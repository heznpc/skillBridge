/**
 * Self-test for `scripts/check-dict-coverage.js`. The script enforces the
 * "48h × 11 languages" terminology SLA, so a silent regression in the
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
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'check-dict-coverage.js');

function run(env) {
  // spawnSync with array args avoids the shell-interpolation form that
  // CodeQL flags as js/shell-command-injection-from-environment. The
  // SCRIPT path is __dirname-derived so there's no real injection
  // vector, but the array form is honest about that.
  const r = spawnSync(process.execPath, [SCRIPT], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

describe('check-dict-coverage.js self-test', () => {
  test('happy path — real dictionaries pass', () => {
    const r = run({});
    expect(r.code).toBe(0);
    expect(r.out).toContain('Check 1');
    expect(r.out).toContain('Check 2');
    expect(r.out).toContain('Check 5');
    expect(r.out).toContain('Check 8');
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

  test('Check 6 fails when a catalog entry is translated in some dicts but English in others', () => {
    const tmpDir = makeMutatedDataDir((d) => {
      // Regress one locale's catalog course title back to its English key while
      // the others keep their translation — the exact partial-translation shape
      // that left Bedrock/Vertex titles English in 7 of 12 catalogs.
      const key = 'Claude with Amazon Bedrock';
      d.ko.catalog[key] = key;
    });
    try {
      const r = run({ SB_DICT_DIR_OVERRIDE: tmpDir });
      expect(r.code).toBe(1);
      expect(r.out).toMatch(/Check 6/);
      expect(r.out).toMatch(/Amazon Bedrock/);
      expect(r.out).toMatch(/partial translation/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('Check 6 does NOT flag a catalog entry that is passthrough in every dict', () => {
    // "Claude 101" is value==key in all 12 dicts by design (proper noun). The
    // check must treat uniform passthrough as correct, not partial translation.
    const r = run({});
    expect(r.code).toBe(0);
    expect(r.out).toContain('Check 6');
    expect(r.out).toContain('0 error(s)');
  });

  test('Check 7 fails when a dict translates a term in its own _protected map', () => {
    const tmpDir = makeMutatedDataDir((d) => {
      // ko's _protected map registers "Anthropic Academy" as a canonical English
      // brand term. Translating it in a section is the exact inconsistency Check 7
      // guards — the dict shipping the very mistranslation _protected exists to undo.
      d.ko.ui['Anthropic Academy'] = 'Anthropic 아카데미';
    });
    try {
      const r = run({ SB_DICT_DIR_OVERRIDE: tmpDir });
      expect(r.code).toBe(1);
      expect(r.out).toMatch(/Check 7/);
      expect(r.out).toMatch(/Anthropic Academy/);
      expect(r.out).toMatch(/_protected/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('Check 7 does NOT flag a translated term that is not protected in that locale', () => {
    // Real-data assertion (no mutation) proving Check 7 is PER-LOCALE, not a global
    // term blocklist. Precondition is asserted explicitly so the test can never go
    // vacuous: de TRANSLATES "Skills" (claudePlatform.Skills = "Fähigkeiten") while
    // ja's _protected DOES register "Skills". If Check 7 were global it would flag
    // de here; because protection is scoped to each dict's own _protected, it must
    // not — and the full real-data run stays clean (exit 0).
    const DATA = path.join(__dirname, '..', 'src', 'data');
    const de = JSON.parse(fs.readFileSync(path.join(DATA, 'de.json'), 'utf8'));
    const ja = JSON.parse(fs.readFileSync(path.join(DATA, 'ja.json'), 'utf8'));
    // Precondition: de translates Skills, ja protects it, de does NOT protect it.
    expect(de.claudePlatform.Skills).not.toBe('Skills');
    expect(Object.keys(ja._protected)).toContain('Skills');
    expect(Object.keys(de._protected)).not.toContain('Skills');

    const r = run({});
    expect(r.code).toBe(0);
    // No de Skills violation surfaced (the per-locale scoping held).
    expect(r.out).not.toMatch(/de:.*Skills.*_protected/);
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

  test('Check 8 fails when AI Fluency Diligence is rendered as industriousness in Japanese', () => {
    const tmpDir = makeMutatedDataDir((d) => {
      d.ja.aiFluency['Diligence'] = '勤勉さ';
    });
    try {
      const r = run({ SB_DICT_DIR_OVERRIDE: tmpDir });
      expect(r.code).toBe(1);
      expect(r.out).toMatch(/Check 8/);
      expect(r.out).toMatch(/Diligence/);
      expect(r.out).toMatch(/勤勉/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
