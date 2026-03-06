/**
 * SkillBridge — Shared Constants
 * Loaded first by all content scripts via manifest.json.
 */

/* eslint-disable no-unused-vars */

// ==================== AI MODELS ====================

const SKILLBRIDGE_MODELS = {
  GEMINI: 'gemini-2.0-flash',
  CLAUDE: 'claude-sonnet-4',
};

// ==================== THRESHOLDS ====================

const SKILLBRIDGE_THRESHOLDS = {
  GEMINI_MIN_TEXT: 80,
  GEMINI_ALPHA_RATIO: 0.5,
  MIN_COMPLEX_TEXT: 120,
  GT_BATCH_SIZE: 10,
  GEMINI_BATCH_SIZE: 3,
  VERIFY_QUEUE_MAX: 200,
};

// ==================== DELAYS (ms) ====================

const SKILLBRIDGE_DELAYS = {
  GT_BATCH: 100,
  GEMINI_BATCH: 300,
  DOM_DEBOUNCE: 300,
  VERIFY_QUEUE: 1000,
  LATE_CONTENT: 1500,
};

// ==================== LIMITS ====================

const SKILLBRIDGE_LIMITS = {
  HISTORY: 50,
  HISTORY_PREVIEW: 50,
  QUOTE_MAX: 200,
};

// ==================== LANGUAGES ====================

const PREMIUM_LANGUAGES = [
  { code: 'ko', label: '\ud55c\uad6d\uc5b4' },
  { code: 'ja', label: '\u65e5\u672c\u8a9e' },
  { code: 'zh-CN', label: '\u4e2d\u6587(\u7b80\u4f53)' },
  { code: 'es', label: 'Espa\u00f1ol' },
  { code: 'fr', label: 'Fran\u00e7ais' },
  { code: 'de', label: 'Deutsch' },
];

const AVAILABLE_LANGUAGES = [
  { code: 'en', label: 'English' },
  ...PREMIUM_LANGUAGES,
  { code: 'zh-TW', label: '\u4e2d\u6587(\u7e41\u9ad4)' },
  { code: 'pt-BR', label: 'Portugu\u00eas (BR)' },
  { code: 'pt', label: 'Portugu\u00eas (PT)' },
  { code: 'it', label: 'Italiano' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'ru', label: '\u0420\u0443\u0441\u0441\u043a\u0438\u0439' },
  { code: 'pl', label: 'Polski' },
  { code: 'uk', label: '\u0423\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430' },
  { code: 'cs', label: '\u010ce\u0161tina' },
  { code: 'sv', label: 'Svenska' },
  { code: 'da', label: 'Dansk' },
  { code: 'fi', label: 'Suomi' },
  { code: 'no', label: 'Norsk' },
  { code: 'tr', label: 'T\u00fcrk\u00e7e' },
  { code: 'ar', label: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629' },
  { code: 'hi', label: '\u0939\u093f\u0928\u094d\u0926\u0940' },
  { code: 'th', label: '\u0e20\u0e32\u0e29\u0e32\u0e44\u0e17\u0e22' },
  { code: 'vi', label: 'Ti\u1ebfng Vi\u1ec7t' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'ms', label: 'Bahasa Melayu' },
  { code: 'tl', label: 'Filipino' },
  { code: 'bn', label: '\u09ac\u09be\u0982\u09b2\u09be' },
  { code: 'he', label: '\u05e2\u05d1\u05e8\u05d9\u05ea' },
  { code: 'ro', label: 'Rom\u00e2n\u0103' },
  { code: 'hu', label: 'Magyar' },
  { code: 'el', label: '\u0395\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac' },
];

const PREMIUM_LANGUAGE_CODES = PREMIUM_LANGUAGES.map(l => l.code);

/**
 * Build a { code: label } map from AVAILABLE_LANGUAGES.
 * Used by translator.js supportedLanguages and youtube-subtitles.js.
 */
const SUPPORTED_LANGUAGE_MAP = Object.fromEntries(
  AVAILABLE_LANGUAGES.filter(l => l.code !== 'en').map(l => [l.code, l.label])
);

// Google Translate language code overrides
const GT_LANG_MAP = {
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW',
  'pt-BR': 'pt',
};

// YouTube subtitle language code overrides
const YT_LANG_CODE_MAP = {
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
  'pt-BR': 'pt',
};

// YouTube subtitle language names (English) — hoisted to avoid per-iteration allocation
const _YT_LANG_NAMES = {
  'ko': 'Korean', 'ja': 'Japanese', 'zh-CN': 'Chinese (Simplified)',
  'zh-TW': 'Chinese (Traditional)', 'es': 'Spanish', 'fr': 'French',
  'de': 'German', 'pt-BR': 'Portuguese', 'pt': 'Portuguese',
  'vi': 'Vietnamese', 'th': 'Thai', 'id': 'Indonesian', 'ar': 'Arabic',
  'hi': 'Hindi', 'ru': 'Russian', 'tr': 'Turkish', 'it': 'Italian',
  'nl': 'Dutch', 'pl': 'Polish', 'uk': 'Ukrainian', 'cs': 'Czech',
  'sv': 'Swedish', 'da': 'Danish', 'fi': 'Finnish', 'no': 'Norwegian',
  'ms': 'Malay', 'tl': 'Filipino', 'bn': 'Bengali', 'he': 'Hebrew',
  'ro': 'Romanian', 'hu': 'Hungarian', 'el': 'Greek',
};
const YT_LANG_NAME_MAP = Object.fromEntries(
  AVAILABLE_LANGUAGES.filter(l => l.code !== 'en').map(l => [l.code, _YT_LANG_NAMES[l.code] || l.code])
);
