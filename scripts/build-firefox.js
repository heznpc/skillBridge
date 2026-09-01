#!/usr/bin/env node

/**
 * SkillBridge — Firefox Manifest Builder
 *
 * Generates a Firefox-compatible manifest from the Chrome manifest.
 * Firefox MV3 differences handled:
 *   1. Adds `browser_specific_settings` with the gecko addon ID
 *   2. Replaces `background.service_worker` with `background.scripts` array
 *      (Firefox MV3 supports service workers since Firefox 121, but
 *       background scripts are more broadly compatible with older versions)
 *   3. Removes `minimum_chrome_version` (Chrome-only field)
 *
 * Usage:
 *   node scripts/build-firefox.js [--out-dir <directory>]
 *
 * Output:
 *   dist/firefox/  — full extension copy with Firefox-compatible manifest
 */

const fs = require('fs');
const path = require('path');
const { writeCwsSafePuter } = require('./build-bundle');
const { assertNoRemoteHostedCode } = require('./check-rhc');
const { assertSafeBuildOutput } = require('./lib/safe-build-output');

const ROOT = path.resolve(__dirname, '..');
const outputArgIndex = process.argv.indexOf('--out-dir');
if (outputArgIndex !== -1 && !process.argv[outputArgIndex + 1]) {
  throw new Error('--out-dir requires a directory path');
}
const DIST_DIR =
  outputArgIndex === -1 ? path.join(ROOT, 'dist', 'firefox') : path.resolve(process.argv[outputArgIndex + 1]);

// ── Read Chrome manifest ──────────────────────────────────────

const chromeManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

// ── Transform to Firefox manifest ────────────────────────────

const firefoxManifest = { ...chromeManifest };

// 1. Add Firefox addon ID for AMO (addons.mozilla.org)
firefoxManifest.browser_specific_settings = {
  gecko: {
    id: 'skillbridge@heznpc',
    strict_min_version: '121.0',
  },
};

// 2. Replace service_worker with background scripts
//    Firefox 121+ supports service workers in MV3, but using background.scripts
//    provides wider compatibility with older Firefox versions.
if (firefoxManifest.background?.service_worker) {
  const sw = firefoxManifest.background.service_worker;
  firefoxManifest.background = {
    scripts: [sw],
  };
}

// 3. Remove Chrome-specific fields
delete firefoxManifest.minimum_chrome_version;
for (const contentScript of firefoxManifest.content_scripts || []) {
  // Firefox content scripts already default to the isolated extension world;
  // omit Chrome's explicit manifest key for Firefox 121 compatibility.
  delete contentScript.world;
}

// ── Write Firefox manifest ───────────────────────────────────

assertSafeBuildOutput(DIST_DIR, { repoRoot: ROOT });

// Clean previous build to prevent recursive nesting
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}

// Create dist/firefox directory
fs.mkdirSync(DIST_DIR, { recursive: true });

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === '.DS_Store') continue;

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

for (const dir of ['_locales', 'src']) {
  copyDir(path.join(ROOT, dir), path.join(DIST_DIR, dir));
}
// Firefox uses the same reviewed SDK transform as the Chrome package. Raw
// vendored Puter code is useful for source auditing, but must not be the
// runtime copy because it contains unused remote imports and host-storage
// accesses that SkillBridge does not need.
writeCwsSafePuter(path.join(ROOT, 'src', 'bridge', 'puter.js'), path.join(DIST_DIR, 'src', 'bridge', 'puter.js'));
copyDir(path.join(ROOT, 'assets', 'icons'), path.join(DIST_DIR, 'assets', 'icons'));
copyDir(path.join(ROOT, 'licenses'), path.join(DIST_DIR, 'licenses'));
fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(DIST_DIR, 'LICENSE'));
fs.copyFileSync(path.join(ROOT, 'THIRD_PARTY_NOTICES.md'), path.join(DIST_DIR, 'THIRD_PARTY_NOTICES.md'));

// Write the Firefox-specific manifest
fs.writeFileSync(path.join(DIST_DIR, 'manifest.json'), JSON.stringify(firefoxManifest, null, 2) + '\n');
assertNoRemoteHostedCode(DIST_DIR);

console.log(`Firefox build complete: ${DIST_DIR}`);
console.log('Remote-hosted-code check: clean');
console.log('');
console.log('Firefox manifest differences:');
console.log('  + browser_specific_settings.gecko.id = "skillbridge@heznpc"');
console.log('  + background.scripts (replaces service_worker)');
console.log('  - minimum_chrome_version (removed)');
