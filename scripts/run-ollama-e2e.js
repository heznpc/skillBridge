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
const http = require('http');
const net = require('net');
const path = require('path');
const { createBrowserLaunchEnv } = require('./lib/browser-launch-env');

const ROOT = path.join(__dirname, '..');
const DEFAULT_MODEL = 'smollm2:135m-instruct-q2_K';
const SERVER_READY_TIMEOUT_MS = 30_000;
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

async function waitForServer(apiRoot, child, timeoutMs = SERVER_READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Ollama exited before becoming ready (status=${child.exitCode})`);
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

  try {
    logger.log(`[ollama-e2e] Starting isolated Ollama on ${apiRoot}`);
    let tags = await waitForServer(apiRoot, server);
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

    const testEnv = {
      ...createBrowserLaunchEnv(baseEnv, { headed: options.headed }),
      SB_OLLAMA_BASE_URL: `${apiRoot}/v1`,
      SB_OLLAMA_MODEL: model,
    };
    runChecked(npmCmd, ['run', 'build:bundle'], { env: testEnv, spawnCommand });
    runChecked(
      npxCmd,
      ['playwright', 'test', 'tests/e2e/local-engine-live.spec.js', '--workers=1', '--reporter=line'],
      {
        env: testEnv,
        spawnCommand,
      },
    );
    logger.log(`[ollama-e2e] Real extension round trip passed with ${model}.`);
    return 0;
  } catch (err) {
    if (serverLog.length) err.message += `\nOllama log tail:\n${serverLog.join('')}`;
    throw err;
  } finally {
    process.removeListener('SIGINT', stopForSignal);
    process.removeListener('SIGTERM', stopForSignal);
    await stopServer(server);
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
