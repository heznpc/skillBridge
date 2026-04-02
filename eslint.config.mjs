import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script', // MV3 content scripts are not ESM
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        location: 'readonly',
        history: 'readonly',
        navigator: 'readonly',
        fetch: 'readonly',
        indexedDB: 'readonly',
        crypto: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        requestIdleCallback: 'readonly',
        console: 'readonly',
        confirm: 'readonly',
        Node: 'readonly',
        NodeFilter: 'readonly',
        DOMParser: 'readonly',
        MutationObserver: 'readonly',
        URL: 'readonly',
        // Chrome extension APIs
        chrome: 'readonly',
        // Shared globals from content script load order
        SKILLBRIDGE_MODELS: 'readonly',
        SKILLBRIDGE_THRESHOLDS: 'readonly',
        SKILLBRIDGE_DELAYS: 'readonly',
        SKILLBRIDGE_LIMITS: 'readonly',
        PREMIUM_LANGUAGES: 'readonly',
        PREMIUM_LANGUAGE_CODES: 'readonly',
        AVAILABLE_LANGUAGES: 'readonly',
        AVAILABLE_LANGUAGE_CODES: 'readonly',
        SUPPORTED_LANGUAGE_MAP: 'readonly',
        SKILLJAR_SELECTORS: 'readonly',
        DEFAULT_PROTECTED_TERMS: 'readonly',
        YOUTUBE_CLIENT_VERSION: 'readonly',
        GT_LANG_MAP: 'readonly',
        YT_LANG_CODE_MAP: 'readonly',
        YT_LANG_NAME_MAP: 'readonly',
        CERT_DISABLE_PATTERNS: 'readonly',
        EXAM_URL_PATTERNS: 'readonly',
        EXAM_SKIP_SELECTORS: 'readonly',
        EXAM_BANNER_LABELS: 'readonly',
        TUTOR_EXAM_LABELS: 'readonly',
        TUTOR_GREETINGS: 'readonly',
        SEND_LABELS: 'readonly',
        ASK_TUTOR_LABELS: 'readonly',
        CHAT_PLACEHOLDERS: 'readonly',
        QUOTE_PLACEHOLDERS: 'readonly',
        BANNER_UI: 'readonly',
        ONBOARDING_LABELS: 'readonly',
        EXAMPLE_QUESTIONS: 'readonly',
        A11Y_LABELS: 'readonly',
        PROGRESS_LABELS: 'readonly',
        CHAT_ERROR_LABELS: 'readonly',
        OFFLINE_LABELS: 'readonly',
        TUTOR_OFFLINE_LABELS: 'readonly',
        HISTORY_LABELS: 'readonly',
        HISTORY_DB_NAME: 'readonly',
        HISTORY_STORE: 'readonly',
        POPUP_LABELS: 'readonly',
        SKILLBRIDGE_MODEL_LABELS: 'readonly',
        SHORTCUT_LABELS: 'readonly',
        SHORTCUT_DESCRIPTIONS: 'readonly',
        FLASHCARD_LABELS: 'readonly',
        FLASHCARD_COURSE_MAP: 'readonly',
        CODE_COMMENT_PATTERNS: 'readonly',
        COMMENT_TRANSLATE_LABELS: 'readonly',
        // Classes from other content scripts
        SkilljarTranslator: 'readonly',
        YouTubeSubtitleManager: 'readonly',
        // Exposed by modules
        _YT_LANG_NAMES: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off', // Extension uses console for debugging
      'no-undef': 'error',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': ['warn', { destructuring: 'all' }],
    },
  },
  {
    // These files define the shared globals/classes — suppress redeclare warnings
    files: ['src/lib/constants.js', 'src/lib/selectors.js', 'src/lib/translator.js', 'src/lib/youtube-subtitles.js'],
    rules: {
      'no-redeclare': 'off',
    },
  },
  {
    // page-bridge.js uses the Puter.js SDK which is injected at runtime
    files: ['src/lib/page-bridge.js'],
    languageOptions: {
      globals: {
        puter: 'readonly',
      },
    },
  },
  {
    // gemini-block.js intentionally matches control characters for sanitization
    files: ['src/lib/gemini-block.js'],
    rules: {
      'no-control-regex': 'off',
    },
  },
  {
    // Test and script files use CommonJS; suppress redeclare for jest globals
    files: ['tests/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
        describe: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      'no-redeclare': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'src/bridge/puter.js', 'store-assets/**'],
  },
];
