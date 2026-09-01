/**
 * Integration tests for the Firefox manifest builder script.
 *
 * Validates that the build-firefox.js script correctly transforms
 * the Chrome manifest into a Firefox-compatible manifest.
 */

/* global describe, test, expect, beforeAll, afterAll */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TEST_OUTPUT_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'skillbridge-firefox-test-'));
const DIST_DIR = path.join(TEST_OUTPUT_ROOT, 'firefox');
const REJECTED_OUTPUT_DIR = path.join(ROOT, `.firefox-output-probe-${process.pid}`);
const EXTERNAL_OUTPUT_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'build-firefox-external-'));
const ESCAPING_OUTPUT_LINK = path.join(TEST_OUTPUT_ROOT, 'escape');
const EXTERNAL_SENTINEL = path.join(EXTERNAL_OUTPUT_ROOT, 'sentinel.txt');
fs.writeFileSync(EXTERNAL_SENTINEL, 'keep');
fs.symlinkSync(EXTERNAL_OUTPUT_ROOT, ESCAPING_OUTPUT_LINK, process.platform === 'win32' ? 'junction' : 'dir');

// ── Read the Chrome source manifest for comparison ─────────────
const chromeManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

// ── Run the build script before tests ──────────────────────────
beforeAll(() => {
  execSync(`node scripts/build-firefox.js --out-dir ${JSON.stringify(DIST_DIR)}`, {
    cwd: ROOT,
    encoding: 'utf8',
  });
});

afterAll(() => {
  fs.rmSync(TEST_OUTPUT_ROOT, { recursive: true, force: true });
  fs.rmSync(REJECTED_OUTPUT_DIR, { recursive: true, force: true });
  fs.rmSync(EXTERNAL_OUTPUT_ROOT, { recursive: true, force: true });
});

// ── Tests ──────────────────────────────────────────────────────

