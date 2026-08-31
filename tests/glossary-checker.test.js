/**
 * Tests for the glossary consistency checker and translation validator scripts.
 * Ensures the CI validation pipeline works correctly.
 */

/* global describe, test, expect */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DICTIONARY_FILES = fs
  .readdirSync(path.join(ROOT, 'src', 'data'))
  .filter((file) => file.endsWith('.json'))
  .sort();

describe('scripts/validate-translations.js', () => {
  test('exits 0 on valid files', () => {
    const result = execSync('node scripts/validate-translations.js', {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(result).toContain('Errors:   0');
  });

  test('validates every shipped premium language file', () => {
    const result = execSync('node scripts/validate-translations.js', {
      cwd: ROOT,
      encoding: 'utf8',
    });
    for (const file of DICTIONARY_FILES) expect(result).toContain(file);
    expect(result).toContain(`Files:    ${DICTIONARY_FILES.length}`);
  });
});

describe('scripts/check-glossary.js', () => {
  test('exits 0 (passes) on current data files', () => {
    const result = execSync('node scripts/check-glossary.js', {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(result).toContain('PASSED');
    expect(result).toContain('Errors:   0');
  });

  test('reports every shipped premium language', () => {
    const result = execSync('node scripts/check-glossary.js', {
      cwd: ROOT,
      encoding: 'utf8',
    });
    for (const file of DICTIONARY_FILES) expect(result).toContain(file.replace('.json', ''));
  });

  test('checks section coverage', () => {
    const result = execSync('node scripts/check-glossary.js', {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(result).toContain('Check 3: Section coverage');
  });

  test('checks key coverage', () => {
    const result = execSync('node scripts/check-glossary.js', {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(result).toContain('Check 4: Key coverage');
  });
});

describe('scripts/audit-translations.js', () => {
  test('audits every shipped premium dictionary', () => {
    const result = execSync('node scripts/audit-translations.js', {
      cwd: ROOT,
      encoding: 'utf8',
    });

    for (const file of DICTIONARY_FILES) expect(result).toContain(`${file} loaded`);
    expect(result).toContain(`Languages: ${DICTIONARY_FILES.length}`);
    expect(result).toContain('✅ All checks passed');
  });
});
