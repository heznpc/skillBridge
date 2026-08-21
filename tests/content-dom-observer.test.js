/**
 * @jest-environment jsdom
 *
 * Behavioural tests for the MutationObserver drain in content-dom-observer.js.
 *
 * Loads the real IIFE and drives it through actual DOM mutations rather than
 * asserting on source strings, so a refactor that keeps the shape but changes
 * the behaviour still fails here.
 */

/* global describe, test, expect, beforeEach */

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'content-dom-observer.js'), 'utf8');
new Function('window', src)(window);
const { createContentDomObserver } = window._sbContentDomObserver;

/**
 * A fixed grace period. Use ONLY after `settleUntil` has already confirmed the
 * expected work happened, to give any WRONG extra work a chance to show up
 * before an absence assertion — and in the one test whose whole claim is that
 * nothing runs, where there is nothing to poll for.
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

/**
 * Poll until `predicate()` holds. For "wait for the expected outcome".
 *
 * The chain under test is a MutationObserver callback (a microtask) followed
 * by a debounce timer, and on a loaded machine it intermittently takes longer
 * than any single number you pick: a flat 20ms sleep left `processed` empty in
 * roughly one full-suite run in five, while the same test passed every time in
 * isolation. A ceiling costs nothing when the assertion passes — this exits as
 * soon as the condition holds, so it only changes how long a real failure
 * takes to report.
 */
async function settleUntil(predicate, ceilingMs = 2000) {
  const deadline = Date.now() + ceilingMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (predicate()) return;
  }
}

function setup({ max = 2, scope = null, debounce = 1 } = {}) {
  document.body.innerHTML = '<div id="root"></div>';
  const processed = [];
  const queued = [];
  const observer = createContentDomObserver({
    getCurrentLang: () => 'ko',
    getTranslator: () => ({}),
    getIsReady: () => true,
    getOriginalTextCount: () => 0,
    getTranslatedTextCount: () => 0,
    pruneDetachedEntries: () => {},
    getTranslatableSelector: () => 'p',
    getExcludeSelector: () => '.excluded',
    getTranslationScope: () => scope,
    getHostCaps: () => ({ examDetection: false }),
    getIsExamPage: () => false,
    setIsExamPage: () => {},
    detectExamPage: () => false,
    processOneElement: (el) => {
      processed.push(el.id);
      return 'gt';
    },
    queueForGoogleTranslate: (els) => queued.push(...els.map((e) => e.id)),
    delays: { DOM_DEBOUNCE: debounce },
    thresholds: { PENDING_NODES_MAX: max },
  });
  observer.observe(document.getElementById('root'));
  return { observer, processed, queued, root: document.getElementById('root') };
}

/** Append `count` <p> elements in one burst, as a framework render would. */
function burst(root, count, offset = 0) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const p = document.createElement('p');
    p.id = `p${offset + i}`;
    p.textContent = `Paragraph ${offset + i}`;
    frag.appendChild(p);
  }
  root.appendChild(frag);
}

describe('content DOM observer — mutation burst handling', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('a burst inside the cap translates every node', async () => {
    const { processed, root } = setup({ max: 10 });
    burst(root, 4);
    await settleUntil(() => processed.length >= 4);
    expect(processed.sort()).toEqual(['p0', 'p1', 'p2', 'p3']);
  });

  test('a burst OVER the cap still translates the nodes past it', async () => {
    // Regression: `debounceTranslateNew` used to `return` once the queue hit
    // PENDING_NODES_MAX, dropping every later node with no flag and no rescan.
    // A single SPA render of more than PENDING_NODES_MAX roots therefore left
    // its tail untranslated until some unrelated mutation happened to arrive.
    const { processed, root } = setup({ max: 2 });
    burst(root, 6);
    await settleUntil(() => processed.length >= 6);
    expect(processed.length).toBe(6);
    expect(processed.sort()).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5']);
  });

  test('the overflow rescan still honours the exclude selector', async () => {
    const { processed, root } = setup({ max: 2 });
    burst(root, 5);
    const skipped = document.createElement('div');
    skipped.className = 'excluded';
    const inner = document.createElement('p');
    inner.id = 'excluded-child';
    skipped.appendChild(inner);
    root.appendChild(skipped);
    await settleUntil(() => processed.length >= 5);
    // The five are in; now leave room for a sixth to arrive wrongly.
    await settle();
    expect(processed).not.toContain('excluded-child');
    expect(processed.length).toBe(5);
  });

  test('the overflow rescan stays inside the translation scope', async () => {
    document.body.innerHTML = '<div id="root"></div><div id="outside"><p id="stranger">Elsewhere</p></div>';
    const { processed, root } = setup({ max: 2, scope: '#root' });
    // setup() reset innerHTML, so rebuild the out-of-scope node afterwards.
    const outside = document.createElement('div');
    outside.innerHTML = '<p id="stranger">Elsewhere</p>';
    document.body.appendChild(outside);
    burst(root, 5);
    await settleUntil(() => processed.length >= 5);
    await settle();
    expect(processed).not.toContain('stranger');
    expect(processed.length).toBe(5);
  });

  test('the overflow flag is consumed, so a later small burst does not rescan', async () => {
    const { processed, root } = setup({ max: 2 });
    burst(root, 5);
    await settleUntil(() => processed.length >= 5);
    const afterFirst = processed.length;
    expect(afterFirst).toBe(5);

    processed.length = 0;
    burst(root, 1, 100);
    await settleUntil(() => processed.includes('p100'));
    // A rescan would re-visit p0..p4 as well; only the new node should appear.
    await settle();
    expect(processed).toEqual(['p100']);
  });

  test('resetPending clears a pending overflow', async () => {
    // A long debounce so the drain is genuinely still queued when we cancel.
    // MutationObserver delivers on a microtask, so the flush below is what
    // actually gets the nodes queued — cancelling before it would prove
    // nothing.
    const { observer, processed, root } = setup({ max: 2, debounce: 200 });
    burst(root, 6);
    await new Promise((resolve) => setTimeout(resolve, 0)); // observer callback runs
    observer.resetPending();
    await new Promise((resolve) => setTimeout(resolve, 300)); // past the debounce
    expect(processed).toEqual([]);
  });
});
