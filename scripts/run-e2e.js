#!/usr/bin/env node
/**
 * Run Playwright E2E in resource-bounded batches.
 *
 * A single `playwright test` invocation launches many persistent Chromium
 * extension contexts over one long process. On local macOS runs with other
 * Chrome/Codex processes active, the OS can kill that process before the suite
 * reaches the later specs. The specs are independent by file, so run them in
 * stable batches while preserving the same total coverage.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createBrowserLaunchEnv } = require('./lib/browser-launch-env');

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const tempPrefix = 'skillbridge-e2e-';
const tempExtPrefix = 'skillbridge-e2e-ext-';
// This runner validates every CWS runtime surface, including the bundled Tutor,
// local-engine permission flow, streaming cancellation, and chat history.
const batches = [
  [
    'tests/e2e/a11y.spec.js',
    'tests/e2e/first-user-flow.spec.js',
    // Sits next to first-user-flow on purpose: one covers a new install, the
    // other the upgrade from the build the store actually serves.
    'tests/e2e/upgrade-from-legacy.spec.js',
    'tests/e2e/popup.spec.js',
    'tests/e2e/keyboard-shortcuts.spec.js',
    'tests/e2e/viewport-polish.spec.js',
    'tests/e2e/shadow-isolation.spec.js',
  ],
  [
    'tests/e2e/code-comments.spec.js',
    'tests/e2e/dashboard.spec.js',
    'tests/e2e/exam-mode.spec.js',
    'tests/e2e/notes.spec.js',
    'tests/e2e/byoa.spec.js',
    'tests/e2e/term-reports.spec.js',
  ],
  [
    'tests/e2e/golden-translation.spec.js',
    'tests/e2e/idb-cache.spec.js',
    'tests/e2e/lazy-translate.spec.js',
    'tests/e2e/offline-recovery.spec.js',
    'tests/e2e/performance-budget.spec.js',
    'tests/e2e/pdf-export.spec.js',
    'tests/e2e/protected-terms.spec.js',
    // Next to protected-terms on purpose: both police what may reach Google.
    // That one asserts the response is corrected; this one asserts the
    // request should never have been sent.
    'tests/e2e/mixed-localization.spec.js',
  ],
  [
    'tests/e2e/rapid-switch.spec.js',
    'tests/e2e/spa-navigation.spec.js',
    // With the SPA specs on purpose: this one is the same route-change
    // machinery, driven on the host where getting it wrong leaves a tutor
    // unguarded on a live quiz rather than showing stale text.
    'tests/e2e/academy-lifecycle.spec.js',
  ],
  [
    'tests/e2e/chat-history.spec.js',
    'tests/e2e/stream-cancel.spec.js',
    'tests/e2e/tutor-chat.spec.js',
    // With the tutor specs, not the Academy ones: this is a transport claim.
    // It asserts on the prompt the model actually received, which is the only
    // place a guard that is built and then dropped becomes visible.
    'tests/e2e/academy-tutor.spec.js',
    'tests/e2e/tutor-offline.spec.js',
  ],
  ['tests/e2e/puter-frame-boot.spec.js'],
  ['tests/e2e/local-engine-live.spec.js'],
  ['tests/e2e/youtube-lifecycle.spec.js'],
];

function verifyBatchCoverage() {
  const e2eDir = path.join(__dirname, '..', 'tests', 'e2e');
  const discovered = fs
    .readdirSync(e2eDir)
    .filter((name) => name.endsWith('.spec.js'))
    .map((name) => `tests/e2e/${name}`)
    .sort();
  const listed = batches.flat();
  const duplicates = listed.filter((file, index) => listed.indexOf(file) !== index);
  const listedSet = new Set(listed);
  const discoveredSet = new Set(discovered);
  const missing = discovered.filter((file) => !listedSet.has(file));
  const unknown = listed.filter((file) => !discoveredSet.has(file));
  if (duplicates.length || missing.length || unknown.length) {
    const parts = [];
    if (duplicates.length) parts.push(`duplicates: ${[...new Set(duplicates)].join(', ')}`);
    if (missing.length) parts.push(`missing: ${missing.join(', ')}`);
    if (unknown.length) parts.push(`unknown: ${unknown.join(', ')}`);
    throw new Error(`E2E batch coverage mismatch (${parts.join('; ')})`);
  }
}

function run(cmd, args, options = {}) {
  const started = Date.now();
  const result = (options.spawn || spawnSync)(cmd, args, {
    stdio: 'inherit',
    timeout: options.timeoutMs,
    env: options.env,
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (result.error) {
    throw new Error(`${cmd} failed after ${seconds}s: ${result.error.message}`);
  }
  if (result.signal) {
    throw new Error(`${cmd} failed after ${seconds}s with signal ${result.signal}`);
  }
  if (result.status !== 0) {
    const error = new Error(`Command failed after ${seconds}s: ${cmd} ${args.join(' ')} (status=${result.status})`);
    error.exitCode = result.status || 1;
    throw error;
  }
}

function cleanupE2ETempState() {
  for (const name of fs.readdirSync(os.tmpdir())) {
    if (!name.startsWith(tempPrefix) && !name.startsWith(tempExtPrefix)) continue;
    try {
      fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
    } catch (_err) {
      // A just-closed Chromium process may release its profile a moment later.
    }
  }
}

function main({
  argv = process.argv.slice(2),
  baseEnv = process.env,
  spawn = spawnSync,
  cleanup = cleanupE2ETempState,
  verify = verifyBatchCoverage,
  logger = console,
} = {}) {
  const headed = argv.includes('--headed');
  const workers = baseEnv.E2E_WORKERS || '1';
  const browserEnv = createBrowserLaunchEnv(baseEnv, { headed });
  const selectedBatches = argv.includes('--first-user')
    ? [['tests/e2e/first-user-flow.spec.js', 'tests/e2e/popup.spec.js']]
    : batches;

  cleanup();
  verify();
  run(npmCmd, ['run', 'build:bundle'], { spawn, env: browserEnv });
  for (let i = 0; i < selectedBatches.length; i++) {
    cleanup();
    logger.log(`\n=== E2E batch ${i + 1}/${selectedBatches.length} ===`);
    run(
      npxCmd,
      [
        'playwright',
        'test',
        ...selectedBatches[i],
        `--workers=${workers}`,
        '--reporter=line',
        '--max-failures=1',
        '--output',
        `test-results/e2e-batch-${i + 1}`,
      ],
      { timeoutMs: 360_000, env: browserEnv, spawn },
    );
    cleanup();
  }
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (err) {
    console.error(err.message);
    process.exitCode = err.exitCode || 1;
  }
}

module.exports = { batches, main, run, verifyBatchCoverage };
