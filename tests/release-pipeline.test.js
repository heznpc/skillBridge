/**
 * Unit and command-boundary tests for the upload ZIP release gate.
 */

/* global describe, test, expect, afterEach, jest */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  assertMatchingFileLists,
  buildCommandEnv,
  main,
  parseZipFileEntries,
  verifyZipMatchesBundle,
} = require('../scripts/release-pipeline');

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

function fakeOperations(overrides = {}) {
  return {
    run: jest.fn(),
    runNpm: jest.fn(),
    runNode: jest.fn(),
    verifyArtifacts: jest.fn(),
    verifyStoreDescriptionSync: jest.fn(),
    ...overrides,
  };
}

function fakeLogger() {
  return { log: jest.fn(), error: jest.fn() };
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

describe('release pipeline orchestration', () => {
  test('quiet browser commands override leaked headed and inspector state', () => {
    expect(
      buildCommandEnv(
        { quietBrowser: true, env: { KEEP: 'child' } },
        { E2E_HEADED: '1', PWDEBUG: '1', PWTEST_INSPECTOR: '1', KEEP: 'parent' },
      ),
    ).toEqual({ E2E_HEADED: '0', PWDEBUG: '0', KEEP: 'child' });
  });

  test('smoke mode runs only the production build and first-user browser path', () => {
    const operations = fakeOperations();
    const logger = fakeLogger();

    expect(
      main({
        modes: { smoke: true, preflight: false, full: false, postUpload: false },
        operations,
        logger,
      }),
    ).toBe(0);

    expect(operations.runNpm).toHaveBeenCalledWith('Build production extension bundle', 'build:bundle');
    expect(operations.run).toHaveBeenCalledWith(
      'First-user and action-popup smoke E2E',
      expect.any(String),
      ['playwright', 'test', 'tests/e2e/first-user-flow.spec.js', 'tests/e2e/popup.spec.js'],
      { timeoutMs: 180_000, quietBrowser: true },
    );
    expect(operations.runNpm).toHaveBeenCalledTimes(1);
    expect(operations.runNode).not.toHaveBeenCalled();
    expect(operations.verifyArtifacts).not.toHaveBeenCalled();
  });

  test('post-upload mode invokes only the live CWS drift command with JSON output', () => {
    const operations = fakeOperations();

    expect(
      main({
        modes: { smoke: false, preflight: false, full: false, postUpload: true },
        operations,
        logger: fakeLogger(),
      }),
    ).toBe(0);

    expect(operations.runNode).toHaveBeenCalledWith('Post-upload CWS drift check', 'scripts/check-cws-drift.js', [
      '--json',
    ]);
    expect(operations.run).not.toHaveBeenCalled();
    expect(operations.runNpm).not.toHaveBeenCalled();
  });

  test('full mode captures store media, verifies artifacts, and finishes with the full E2E suite', () => {
    const operations = fakeOperations();

    expect(
      main({
        modes: { smoke: false, preflight: false, full: true, postUpload: false },
        operations,
        logger: fakeLogger(),
      }),
    ).toBe(0);

    const npmScripts = operations.runNpm.mock.calls.map(([, script]) => script);
    expect(npmScripts).toEqual(
      expect.arrayContaining([
        'check:version',
        'test:ci',
        'build:bundle',
        'build:firefox',
        'capture:store',
        'build:bundle:zip',
        'test:e2e',
      ]),
    );
    expect(npmScripts.at(-1)).toBe('test:e2e');
    expect(npmScripts).not.toContain('capture:store:headed');
    expect(operations.runNode).toHaveBeenCalledWith(
      'Regenerate promo video derivatives',
      'scripts/build-promo-media.js',
    );
    expect(operations.verifyArtifacts).toHaveBeenCalledTimes(1);
    expect(operations.verifyStoreDescriptionSync).not.toHaveBeenCalled();
  });

  test('default preflight verifies existing store copy and excludes capture and full E2E', () => {
    const operations = fakeOperations();

    expect(
      main({
        modes: { smoke: false, preflight: true, full: false, postUpload: false },
        operations,
        logger: fakeLogger(),
      }),
    ).toBe(0);

    const npmScripts = operations.runNpm.mock.calls.map(([, script]) => script);
    expect(operations.verifyStoreDescriptionSync).toHaveBeenCalledTimes(1);
    expect(operations.verifyArtifacts).toHaveBeenCalledTimes(1);
    expect(npmScripts).not.toContain('capture:store');
    expect(npmScripts).not.toContain('test:e2e');
  });

  test('stops orchestration at the first failed gate and reports a nonzero result', () => {
    const logger = fakeLogger();
    const operations = fakeOperations({
      runNpm: jest.fn((_label, script) => {
        if (script === 'lint') throw new Error('lint failed');
      }),
    });

    expect(
      main({
        modes: { smoke: false, preflight: true, full: false, postUpload: false },
        operations,
        logger,
      }),
    ).toBe(1);

    expect(operations.runNpm.mock.calls.map(([, script]) => script)).toEqual(['check:version', 'lint']);
    expect(operations.run).not.toHaveBeenCalled();
    expect(operations.verifyArtifacts).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('\nRelease pipeline stopped: lint failed');
  });
});
