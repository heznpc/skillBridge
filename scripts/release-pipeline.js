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
const UNZIP = process.platform === 'win32' ? 'unzip.exe' : 'unzip';

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

function runCaptured(label, command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd || ROOT,
    encoding: 'utf8',
    timeout: options.timeoutMs || 60_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`${label} failed: ${result.error.message}`);
  }
  if (result.signal) {
    throw new Error(`${label} failed with signal ${result.signal}`);
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`${label} failed with exit code ${result.status}${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout || '';
}

function listBundleFiles(bundleDir) {
  const files = [];

  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile()) {
        files.push(path.relative(bundleDir, absolute).split(path.sep).join('/'));
      } else {
        throw new Error(`Unsupported bundle entry type: ${path.relative(bundleDir, absolute)}`);
      }
    }
  }

  visit(bundleDir);
  return files.sort();
}

function parseZipFileEntries(output) {
  const files = [];
  const seen = new Set();

  for (const rawLine of output.split(/\r?\n/)) {
    const raw = rawLine.replace(/^(?:\.\/)+/, '');
    const isDirectory = raw.endsWith('/');
    const entryPath = isDirectory ? raw.replace(/\/+$/, '') : raw;
    if (!entryPath) continue;
    if (
      entryPath.includes('\\') ||
      entryPath.includes('\0') ||
      path.posix.isAbsolute(entryPath) ||
      /^[A-Za-z]:/.test(entryPath)
    ) {
      throw new Error(`Unsafe ZIP entry path: ${rawLine}`);
    }

    const normalized = path.posix.normalize(entryPath);
    if (normalized !== entryPath || normalized === '..' || normalized.startsWith('../')) {
      throw new Error(`Unsafe ZIP entry path: ${rawLine}`);
    }
    if (isDirectory) continue;
    if (seen.has(normalized)) {
      throw new Error(`Duplicate ZIP file entry: ${normalized}`);
    }
    seen.add(normalized);
    files.push(normalized);
  }

  return files.sort();
}

function assertMatchingFileLists(bundleFiles, zipFiles) {
  const bundleSet = new Set(bundleFiles);
  const zipSet = new Set(zipFiles);
  const missing = bundleFiles.filter((file) => !zipSet.has(file));
  const extra = zipFiles.filter((file) => !bundleSet.has(file));

  if (missing.length || extra.length) {
    const summarize = (files) =>
      `${files.slice(0, 10).join(', ')}${files.length > 10 ? ` (+${files.length - 10} more)` : ''}`;
    const details = [];
    if (missing.length) details.push(`missing from ZIP: ${summarize(missing)}`);
    if (extra.length) details.push(`not present in dist/bundled: ${summarize(extra)}`);
    throw new Error(`Upload ZIP file list does not match dist/bundled (${details.join('; ')})`);
  }
}

function verifyZipMatchesBundle({
  zipPath = path.join(ROOT, 'store-assets', 'skillbridge-bundled.zip'),
  bundleDir = path.join(ROOT, 'dist', 'bundled'),
} = {}) {
  runCaptured('Upload ZIP integrity check', UNZIP, ['-tqq', zipPath]);
  const zipFiles = parseZipFileEntries(runCaptured('Upload ZIP entry listing', UNZIP, ['-Z1', zipPath]));
  const bundleFiles = listBundleFiles(bundleDir);
  assertMatchingFileLists(bundleFiles, zipFiles);
  return { fileCount: bundleFiles.length };
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

  const retiredTutorScreenshot = path.join(ROOT, 'store-assets', '03-sidebar-tutor.png');
  if (fs.existsSync(retiredTutorScreenshot)) {
    throw new Error(
      'Retired AI-Tutor screenshot is still present: store-assets/03-sidebar-tutor.png. ' +
        'Run npm run capture:store before preparing the CWS upload.',
    );
  }
  for (const generatedTextAsset of [
    'store-assets/captions.json',
    'store-assets/storyboard.json',
    'store-assets/shotkit-manifest.json',
  ]) {
    const absolute = path.join(ROOT, generatedTextAsset);
    if (!fs.existsSync(absolute)) continue;
    const source = fs.readFileSync(absolute, 'utf8');
    if (/AI tutor|Puter|Gemini|Claude-powered/i.test(source)) {
      throw new Error(
        `Retired AI feature copy remains in generated store media metadata: ${generatedTextAsset}. ` +
          'Run npm run capture:store before preparing the CWS upload.',
      );
    }
  }

  for (const file of [
    'store-assets/description.md',
    'store-assets/promo-tile-440x280.png',
    'store-assets/01-translate.png',
    'store-assets/02-language-select.png',
    'store-assets/03-learning-dashboard.png',
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

  const zipVerification = verifyZipMatchesBundle();

  console.log(
    `✓ release artifacts are present and internally consistent (${zipVerification.fileCount} ZIP files verified)`,
  );
}

function smoke() {
  runNpm('Build production extension bundle', 'build:bundle');
  run(
    'First-user, action-popup, and no-RHC smoke E2E',
    NPX,
    [
      'playwright',
      'test',
      'tests/e2e/first-user-flow.spec.js',
      'tests/e2e/popup.spec.js',
      'tests/e2e/cws-no-rhc.spec.js',
    ],
    { timeoutMs: 180_000 },
  );
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
    console.log('Preflight covers upload-readiness plus first-user, action-popup, and no-RHC paths.');
  }
}

function main() {
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
}

if (require.main === module) main();

module.exports = {
  assertMatchingFileLists,
  listBundleFiles,
  parseZipFileEntries,
  verifyZipMatchesBundle,
};
