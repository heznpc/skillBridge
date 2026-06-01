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
        alert: 'readonly',
        Node: 'readonly',
        NodeFilter: 'readonly',
        DOMParser: 'readonly',
        DOMException: 'readonly',
        MutationObserver: 'readonly',
        IntersectionObserver: 'readonly',
        WeakMap: 'readonly',
        AbortController: 'readonly',
        CustomEvent: 'readonly',
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
        STORAGE_WARNING_LABELS: 'readonly',
        TUTOR_OFFLINE_LABELS: 'readonly',
        HISTORY_LABELS: 'readonly',
        HISTORY_DB_NAME: 'readonly',
        HISTORY_STORE: 'readonly',
        POPUP_LABELS: 'readonly',
        SKILLBRIDGE_MODEL_LABELS: 'readonly',
        SHORTCUT_LABELS: 'readonly',
        SHORTCUT_DESCRIPTIONS: 'readonly',
        FLASHCARD_LABELS: 'readonly',
        BOOKMARK_LABELS: 'readonly',
        RESUME_LABELS: 'readonly',
        TOC_LABELS: 'readonly',
        MENU_LABELS: 'readonly',
        PDF_EXPORT_LABELS: 'readonly',
        TERM_PREVIEW_LABELS: 'readonly',
        FLASHCARD_COURSE_MAP: 'readonly',
        FLASHCARD_COURSE_SLUGS_SORTED: 'readonly',
        BRIDGE_UNAVAILABLE_LABELS: 'readonly',
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
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-console': 'off', // Extension uses console for debugging
      'no-undef': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': ['warn', { destructuring: 'all' }],

      // Belt-and-suspenders security rules. Today's code passes these;
      // they exist so future contributors can't reintroduce the patterns
      // without an explicit `eslint-disable` that surfaces in review.
      // CodeQL default-setup catches the same categories more deeply —
      // these give a faster local signal.
      'no-implied-eval': 'error', // bans setTimeout(string), setInterval(string)
      'no-new-func': 'error', // bans new Function('...')
      'no-script-url': 'error', // bans href="javascript:..."
      'no-prototype-builtins': 'error', // forces Object.hasOwn / hasOwnProperty.call
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
    // Test and script files use CommonJS; suppress redeclare for jest globals.
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
      // Content scripts are non-module scripts; the test harness loads them
      // via `new Function('window', src)(fakeWindow)` so the production
      // file under test can register on `window.*` exactly the way Chrome
      // does at runtime. `require()`-ing would change the load semantics
      // and miss exactly the class of bug we test for. The Function
      // constructor here is hermetic to test setup, not user input.
      'no-new-func': 'off',
    },
  },
  {
    // Playwright config + E2E specs run under @playwright/test (CommonJS).
    // No jest globals; everything's via `require('@playwright/test')`.
    files: ['playwright.config.js', 'tests/e2e/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
      },
    },
  },
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'src/bridge/puter.js',
      'store-assets/**',
      'test-results/**',
      'playwright-report/**',
      'eslint.config.mjs',
    ],
  },
];
