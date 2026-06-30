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

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const workers = process.env.E2E_WORKERS || '1';
const tempPrefix = 'skillbridge-e2e-';
const tempExtPrefix = 'skillbridge-e2e-ext-';
const batches = [
  [
    'tests/e2e/a11y.spec.js',
    'tests/e2e/first-user-flow.spec.js',
    'tests/e2e/keyboard-shortcuts.spec.js',
    'tests/e2e/viewport-polish.spec.js',
    'tests/e2e/shadow-isolation.spec.js',
  ],
  [
    'tests/e2e/chat-history.spec.js',
    'tests/e2e/code-comments.spec.js',
    'tests/e2e/dashboard.spec.js',
    'tests/e2e/exam-mode.spec.js',
  ],
  [
    'tests/e2e/golden-translation.spec.js',
    'tests/e2e/idb-cache.spec.js',
    'tests/e2e/lazy-translate.spec.js',
    'tests/e2e/offline-recovery.spec.js',
    'tests/e2e/performance-budget.spec.js',
    'tests/e2e/pdf-export.spec.js',
    'tests/e2e/protected-terms.spec.js',
  ],
  ['tests/e2e/rapid-switch.spec.js', 'tests/e2e/spa-navigation.spec.js', 'tests/e2e/stream-cancel.spec.js'],
  ['tests/e2e/tutor-chat.spec.js', 'tests/e2e/tutor-offline.spec.js', 'tests/e2e/youtube-lifecycle.spec.js'],
];

function run(cmd, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(cmd, args, { stdio: 'inherit', timeout: options.timeoutMs });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (result.error) {
    console.error(`${cmd} failed after ${seconds}s: ${result.error.message}`);
    process.exit(1);
  }
  if (result.signal) {
    console.error(`${cmd} failed after ${seconds}s with signal ${result.signal}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`Command failed after ${seconds}s: ${cmd} ${args.join(' ')} (status=${result.status})`);
    process.exit(result.status || 1);
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

cleanupE2ETempState();
run(npmCmd, ['run', 'build:bundle']);
for (let i = 0; i < batches.length; i++) {
  cleanupE2ETempState();
  console.log(`\n=== E2E batch ${i + 1}/${batches.length} ===`);
  run(
    npxCmd,
    [
      'playwright',
      'test',
      ...batches[i],
      `--workers=${workers}`,
      '--reporter=line',
      '--max-failures=1',
      '--output',
      `test-results/e2e-batch-${i + 1}`,
    ],
    { timeoutMs: 240_000 },
  );
  cleanupE2ETempState();
}
