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

beforeAll(() => {
  execSync('node scripts/build-bundle.js', { cwd: ROOT, encoding: 'utf8' });
});

describe('bundled artifact shape', () => {
  test('creates a bundled manifest with bundled content and background paths', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIST_DIR, 'manifest.json'), 'utf8'));
    expect(manifest.content_scripts[0].js).toEqual(['content.bundle.js']);
    expect(manifest.content_scripts[0].css).toEqual(['content.bundle.css']);
    expect(manifest.background.service_worker).toBe('background.bundle.js');
  });

  test('copies extension icons but excludes repo marketing screenshots', () => {
    expect(fs.existsSync(path.join(DIST_DIR, 'assets', 'icons', 'icon128.png'))).toBe(true);
    expect(fs.existsSync(path.join(DIST_DIR, 'assets', 'screenshots'))).toBe(false);
  });

  test('does not copy repo-only development surfaces', () => {
    for (const name of ['tests', 'scripts', 'coverage', 'test-results', 'package.json', 'package-lock.json']) {
      expect(fs.existsSync(path.join(DIST_DIR, name))).toBe(false);
    }
  });
});
