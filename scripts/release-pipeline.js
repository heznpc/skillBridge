#!/usr/bin/env node

/**
 * SkillBridge release pipeline.
 *
 * This is the local truth gate for the path a first user actually touches:
 * install the production bundle, accept first-run language onboarding, verify
 * the page translates, build store assets, and only then prepare the upload zip.
 */

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createBrowserLaunchEnv } = require('./lib/browser-launch-env');

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

function buildCommandEnv(options = {}, baseEnv = process.env) {
  const env = { ...baseEnv, ...options.env };
  return options.quietBrowser ? createBrowserLaunchEnv(env) : env;
}

function run(label, command, commandArgs, options = {}) {
  const started = Date.now();
  console.log(`\n==> ${label}`);
  console.log(`$ ${[command, ...commandArgs].join(' ')}`);
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    env: buildCommandEnv(options),
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

function sha256(file) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(ROOT, file)))
    .digest('hex');
}

function verifyPromoMedia() {
  const manifest = JSON.parse(readText('store-assets/promo-media-manifest.json'));
  if (manifest.version !== JSON.parse(readText('manifest.json')).version) {
    throw new Error(`Promo manifest version drift: ${manifest.version}`);
  }
  const sourcePath = manifest.source?.path;
  if (typeof sourcePath !== 'string' || !sourcePath) throw new Error('Promo manifest source path is missing');
  assertFile(sourcePath, 1024);
  if (sha256(sourcePath) !== manifest.source.sha256) {
    throw new Error(`Promo source hash drift: ${sourcePath}`);
  }
  if (!Array.isArray(manifest.assets) || manifest.assets.length !== 2) {
    throw new Error('Promo manifest must describe the landscape and short videos');
  }
  for (const asset of manifest.assets) {
    if (typeof asset?.path !== 'string' || !asset.path) throw new Error('Promo manifest asset path is missing');
    assertFile(asset.path, 100_000);
    if (sha256(asset.path) !== asset.sha256) throw new Error(`Promo asset hash drift: ${asset.path}`);
  }
  const expectedThumbnails = new Map([
    ['store-assets/promo-video-thumbnail-1280x720.png', [1280, 720]],
    ['store-assets/promo-short-thumbnail-1080x1920.png', [1080, 1920]],
  ]);
  if (!Array.isArray(manifest.thumbnails) || manifest.thumbnails.length !== expectedThumbnails.size) {
    throw new Error('Promo manifest must describe both video thumbnails');
  }
  for (const thumbnail of manifest.thumbnails) {
    const dimensions = expectedThumbnails.get(thumbnail?.path);
    if (!dimensions) throw new Error(`Unexpected promo thumbnail: ${thumbnail?.path}`);
    const [width, height] = dimensions;
    if (thumbnail.width !== width || thumbnail.height !== height) {
      throw new Error(`Promo thumbnail dimension drift: ${thumbnail.path}`);
    }
    assertFile(thumbnail.path, 1024);
    if (sha256(thumbnail.path) !== thumbnail.sha256) {
      throw new Error(`Promo thumbnail hash drift: ${thumbnail.path}`);
    }
    expectedThumbnails.delete(thumbnail.path);
  }
  if (expectedThumbnails.size) {
    throw new Error(`Promo manifest is missing thumbnails: ${[...expectedThumbnails.keys()].join(', ')}`);
  }
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

  for (const file of [
    'store-assets/description.md',
    'store-assets/promo-tile-440x280.png',
    'store-assets/01-translate.png',
    'store-assets/02-language-select.png',
    'store-assets/03-sidebar-tutor.png',
    'store-assets/04-flashcards.png',
    'store-assets/05-exam-safe.png',
    'store-assets/skillbridge-bundled.zip',
    'store-assets/promo-media-manifest.json',
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
  verifyPromoMedia();

  console.log(
    `✓ release artifacts are present and internally consistent (${zipVerification.fileCount} ZIP files verified)`,
  );
}

function smoke(operations = DEFAULT_OPERATIONS) {
  operations.runNpm('Build production extension bundle', 'build:bundle');
  operations.run(
    'First-user and action-popup smoke E2E',
    NPX,
    ['playwright', 'test', 'tests/e2e/first-user-flow.spec.js', 'tests/e2e/popup.spec.js'],
    { timeoutMs: 180_000, quietBrowser: true },
  );
}

function localQualityGates(operations = DEFAULT_OPERATIONS) {
  operations.runNpm('Release version identity check', 'check:version');
  operations.runNpm('Lint', 'lint');
  operations.runNpm('Format check', 'format:check');
  operations.runNpm('Unit tests with coverage gates', 'test:ci');
  operations.runNpm('Validate translation JSON', 'validate');
  operations.runNpm('Glossary quality check', 'glossary');
  operations.runNpm('i18n key parity', 'check:i18n');
  operations.runNpm('Locale contamination check', 'check:locales');
  operations.runNpm('Dictionary coverage check', 'check:dict-coverage');
  operations.runNpm('Background/content sync check', 'check:sync');
  operations.runNpm('Dictionary freshness check', 'check:dicts');
  operations.runNpm('Generated plugin check', 'check:plugin');
  operations.runNpm('Canonical lesson lookup check', 'check:canonical');
  operations.runNpm('Live selector check', 'check:selectors');
  operations.runNpm('Live course-map check', 'check:academy');
  // Puter does not validate a model id: it forwards whatever it is given and
  // lets the server refuse. A retired id is therefore not a build failure but
  // a failed first question after a successful sign-in, which is the most
  // expensive place to discover it.
  operations.runNpm('Live tutor-model check', 'check:models');
}

function preflight({ includeFullE2e, includeStoreCapture }, operations = DEFAULT_OPERATIONS, logger = console) {
  localQualityGates(operations);
  smoke(operations);
  operations.runNpm('Build Firefox artifact', 'build:firefox');
  if (includeStoreCapture) {
    operations.runNpm('Regenerate store assets from the production bundle', 'capture:store');
    operations.runNode('Regenerate promo video derivatives', 'scripts/build-promo-media.js');
  } else {
    logger.log('\n==> Verify store description is generated from the current listing source');
    operations.verifyStoreDescriptionSync();
    logger.log('✓ store description matches STORE_LISTING.md');
  }
  operations.runNpm('Build bundled upload zip', 'build:bundle:zip');
  operations.verifyArtifacts();
  if (includeFullE2e) {
    operations.runNpm('Full E2E suite', 'test:e2e');
  } else {
    logger.log('\nFull E2E suite is reserved for npm run release:verify.');
    logger.log('Preflight covers upload-readiness plus first-user and action-popup paths.');
  }
}

const DEFAULT_OPERATIONS = {
  run,
  runNpm,
  runNode,
  verifyArtifacts,
  verifyStoreDescriptionSync,
};

function main({ modes = MODES, operations = DEFAULT_OPERATIONS, logger = console } = {}) {
  try {
    if (modes.smoke) {
      smoke(operations);
    } else if (modes.postUpload) {
      operations.runNode('Post-upload CWS drift check', 'scripts/check-cws-drift.js', ['--json']);
    } else if (modes.full) {
      preflight({ includeFullE2e: true, includeStoreCapture: true }, operations, logger);
    } else {
      preflight({ includeFullE2e: false, includeStoreCapture: false }, operations, logger);
    }
    logger.log('\nRelease pipeline finished successfully.');
    return 0;
  } catch (err) {
    logger.error(`\nRelease pipeline stopped: ${err.message}`);
    return 1;
  }
}

if (require.main === module) process.exitCode = main();

module.exports = {
  DEFAULT_OPERATIONS,
  assertMatchingFileLists,
  buildCommandEnv,
  listBundleFiles,
  localQualityGates,
  main,
  parseZipFileEntries,
  preflight,
  smoke,
  verifyZipMatchesBundle,
};
