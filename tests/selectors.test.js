/**
 * @jest-environment jsdom
 */

/**
 * Unit tests for selectors.js structural integrity.
 *
 * Validates that all Skilljar DOM selectors are properly defined,
 * follow expected naming conventions, and contain valid CSS selector syntax.
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

const selectorsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'selectors.js'), 'utf8');

const SKILLJAR_SELECTORS = new Function(`${selectorsSrc}; return SKILLJAR_SELECTORS;`)();

// ── Tests ──────────────────────────────────────────────────────

describe('SKILLJAR_SELECTORS', () => {
  test('is a non-empty object', () => {
    expect(typeof SKILLJAR_SELECTORS).toBe('object');
    expect(Object.keys(SKILLJAR_SELECTORS).length).toBeGreaterThan(0);
  });

  test('all values are non-empty strings', () => {
    for (const [_key, value] of Object.entries(SKILLJAR_SELECTORS)) {
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
      // Skilljar AI Tutor (2026)
      'aiTutor',
      'aiTutorButton',
      'aiTutorPanel',
      // Course Families (Jan 2026)
      'courseFamily',
      'courseFamilyTitle',
      // Course Ratings (Jan 2026)
      'courseRating',
      'courseRatingStars',
      'courseRatingText',
      // AI Feedback (Mar 2026)
      'aiFeedback',
    ];

    test('contains the complete required selector registry', () => {
      const missing = REQUIRED_KEYS.filter((key) => typeof SKILLJAR_SELECTORS[key] !== 'string');

      // Keep all missing keys in one failure so the assertion remains diagnostic
      // without inflating one registry invariant into dozens of Jest cases.
      expect(missing).toEqual([]);
    });
  });

  describe('CSS selector syntax', () => {
    test('every selector is accepted by the browser selector parser', () => {
      const invalid = [];

      for (const [key, value] of Object.entries(SKILLJAR_SELECTORS)) {
        try {
          document.querySelector(value);
        } catch (error) {
          invalid.push({ key, value, error: error.message });
        }
      }

      expect(invalid).toEqual([]);
    });

    test('no selector has leading/trailing whitespace', () => {
      for (const [_key, value] of Object.entries(SKILLJAR_SELECTORS)) {
        expect(value).toBe(value.trim());
      }
    });

    test('no selector is just whitespace', () => {
      for (const [_key, value] of Object.entries(SKILLJAR_SELECTORS)) {
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

    test('AI Tutor selectors support multiple variants', () => {
      expect(SKILLJAR_SELECTORS.aiTutor).toContain(',');
      expect(SKILLJAR_SELECTORS.aiTutorButton).toContain(',');
      expect(SKILLJAR_SELECTORS.aiTutorPanel).toContain(',');
    });

    test('Course Families selectors exist', () => {
      expect(SKILLJAR_SELECTORS.courseFamily).toContain('course-family');
      expect(SKILLJAR_SELECTORS.courseFamilyTitle).toContain('course-family-title');
    });

    test('Course Ratings selectors exist', () => {
      expect(SKILLJAR_SELECTORS.courseRating).toContain('course-rating');
      expect(SKILLJAR_SELECTORS.courseRatingStars).toContain('rating-stars');
      expect(SKILLJAR_SELECTORS.courseRatingText).toContain('rating-text');
    });

    test('AI Feedback selector exists', () => {
      expect(SKILLJAR_SELECTORS.aiFeedback).toContain('ai-feedback');
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
