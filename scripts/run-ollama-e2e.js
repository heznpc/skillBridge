#!/usr/bin/env node
'use strict';

/**
 * Run the real local-engine E2E against an isolated Ollama server.
 *
 * The harness owns the server process and its port, so it never has to stop or
 * reconfigure a developer's normal Ollama instance. Installed chat models are
 * reused. On a machine with no suitable model, a deliberately small model is
 * pulled once and then remains in Ollama's normal model store for later runs.
 */

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { createBrowserLaunchEnv } = require('./lib/browser-launch-env');

const ROOT = path.join(__dirname, '..');
const DEFAULT_MODEL = 'smollm2:135m-instruct-q2_K';
const SERVER_READY_TIMEOUT_MS = 30_000;
const LOCK_WAIT_TIMEOUT_MS = 180_000;
const LOCK_OWNER_WRITE_GRACE_MS = 2_000;
const CHAT_MODEL_EXCLUSIONS = /(?:^|[-_:])(embed|embedding|nomic|bge|mxbai|snowflake|minilm)(?:[-_:]|$)/i;
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function parseArgs(argv = []) {
  const options = { headed: false, pull: true, requestedModel: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--headed') options.headed = true;
    else if (arg === '--no-pull') options.pull = false;
    else if (arg === '--model') {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('--model requires a model name');
      options.requestedModel = argv[++i];
    } else if (arg.startsWith('--model=')) {
      options.requestedModel = arg.slice('--model='.length);
      if (!options.requestedModel) throw new Error('--model requires a model name');
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function installedModelNames(payload) {
  if (!Array.isArray(payload?.models)) return [];
  return payload.models
    .map((model) => model?.name || model?.model)
    .filter((name) => typeof name === 'string' && name.length > 0);
}

function chooseModel(installed, requestedModel = null) {
  if (requestedModel) return requestedModel;
  if (modelIsInstalled(installed, DEFAULT_MODEL)) return DEFAULT_MODEL;
  return installed.find((name) => !CHAT_MODEL_EXCLUSIONS.test(name)) || DEFAULT_MODEL;
}

function modelIsInstalled(installed, model) {
  const wanted = model.includes(':') ? model : `${model}:latest`;
  return installed.some((name) => name === model || name === wanted || `${name}:latest` === wanted);
}

function reservePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      server.close((err) => (err ? reject(err) : resolve(address.port)));
    });
  });
}

function requestJson(url, timeoutMs = 3_000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`${url} returned HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(new Error(`${url} returned invalid JSON: ${err.message}`));
        }
      });
    });
    req.once('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`${url} timed out after ${timeoutMs}ms`)));
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === 'EPERM';
  }
}

async function acquireOllamaLock({
  lockPath = path.join(os.tmpdir(), 'skillbridge-ollama-e2e.lock'),
  timeoutMs = LOCK_WAIT_TIMEOUT_MS,
  logger = console,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ownerPath = path.join(lockPath, 'owner.json');
  let announcedWait = false;

  while (Date.now() < deadline) {
    try {
      fs.mkdirSync(lockPath);
      fs.writeFileSync(ownerPath, JSON.stringify({ pid: process.pid, token }));
      return () => {
        try {
          const owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
          if (owner.token === token) fs.rmSync(lockPath, { recursive: true, force: true });
        } catch (_err) {
          // Another process may already have reclaimed a stale lock.
        }
      };
    } catch (err) {
      if (err?.code !== 'EEXIST') throw err;
    }

    let owner = null;
    try {
      owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
    } catch (_err) {
      // The winning process may be between mkdir and writing owner.json.
    }
    if (owner && !processIsAlive(owner.pid)) {
      fs.rmSync(lockPath, { recursive: true, force: true });
      continue;
    }
    if (!owner) {
      try {
        if (Date.now() - fs.statSync(lockPath).mtimeMs > LOCK_OWNER_WRITE_GRACE_MS) {
          fs.rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch (err) {
        if (err?.code === 'ENOENT') continue;
        throw err;
      }
    }
    if (!announcedWait) {
      logger.log('[ollama-e2e] Waiting for another live Ollama test to release the model/GPU lock.');
      announcedWait = true;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting ${timeoutMs}ms for the live Ollama test lock.`);
}

async function waitForServer(apiRoot, child, timeoutMs = SERVER_READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      const reason = child.exitCode !== null ? `status=${child.exitCode}` : `signal=${child.signalCode}`;
      throw new Error(`Ollama exited before becoming ready (${reason})`);
    }
    try {
      return await requestJson(`${apiRoot}/api/tags`);
    } catch (err) {
      lastError = err;
      await delay(200);
    }
  }
  throw new Error(`Ollama did not become ready within ${timeoutMs}ms: ${lastError?.message || 'no response'}`);
}

