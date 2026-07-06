/**
 * @jest-environment jsdom
 *
 * Unit tests for the per-host content scope in `getTranslatableElements`
 * (gt-queue.js). On scoped hosts (claude.com tutorials) the translation walk
 * must return only elements inside the lesson root(s) and EXCLUDE the
 * surrounding Webflow marketing shell; with no scope it walks the whole
 * document (the Skilljar default). e2e cannot cover this — it runs on
 * localhost where the scope is always null — so it is unit-tested here against
 * the real source.
 *
 * `getTranslatableElements` is extracted from the IIFE source (same pattern as
 * safe-replace-text / gt-queue tests) and given a fake `sb`.
 */

/* global describe, test, expect, beforeEach, jest */

const fs = require('fs');
const path = require('path');

const gtSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'gt-queue.js'), 'utf8');
const fnSrc = gtSrc.match(/function getTranslatableElements\(\) \{[\s\S]*?\n {2}\}/);
if (!fnSrc) {
  throw new Error('Could not extract getTranslatableElements from gt-queue.js — did the source shape change?');
}

// The function closes over `sb` and the `EXAM_SKIP_SELECTORS` global; supply both.
const factory = new Function('sb', 'EXAM_SKIP_SELECTORS', `${fnSrc[0]}\nreturn getTranslatableElements;`);

const LESSON_SCOPE = '.hero_tutorial_post_content, #tutorial_content';
const TRANSLATABLE = 'h1, h2, h3, p, li';
const EXCLUDE = 'code, pre, script, style';

function buildPage() {
  document.body.innerHTML = `
    <header><nav><ul><li class="chrome">Pricing</li><li class="chrome">Docs</li></ul></nav></header>
    <div class="hero_tutorial_post_content"><h1>Choosing the right Claude model</h1></div>
    <div id="tutorial_content">
      <h2>Meet the four models</h2>
      <p>Claude comes in four versions.</p>
      <ul><li>Haiku is fast and lightweight.</li></ul>
    </div>
    <footer><p class="chrome">Footer marketing copy here.</p></footer>
  `;
}

const texts = (els) => els.map((el) => el.textContent.trim());
const makeSb = (translationScope) => ({
  translatableSelector: TRANSLATABLE,
  excludeSelector: EXCLUDE,
  translationScope,
  isExamPage: false,
});

describe('getTranslatableElements — per-host content scope', () => {
  beforeEach(buildPage);

  test('scoped host returns lesson elements and EXCLUDES the surrounding shell', () => {
    const out = factory(makeSb(LESSON_SCOPE), [])();
    const joined = texts(out).join(' | ');
    // lesson content present
    expect(joined).toContain('Choosing the right Claude model');
    expect(joined).toContain('Meet the four models');
    expect(joined).toContain('Claude comes in four versions.');
    expect(joined).toContain('Haiku is fast and lightweight.');
    // site chrome excluded
    expect(out.some((el) => el.classList.contains('chrome'))).toBe(false);
    expect(joined).not.toContain('Pricing');
    expect(joined).not.toContain('Footer marketing copy');
  });

  test('no scope (Skilljar default) walks the whole document including chrome', () => {
    const joined = texts(factory(makeSb(null), [])()).join(' | ');
    expect(joined).toContain('Claude comes in four versions.');
    expect(joined).toContain('Pricing'); // chrome IS included when unscoped
    expect(joined).toContain('Footer marketing copy');
  });

  test('scoped host with a MISSING lesson root returns nothing and warns exactly once', () => {
    document.body.innerHTML = '<div class="some-other-shell"><p>Unrelated page.</p></div>';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const get = factory(makeSb(LESSON_SCOPE), []);
    expect(get()).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    // The sb._scopeWarned latch must suppress repeat warnings on subsequent walks.
    get();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

// ── updateLangClass: lang/font class scoping (content.js) ──────────
// Proves the font/lang class lands on the lesson root on scoped hosts (so the
// claude.com marketing shell keeps its own typography) and on <body> otherwise.

const contentSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'content.js'), 'utf8');
const updateLangSrc = contentSrc.match(/function updateLangClass\(lang\) \{[\s\S]*?\n {2}\}/);
if (!updateLangSrc) {
  throw new Error('Could not extract updateLangClass from content.js — did the source shape change?');
}
const updateLangFactory = new Function('sb', `${updateLangSrc[0]}\nreturn updateLangClass;`);
const makeUpdate = (translationScope) => updateLangFactory({ translationScope });

describe('updateLangClass — lang/font class targets the scope, not the whole page', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.className = '';
    document.documentElement.removeAttribute('lang');
    document.documentElement.removeAttribute('dir');
  });

  test('scoped host applies si18n-lang-* to the lesson root, NOT <body>', () => {
    document.body.innerHTML = '<div id="tutorial_content"><p>x</p></div><nav>shell</nav>';
    makeUpdate('#tutorial_content')('ko');
    expect(document.getElementById('tutorial_content').classList.contains('si18n-lang-ko')).toBe(true);
    expect(document.body.classList.contains('si18n-lang-ko')).toBe(false);
    expect(document.documentElement.lang).toBe('ko');
  });

  test('unscoped host (Skilljar) applies the class to <body> — unchanged behaviour', () => {
    makeUpdate(null)('ja');
    expect(document.body.classList.contains('si18n-lang-ja')).toBe(true);
    expect(document.documentElement.lang).toBe('ja');
  });

  test('does not inject remote font links', () => {
    makeUpdate(null)('ko');
    expect(document.querySelector('link[href*="fonts.googleapis.com"]')).toBeNull();
  });

  test('switching to en clears the lang class and resets lang/dir', () => {
    const update = makeUpdate(null);
    update('ar');
    expect(document.documentElement.dir).toBe('rtl');
    update('en');
    expect(document.body.classList.contains('si18n-lang-ar')).toBe(false);
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
  });
});
