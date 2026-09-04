/**
 * @jest-environment jsdom
 *
 * Behavioural cover for the partial-static / Google-Translate handoff in
 * `processOneElement`. Loads the real IIFE and drives it through actual DOM
 * nodes rather than asserting on source strings.
 *
 * The defect this pins: the per-text-node static pass used to WRITE its
 * matches into the DOM before deciding whether the block still needed Google
 * Translate. `queueForGoogleTranslate` reads `el.textContent`, so a block that
 * matched some nodes and then routed to GT shipped a half-Korean string to
 * Google — our own dictionary output fed back as source text. That is the same
 * failure class as #299 (which only guards ACROSS passes, via `_lastWritten`);
 * this one happens WITHIN a single pass, before any mark exists.
 */

/* global describe, test, expect, beforeEach, afterEach, jest */

const { readProductionSource } = require('./helpers/production-source');

const src = readProductionSource('src', 'content', 'gt-queue.js');

// Globals the IIFE reads as bare identifiers (normally from constants.js).
global.EXAM_SKIP_SELECTORS = ['.answer'];
global.SKILLBRIDGE_THRESHOLDS = { GT_QUEUE_MAX: 100, GT_BATCH_SIZE: 10 };
global.SKILLBRIDGE_DELAYS = { GT_BATCH_GAP: 0, LATE_CONTENT: 0 };
window._geminiBlock = { hasInlineTags: () => false };
window._protectedTerms = {
  buildProtectedTermsMap: () => {},
  restoreProtectedTerms: (text) => text,
};

/**
 * @param {Record<string,string>} dict — exact-match static dictionary
 * @param {object} [translatorOverrides]
 * @returns {{ processOneElement: Function, sb: object }}
 */
