/**
 * Unit tests for the Firefox manifest builder script.
 *
 * Validates that the build-firefox.js script correctly transforms
 * the Chrome manifest into a Firefox-compatible manifest.
 */

/* global describe, test, expect, beforeAll, afterAll */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist', 'firefox');

// ── Read the Chrome source manifest for comparison ─────────────
const chromeManifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')
);

// ── Run the build script before tests ──────────────────────────
beforeAll(() => {
  execSync('node scripts/build-firefox.js', { cwd: ROOT, encoding: 'utf8' });
});

// ── Tests ──────────────────────────────────────────────────────

describe('Firefox build output', () => {
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
    firefoxManifest = JSON.parse(
      fs.readFileSync(path.join(DIST_DIR, 'manifest.json'), 'utf8')
    );
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
    expect(firefoxManifest.background.scripts).toContain(
      chromeManifest.background.service_worker
    );
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

  test('preserves content_scripts', () => {
    expect(firefoxManifest.content_scripts).toEqual(chromeManifest.content_scripts);
  });

  test('preserves web_accessible_resources', () => {
    expect(firefoxManifest.web_accessible_resources).toEqual(
      chromeManifest.web_accessible_resources
    );
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

  test('copies source JS files', () => {
    expect(fs.existsSync(path.join(DIST_DIR, 'src', 'background', 'background.js'))).toBe(true);
    expect(fs.existsSync(path.join(DIST_DIR, 'src', 'lib', 'constants.js'))).toBe(true);
    expect(fs.existsSync(path.join(DIST_DIR, 'src', 'content', 'content.js'))).toBe(true);
  });
});
