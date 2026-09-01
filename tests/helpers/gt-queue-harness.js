const { readProductionSource } = require('./production-source');

const GT_QUEUE_SOURCE = readProductionSource('src', 'content', 'gt-queue.js');

/**
 * Load the complete production GT queue IIFE around a small browser harness.
 * Callers exercise the same exported processOneElement function used by the
 * mutation observer instead of reproducing its exam/localization gates.
 */
function loadGtQueue({
  examSkipSelectors,
  isExamPage = true,
  staticLookup = () => null,
  sbOverrides = {},
  windowOverrides = {},
} = {}) {
  if (!Array.isArray(examSkipSelectors) || examSkipSelectors.length === 0) {
    throw new Error('loadGtQueue requires the production EXAM_SKIP_SELECTORS');
  }

  const { translator: translatorOverrides = {}, ...otherSbOverrides } = sbOverrides;
  const translator = {
    staticLookup,
    cachedLookup: async () => null,
    googleTranslateBatch: async () => [],
    _cacheTranslation: async () => {},
    ...translatorOverrides,
  };
  const sb = {
    isExamPage,
    isOffline: false,
    localization: {
      mayTranslate: () => true,
      mayTranslateText: () => true,
    },
    originalTexts: new Map(),
    originalComments: new Map(),
    translatedTexts: new Map(),
    mapSizeCap: 5000,
    safeReplaceText: (el, text) => {
      el.textContent = text;
      return true;
    },
    registerModule: () => {},
    ...otherSbOverrides,
    translator,
  };
  const fakeWindow = {
    _sb: sb,
    _protectedTerms: {
      getProtectedTermList: () => [],
      restoreProtectedTerms: (text) => text,
    },
    _geminiBlock: { hasInlineTags: () => false },
    _sbInteractive: { INTERACTIVE_SELECTOR: 'a, button, summary, [role="button"], [role="link"]' },
    innerHeight: 900,
    ...windowOverrides,
  };

  new Function('window', 'SKILLBRIDGE_THRESHOLDS', 'SKILLBRIDGE_DELAYS', 'EXAM_SKIP_SELECTORS', GT_QUEUE_SOURCE)(
    fakeWindow,
    { GT_QUEUE_MAX: 500, GT_BATCH_SIZE: 20 },
    { GT_BATCH: 0 },
    examSkipSelectors,
  );

  return { sb, processOneElement: sb._gt.processOneElement };
}

module.exports = { loadGtQueue };