function runChecked(command, args, { cwd = ROOT, env = process.env, spawnCommand = spawnSync } = {}) {
  const result = spawnCommand(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${command} ${args.join(' ')} stopped by ${result.signal}`);
  if (result.status !== 0) {
    const error = new Error(`${command} ${args.join(' ')} failed with status ${result.status}`);
    error.exitCode = result.status || 1;
    throw error;
  }
}

function stopServer(child) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const hardStop = setTimeout(() => child.kill('SIGKILL'), 5_000);
    hardStop.unref();
    child.once('exit', () => {
      clearTimeout(hardStop);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

async function main({
  argv = process.argv.slice(2),
  baseEnv = process.env,
  logger = console,
  spawnServer = spawn,
  spawnCommand = spawnSync,
  allocatePort = reservePort,
} = {}) {
  const options = parseArgs(argv);
  const binaryCheck = spawnCommand('ollama', ['--version'], { env: baseEnv, encoding: 'utf8' });
  if (binaryCheck.error?.code === 'ENOENT') {
    throw new Error('Ollama is not installed or is not available on PATH.');
  }
  if (binaryCheck.error) throw binaryCheck.error;
  if (binaryCheck.status !== 0) throw new Error(`ollama --version failed with status ${binaryCheck.status}`);

  const port = await allocatePort();
  const apiRoot = `http://localhost:${port}`;
  const serverEnv = {
    ...baseEnv,
    OLLAMA_HOST: `127.0.0.1:${port}`,
    OLLAMA_ORIGINS: 'chrome-extension://*',
  };
  const server = spawnServer('ollama', ['serve'], {
    cwd: ROOT,
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const serverLog = [];
  const rememberLog = (chunk) => {
    serverLog.push(String(chunk));
    if (serverLog.length > 30) serverLog.shift();
  };
  server.stdout?.on('data', rememberLog);
  server.stderr?.on('data', rememberLog);

  const stopForSignal = () => {
    server.kill('SIGTERM');
  };
  process.once('SIGINT', stopForSignal);
  process.once('SIGTERM', stopForSignal);

  let serverReady = false;
  let buildDir = null;
  let releaseLock = null;
  try {
    logger.log(`[ollama-e2e] Starting isolated Ollama on ${apiRoot}`);
    let tags = await waitForServer(apiRoot, server);
    serverReady = true;
    // Separate ports and build directories prevent I/O collisions, but two
    // Ollama daemons loading the same model concurrently can still contend on
    // the shared model store/GPU and leave one stream waiting until timeout.
    releaseLock = await acquireOllamaLock({ logger });
    tags = await requestJson(`${apiRoot}/api/tags`);
    let installed = installedModelNames(tags);
    const model = chooseModel(installed, options.requestedModel || baseEnv.SB_OLLAMA_MODEL || null);

    if (!modelIsInstalled(installed, model)) {
      if (!options.pull) {
        throw new Error(`Ollama model ${model} is not installed and --no-pull was specified.`);
      }
      logger.log(`[ollama-e2e] Pulling ${model}; this happens only when the model is absent.`);
      runChecked('ollama', ['pull', model], { env: serverEnv, spawnCommand });
      tags = await requestJson(`${apiRoot}/api/tags`);
      installed = installedModelNames(tags);
      if (!modelIsInstalled(installed, model)) throw new Error(`Ollama reported success but ${model} is still absent.`);
    } else {
      logger.log(`[ollama-e2e] Reusing installed model ${model}`);
    }

    const testRunId = `ollama-${process.pid}-${Date.now().toString(36)}`;
    buildDir = fs.mkdtempSync(path.join(os.tmpdir(), `skillbridge-ollama-build-${testRunId}-`));
    const testEnv = {
      ...createBrowserLaunchEnv(baseEnv, { headed: options.headed }),
      SB_OLLAMA_BASE_URL: `${apiRoot}/v1`,
      SB_OLLAMA_MODEL: model,
      SB_E2E_RUN_ID: testRunId,
      SB_EXTENSION_BUNDLE: buildDir,
    };
    runChecked(npmCmd, ['run', 'build:bundle', '--', '--out-dir', buildDir], { env: testEnv, spawnCommand });
    runChecked(
      npxCmd,
      [
        'playwright',
        'test',
        'tests/e2e/local-engine-live.spec.js',
        '--workers=1',
        '--reporter=line',
        '--output',
        `test-results/${testEnv.SB_E2E_RUN_ID}`,
      ],
      {
        env: testEnv,
        spawnCommand,
      },
    );
    logger.log(`[ollama-e2e] Real extension round trip passed with ${model}.`);
    return 0;
  } catch (err) {
    // Startup failures need the daemon log. Later failures already have a
    // focused model/build/Playwright error, where a normal Ollama info log is
    // noise unless the caller explicitly asks for it.
    if (serverLog.length && (!serverReady || baseEnv.SB_OLLAMA_DEBUG === '1')) {
      err.message += `\nOllama log tail:\n${serverLog.join('')}`;
    }
    throw err;
  } finally {
    process.removeListener('SIGINT', stopForSignal);
    process.removeListener('SIGTERM', stopForSignal);
    await stopServer(server);
    if (buildDir) fs.rmSync(buildDir, { recursive: true, force: true });
    releaseLock?.();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = err.exitCode || 1;
  });
}

module.exports = {
  DEFAULT_MODEL,
  acquireOllamaLock,
  chooseModel,
  installedModelNames,
  main,
  modelIsInstalled,
  parseArgs,
  requestJson,
  reservePort,
  runChecked,
  stopServer,
  waitForServer,
};
