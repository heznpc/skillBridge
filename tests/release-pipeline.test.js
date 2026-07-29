/**
 * Unit and command-boundary tests for the upload ZIP release gate.
 */

/* global describe, test, expect, afterEach */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { assertMatchingFileLists, parseZipFileEntries, verifyZipMatchesBundle } = require('../scripts/release-pipeline');

const tempDirs = new Set();

function createBundleFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skillbridge-release-zip-'));
  tempDirs.add(root);
  const bundleDir = path.join(root, 'bundled');
  const zipPath = path.join(root, 'upload.zip');
  fs.mkdirSync(path.join(bundleDir, 'src', 'popup'), { recursive: true });
  fs.writeFileSync(path.join(bundleDir, 'manifest.json'), '{}');
  fs.writeFileSync(path.join(bundleDir, 'src', 'popup', 'popup.html'), '<!doctype html>');
  fs.writeFileSync(path.join(bundleDir, 'src', 'popup', 'popup.js'), 'void 0;');
  execFileSync('zip', ['-qr', zipPath, '.'], { cwd: bundleDir });
  return { bundleDir, zipPath };
}

afterEach(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  tempDirs.clear();
});

describe('release upload ZIP verification', () => {
  test('accepts an intact ZIP with the same files as dist/bundled', () => {
    const fixture = createBundleFixture();
    expect(verifyZipMatchesBundle(fixture)).toEqual({ fileCount: 3 });
  });

  test('rejects a ZIP that is missing a bundle file', () => {
    const fixture = createBundleFixture();
    fs.writeFileSync(path.join(fixture.bundleDir, 'added-after-zip.js'), 'void 0;');
    expect(() => verifyZipMatchesBundle(fixture)).toThrow(/missing from ZIP: added-after-zip\.js/);
  });

  test('rejects a corrupt ZIP before comparing its entries', () => {
    const fixture = createBundleFixture();
    fs.truncateSync(fixture.zipPath, Math.floor(fs.statSync(fixture.zipPath).size / 2));
    expect(() => verifyZipMatchesBundle(fixture)).toThrow(/Upload ZIP integrity check failed/);
  });

  test('rejects unsafe, duplicate, and extra ZIP entries', () => {
    expect(() => parseZipFileEntries('../escape.js\n')).toThrow(/Unsafe ZIP entry path/);
    expect(() => parseZipFileEntries('../escape-dir/\nmanifest.json\n')).toThrow(/Unsafe ZIP entry path/);
    expect(() => parseZipFileEntries('manifest.json\nmanifest.json\n')).toThrow(/Duplicate ZIP file entry/);
    expect(() => assertMatchingFileLists(['manifest.json'], ['manifest.json', 'unexpected.js'])).toThrow(
      /not present in dist\/bundled: unexpected\.js/,
    );
  });
});
