/**
 * Unit tests for selectors.js structural integrity.
 *
 * Validates that all Skilljar DOM selectors are properly defined,
 * follow expected naming conventions, and contain valid CSS selector syntax.
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

const selectorsSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'lib', 'selectors.js'), 'utf8'
);

const SKILLJAR_SELECTORS = new Function(`${selectorsSrc}; return SKILLJAR_SELECTORS;`)();

// ── Tests ──────────────────────────────────────────────────────

describe('SKILLJAR_SELECTORS', () => {
  test('is a non-empty object', () => {
    expect(typeof SKILLJAR_SELECTORS).toBe('object');
    expect(Object.keys(SKILLJAR_SELECTORS).length).toBeGreaterThan(0);
  });

  test('all values are non-empty strings', () => {
    for (const [key, value] of Object.entries(SKILLJAR_SELECTORS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  describe('required selectors exist', () => {
    const REQUIRED_KEYS = [
      'headerRight',
      'headerLinks',
      'lessonMain',
      'lessonContent',
      'courseContent',
      'courseTitle',
      'courseBox',
      'courseBoxDesc',
      'ribbonText',
      'courseTime',
      'lessonRow',
      'sectionTitle',
      'leftNavReturn',
      'courseOverview',
      'lessonTop',
      'detailsPane',
      'focusLink',
      'faqTitle',
      'faqPost',
      'quizForm',
      'answerOption',
      'answerLabel',
      'quizResult',
      'certificateSection',
    ];

    for (const key of REQUIRED_KEYS) {
      test(`has "${key}" selector`, () => {
        expect(SKILLJAR_SELECTORS[key]).toBeDefined();
        expect(typeof SKILLJAR_SELECTORS[key]).toBe('string');
      });
    }
  });

  describe('CSS selector syntax', () => {
    test('selectors use valid CSS prefixes (., #, or tag name)', () => {
      for (const [key, value] of Object.entries(SKILLJAR_SELECTORS)) {
        // Each comma-separated selector should start with #, ., or a letter (tag name),
        // or contain attribute selectors ([...)
        const parts = value.split(',').map(s => s.trim());
        for (const part of parts) {
          const valid = /^[.#a-zA-Z\[]/.test(part);
          expect(valid).toBe(true);
        }
      }
    });

    test('no selector has leading/trailing whitespace', () => {
      for (const [key, value] of Object.entries(SKILLJAR_SELECTORS)) {
        expect(value).toBe(value.trim());
      }
    });

    test('no selector is just whitespace', () => {
      for (const [key, value] of Object.entries(SKILLJAR_SELECTORS)) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe('selector categories', () => {
    test('page structure selectors use # or . prefix', () => {
      expect(SKILLJAR_SELECTORS.headerRight).toMatch(/^[#.]/);
      expect(SKILLJAR_SELECTORS.headerLinks).toMatch(/^[#.]/);
    });

    test('course content selectors are defined', () => {
      expect(SKILLJAR_SELECTORS.lessonMain).toBeDefined();
      expect(SKILLJAR_SELECTORS.lessonContent).toBeDefined();
      expect(SKILLJAR_SELECTORS.courseContent).toBeDefined();
      expect(SKILLJAR_SELECTORS.courseTitle).toBeDefined();
    });

    test('quiz selectors support multiple selector variants', () => {
      // quizForm should have fallback selectors for different Skilljar quiz implementations
      expect(SKILLJAR_SELECTORS.quizForm).toContain(',');
      expect(SKILLJAR_SELECTORS.answerOption).toContain(',');
    });

    test('certificate selector exists', () => {
      expect(SKILLJAR_SELECTORS.certificateSection).toBeDefined();
      expect(SKILLJAR_SELECTORS.certificateSection).toContain('certificate');
    });
  });

  describe('no duplicate selectors', () => {
    test('all selector values are unique (no two keys share the same value)', () => {
      const values = Object.values(SKILLJAR_SELECTORS);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });
  });

  describe('naming conventions', () => {
    test('all keys use camelCase', () => {
      for (const key of Object.keys(SKILLJAR_SELECTORS)) {
        // camelCase: starts with lowercase, no underscores, no hyphens
        expect(key).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      }
    });
  });
});
