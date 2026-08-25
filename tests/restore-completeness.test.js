/**
 * @jest-environment jsdom
 *
 * Restore must put every translated element back, including one the page
 * detached and re-attached while it was translated.
 *
 * This is issue #300: after ~15 consecutive language switches on a live
 * Skilljar lesson, selecting English left one `<h2>` — inside the collapsible
 * course-overview block — still rendered in Korean, while everything else on
 * the page restored. It reloaded clean and never reproduced under the obvious
 * races: short chains, mid-translation switches, dictionary-less locales.
 *
 * The mechanism is the one the issue itself pointed at. `restoreOriginal`
 * rewrites exactly the elements in `originalTexts`; anything missing from that
 * map keeps whatever text it is showing. And `pruneDetachedEntries` deleted an
 * entry the moment its element had no parent — scheduled by the observer on ANY
 * mutation carrying removals, which is precisely what a collapsible does when
 * it closes.
 *
 * So a node that is removed and re-inserted — the SAME node, still holding
 * translated text — comes back with no record of its English. Every later
 * restore skips it. That needs no unusual timing, only a prune that lands
 * inside the window, which is why it took a long session to be seen once.
 *
 * The tests below drive the real `pruneDetachedEntries` and the real
 * `restoreOriginal` against that sequence.
 */

/* global describe, test, expect, beforeEach */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

/** Pull one `  function name() { ... }` block out of an IIFE source file. */
function extractFunction(source, name) {
  const start = source.indexOf(`  function ${name}(`);
  if (start === -1) throw new Error(`Could not find ${name} — did the source shape change?`);
  const end = source.indexOf('\n  }\n', start);
  if (end === -1) throw new Error(`Could not find the end of ${name}`);
  return source.slice(start, end + 4);
}

const GT_SRC = read('src', 'content', 'gt-queue.js');
const CONTENT_SRC = read('src', 'content', 'content.js');

/** A `_sb` carrying the three maps the two functions share. */
function makeSb(cap = 5000) {
  return {
    originalTexts: new Map(),
    translatedTexts: new Map(),
    originalComments: new Map(),
    mapSizeCap: cap,
    _gt: { reset() {} },
  };
}

function buildPrune(sb) {
  return new Function('sb', `${extractFunction(GT_SRC, 'pruneDetachedEntries')}\nreturn pruneDetachedEntries;`)(sb);
}

/**
 * The real `restoreOriginal`, with everything it touches beyond the maps
 * stubbed. The loop over `originalTexts` is the part under test.
 */
function buildRestore(sb) {
  const noop = () => {};
  return new Function(
    'originalTexts',
    'translatedTexts',
    'originalComments',
    'sb',
    'domTranslationObserver',
    'updateLangClass',
    'window',
    `let currentLang = 'ko';
     ${extractFunction(CONTENT_SRC, 'restoreOriginal')}
     return restoreOriginal;`,
  )(sb.originalTexts, sb.translatedTexts, sb.originalComments, sb, { resetPending: noop }, noop, {
    _protectedTerms: { resetProtectedTerms: noop },
    _sb: { hideTranslationProgress: noop },
  });
}

/** A lesson with a collapsible course-overview block, as Skilljar renders it. */
function buildPage() {
  document.body.innerHTML = `
    <div id="lesson">
      <h1 id="title">Introduction to Claude</h1>
      <div id="overview"><h2 id="overview-heading">Course Overview</h2></div>
      <p id="body">A prompt is the input you give to Claude.</p>
    </div>`;
}

/** Translate an element the way processOneElement does: record, then write. */
function translate(sb, el, text) {
  if (!sb.originalTexts.has(el)) sb.originalTexts.set(el, el.innerHTML);
  el.innerHTML = text;
}

beforeEach(buildPage);

describe('pruneDetachedEntries', () => {
  test('an element the page removed and re-inserted keeps its original', () => {
    // The #300 sequence, in three lines: translate, collapse (which removes the
    // node and fires the observer's prune), expand (which puts the SAME node
    // back, still translated).
    const sb = makeSb();
    const prune = buildPrune(sb);
    const heading = document.getElementById('overview-heading');
    const overview = document.getElementById('overview');

    translate(sb, heading, '과정 개요');
    heading.remove();
    prune();
    overview.appendChild(heading);

    // A re-attached node must still know its English.
    expect(sb.originalTexts.has(heading)).toBe(true);
  });

  test('so a later restore puts it back', () => {
    const sb = makeSb();
    const prune = buildPrune(sb);
    const restore = buildRestore(sb);
    const heading = document.getElementById('overview-heading');
    const overview = document.getElementById('overview');
    const title = document.getElementById('title');

    translate(sb, title, 'Claude 소개');
    translate(sb, heading, '과정 개요');
    heading.remove();
    prune();
    overview.appendChild(heading);

    restore();
    expect(title.innerHTML).toBe('Introduction to Claude');
    // The heading #300 saw left in Korean.
    expect(heading.innerHTML).toBe('Course Overview');
  });

  test('it survives many switch cycles, which is where it was actually seen', () => {
    // ~15 consecutive language switches with no reload was the only condition
    // the failed reproduction attempts never matched.
    const sb = makeSb();
    const prune = buildPrune(sb);
    const restore = buildRestore(sb);
    const overview = document.getElementById('overview');

    for (let i = 0; i < 15; i += 1) {
      const heading = document.getElementById('overview-heading');
      translate(sb, heading, `번역-${i}`);
      heading.remove();
      prune();
      overview.appendChild(heading);
      restore();
      expect(document.getElementById('overview-heading').innerHTML).toBe('Course Overview');
    }
  });

  test('a genuinely dead entry is still evicted once the map is under pressure', () => {
    // The sweep is not removed, only deferred: it is what makes room at the
    // cap, and it must still clear nodes the page really did throw away.
    const sb = makeSb(3);
    const prune = buildPrune(sb);
    for (let i = 0; i < 10; i += 1) {
      const el = document.createElement('p');
      el.innerHTML = `dead ${i}`;
      sb.originalTexts.set(el, el.innerHTML);
    }
    prune();
    expect(sb.originalTexts.size).toBeLessThanOrEqual(3);
  });

  test('under pressure a LIVE entry outlives a dead one', () => {
    // Eviction order matters: dropping a live element's original is exactly the
    // bug, so the detached ones have to go first.
    const sb = makeSb(2);
    const prune = buildPrune(sb);
    const live = document.getElementById('title');
    translate(sb, live, 'Claude 소개');
    for (let i = 0; i < 8; i += 1) {
      const el = document.createElement('p');
      sb.originalTexts.set(el, `dead ${i}`);
    }
    prune();
    expect(sb.originalTexts.has(live)).toBe(true);
  });

  test('the translated-text bookkeeping is still bounded', () => {
    const sb = makeSb(2);
    const prune = buildPrune(sb);
    for (let i = 0; i < 10; i += 1) {
      sb.translatedTexts.set(`text ${i}`, [{ el: document.createElement('p') }]);
    }
    prune();
    expect(sb.translatedTexts.size).toBeLessThanOrEqual(2);
  });

  test('originalComments stays bounded too', () => {
    const sb = makeSb(2);
    const prune = buildPrune(sb);
    for (let i = 0; i < 10; i += 1) sb.originalComments.set(document.createElement('code'), `c${i}`);
    prune();
    expect(sb.originalComments.size).toBeLessThanOrEqual(2);
  });
});