describe('Firefox build output', () => {
  test('refuses a destructive custom output path outside dist or the system temp directory', () => {
    const result = spawnSync(process.execPath, ['scripts/build-firefox.js', '--out-dir', REJECTED_OUTPUT_DIR], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('--out-dir must be inside repository dist');
    expect(fs.existsSync(REJECTED_OUTPUT_DIR)).toBe(false);
  });

  test('refuses an allowed-looking output symlink that resolves outside its temporary root', () => {
    const result = spawnSync(process.execPath, ['scripts/build-firefox.js', '--out-dir', ESCAPING_OUTPUT_LINK], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('possible symlink escape');
    expect(fs.readFileSync(EXTERNAL_SENTINEL, 'utf8')).toBe('keep');
  });

  test('creates dist/firefox directory', () => {
    expect(fs.existsSync(DIST_DIR)).toBe(true);
  });

  test('creates a manifest.json in dist/firefox', () => {
    expect(fs.existsSync(path.join(DIST_DIR, 'manifest.json'))).toBe(true);
  });

  test('output manifest is valid JSON', () => {
    const content = fs.readFileSync(path.join(DIST_DIR, 'manifest.json'), 'utf8');
    expect(() => JSON.parse(content)).not.toThrow();
  });
});

describe('Firefox manifest transformations', () => {
  let firefoxManifest;

  beforeAll(() => {
    firefoxManifest = JSON.parse(fs.readFileSync(path.join(DIST_DIR, 'manifest.json'), 'utf8'));
  });

  test('adds browser_specific_settings with gecko ID', () => {
    expect(firefoxManifest.browser_specific_settings).toBeDefined();
    expect(firefoxManifest.browser_specific_settings.gecko).toBeDefined();
    expect(firefoxManifest.browser_specific_settings.gecko.id).toBe('skillbridge@heznpc');
  });

  test('sets gecko strict_min_version to 121.0', () => {
    expect(firefoxManifest.browser_specific_settings.gecko.strict_min_version).toBe('121.0');
  });

  test('replaces service_worker with background.scripts array', () => {
    // Chrome manifest has service_worker
    expect(chromeManifest.background.service_worker).toBeDefined();

    // Firefox manifest should have scripts array instead
    expect(firefoxManifest.background.service_worker).toBeUndefined();
    expect(firefoxManifest.background.scripts).toBeDefined();
    expect(Array.isArray(firefoxManifest.background.scripts)).toBe(true);
    expect(firefoxManifest.background.scripts.length).toBeGreaterThan(0);
  });

  test('background.scripts contains the original service_worker path', () => {
    expect(firefoxManifest.background.scripts).toContain(chromeManifest.background.service_worker);
  });

  test('removes minimum_chrome_version', () => {
    // Chrome manifest has it
    expect(chromeManifest.minimum_chrome_version).toBeDefined();

    // Firefox manifest should not
    expect(firefoxManifest.minimum_chrome_version).toBeUndefined();
  });

  test('preserves manifest_version 3', () => {
    expect(firefoxManifest.manifest_version).toBe(3);
  });

  test('preserves extension version', () => {
    expect(firefoxManifest.version).toBe(chromeManifest.version);
  });

  test('preserves permissions', () => {
    expect(firefoxManifest.permissions).toEqual(chromeManifest.permissions);
  });

  test('preserves host_permissions', () => {
    expect(firefoxManifest.host_permissions).toEqual(chromeManifest.host_permissions);
  });

  test('preserves content_scripts while omitting Chrome-only world declarations', () => {
    const expectedContentScripts = chromeManifest.content_scripts.map((contentScript) => {
      const compatibleContentScript = { ...contentScript };
      delete compatibleContentScript.world;
      return compatibleContentScript;
    });

    expect(firefoxManifest.content_scripts).toEqual(expectedContentScripts);
    expect(firefoxManifest.content_scripts[1].world).toBeUndefined();
  });

  test('preserves web_accessible_resources', () => {
    expect(firefoxManifest.web_accessible_resources).toEqual(chromeManifest.web_accessible_resources);
  });

  test('preserves name and description', () => {
    expect(firefoxManifest.name).toBe(chromeManifest.name);
    expect(firefoxManifest.description).toBe(chromeManifest.description);
  });
});

describe('Firefox build file copying', () => {
  test('copies src directory', () => {
    expect(fs.existsSync(path.join(DIST_DIR, 'src'))).toBe(true);
  });

  test('copies _locales directory', () => {
    expect(fs.existsSync(path.join(DIST_DIR, '_locales'))).toBe(true);
  });

  test('copies assets directory', () => {
    expect(fs.existsSync(path.join(DIST_DIR, 'assets'))).toBe(true);
  });

  test('does NOT copy node_modules', () => {
    expect(fs.existsSync(path.join(DIST_DIR, 'node_modules'))).toBe(false);
  });

  test('does NOT copy .git directory', () => {
    expect(fs.existsSync(path.join(DIST_DIR, '.git'))).toBe(false);
  });

  test('does NOT copy dist directory (no recursive copy)', () => {
    expect(fs.existsSync(path.join(DIST_DIR, 'dist'))).toBe(false);
  });

  test('does NOT copy repo-only development surfaces', () => {
    for (const name of [
      'tests',
      'scripts',
      'coverage',
      'test-results',
      '.playwright-mcp',
      'package.json',
      'package-lock.json',
    ]) {
      expect(fs.existsSync(path.join(DIST_DIR, name))).toBe(false);
    }
  });

  test('copies source JS files', () => {
    expect(fs.existsSync(path.join(DIST_DIR, 'src', 'background', 'background.js'))).toBe(true);
    expect(fs.existsSync(path.join(DIST_DIR, 'src', 'lib', 'constants.js'))).toBe(true);
    expect(fs.existsSync(path.join(DIST_DIR, 'src', 'content', 'content.js'))).toBe(true);
  });

  test('copies only extension icon assets from assets/', () => {
    expect(fs.existsSync(path.join(DIST_DIR, 'assets', 'icons', 'icon128.png'))).toBe(true);
    expect(fs.existsSync(path.join(DIST_DIR, 'assets', 'screenshots'))).toBe(false);
  });

  test('copies license and third-party notices', () => {
    expect(fs.existsSync(path.join(DIST_DIR, 'LICENSE'))).toBe(true);
    expect(fs.existsSync(path.join(DIST_DIR, 'THIRD_PARTY_NOTICES.md'))).toBe(true);
    expect(fs.existsSync(path.join(DIST_DIR, 'licenses', 'Apache-2.0.txt'))).toBe(true);
    expect(fs.existsSync(path.join(DIST_DIR, 'licenses', 'heyputer-kv.js-MIT.txt'))).toBe(true);
  });
});
