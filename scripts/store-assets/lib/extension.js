/*
 * Store-asset harness — extension staging.
 *
 * Playwright loads an extension from an UNPACKED directory via
 * `--load-extension=<dir>`. Two helpers prepare that directory:
 *
 *   stageExtension()            — copy just the extension's own files (manifest,
 *                                 src, assets) into a throwaway temp dir, so we
 *                                 never hand Chromium a repo root full of
 *                                 node_modules / .git.
 *   patchManifestForLocalhost() — widen the manifest so content scripts also
 *                                 match a localhost fixture server. Real store
 *                                 listings target real hosts; our screenshot
 *                                 fixtures are served from 127.0.0.1, and MV3
 *                                 only injects content scripts on hosts the
 *                                 manifest matches.
 *
 * Both operate on a COPY — the shipped extension dir is never mutated.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const LOCALHOST_MATCHES = ['http://localhost:*/*', 'http://127.0.0.1:*/*'];

/**
 * Copy a fixed set of paths from `rootDir` into a fresh temp directory and
 * return that directory. `include` is a list of repo-relative files/dirs that
 * make up the unpacked extension (e.g. `['manifest.json', 'src', 'assets']`).
 *
 * @param {string} rootDir
 * @param {string[]} include
 * @returns {string} absolute path to the staged temp dir
 */
function stageExtension(rootDir, include) {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'store-ext-'));
  for (const rel of include) {
    const from = path.join(rootDir, rel);
    if (!fs.existsSync(from)) {
      throw new Error(`stageExtension: '${rel}' not found under ${rootDir}`);
    }
    fs.cpSync(from, path.join(dest, rel), { recursive: true });
  }
  if (!fs.existsSync(path.join(dest, 'manifest.json'))) {
    throw new Error(`stageExtension: include list produced no manifest.json (got ${include.join(', ')})`);
  }
  return dest;
}

/**
 * Mutate `<extDir>/manifest.json` so the extension also runs against a
 * localhost fixture server. Adds localhost to every content-script match
 * list, to host_permissions, and to web_accessible_resources match lists,
 * and ensures the `scripting` permission exists (scenes that drive the
 * content script from the service worker via chrome.scripting need it).
 *
 * Idempotent: re-adding a match it already has is a no-op.
 *
 * @param {string} extDir directory containing manifest.json (a staged copy)
 * @returns {string} extDir
 */
function patchManifestForLocalhost(extDir) {
  const manifestPath = path.join(extDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const addMatches = (arr) => {
    for (const m of LOCALHOST_MATCHES) if (!arr.includes(m)) arr.push(m);
  };

  for (const cs of manifest.content_scripts || []) {
    cs.matches = cs.matches || [];
    addMatches(cs.matches);
  }

  manifest.host_permissions = manifest.host_permissions || [];
  addMatches(manifest.host_permissions);

  manifest.permissions = manifest.permissions || [];
  if (!manifest.permissions.includes('scripting')) manifest.permissions.push('scripting');

  for (const war of manifest.web_accessible_resources || []) {
    // MV3 form is an array of { resources, matches }. Guard the older string
    // form (MV2) by skipping entries without a matches array.
    if (war && Array.isArray(war.matches)) addMatches(war.matches);
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return extDir;
}

module.exports = { stageExtension, patchManifestForLocalhost, LOCALHOST_MATCHES };
