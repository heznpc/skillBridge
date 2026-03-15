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
 *   node scripts/build-firefox.js
 *
 * Output:
 *   dist/firefox/  — full extension copy with Firefox-compatible manifest
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist', 'firefox');

// ── Read Chrome manifest ──────────────────────────────────────

const chromeManifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')
);

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

// ── Write Firefox manifest ───────────────────────────────────

// Create dist/firefox directory
fs.mkdirSync(DIST_DIR, { recursive: true });

// Copy all extension files (excluding dist/, .git/, node_modules/)
const EXCLUDE = new Set(['dist', '.git', 'node_modules', '.DS_Store', '.claude']);

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    if (EXCLUDE.has(entry.name)) continue;
    // Skip manifest.json — we write our own
    if (entry.name === 'manifest.json' && src === ROOT) continue;

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(ROOT, DIST_DIR);

// Write the Firefox-specific manifest
fs.writeFileSync(
  path.join(DIST_DIR, 'manifest.json'),
  JSON.stringify(firefoxManifest, null, 2) + '\n'
);

console.log('Firefox build complete: dist/firefox/');
console.log('');
console.log('Firefox manifest differences:');
console.log('  + browser_specific_settings.gecko.id = "skillbridge@heznpc"');
console.log('  + background.scripts (replaces service_worker)');
console.log('  - minimum_chrome_version (removed)');
