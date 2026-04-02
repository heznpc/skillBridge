/**
 * Tests for the glossary consistency checker and translation validator scripts.
 * Ensures the CI validation pipeline works correctly.
 */

/* global describe, test, expect */

const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');

describe('scripts/validate-translations.js', () => {
  test('exits 0 on valid files', () => {
    const result = execSync('node scripts/validate-translations.js', {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(result).toContain('Errors:   0');
  });

  test('validates all 6 premium language files', () => {
    const result = execSync('node scripts/validate-translations.js', {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(result).toContain('ko.json');
    expect(result).toContain('ja.json');
    expect(result).toContain('zh-CN.json');
    expect(result).toContain('es.json');
    expect(result).toContain('fr.json');
    expect(result).toContain('de.json');
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

  test('reports all 6 languages', () => {
    const result = execSync('node scripts/check-glossary.js', {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(result).toContain('de');
    expect(result).toContain('es');
    expect(result).toContain('fr');
    expect(result).toContain('ja');
    expect(result).toContain('ko');
    expect(result).toContain('zh-CN');
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
