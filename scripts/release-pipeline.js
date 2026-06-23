#!/usr/bin/env node

/**
 * SkillBridge release pipeline.
 *
 * This is the local truth gate for the path a first user actually touches:
 * install the production bundle, accept first-run language onboarding, verify
 * the page translates, build store assets, and only then prepare the upload zip.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const args = new Set(process.argv.slice(2));

const MODES = {
  smoke: args.has('--smoke'),
  preflight: args.has('--preflight'),
  full: args.has('--full'),
  postUpload: args.has('--post-upload'),
};

if (!Object.values(MODES).some(Boolean)) {
  MODES.preflight = true;
}

function run(label, command, commandArgs, options = {}) {
  const started = Date.now();
  console.log(`\n==> ${label}`);
  console.log(`$ ${[command, ...commandArgs].join(' ')}`);
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...options.env },
    timeout: options.timeoutMs,
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (result.error) {
    throw new Error(`${label} failed after ${seconds}s: ${result.error.message}`);
  }
  if (result.signal) {
    throw new Error(`${label} failed after ${seconds}s with signal ${result.signal}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed after ${seconds}s with exit code ${result.status}`);
  }
  console.log(`✓ ${label} (${seconds}s)`);
}

function runNpm(label, script, extraArgs = []) {
  run(label, NPM, ['run', script, ...extraArgs]);
}

function runNode(label, script, extraArgs = []) {
  run(label, process.execPath, [script, ...extraArgs]);
}

function readText(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function assertFile(file, minBytes = 1) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) throw new Error(`Missing required artifact: ${file}`);
  const size = fs.statSync(abs).size;
  if (size < minBytes) throw new Error(`Artifact is too small: ${file} (${size} bytes)`);
}

function extractCourseCount(text, label) {
  const match = text.match(/All\s+(\d+)\s+currently-published courses/i);
  if (!match) throw new Error(`Could not find supported-course count in ${label}`);
  return Number(match[1]);
}

function premiumLanguagesBlock(text, label) {
  const match = text.match(/PREMIUM LANGUAGES[\s\S]*?STANDARD LANGUAGES/i);
  if (!match) throw new Error(`Could not find premium-language block in ${label}`);
  return match[0];
}

function verifyStoreDescriptionSync() {
  const source = readText('store-assets/STORE_LISTING.md');
  const generated = readText('store-assets/description.md');

  const sourceCount = extractCourseCount(source, 'STORE_LISTING.md');
  const generatedCount = extractCourseCount(generated, 'description.md');
  if (sourceCount !== generatedCount) {
    throw new Error(
      `Store description is stale: STORE_LISTING.md says ${sourceCount} courses, ` +
        `description.md says ${generatedCount}. Run npm run capture:store.`,
    );
  }

  const sourcePremium = premiumLanguagesBlock(source, 'STORE_LISTING.md');
  const generatedPremium = premiumLanguagesBlock(generated, 'description.md');
  const sourceHasIndonesian = /Bahasa Indonesia/i.test(sourcePremium);
  const generatedHasIndonesian = /Bahasa Indonesia/i.test(generatedPremium);
  if (sourceHasIndonesian !== generatedHasIndonesian) {
    throw new Error(
      'Store description premium-language block is stale. ' +
        'Run npm run capture:store so description.md matches STORE_LISTING.md.',
    );
  }
}

function verifyArtifacts() {
  console.log('\n==> Verify generated release artifacts');
  verifyStoreDescriptionSync();

  for (const file of [
    'store-assets/description.md',
    'store-assets/promo-tile-440x280.png',
    'store-assets/01-translate.png',
    'store-assets/02-language-select.png',
    'store-assets/03-sidebar-tutor.png',
    'store-assets/04-flashcards.png',
    'store-assets/05-exam-safe.png',
    'store-assets/skillbridge-bundled.zip',
  ]) {
    assertFile(file, file.endsWith('.png') || file.endsWith('.zip') ? 1024 : 1);
  }

  const manifest = JSON.parse(readText('manifest.json'));
  const bundledManifest = JSON.parse(readText('dist/bundled/manifest.json'));
  if (manifest.version !== bundledManifest.version) {
    throw new Error(`Bundled manifest version drift: ${bundledManifest.version} != ${manifest.version}`);
  }
  if (JSON.stringify(bundledManifest.content_scripts?.[0]?.js) !== JSON.stringify(['content.bundle.js'])) {
    throw new Error('Bundled manifest does not point at content.bundle.js');
  }
  if (bundledManifest.background?.service_worker !== 'background.bundle.js') {
    throw new Error('Bundled manifest does not point at background.bundle.js');
  }

  console.log('✓ release artifacts are present and internally consistent');
}

function smoke() {
  runNpm('Build production extension bundle', 'build:bundle');
  run('First-user install/translate smoke E2E', NPX, ['playwright', 'test', 'tests/e2e/first-user-flow.spec.js'], {
    timeoutMs: 180_000,
  });
}

function localQualityGates() {
  runNpm('Lint', 'lint');
  runNpm('Format check', 'format:check');
  run('Unit tests', NPM, ['test', '--', '--runInBand']);
  runNpm('Validate translation JSON', 'validate');
  runNpm('Glossary quality check', 'glossary');
  runNpm('i18n key parity', 'check:i18n');
  runNpm('Locale contamination check', 'check:locales');
  runNpm('Dictionary coverage check', 'check:dict-coverage');
  runNpm('Background/content sync check', 'check:sync');
  runNpm('Dictionary freshness check', 'check:dicts');
  runNpm('Generated plugin check', 'check:plugin');
  runNpm('Live selector check', 'check:selectors');
  runNpm('Live course-map check', 'check:academy');
}

function preflight({ includeFullE2e, includeStoreCapture }) {
  localQualityGates();
  smoke();
  runNpm('Build Firefox artifact', 'build:firefox');
  if (includeStoreCapture) {
    runNpm('Regenerate store assets from the production bundle', 'capture:store');
  } else {
    console.log('\n==> Verify store description is generated from the current listing source');
    verifyStoreDescriptionSync();
    console.log('✓ store description matches STORE_LISTING.md');
  }
  runNpm('Build bundled upload zip', 'build:bundle:zip');
  verifyArtifacts();
  if (includeFullE2e) {
    runNpm('Full E2E suite', 'test:e2e');
  } else {
    console.log('\nFull E2E suite is reserved for npm run release:verify.');
    console.log('Preflight covers upload-readiness plus the first-user install/translate path.');
  }
}

try {
  if (MODES.smoke) {
    smoke();
  } else if (MODES.postUpload) {
    runNode('Post-upload CWS drift check', 'scripts/check-cws-drift.js', ['--json']);
  } else if (MODES.full) {
    preflight({ includeFullE2e: true, includeStoreCapture: true });
  } else {
    preflight({ includeFullE2e: false, includeStoreCapture: false });
  }
  console.log('\nRelease pipeline finished successfully.');
} catch (err) {
  console.error(`\nRelease pipeline stopped: ${err.message}`);
  process.exit(1);
}
