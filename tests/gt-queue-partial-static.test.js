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

/* global describe, test, expect, beforeEach */

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'gt-queue.js'), 'utf8');

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
});
