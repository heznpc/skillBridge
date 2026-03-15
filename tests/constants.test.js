/**
 * Unit tests for shared constants validation.
 * Ensures critical configuration values are properly defined.
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

const constantsSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'lib', 'constants.js'), 'utf8'
);

// Eval constants into a returned object so they're accessible in test scope
const constants = new Function(`${constantsSrc}; return {
  SKILLBRIDGE_MODELS, SKILLBRIDGE_THRESHOLDS, SKILLBRIDGE_DELAYS, SKILLBRIDGE_LIMITS,
  PREMIUM_LANGUAGES, AVAILABLE_LANGUAGES, AVAILABLE_LANGUAGE_CODES,
  SUPPORTED_LANGUAGE_MAP, POPUP_LABELS, DEFAULT_PROTECTED_TERMS,
  YOUTUBE_CLIENT_VERSION, SKILLBRIDGE_MODEL_LABELS,
};`)();

const {
  SKILLBRIDGE_MODELS, SKILLBRIDGE_THRESHOLDS, SKILLBRIDGE_DELAYS,
  PREMIUM_LANGUAGES, AVAILABLE_LANGUAGES,
  POPUP_LABELS, DEFAULT_PROTECTED_TERMS,
} = constants;

describe('SKILLBRIDGE_MODELS', () => {
  test('defines Gemini model', () => {
    expect(SKILLBRIDGE_MODELS.GEMINI).toBeDefined();
    expect(SKILLBRIDGE_MODELS.GEMINI).toContain('gemini');
  });

  test('defines Claude model', () => {
    expect(SKILLBRIDGE_MODELS.CLAUDE).toBeDefined();
    expect(SKILLBRIDGE_MODELS.CLAUDE).toContain('claude');
  });
});

describe('SKILLBRIDGE_THRESHOLDS', () => {
  test('GT_BATCH_SIZE is reasonable', () => {
    expect(SKILLBRIDGE_THRESHOLDS.GT_BATCH_SIZE).toBeGreaterThan(0);
    expect(SKILLBRIDGE_THRESHOLDS.GT_BATCH_SIZE).toBeLessThanOrEqual(50);
  });

  test('GEMINI_MIN_TEXT is positive', () => {
    expect(SKILLBRIDGE_THRESHOLDS.GEMINI_MIN_TEXT).toBeGreaterThan(0);
  });

  test('CACHE_TTL_MS is at least 1 day', () => {
    expect(SKILLBRIDGE_THRESHOLDS.CACHE_TTL_MS).toBeGreaterThanOrEqual(86400000);
  });

  test('GT_RATE_LIMIT_PER_MIN is positive', () => {
    expect(SKILLBRIDGE_THRESHOLDS.GT_RATE_LIMIT_PER_MIN).toBeGreaterThan(0);
  });

  test('VERIFY_QUEUE_MAX caps queue size', () => {
    expect(SKILLBRIDGE_THRESHOLDS.VERIFY_QUEUE_MAX).toBeGreaterThan(0);
    expect(SKILLBRIDGE_THRESHOLDS.VERIFY_QUEUE_MAX).toBeLessThanOrEqual(1000);
  });
});

describe('SKILLBRIDGE_DELAYS', () => {
  test('all delays are non-negative', () => {
    for (const [key, value] of Object.entries(SKILLBRIDGE_DELAYS)) {
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  test('DOM_DEBOUNCE is reasonable', () => {
    expect(SKILLBRIDGE_DELAYS.DOM_DEBOUNCE).toBeGreaterThanOrEqual(100);
    expect(SKILLBRIDGE_DELAYS.DOM_DEBOUNCE).toBeLessThanOrEqual(1000);
  });
});

describe('Languages', () => {
  test('PREMIUM_LANGUAGES has 6 entries', () => {
    expect(PREMIUM_LANGUAGES).toHaveLength(6);
  });

  test('AVAILABLE_LANGUAGES includes English and all premium', () => {
    const codes = AVAILABLE_LANGUAGES.map(l => l.code);
    expect(codes).toContain('en');
    for (const lang of PREMIUM_LANGUAGES) {
      expect(codes).toContain(lang.code);
    }
  });

  test('AVAILABLE_LANGUAGES has 30+ entries', () => {
    expect(AVAILABLE_LANGUAGES.length).toBeGreaterThanOrEqual(30);
  });

  test('all languages have code and label', () => {
    for (const lang of AVAILABLE_LANGUAGES) {
      expect(lang.code).toBeDefined();
      expect(lang.label).toBeDefined();
      expect(lang.code.length).toBeGreaterThan(0);
      expect(lang.label.length).toBeGreaterThan(0);
    }
  });
});

describe('UI Labels (i18n)', () => {
  // UI labels are defined in constants.js but may not all be in scope
  // when eval'd outside the full extension context. Test what's available.
  test('POPUP_LABELS has English fallback for all entries', () => {
    for (const [key, map] of Object.entries(POPUP_LABELS)) {
      expect(map['en']).toBeDefined();
    }
  });

  test('POPUP_LABELS has entries for premium languages', () => {
    for (const [key, map] of Object.entries(POPUP_LABELS)) {
      for (const lang of PREMIUM_LANGUAGES) {
        expect(map[lang.code]).toBeDefined();
      }
    }
  });
});

describe('DEFAULT_PROTECTED_TERMS', () => {
  test('is defined and non-empty', () => {
    expect(DEFAULT_PROTECTED_TERMS).toBeDefined();
    expect(DEFAULT_PROTECTED_TERMS.length).toBeGreaterThan(0);
  });

  test('contains critical terms', () => {
    expect(DEFAULT_PROTECTED_TERMS).toContain('Claude');
    expect(DEFAULT_PROTECTED_TERMS).toContain('Anthropic');
    expect(DEFAULT_PROTECTED_TERMS).toContain('API');
  });
});
