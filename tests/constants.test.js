/**
 * Unit tests for shared constants validation.
 * Ensures critical configuration values are properly defined.
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

const selectorsSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'lib', 'selectors.js'), 'utf8'
);
const constantsSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'lib', 'constants.js'), 'utf8'
);

// Eval selectors first (constants.js references SKILLJAR_SELECTORS), then constants
const constants = new Function(`${selectorsSrc}\n${constantsSrc}; return {
  SKILLBRIDGE_MODELS, SKILLBRIDGE_THRESHOLDS, SKILLBRIDGE_DELAYS, SKILLBRIDGE_LIMITS,
  PREMIUM_LANGUAGES, AVAILABLE_LANGUAGES, AVAILABLE_LANGUAGE_CODES,
  SUPPORTED_LANGUAGE_MAP, POPUP_LABELS, DEFAULT_PROTECTED_TERMS,
  YOUTUBE_CLIENT_VERSION, SKILLBRIDGE_MODEL_LABELS,
  SHORTCUT_LABELS, SHORTCUT_DESCRIPTIONS,
  EXAM_URL_PATTERNS, EXAM_SKIP_SELECTORS, EXAM_BANNER_LABELS, TUTOR_EXAM_LABELS,
  CERT_DISABLE_PATTERNS,
  SKILLJAR_SELECTORS,
};`)();

const {
  SKILLBRIDGE_MODELS, SKILLBRIDGE_THRESHOLDS, SKILLBRIDGE_DELAYS,
  PREMIUM_LANGUAGES, AVAILABLE_LANGUAGES,
  POPUP_LABELS, DEFAULT_PROTECTED_TERMS,
  SHORTCUT_LABELS, SHORTCUT_DESCRIPTIONS,
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
  test('PREMIUM_LANGUAGES has 10 entries', () => {
    expect(PREMIUM_LANGUAGES).toHaveLength(10);
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

  test('POPUP_LABELS has entries for core i18n languages', () => {
    const coreI18nCodes = ['en', 'ko', 'ja', 'zh-CN', 'es', 'fr', 'de'];
    for (const [key, map] of Object.entries(POPUP_LABELS)) {
      for (const code of coreI18nCodes) {
        expect(map[code]).toBeDefined();
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

describe('SHORTCUT_LABELS', () => {
  test('title has English fallback', () => {
    expect(SHORTCUT_LABELS.title.en).toBeDefined();
    expect(typeof SHORTCUT_LABELS.title.en).toBe('string');
  });

  test('title has core i18n language entries', () => {
    for (const code of ['ko', 'ja', 'zh-CN', 'es', 'fr', 'de']) {
      expect(SHORTCUT_LABELS.title[code]).toBeDefined();
    }
  });
});

describe('SHORTCUT_DESCRIPTIONS', () => {
  const EXPECTED_KEYS = ['toggleSidebar', 'toggleDarkMode', 'showHelp', 'close', 'focusChat'];

  test('has all expected shortcut descriptions', () => {
    for (const key of EXPECTED_KEYS) {
      expect(SHORTCUT_DESCRIPTIONS[key]).toBeDefined();
    }
  });

  test('each description has English fallback', () => {
    for (const key of EXPECTED_KEYS) {
      expect(SHORTCUT_DESCRIPTIONS[key].en).toBeDefined();
      expect(typeof SHORTCUT_DESCRIPTIONS[key].en).toBe('string');
    }
  });

  test('each description has core i18n language entries', () => {
    for (const key of EXPECTED_KEYS) {
      for (const code of ['ko', 'ja', 'zh-CN', 'es', 'fr', 'de']) {
        expect(SHORTCUT_DESCRIPTIONS[key][code]).toBeDefined();
      }
    }
  });
});

describe('CERT_DISABLE_PATTERNS', () => {
  const { CERT_DISABLE_PATTERNS, EXAM_URL_PATTERNS } = constants;

  const certUrls = [
    'https://anthropic.skilljar.com/claude-certified-architect-foundations',
    'https://anthropic.skilljar.com/certified-architect/exam',
    'https://anthropic.skilljar.com/certification-exam/start',
    'https://anthropic.skilljar.com/certified-developer-access-request',
    'https://anthropic.skilljar.com/page?type=certification',
    'https://anthropic.skilljar.com/proctored/session',
  ];

  const courseUrls = [
    'https://anthropic.skilljar.com/claude-101',
    'https://anthropic.skilljar.com/introduction-to-claude-cowork',
    'https://anthropic.skilljar.com/introduction-to-subagents',
    'https://anthropic.skilljar.com/ai-fluency-framework-foundations',
    'https://anthropic.skilljar.com/building-with-the-claude-api',
    'https://anthropic.skilljar.com/page?type=course',
  ];

  test('matches certification exam URLs', () => {
    for (const url of certUrls) {
      expect(CERT_DISABLE_PATTERNS.some(p => p.test(url))).toBe(true);
    }
  });

  test('does NOT match regular course URLs', () => {
    for (const url of courseUrls) {
      expect(CERT_DISABLE_PATTERNS.some(p => p.test(url))).toBe(false);
    }
  });

  test('does NOT match course quiz URLs (those use EXAM_URL_PATTERNS)', () => {
    const quizUrls = [
      'https://anthropic.skilljar.com/claude-101/quiz',
      'https://anthropic.skilljar.com/lesson/assessment',
      'https://anthropic.skilljar.com/page?type=quiz',
    ];
    for (const url of quizUrls) {
      expect(CERT_DISABLE_PATTERNS.some(p => p.test(url))).toBe(false);
      expect(EXAM_URL_PATTERNS.some(p => p.test(url))).toBe(true);
    }
  });

  test('certification URLs do NOT trigger exam mode patterns', () => {
    // Certification-only URLs should not match EXAM_URL_PATTERNS
    const certOnly = [
      'https://anthropic.skilljar.com/claude-certified-architect-foundations',
      'https://anthropic.skilljar.com/certified-developer-access-request',
    ];
    for (const url of certOnly) {
      expect(EXAM_URL_PATTERNS.some(p => p.test(url))).toBe(false);
    }
  });
});

describe('Performance thresholds', () => {
  test('VIEWPORT_CHUNK_SIZE is defined and reasonable', () => {
    expect(SKILLBRIDGE_THRESHOLDS.VIEWPORT_CHUNK_SIZE).toBeGreaterThan(0);
    expect(SKILLBRIDGE_THRESHOLDS.VIEWPORT_CHUNK_SIZE).toBeLessThanOrEqual(200);
  });

  test('IDLE_TIMEOUT is defined', () => {
    expect(SKILLBRIDGE_DELAYS.IDLE_TIMEOUT).toBeGreaterThan(0);
  });
});
