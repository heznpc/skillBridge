/* global describe, test, expect, beforeEach, afterEach */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { assertSafeBuildOutput } = require('../scripts/lib/safe-build-output');

const SYMLINK_TYPE = process.platform === 'win32' ? 'junction' : 'dir';
let testRoot;
let ownedTempRoot;
let repository;
let external;

function makeSymlink(target, linkPath) {
  fs.symlinkSync(target, linkPath, SYMLINK_TYPE);
}

beforeEach(() => {
  testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-output-test-'));
  ownedTempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skillbridge-safe-output-test-'));
  repository = path.join(testRoot, 'repository');
  external = path.join(testRoot, 'external');
  fs.mkdirSync(repository);
  fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, 'sentinel.txt'), 'keep');
});

afterEach(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
  fs.rmSync(ownedTempRoot, { recursive: true, force: true });
});

describe('safe build output validation', () => {
  test('allows projected repository dist paths and owned skillbridge temp roots', () => {
    const repositoryOutput = path.join(repository, 'dist', 'nested', 'bundle');
    expect(assertSafeBuildOutput(repositoryOutput, { repoRoot: repository })).toBe(repositoryOutput);
    expect(assertSafeBuildOutput(ownedTempRoot, { repoRoot: repository })).toBe(ownedTempRoot);
  });

  test('rejects lexical paths outside the allowed roots and repository dist itself', () => {
    expect(() => assertSafeBuildOutput(external, { repoRoot: repository })).toThrow(
      '--out-dir must be inside repository dist',
    );
    expect(() => assertSafeBuildOutput(path.join(repository, 'dist'), { repoRoot: repository })).toThrow(
      '--out-dir must be inside repository dist',
    );
  });

  test('rejects a repository dist directory that is a symlink outside the repository', () => {
    makeSymlink(external, path.join(repository, 'dist'));

    expect(() => assertSafeBuildOutput(path.join(repository, 'dist', 'bundle'), { repoRoot: repository })).toThrow(
      'possible symlink escape',
    );
    expect(fs.readFileSync(path.join(external, 'sentinel.txt'), 'utf8')).toBe('keep');
  });

  test.each([
    ['intermediate', (dist) => path.join(dist, 'escape', 'nested')],
    ['target', (dist) => path.join(dist, 'escape')],
  ])('rejects an %s output symlink that resolves outside repository dist', (_kind, getOutput) => {
    const dist = path.join(repository, 'dist');
    fs.mkdirSync(dist);
    makeSymlink(external, path.join(dist, 'escape'));

    expect(() => assertSafeBuildOutput(getOutput(dist), { repoRoot: repository })).toThrow('possible symlink escape');
    expect(fs.readFileSync(path.join(external, 'sentinel.txt'), 'utf8')).toBe('keep');
  });

  test('rejects a skillbridge temp top-level symlink that resolves outside its owned root', () => {
    const linkPath = path.join(os.tmpdir(), `skillbridge-safe-output-link-${process.pid}-${Date.now()}`);
    makeSymlink(external, linkPath);
    try {
      expect(() => assertSafeBuildOutput(path.join(linkPath, 'bundle'), { repoRoot: repository })).toThrow(
        'possible symlink escape',
      );
      expect(fs.readFileSync(path.join(external, 'sentinel.txt'), 'utf8')).toBe('keep');
    } finally {
      fs.rmSync(linkPath, { force: true });
    }
  });
});
