/**
 * Behavioral tests for the translation validation scripts.
 *
 * Shipped dictionaries must pass, while deliberately broken temporary
 * fixtures prove that each checker actually rejects the defect it claims to
 * detect.
 */

/* global describe, test, expect, afterEach */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DICTIONARY_FILES = fs
  .readdirSync(path.join(ROOT, 'src', 'data'))
  .filter((file) => file.endsWith('.json'))
  .sort();
const tempDirs = [];

function makeTempDir(prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

function writeText(root, relativePath, contents) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function writeJson(root, relativePath, value) {
  writeText(root, relativePath, JSON.stringify(value));
}

function runScript(script, args = []) {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return {
    status: result.status,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function makeI18nFixture() {
  const root = makeTempDir('skillbridge-i18n-');
  const messages = {
    extDescription: { message: 'A concise extension description.' },
    extensionName: { message: 'SkillBridge' },
  };

  writeJson(root, '_locales/en/messages.json', messages);
  writeJson(root, '_locales/nl/messages.json', messages);
  writeText(root, 'src/shared/runtime-constants.js', '');
  writeText(root, 'src/lib/selectors.js', '');
  writeText(
    root,
    'src/lib/constants.js',
    "const PREMIUM_LANGUAGE_CODES = ['nl'];\nconst POPUP_LABELS = { en: { save: 'Save' }, nl: { save: 'Opslaan' } };\n",
  );
  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe('scripts/validate-translations.js', () => {
  test('validates every shipped premium language file', () => {
    const result = runScript('validate-translations.js');

    expect(result.status).toBe(0);
    expect(result.output).toContain('Errors:   0');
    for (const file of DICTIONARY_FILES) expect(result.output).toContain(file);
    expect(result.output).toContain(`Files:    ${DICTIONARY_FILES.length}`);
  });

  test('rejects invalid JSON, non-object roots, and malformed sections', () => {
    const dataDir = makeTempDir('skillbridge-validate-');
    const invalidJson = path.join(dataDir, 'invalid-json.json');
    const nullRoot = path.join(dataDir, 'null-root.json');
    const malformed = path.join(dataDir, 'xx.json');
    writeText(dataDir, 'invalid-json.json', '{');
    writeText(dataDir, 'null-root.json', 'null');
    writeJson(dataDir, 'xx.json', {
      _meta: { lang: 'xx', langName: 'Broken', version: '0.0.0' },
      _protected: null,
      lessons: [],
    });

    const result = runScript('validate-translations.js', [invalidJson, nullRoot, malformed]);

    expect(result.status).toBe(1);
    expect(result.output).toContain('invalid-json.json: Invalid JSON');
    expect(result.output).toContain('null-root.json: Top-level JSON value must be an object');
    expect(result.output).toContain('xx.json: _protected must be an object');
    expect(result.output).toContain('xx.json: Section "lessons" must be a plain object');
  });
});

describe('scripts/check-glossary.js', () => {
  test('passes all shipped dictionaries and reports every premium language', () => {
    const result = runScript('check-glossary.js');

    expect(result.status).toBe(0);
    expect(result.output).toContain('PASSED');
    expect(result.output).toContain('Errors:   0');
    for (const file of DICTIONARY_FILES) expect(result.output).toContain(file.replace('.json', ''));
  });

  test('rejects a wrong form that would corrupt its own protected term', () => {
    const dataDir = makeTempDir('skillbridge-glossary-');
    writeJson(dataDir, 'xx.json', {
      _meta: { lang: 'xx' },
      _protected: { subagent: ['subagen'] },
      lessons: { 'Use a subagent for this task': 'Use a subagent for this task' },
    });

    const result = runScript('check-glossary.js', ['--data-dir', dataDir]);

    expect(result.status).toBe(1);
    expect(result.output).toContain('wrong-form "subagen" is a substring of the correct term');
    expect(result.output).toContain('FAILED');
  });

  test('rejects a dictionary that cannot be parsed', () => {
    const dataDir = makeTempDir('skillbridge-glossary-json-');
    writeText(dataDir, 'broken.json', '{');

    const result = runScript('check-glossary.js', ['--data-dir', dataDir]);

    expect(result.status).toBe(1);
    expect(result.output).toContain('Failed to load dictionary');
    expect(result.output).toContain('broken.json');
  });
});

describe('scripts/check-i18n-keys.js', () => {
  test('passes the shipped locale and label dictionaries', () => {
    const result = runScript('check-i18n-keys.js');

    expect(result.status).toBe(0);
    expect(result.output).toContain('0 error(s)');
  });

  test('rejects malformed locale JSON', () => {
    const fixtureRoot = makeI18nFixture();
    writeText(fixtureRoot, '_locales/nl/messages.json', '{');

    const result = runScript('check-i18n-keys.js', ['--root', fixtureRoot]);

    expect(result.status).toBe(1);
    expect(result.output).toContain('Invalid JSON in nl/messages.json');
  });

  test('rejects missing nested label keys', () => {
    const fixtureRoot = makeI18nFixture();
    writeText(
      fixtureRoot,
      'src/lib/constants.js',
      "const PREMIUM_LANGUAGE_CODES = ['nl'];\nconst POPUP_LABELS = { en: { save: 'Save' }, nl: {} };\n",
    );

    const result = runScript('check-i18n-keys.js', ['--root', fixtureRoot]);

    expect(result.status).toBe(1);
    expect(result.output).toContain('POPUP_LABELS.nl: missing sub-keys save');
  });
});

describe('scripts/check-locale-contamination.js', () => {
  test('passes the shipped locale dictionaries', () => {
    const result = runScript('check-locale-contamination.js');

    expect(result.status).toBe(0);
    expect(result.output).toContain('No cross-locale contamination');
  });

  test('rejects copied long translations in a temporary locale pair', () => {
    const dataDir = makeTempDir('skillbridge-contamination-');
    const copied = 'This deliberately copied translation is much longer than twenty characters.';
    writeJson(dataDir, 'aa.json', { lessons: { source: copied } });
    writeJson(dataDir, 'bb.json', { lessons: { source: copied } });

    const result = runScript('check-locale-contamination.js', ['--data-dir', dataDir]);

    expect(result.status).toBe(1);
    expect(result.output).toContain('100.0%');
    expect(result.output).toContain('likely copied and not fully re-translated');
  });
});

describe('scripts/audit-translations.js', () => {
  test('audits every shipped premium dictionary', () => {
    const result = runScript('audit-translations.js');

    expect(result.status).toBe(0);
    for (const file of DICTIONARY_FILES) expect(result.output).toContain(`${file} loaded`);
    expect(result.output).toContain(`Languages: ${DICTIONARY_FILES.length}`);
    expect(result.output).toContain('✅ All checks passed');
  });
});
