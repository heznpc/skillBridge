/**
 * Unit tests for shared constants validation.
 * Ensures critical configuration values are properly defined.
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

const selectorsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'selectors.js'), 'utf8');
const sharedSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'shared', 'runtime-constants.js'), 'utf8');
const constantsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'constants.js'), 'utf8');

// Eval selectors first (constants.js references SKILLJAR_SELECTORS), then constants
const constants = new Function(`${sharedSrc}\n${selectorsSrc}\n${constantsSrc}; return {
  SKILLBRIDGE_MODELS, SKILLBRIDGE_THRESHOLDS, SKILLBRIDGE_DELAYS, SKILLBRIDGE_LIMITS,
  PREMIUM_LANGUAGES, AVAILABLE_LANGUAGES, AVAILABLE_LANGUAGE_CODES,
  SUPPORTED_LANGUAGE_MAP, POPUP_LABELS, DEFAULT_PROTECTED_TERMS,
  ENGINE_LABELS,
  SKILLBRIDGE_MODEL_LABELS,
  SHORTCUT_LABELS, SHORTCUT_DESCRIPTIONS,
  EXAM_URL_PATTERNS, EXAM_SKIP_SELECTORS, EXAM_BANNER_LABELS, TUTOR_EXAM_LABELS,
  OFFLINE_LABELS, TRANSLATION_UNAVAILABLE_LABELS,
  CERT_DISABLE_PATTERNS, FLASHCARD_COURSE_MAP, FLASHCARD_BOX,
  SKILLJAR_SELECTORS,
  PREMIUM_UI_LABEL_SETS: {
    LOCALIZED_PAGE_LABELS, LOCALIZED_MISMATCH_LABELS, EXAM_BANNER_LABELS, TUTOR_EXAM_LABELS,
    TUTOR_GREETINGS, SEND_LABELS, ASK_TUTOR_LABELS, CHAT_PLACEHOLDERS, QUOTE_PLACEHOLDERS,
    BANNER_UI, ONBOARDING_LABELS, EXAMPLE_QUESTIONS, DASHBOARD_LABELS, A11Y_LABELS,
    PROGRESS_LABELS, CHAT_ERROR_LABELS, OFFLINE_LABELS, TRANSLATION_UNAVAILABLE_LABELS,
    BRIDGE_UNAVAILABLE_LABELS, STORAGE_WARNING_LABELS, TUTOR_OFFLINE_LABELS, HISTORY_LABELS,
    POPUP_LABELS, ENGINE_LABELS, SKILLBRIDGE_MODEL_LABELS, SHORTCUT_LABELS,
    SHORTCUT_DESCRIPTIONS, FLASHCARD_LABELS, BOOKMARK_LABELS, NOTE_LABELS, REPORT_LABELS,
    RESUME_LABELS, TOC_LABELS, MENU_LABELS, PDF_EXPORT_LABELS, TERM_PREVIEW_LABELS,
    REFINE_LABELS, BYOA_LABELS, BYOA_PROMPT_LABELS, COMMENT_TRANSLATE_LABELS,
  },
};`)();

const {
  SKILLBRIDGE_MODELS,
  SKILLBRIDGE_THRESHOLDS,
  SKILLBRIDGE_DELAYS,
  PREMIUM_LANGUAGES,
  AVAILABLE_LANGUAGES,
  POPUP_LABELS,
  ENGINE_LABELS,
  DEFAULT_PROTECTED_TERMS,
  SHORTCUT_LABELS,
  SHORTCUT_DESCRIPTIONS,
  FLASHCARD_COURSE_MAP,
  OFFLINE_LABELS,
  TRANSLATION_UNAVAILABLE_LABELS,
  PREMIUM_UI_LABEL_SETS,
} = constants;

describe('SKILLBRIDGE_MODELS', () => {
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

  test('CACHE_TTL_MS is at least 1 day', () => {
    expect(SKILLBRIDGE_THRESHOLDS.CACHE_TTL_MS).toBeGreaterThanOrEqual(86400000);
  });

  test('GT_RATE_LIMIT_PER_MIN is positive', () => {
    expect(SKILLBRIDGE_THRESHOLDS.GT_RATE_LIMIT_PER_MIN).toBeGreaterThan(0);
  });
});

describe('SKILLBRIDGE_DELAYS', () => {
  test('all delays are non-negative', () => {
    for (const [_key, value] of Object.entries(SKILLBRIDGE_DELAYS)) {
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  test('DOM_DEBOUNCE is reasonable', () => {
    expect(SKILLBRIDGE_DELAYS.DOM_DEBOUNCE).toBeGreaterThanOrEqual(100);
    expect(SKILLBRIDGE_DELAYS.DOM_DEBOUNCE).toBeLessThanOrEqual(1000);
  });
});

describe('Languages', () => {
  test('PREMIUM_LANGUAGES has 13 entries after the Dutch promotion', () => {
    expect(PREMIUM_LANGUAGES).toHaveLength(13);
    expect(PREMIUM_LANGUAGES.map((l) => l.code)).toContain('id');
    expect(PREMIUM_LANGUAGES).toContainEqual({ code: 'nl', label: 'Nederlands' });
  });

  test('PREMIUM_LANGUAGES includes Italian (data-driven promotion 2026-05-25)', () => {
    expect(PREMIUM_LANGUAGES.map((l) => l.code)).toContain('it');
  });

  test('AVAILABLE_LANGUAGES includes English and all premium', () => {
    const codes = AVAILABLE_LANGUAGES.map((l) => l.code);
    expect(codes).toContain('en');
    for (const lang of PREMIUM_LANGUAGES) {
      expect(codes).toContain(lang.code);
    }
  });

  test('Dutch is no longer duplicated in the Standard tier', () => {
    const premiumCodes = new Set(PREMIUM_LANGUAGES.map((lang) => lang.code));
    const standardCodes = AVAILABLE_LANGUAGES.filter((lang) => lang.code !== 'en' && !premiumCodes.has(lang.code)).map(
      (lang) => lang.code,
    );

    expect(AVAILABLE_LANGUAGES.filter((lang) => lang.code === 'nl')).toHaveLength(1);
    expect(standardCodes).not.toContain('nl');
    expect(standardCodes).toContain('pl');
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
    for (const [_key, map] of Object.entries(POPUP_LABELS)) {
      expect(map['en']).toBeDefined();
    }
  });

  test('POPUP_LABELS has entries for core i18n languages', () => {
    const coreI18nCodes = ['en', 'ko', 'ja', 'zh-CN', 'es', 'fr', 'de'];
    for (const [_key, map] of Object.entries(POPUP_LABELS)) {
      for (const code of coreI18nCodes) {
        expect(map[code]).toBeDefined();
      }
    }
  });

  test('every user-facing locale map covers every premium language', () => {
    const localeCodes = ['en', ...PREMIUM_LANGUAGES.map((lang) => lang.code)];
    let localeMapCount = 0;

    const visit = (value, path) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      if (Object.hasOwn(value, 'en')) {
        localeMapCount++;
        for (const code of localeCodes) {
          expect(Object.hasOwn(value, code)).toBe(true);
          const localized = value[code];
          expect(localized).toBeDefined();
          if (typeof localized === 'string') expect(localized.length).toBeGreaterThan(0);
          if (Array.isArray(localized)) {
            expect(Array.isArray(value.en)).toBe(true);
            expect(localized).toHaveLength(value.en.length);
            for (const item of localized) {
              expect(typeof item).toBe('string');
              expect(item.trim().length).toBeGreaterThan(0);
            }
          }
        }
        return;
      }
      for (const [key, nested] of Object.entries(value)) visit(nested, `${path}.${key}`);
    };

    for (const [name, labels] of Object.entries(PREMIUM_UI_LABEL_SETS)) visit(labels, name);
    // Pin the complete UI surface so deleting an entire locale map cannot
    // make the recursive coverage assertions silently skip it.
    expect(localeMapCount).toBe(170);
  });
});

describe('offline status labels', () => {
  const curatedCodes = ['en', ...PREMIUM_LANGUAGES.map((lang) => lang.code)];

  test('defines every cache-coverage state in every curated locale', () => {
    expect(Object.keys(OFFLINE_LABELS)).toEqual(['unknown', 'cacheOnly', 'partial', 'missOnly']);
    for (const labels of Object.values(OFFLINE_LABELS)) {
      for (const code of curatedCodes) {
        expect(typeof labels[code]).toBe('string');
        expect(labels[code].length).toBeGreaterThan(0);
      }
    }
  });

  test('defines the translation-service fallback in every curated locale', () => {
    for (const code of curatedCodes) {
      expect(typeof TRANSLATION_UNAVAILABLE_LABELS[code]).toBe('string');
      expect(TRANSLATION_UNAVAILABLE_LABELS[code].length).toBeGreaterThan(0);
    }
  });
});

describe('ENGINE_LABELS (v4 tutor engine selector)', () => {
  const EXPECTED_KEYS = [
    'engineLabel',
    'cloudOption',
    'localOption',
    'offOption',
    'localBaseUrl',
    'localModel',
    'onDeviceHint',
    // Hardware guidance from the measured benchmark + the Chrome-built-in-AI
    // note (v4 A4), and the tutor-side messages for engine states a retry
    // cannot fix.
    'hardwareHint',
    'tutorOff',
    'tutorSignInRequired',
    'tutorLocalUnreachable',
    'statusChecking',
    'statusOk',
    'statusCors',
    'statusUnreachable',
    'permDenied',
  ];

  test('defines every engine-selector string', () => {
    for (const key of EXPECTED_KEYS) {
      expect(ENGINE_LABELS[key]).toBeDefined();
    }
  });

  test('every entry covers the full i18n locale set', () => {
    const codes = ['en', ...PREMIUM_LANGUAGES.map((lang) => lang.code)];
    for (const [_key, map] of Object.entries(ENGINE_LABELS)) {
      for (const code of codes) {
        expect(typeof map[code]).toBe('string');
        expect(map[code].length).toBeGreaterThan(0);
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
      expect(CERT_DISABLE_PATTERNS.some((p) => p.test(url))).toBe(true);
    }
  });

  test('does NOT match regular course URLs', () => {
    for (const url of courseUrls) {
      expect(CERT_DISABLE_PATTERNS.some((p) => p.test(url))).toBe(false);
    }
  });

  test('does NOT match course quiz URLs (those use EXAM_URL_PATTERNS)', () => {
    const quizUrls = [
      'https://anthropic.skilljar.com/claude-101/quiz',
      'https://anthropic.skilljar.com/lesson/assessment',
      'https://anthropic.skilljar.com/page?type=quiz',
    ];
    for (const url of quizUrls) {
      expect(CERT_DISABLE_PATTERNS.some((p) => p.test(url))).toBe(false);
      expect(EXAM_URL_PATTERNS.some((p) => p.test(url))).toBe(true);
    }
  });

  test('certification URLs do NOT trigger exam mode patterns', () => {
    // Certification-only URLs should not match EXAM_URL_PATTERNS
    const certOnly = [
      'https://anthropic.skilljar.com/claude-certified-architect-foundations',
      'https://anthropic.skilljar.com/certified-developer-access-request',
    ];
    for (const url of certOnly) {
      expect(EXAM_URL_PATTERNS.some((p) => p.test(url))).toBe(false);
    }
  });
});

describe('FLASHCARD_COURSE_MAP', () => {
  test('maps the AI Fluency for Builders live course to the generic AI Fluency deck', () => {
    expect(FLASHCARD_COURSE_MAP['ai-fluency-for-builders']).toEqual(['aiFluency']);
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
