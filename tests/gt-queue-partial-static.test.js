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
window._protectedTerms = { buildProtectedTermsMap: () => {} };

/**
 * @param {Record<string,string>} dict — exact-match static dictionary
 * @returns {{ processOneElement: Function, sb: object }}
 */
function loadModule(dict) {
  const sb = {
    isExamPage: false,
    hostCaps: { examDetection: false },
    originalTexts: new Map(),
    translatedTexts: new Map(),
    translator: { staticLookup: (text) => dict[text] || null },
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
    const { processOneElement } = loadModule({
      'Anthropic courses': 'Anthropic 과정',
      'are taught by the research team here': '는 여기 연구 팀이 가르칩니다',
    });
    const el = setup();
    expect(processOneElement(el, 'ko')).toBe('static');
    expect(el.textContent).toBe('Anthropic 과정 는 여기 연구 팀이 가르칩니다');
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
