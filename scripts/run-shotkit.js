#!/usr/bin/env node

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createBrowserLaunchEnv } = require('./lib/browser-launch-env');

const ROOT = path.resolve(__dirname, '..');

function resolveShotkitCli() {
  const packageEntry = require.resolve('@starter-series/shotkit');
  const packageRoot = path.resolve(path.dirname(packageEntry), '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.shotkit;
  if (!bin) throw new Error('The installed @starter-series/shotkit package has no shotkit CLI');
  const cliPath = path.resolve(packageRoot, bin);
  if (!fs.existsSync(cliPath)) throw new Error(`Cannot find the Shotkit CLI at ${cliPath}`);
  return cliPath;
}

function runShotkit({
  argv = process.argv.slice(2),
  baseEnv = process.env,
  cwd = ROOT,
  cliPath = resolveShotkitCli(),
  spawn = spawnSync,
} = {}) {
  const headed = argv.includes('--headed');
  const forwardedArgs = argv.filter((arg) => arg !== '--headed');
  const env = createBrowserLaunchEnv(baseEnv, { headed, headedVariable: 'HEADED' });
  const result = spawn(process.execPath, [cliPath, ...forwardedArgs], {
    cwd,
    env,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.signal) throw new Error(`Shotkit stopped with signal ${result.signal}`);
  return Number.isInteger(result.status) ? result.status : 1;
}

if (require.main === module) {
  try {
    process.exitCode = runShotkit();
  } catch (err) {
    console.error(`Shotkit launcher failed: ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = { resolveShotkitCli, runShotkit };
