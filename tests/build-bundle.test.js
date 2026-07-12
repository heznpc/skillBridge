/**
 * Unit tests for the bundled Chrome Web Store artifact builder.
 *
 * The CWS upload path should contain only extension runtime resources. Repo
 * marketing screenshots live under assets/screenshots for README/store copy,
 * but they do not belong in dist/bundled or the upload zip.
 */

/* global describe, test, expect, beforeAll */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist', 'bundled');

function localHtmlReferences(html) {
  return Array.from(html.matchAll(/<(?:script|link|img)\b[^>]*?\b(?:src|href)=["']([^"']+)["'][^>]*>/gi))
    .map((match) => match[1].split(/[?#]/, 1)[0])
    .filter((ref) => ref && !/^(?:[a-z]+:|\/\/|#)/i.test(ref));
}

beforeAll(() => {
  execSync('node scripts/build-bundle.js', { cwd: ROOT, encoding: 'utf8' });
});

describe('bundled artifact shape', () => {
  test('keeps the generic ZIP command on the CWS-safe bundle path', () => {
    const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts;
    expect(scripts['build:zip']).toBe('npm run build:bundle:zip');
    expect(scripts['build:bundle:zip']).toContain('rm -f store-assets/skillbridge.zip');
    expect(scripts['build:developer:zip']).toContain('skillbridge-developer.zip');
    expect(scripts['build:developer:zip']).toContain('LICENSE THIRD_PARTY_NOTICES.md');
  });

  test('creates a bundled manifest with bundled content and background paths', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIST_DIR, 'manifest.json'), 'utf8'));
    expect(manifest.content_scripts[0].js).toEqual(['content.bundle.js']);
    expect(manifest.content_scripts[0].css).toEqual(['content.bundle.css']);
    expect(manifest.background.service_worker).toBe('background.bundle.js');
    expect(manifest.host_permissions).not.toContain('https://*.youtube.com/*');
  });

  test('keeps shadow CSS resources fetchable in the bundled manifest', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIST_DIR, 'manifest.json'), 'utf8'));
    for (const entry of manifest.web_accessible_resources) {
      if (!entry.resources.some((r) => r.includes('content'))) continue;
      expect(entry.resources).toContain('content.bundle.css');
      expect(entry.resources).toContain('src/content/styles/fab.css');
      expect(entry.resources).not.toContain('src/content/styles/*.css');
    }
    expect(fs.existsSync(path.join(DIST_DIR, 'src', 'content', 'styles', 'fab.css'))).toBe(true);
  });

  test('copies runtime constants used by bundled popup and background', () => {
    expect(fs.existsSync(path.join(DIST_DIR, 'src', 'shared', 'runtime-constants.js'))).toBe(true);
  });

  test('copies every local dependency referenced by the popup in load order', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIST_DIR, 'manifest.json'), 'utf8'));
    const popupPath = manifest.action.default_popup;
    const popupFile = path.join(DIST_DIR, popupPath);
    const popupHtml = fs.readFileSync(popupFile, 'utf8');
    const refs = localHtmlReferences(popupHtml);

    expect(refs).toEqual([
      '../lib/browser-polyfill.js',
      '../shared/build-config.js',
      '../shared/runtime-constants.js',
      '../lib/selectors.js',
      '../lib/constants.js',
      'popup.js',
    ]);
    for (const ref of refs) {
      expect(fs.existsSync(path.resolve(path.dirname(popupFile), ref))).toBe(true);
    }
  });

  test('copies extension icons but excludes repo marketing screenshots', () => {
    expect(fs.existsSync(path.join(DIST_DIR, 'assets', 'icons', 'icon128.png'))).toBe(true);
    expect(fs.existsSync(path.join(DIST_DIR, 'assets', 'screenshots'))).toBe(false);
  });

  test('copies the license without notices for dependencies not shipped in CWS', () => {
    expect(fs.existsSync(path.join(DIST_DIR, 'LICENSE'))).toBe(true);
    // The repo notice currently documents Puter.js only. The CWS edition does
    // not ship Puter, so copying that notice would misdescribe the artifact.
    expect(fs.existsSync(path.join(DIST_DIR, 'THIRD_PARTY_NOTICES.md'))).toBe(false);
  });

  test('excludes the Puter bridge and pins the CWS AI gateway off', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIST_DIR, 'manifest.json'), 'utf8'));
    const resources = manifest.web_accessible_resources.flatMap((entry) => entry.resources);
    expect(resources).not.toContain('src/lib/page-bridge.js');
    expect(resources).not.toContain('src/bridge/puter.js');
    expect(fs.existsSync(path.join(DIST_DIR, 'src', 'lib', 'page-bridge.js'))).toBe(false);
    expect(fs.existsSync(path.join(DIST_DIR, 'src', 'bridge', 'puter.js'))).toBe(false);
    expect(fs.readFileSync(path.join(DIST_DIR, 'content.bundle.js'), 'utf8')).toContain(
      '__SKILLBRIDGE_AI_GATEWAY_ENABLED__',
    );
    expect(fs.readFileSync(path.join(DIST_DIR, 'src', 'shared', 'build-config.js'), 'utf8')).toContain('value:false');
  });

  test('does not copy repo-only development surfaces', () => {
    for (const name of ['tests', 'scripts', 'coverage', 'test-results', 'package.json', 'package-lock.json']) {
      expect(fs.existsSync(path.join(DIST_DIR, name))).toBe(false);
    }
  });
});