function loadModule(dict, translatorOverrides = {}) {
  const sb = {
    isExamPage: false,
    isOffline: false,
    hostCaps: { examDetection: false },
    originalTexts: new Map(),
    translatedTexts: new Map(),
    originalComments: new Map(),
    mapSizeCap: 100,
    translator: {
      staticLookup: (text) => dict[text] || null,
      cachedLookup: async () => null,
      googleTranslateBatch: async (texts) => texts.map((text) => `translated: ${text}`),
      _cacheTranslation: async () => {},
      ...translatorOverrides,
    },
    safeReplaceText: (el, text) => {
      el.textContent = text;
      return true;
    },
    updateLangClass: () => {},
    detectExamPage: () => false,
    registerModule: () => {},
  };
  window._sb = sb;
  new Function(src)();
  return { processOneElement: sb._gt.processOneElement, sb };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('processOneElement — partial static match routed to Google Translate', () => {
  // One matched node ("Anthropic courses"), one unmatched node long enough to
  // force the GT route.
  const dict = { 'Anthropic courses': 'Anthropic 과정' };
  const setup = () => {
    document.body.innerHTML =
      '<p id="t"><span>Anthropic courses</span> <span>are taught by the research team here</span></p>';
    return document.getElementById('t');
  };

  test('routes to GT when a sibling node has no dictionary entry', () => {
    const { processOneElement } = loadModule(dict);
    expect(processOneElement(setup(), 'ko')).toBe('gt');
  });

  test('leaves the element pristine so Google receives clean English', () => {
    const { processOneElement } = loadModule(dict);
    const el = setup();
    processOneElement(el, 'ko');
    // This is the text queueForGoogleTranslate would read off the element.
    expect(el.textContent).toBe('Anthropic courses are taught by the research team here');
    expect(el.textContent).not.toContain('과정');
  });

  test('still applies static matches when the whole block is covered', () => {
    const { processOneElement, sb } = loadModule({
      'Anthropic courses': 'Anthropic 과정',
      'are taught by the research team here': '는 여기 연구 팀이 가르칩니다',
    });
    const el = setup();
    expect(processOneElement(el, 'ko')).toBe('static');
    expect(el.textContent).toBe('Anthropic 과정 는 여기 연구 팀이 가르칩니다');
    expect(sb.translatedTexts.get('Anthropic courses are taught by the research team here')).toEqual([{ el }]);
  });

  test('short blocks keep their partial static output instead of routing to GT', () => {
    // fullText.length < 10 never reaches the GT branch, so the partial write
    // is the final rendering and must survive.
    const { processOneElement } = loadModule({ Next: '다음' });
    document.body.innerHTML = '<p id="s"><span>Next</span> <span>xyz</span></p>';
    const el = document.getElementById('s');
    expect(processOneElement(el, 'ko')).toBe('static');
    expect(el.textContent).toBe('다음 xyz');
  });
});

describe('translatedTexts — original text to live element index', () => {
  test('a whole-element static translation is indexed once across repeated scans', () => {
    document.body.innerHTML = '<p id="whole">Translate this heading</p>';
    const el = document.getElementById('whole');
    const { processOneElement, sb } = loadModule({ 'Translate this heading': '이 제목 번역' });

    expect(processOneElement(el, 'ko')).toBe('static');
    expect(processOneElement(el, 'ko')).toBeNull();

    const entries = sb.translatedTexts.get('Translate this heading');
    expect(entries).toEqual([{ el }]);
    expect(Object.keys(entries[0])).toEqual(['el']);

    // Refinement rewrites the same element later. The index intentionally
    // holds no translated-text snapshot, so feedback reads the settled DOM.
    el.textContent = '이 제목을 더 자연스럽게 번역';
    expect(entries[0].el.textContent).toBe('이 제목을 더 자연스럽게 번역');
  });

  test('duplicate GT queue entries keep one reference for the element', async () => {
    document.body.innerHTML = '<p id="gt">Translate this paragraph with Google</p>';
    const el = document.getElementById('gt');
    const { sb } = loadModule({});

    sb._gt.queueForGoogleTranslate([el, el], 'ko', true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sb.translatedTexts.get('Translate this paragraph with Google')).toEqual([{ el }]);
  });

  test('enqueues optional refinement only after the baseline is visible', async () => {
    document.body.innerHTML = '<p id="gt">Translate this paragraph with Google</p>';
    const el = document.getElementById('gt');
    const { sb } = loadModule(
      {},
      { googleTranslateBatch: jest.fn(async () => ['Google 번역 기준선이 먼저 표시됩니다']) },
    );
    sb._refine = {
      enqueue: jest.fn(({ el: queuedEl, baseline }) => {
        expect(queuedEl.textContent).toBe('Google 번역 기준선이 먼저 표시됩니다');
        expect(baseline).toBe('Google 번역 기준선이 먼저 표시됩니다');
      }),
    };

    sb._gt.queueForGoogleTranslate([el], 'ko', true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sb._refine.enqueue).toHaveBeenCalledTimes(1);
  });
});

describe('structured routing and re-processing guards', () => {
  function installHtmlRuntime({ allow = true } = {}) {
    const checkTagIntegrity = jest.fn(() => allow);
    const reconcileHtml = jest.fn((el, translatedRoot) => {
      const children = Array.from(translatedRoot.childNodes);
      el.replaceChildren(...children.map((node) => document.adoptNode(node)));
      return true;
    });
    window._sbDomSafe = { sanitizeInlineHtml: (html) => html };
    window._sbHtmlGt = { checkTagIntegrity, reconcileHtml };
    window._sbInteractive = { INTERACTIVE_SELECTOR: 'a, button, summary, [role="button"]' };
    return { checkTagIntegrity, reconcileHtml };
  }

  afterEach(() => {
    window._geminiBlock = { hasInlineTags: () => false };
    delete window._sbDomSafe;
    delete window._sbHtmlGt;
    delete window._sbInteractive;
  });

  test.each([
    ['direct inline tag', '<p id="structured">Read the <a href="/docs">documentation here</a></p>', true],
    [
      'nested interactive descendant',
      '<p id="structured"><span>Read the documentation <a href="/docs">here</a></span></p>',
      false,
    ],
  ])('routes a %s through HTML reconciliation without flattening it', async (_label, markup, hasInlineTags) => {
    document.body.innerHTML = markup;
    const el = document.getElementById('structured');
    window._geminiBlock = { hasInlineTags: () => hasInlineTags };
    const { checkTagIntegrity, reconcileHtml } = installHtmlRuntime();
    const googleTranslateBatch = jest.fn(async ([html]) => [html.replace('Read the', '다음을 읽으세요:')]);
    const { sb } = loadModule({}, { googleTranslateBatch });
    sb.safeReplaceText = jest.fn();

    sb._gt.queueForGoogleTranslate([el], 'ko', true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(googleTranslateBatch).toHaveBeenCalledTimes(1);
    expect(googleTranslateBatch.mock.calls[0][0][0]).toContain('<a href="/docs">');
    expect(checkTagIntegrity).toHaveBeenCalledTimes(1);
    expect(reconcileHtml).toHaveBeenCalledTimes(1);
    expect(sb.safeReplaceText).not.toHaveBeenCalled();
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/docs');
    expect(el.textContent).toContain('다음을 읽으세요:');
  });

  test('an integrity-gate rejection leaves the live structured block untouched and uncached', async () => {
    document.body.innerHTML = '<p id="structured">Read <a href="/safe">safe docs</a></p>';
    const el = document.getElementById('structured');
    const originalHtml = el.outerHTML;
    window._geminiBlock = { hasInlineTags: () => true };
    const { reconcileHtml } = installHtmlRuntime({ allow: false });
    const cacheTranslation = jest.fn();
    const { sb } = loadModule(
      {},
      {
        googleTranslateBatch: jest.fn(async () => ['<p id="structured">위험 <a href="javascript:bad">링크</a></p>']),
        _cacheTranslation: cacheTranslation,
      },
    );

    sb._gt.queueForGoogleTranslate([el], 'ko', true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(reconcileHtml).not.toHaveBeenCalled();
    expect(cacheTranslation).not.toHaveBeenCalled();
    expect(el.outerHTML).toBe(originalHtml);
  });

  test('a Latin-script GT result is skipped on the same generation and reconsidered after a generation bump', async () => {
    document.body.innerHTML = '<p id="latin">Translate this paragraph with Google</p>';
    const el = document.getElementById('latin');
    const { processOneElement, sb } = loadModule(
      {},
      { googleTranslateBatch: jest.fn(async () => ['Texto traducido todavía latino']) },
    );

    sb._gt.queueForGoogleTranslate([el], 'es', true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(el.textContent).toBe('Texto traducido todavía latino');
    expect(processOneElement(el, 'es')).toBeNull();
    sb._gt.bumpGeneration();
    expect(processOneElement(el, 'es')).toBe('gt');
  });
});

describe('offline structured HTML cache coverage', () => {
  beforeEach(() => {
    window._geminiBlock = { hasInlineTags: () => true };
    window._sbDomSafe = { sanitizeInlineHtml: (html) => html };
    window._sbHtmlGt = {
      checkTagIntegrity: () => true,
      reconcileHtml: (el, translatedRoot) => {
        el.innerHTML = translatedRoot.innerHTML;
        return true;
      },
    };
  });

  afterEach(() => {
    window._geminiBlock = { hasInlineTags: () => false };
    delete window._sbDomSafe;
    delete window._sbHtmlGt;
  });

  test('applies cached markup offline, reports mixed coverage, and defers only the miss', async () => {
    document.body.innerHTML = [
      '<p id="cached"><span>Cached lesson paragraph</span></p>',
      '<p id="missing"><span>Missing lesson paragraph</span></p>',
    ].join('');
    const cachedEl = document.getElementById('cached');
    const missingEl = document.getElementById('missing');
    const cachedSource = cachedEl.outerHTML;
    const missingSource = missingEl.outerHTML;
    const cachedTranslation = '<p id="cached"><span>캐시된 레슨 문단</span></p>';
    const missingTranslation = '<p id="missing"><span>새 레슨 문단</span></p>';
    const googleTranslateBatch = jest.fn(async ([source]) =>
      source === missingSource ? [missingTranslation] : [source],
    );
    const cachedLookup = jest.fn(async (key) => {
      if (!key.startsWith('sb-html\u0001')) return null;
      return key.endsWith(cachedSource) ? cachedTranslation : null;
    });
    const { sb } = loadModule({}, { cachedLookup, googleTranslateBatch });
    const coverage = [];
    const onCoverage = (event) => coverage.push(event.detail);
    document.addEventListener('skillbridge:offlinecoverage', onCoverage);

    try {
      sb.isOffline = true;
      sb._gt.queueForGoogleTranslate([cachedEl, missingEl], 'ko', true);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(cachedEl.textContent).toBe('캐시된 레슨 문단');
      expect(missingEl.textContent).toBe('Missing lesson paragraph');
      expect(googleTranslateBatch).not.toHaveBeenCalled();
      expect(coverage).toEqual([
        { generation: 0, hasCached: true, hasMissing: false },
        { generation: 0, hasCached: true, hasMissing: true },
      ]);

      // Only the uncached source was placed in the retry list. If the cached
      // item had also been deferred, this online flush would send both blocks.
      sb.isOffline = false;
      expect(sb._gt.flushOfflinePending('ko')).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(googleTranslateBatch).toHaveBeenCalledTimes(1);
      expect(googleTranslateBatch).toHaveBeenCalledWith([missingSource], 'ko');
      expect(missingEl.textContent).toBe('새 레슨 문단');
      expect(coverage).toHaveLength(2);
    } finally {
      document.removeEventListener('skillbridge:offlinecoverage', onCoverage);
    }
  });

  test('a generation bump clears cumulative coverage back to unknown', () => {
    const { sb } = loadModule({});
    const coverage = [];
    const onCoverage = (event) => coverage.push(event.detail);
    document.addEventListener('skillbridge:offlinecoverage', onCoverage);

    try {
      sb._gt.bumpGeneration();
      expect(coverage).toEqual([{ generation: 1, hasCached: false, hasMissing: false }]);
    } finally {
      document.removeEventListener('skillbridge:offlinecoverage', onCoverage);
    }
  });

  test('a new page or offline episode gets a fresh coverage epoch', () => {
    const { sb } = loadModule({});
    const coverage = [];
    const onCoverage = (event) => coverage.push(event.detail);
    document.addEventListener('skillbridge:offlinecoverage', onCoverage);

    try {
      sb._gt.resetOfflineCoverage();
      sb._gt.resetOfflineCoverage();
      expect(coverage).toEqual([
        { generation: 1, hasCached: false, hasMissing: false },
        { generation: 2, hasCached: false, hasMissing: false },
      ]);
    } finally {
      document.removeEventListener('skillbridge:offlinecoverage', onCoverage);
    }
  });
});

describe('offline coverage epoch races', () => {
  test('online to offline during a cache lookup reports the hit in the new episode', async () => {
    document.body.innerHTML = '<p id="lesson">Same lesson paragraph already cached</p>';
    const el = document.getElementById('lesson');
    let releaseLookup;
    const cachedLookup = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseLookup = resolve;
          }),
      )
      .mockResolvedValue('같은 레슨 캐시 번역');
    const { sb } = loadModule({}, { cachedLookup });
    const coverage = [];
    const onCoverage = (event) => coverage.push(event.detail);
    document.addEventListener('skillbridge:offlinecoverage', onCoverage);

    try {
      sb._gt.queueForGoogleTranslate([el], 'ko', true);
      await Promise.resolve();
      expect(releaseLookup).toEqual(expect.any(Function));

      sb.isOffline = true;
      expect(sb._gt.beginOfflineCoverage()).toBe(false);
      releaseLookup('같은 레슨 캐시 번역');
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(cachedLookup).toHaveBeenCalledTimes(2);
      expect(el.textContent).toBe('같은 레슨 캐시 번역');
      expect(coverage).toEqual([
        { generation: 1, hasCached: false, hasMissing: false },
        { generation: 1, hasCached: true, hasMissing: false },
      ]);
    } finally {
      document.removeEventListener('skillbridge:offlinecoverage', onCoverage);
    }
  });

  test('an epoch retry keeps original cache keys after an earlier flat hit changed the DOM', async () => {
    document.body.innerHTML = [
      '<p id="hit">Cached source paragraph</p>',
      '<p id="miss">Network source paragraph</p>',
    ].join('');
    const hitEl = document.getElementById('hit');
    const missEl = document.getElementById('miss');
    const cachedLookup = jest.fn(async (text) => (text === 'Cached source paragraph' ? '캐시 적중 문단' : null));
    let releaseGoogle;
    const googleTranslateBatch = jest.fn(
      () =>
        new Promise((resolve) => {
          releaseGoogle = resolve;
        }),
    );
    const { sb } = loadModule({}, { cachedLookup, googleTranslateBatch });
    const coverage = [];
    const onCoverage = (event) => coverage.push(event.detail);
    document.addEventListener('skillbridge:offlinecoverage', onCoverage);

    try {
      sb._gt.queueForGoogleTranslate([hitEl, missEl], 'ko', true);
      await Promise.resolve();
      await Promise.resolve();
      expect(hitEl.textContent).toBe('캐시 적중 문단');
      expect(releaseGoogle).toEqual(expect.any(Function));

      sb.isOffline = true;
      expect(sb._gt.beginOfflineCoverage()).toBe(true);
      releaseGoogle(['네트워크 번역 문단']);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(cachedLookup.mock.calls.map(([text]) => text)).toEqual([
        'Cached source paragraph',
        'Network source paragraph',
        'Cached source paragraph',
        'Network source paragraph',
      ]);
      expect(hitEl.textContent).toBe('캐시 적중 문단');
      expect(missEl.textContent).toBe('Network source paragraph');
      expect(coverage).toEqual([
        { generation: 1, hasCached: false, hasMissing: false },
        { generation: 1, hasCached: true, hasMissing: false },
        { generation: 1, hasCached: true, hasMissing: true },
      ]);
    } finally {
      document.removeEventListener('skillbridge:offlinecoverage', onCoverage);
    }
  });

  test('a page reset drops active and queued old work before a later offline reset', async () => {
    const oldTexts = Array.from({ length: 11 }, (_, index) => `Old page paragraph ${index} waiting on cache`);
    document.body.innerHTML = [
      ...oldTexts.map((text, index) => `<p id="old-${index}">${text}</p>`),
      '<p id="fresh">New page paragraph already cached</p>',
    ].join('');
    const oldElements = oldTexts.map((_, index) => document.getElementById(`old-${index}`));
    const freshEl = document.getElementById('fresh');
    let releaseOldLookup;
    const cachedLookup = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseOldLookup = resolve;
          }),
      )
      .mockResolvedValue('새 페이지 캐시 번역');
    const { sb } = loadModule({}, { cachedLookup });
    const coverage = [];
    const onCoverage = (event) => coverage.push(event.detail);
    document.addEventListener('skillbridge:offlinecoverage', onCoverage);

    try {
      // The first page starts online and holds the processor inside its cache
      // await. A same-language SPA reset happens before Skilljar replaces the
      // old DOM, then the network goes offline. The later offline transition
      // may retry new-page work, but must not revive the still-connected batch
      // captured before the page reset.
      sb._gt.queueForGoogleTranslate(oldElements, 'ko', true);
      await Promise.resolve();
      expect(releaseOldLookup).toEqual(expect.any(Function));

      sb._gt.resetOfflineCoverage();
      sb.isOffline = true;
      expect(sb._gt.beginOfflineCoverage()).toBe(false);
      sb._gt.queueForGoogleTranslate([freshEl], 'ko', true);
      releaseOldLookup(null);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(cachedLookup.mock.calls.map(([text]) => text)).toEqual([
        ...oldTexts.slice(0, 10),
        'New page paragraph already cached',
      ]);
      for (let index = 0; index < oldElements.length; index++) {
        expect(oldElements[index].textContent).toBe(oldTexts[index]);
      }
      expect(freshEl.textContent).toBe('새 페이지 캐시 번역');
      expect(coverage).toEqual([
        { generation: 1, hasCached: false, hasMissing: false },
        { generation: 2, hasCached: false, hasMissing: false },
        { generation: 2, hasCached: true, hasMissing: false },
      ]);
    } finally {
      document.removeEventListener('skillbridge:offlinecoverage', onCoverage);
    }
  });

  test('an idle offline episode is seeded from a live rendered translation', async () => {
    document.body.innerHTML = [
      '<p id="live">Rendered lesson paragraph</p>',
      '<p id="detached">Detached translated paragraph</p>',
    ].join('');
    const liveEl = document.getElementById('live');
    const detachedEl = document.getElementById('detached');
    const cachedLookup = jest.fn(async (text) => `cached: ${text}`);
    const { sb } = loadModule({}, { cachedLookup });

    sb._gt.queueForGoogleTranslate([liveEl, detachedEl], 'ko', true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    detachedEl.remove();

    const coverage = [];
    const onCoverage = (event) => coverage.push(event.detail);
    document.addEventListener('skillbridge:offlinecoverage', onCoverage);

    try {
      expect(sb._gt.reportRenderedOfflineCoverage()).toBe(false);
      sb.isOffline = true;
      expect(sb._gt.beginOfflineCoverage()).toBe(true);
      expect(sb._gt.reportRenderedOfflineCoverage()).toBe(true);

      expect(coverage).toEqual([
        { generation: 1, hasCached: false, hasMissing: false },
        { generation: 1, hasCached: true, hasMissing: false },
      ]);

      liveEl.remove();
      expect(sb._gt.reportRenderedOfflineCoverage()).toBe(false);
      expect(coverage).toHaveLength(2);
    } finally {
      document.removeEventListener('skillbridge:offlinecoverage', onCoverage);
    }
  });

  test('a stale lazy observer cannot enqueue old-page elements after a page reset', async () => {
    document.body.innerHTML = '<p id="old-lazy">Old page paragraph below the viewport</p>';
    const oldEl = document.getElementById('old-lazy');
    let observerCallback;
    const observer = {
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn(),
    };
    const OriginalIntersectionObserver = global.IntersectionObserver;
    global.IntersectionObserver = jest.fn(function (callback) {
      observerCallback = callback;
      return observer;
    });
    window.IntersectionObserver = global.IntersectionObserver;

    const cachedLookup = jest.fn(async () => '이전 페이지 캐시 번역');
    const { sb } = loadModule({}, { cachedLookup });
    sb.translatableSelector = 'p';
    sb.excludeSelector = '.skillbridge-never-match';

    try {
      sb._gt.applyStaticTranslations('ko');
      expect(observer.observe).toHaveBeenCalledWith(oldEl);
      expect(observerCallback).toEqual(expect.any(Function));

      sb._gt.resetOfflineCoverage();
      expect(observer.disconnect).toHaveBeenCalledTimes(1);

      observerCallback([{ isIntersecting: true, target: oldEl }]);
      await Promise.resolve();

      expect(observer.unobserve).not.toHaveBeenCalled();
      expect(cachedLookup).not.toHaveBeenCalled();
      expect(oldEl.textContent).toBe('Old page paragraph below the viewport');
    } finally {
      global.IntersectionObserver = OriginalIntersectionObserver;
      window.IntersectionObserver = OriginalIntersectionObserver;
    }
  });
});
