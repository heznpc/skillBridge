/**
 * Self-test for `scripts/check-dict-coverage.js`. The script enforces the
 * POSITIONING.md "48h × 11 languages" SLA, so a silent regression in the
 * script itself (e.g. checks accidentally short-circuiting) would void
 * that whole defense.
 *
 * Strategy: write a temp fixture directory with deliberately-broken
 * dictionaries, then run the script with env overrides pointing it at
 * the fixture, and assert it exits 1 with the right error markers.
 *
 * Mirrors the test approach used by `tests/glossary-checker.test.js`.
 */

/* global describe, test, expect */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'check-dict-coverage.js');

function run(env) {
  try {
    const out = execSync(`node ${SCRIPT}`, {
      env: { ...process.env, ...env },
      encoding: 'utf8',
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

describe('check-dict-coverage.js self-test', () => {
  test('happy path — real dictionaries pass', () => {
    const r = run({});
    expect(r.code).toBe(0);
    expect(r.out).toContain('Check 1');
    expect(r.out).toContain('Check 2');
    expect(r.out).toContain('Check 5');
    expect(r.out).toContain('0 error(s)');
  });

  // The remaining tests SIMULATE failures by temporarily corrupting a
  // copy of one dictionary, running the script with SB_DICT_DIR pointing
  // at the corrupted copy, then restoring. We patch the script via an
  // env-driven override below.
});

/**
 * Build a working copy of src/data/ where one dict has been mutated.
 * Returns the temp dir path; caller is responsible for cleanup.
 *
 * @param {(dictByLang: Record<string, any>) => void} mutate
 * @returns {string}
 */
function makeMutatedDataDir(mutate) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-dict-test-'));
  const realData = path.join(__dirname, '..', 'src', 'data');
  fs.cpSync(realData, tmpDir, { recursive: true });
  const dicts = {};
  for (const f of fs.readdirSync(tmpDir).filter((x) => x.endsWith('.json'))) {
    dicts[f.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(tmpDir, f), 'utf8'));
  }
  mutate(dicts);
  for (const [lang, data] of Object.entries(dicts)) {
    fs.writeFileSync(path.join(tmpDir, `${lang}.json`), JSON.stringify(data, null, 2));
  }
  return tmpDir;
}

// The script reads DATA_DIR from a constant at the top. To make it
// scriptable under test we add an env-var override below in the same PR.
// If SB_DICT_DIR_OVERRIDE isn't set, the script uses src/data/ as before.
describe('check-dict-coverage.js — fault injection', () => {
  test('Check 1 fails when a language drops a section', () => {
    const tmpDir = makeMutatedDataDir((d) => {
      delete d.ja.claude101; // ja loses a course section
    });
    try {
      const r = run({ SB_DICT_DIR_OVERRIDE: tmpDir });
      expect(r.code).toBe(1);
      expect(r.out).toMatch(/Check 1/);
      expect(r.out).toMatch(/ja.*claude101|claude101.*ja/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('Check 2 fails when a language adds an English-only key', () => {
    const tmpDir = makeMutatedDataDir((d) => {
      d.ko.claude101['Brand new term that ja does not have'] = '새 용어';
    });
    try {
      const r = run({ SB_DICT_DIR_OVERRIDE: tmpDir });
      expect(r.code).toBe(1);
      expect(r.out).toMatch(/Check 2/);
      // The diff message names the section, the difference shape, and
      // surfaces the offending key.
      expect(r.out).toMatch(/claude101/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('Check 5 fails when a dict version drifts from manifest', () => {
    const tmpDir = makeMutatedDataDir((d) => {
      d.ko._meta.version = '0.0.1-wrong';
    });
    try {
      const r = run({ SB_DICT_DIR_OVERRIDE: tmpDir });
      expect(r.code).toBe(1);
      expect(r.out).toMatch(/Check 5/);
      expect(r.out).toMatch(/0\.0\.1-wrong/);
      expect(r.out).toMatch(/npm run docs/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('_protected key divergence between languages is allowed (NOT flagged)', () => {
    const tmpDir = makeMutatedDataDir((d) => {
      d.ko._protected['Brand-new-Korean-only-wrong-form'] = 'Claude';
    });
    try {
      const r = run({ SB_DICT_DIR_OVERRIDE: tmpDir });
      // _protected divergence is expected — each language has its own
      // mistranslation patterns. Script must NOT flag this.
      expect(r.code).toBe(0);
      expect(r.out).toContain('0 error(s)');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
