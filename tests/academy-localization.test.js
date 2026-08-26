/**
 * @jest-environment jsdom
 */

/**
 * Translation policy for an already-localized site.
 *
 * The cases below come from the localization observation run: every
 * non-English Academy locale is partial, ko/ja/zh could be classified on every
 * surface, and es/fr could be classified on none.
 */

/* global describe, test, expect, beforeEach */

const fs = require('fs');
const path = require('path');

function load(file) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', file), 'utf8');
  const fake = { module: { exports: {} } };
  new Function('globalThis', src)(fake);
  return fake.module.exports;
}

const { TRANSLATION_POLICY, resolveTranslationPolicy, mayTranslateText, readObservedLocale, createLocalizationPolicy } =
  load('academy-localization.js');

describe('resolveTranslationPolicy', () => {
  test('an English page translates normally', () => {
    const r = resolveTranslationPolicy({ observedLocale: 'en', targetLang: 'ko' });
    expect(r.policy).toBe(TRANSLATION_POLICY.FULL);
    expect(r.mayTranslate).toBe(true);
  });

  test('a Korean page for a Korean reader translates residue only', () => {
    const r = resolveTranslationPolicy({ observedLocale: 'ko', targetLang: 'ko' });
    expect(r.policy).toBe(TRANSLATION_POLICY.RESIDUE_ONLY);
  });

  test('ja, zh-CN and zh-TW resolve the same way', () => {
    for (const lang of ['ja', 'zh-CN', 'zh-TW']) {
      expect(resolveTranslationPolicy({ observedLocale: lang, targetLang: lang }).policy).toBe(
        TRANSLATION_POLICY.RESIDUE_ONLY,
      );
    }
  });

  test('a Spanish page for a Spanish reader is blocked, not residue-only', () => {
    // The observation run classified no surface under es; the Latin-ratio
    // detector puts official Spanish on the same side of the line as English,
    // so "translate the residue" would mean re-translating the whole page.
    const r = resolveTranslationPolicy({ observedLocale: 'es', targetLang: 'es' });
    expect(r.policy).toBe(TRANSLATION_POLICY.BLOCKED);
    expect(r.mayTranslate).toBe(false);
  });

  test('French is blocked for the same reason', () => {
    expect(resolveTranslationPolicy({ observedLocale: 'fr', targetLang: 'fr' }).policy).toBe(
      TRANSLATION_POLICY.BLOCKED,
    );
  });

  test('a page in a third language fails closed', () => {
    const r = resolveTranslationPolicy({ observedLocale: 'ja', targetLang: 'ko' });
    expect(r.policy).toBe(TRANSLATION_POLICY.FAIL_CLOSED);
    expect(r.reason).toBe('no-english-baseline');
  });

  test('an unknown page locale fails closed rather than assuming English', () => {
    expect(resolveTranslationPolicy({ observedLocale: '', targetLang: 'ko' }).policy).toBe(
      TRANSLATION_POLICY.FAIL_CLOSED,
    );
  });
});

describe('mayTranslateText', () => {
  const at = (observedLocale, targetLang) => resolveTranslationPolicy({ observedLocale, targetLang });

  test('under FULL everything may be sent', () => {
    expect(mayTranslateText(at('en', 'ko'), false)).toBe(true);
  });

  test('under RESIDUE_ONLY only English text may be sent', () => {
    const policy = at('ko', 'ko');
    expect(mayTranslateText(policy, true)).toBe(true);
    expect(mayTranslateText(policy, false)).toBe(false);
  });

  test('under BLOCKED nothing may be sent, English-looking or not', () => {
    // The point of BLOCKED is that "English-looking" is not trustworthy here.
    const policy = at('es', 'es');
    expect(mayTranslateText(policy, true)).toBe(false);
    expect(mayTranslateText(policy, false)).toBe(false);
  });

  test('under FAIL_CLOSED nothing may be sent', () => {
    expect(mayTranslateText(at('ja', 'ko'), true)).toBe(false);
  });
});

describe('readObservedLocale', () => {
  test('reads an explicit locale query parameter', () => {
    expect(readObservedLocale(document, { search: '?locale=ko', pathname: '/courses/c' })).toBe('ko');
  });

  test('reads a locale path prefix', () => {
    expect(readObservedLocale(document, { search: '', pathname: '/ja/courses/c' })).toBe('ja');
  });

  test('does not mistake the /courses path for a locale', () => {
    expect(readObservedLocale(document, { search: '', pathname: '/courses/c/making-a-request' })).not.toBe('co');
  });

  test('falls back to the document lang', () => {
    document.documentElement.setAttribute('lang', 'zh-CN');
    expect(readObservedLocale(document, { search: '', pathname: '/courses/c' })).toBe('zh-CN');
    document.documentElement.removeAttribute('lang');
  });

  test('returns empty when nothing declares a locale, so callers fail closed', () => {
    document.documentElement.removeAttribute('lang');
    const observed = readObservedLocale(document, { search: '', pathname: '/courses/c' });
    expect(resolveTranslationPolicy({ observedLocale: observed, targetLang: 'ko' }).mayTranslate).toBe(false);
  });
});

describe('createLocalizationPolicy', () => {
  // The language control is read from the live document, so a button left
  // behind by one test would be evidence in the next.
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('lang');
  });

  function loc(pathname, search = '') {
    return { pathname, search, href: `https://academy.claude.com${pathname}${search}` };
  }

  test('a non-localized host is FULL regardless of what the document claims', () => {
    // Skilljar's <html lang> is English anyway; pinning the value means a host
    // that mislabels itself cannot switch translation off everywhere.
    document.documentElement.setAttribute('lang', 'es');
    const policy = createLocalizationPolicy({ localizedHost: false, doc: document, loc: loc('/es/courses/c') });
    policy.setTarget('ko');
    expect(policy.resolved().policy).toBe(TRANSLATION_POLICY.FULL);
    expect(policy.mayTranslate()).toBe(true);
    document.documentElement.removeAttribute('lang');
  });

  test('captures the page locale at construction, before <html lang> is rewritten', () => {
    document.documentElement.setAttribute('lang', 'es');
    const policy = createLocalizationPolicy({ localizedHost: true, doc: document, loc: loc('/es/courses/c') });
    // updateLangClass() does exactly this once translation starts.
    document.documentElement.setAttribute('lang', 'ko');
    policy.setTarget('ko');
    // Still Spanish as far as the policy is concerned — not "already Korean".
    expect(policy.observedLocale()).toBe('es');
    expect(policy.resolved().policy).toBe(TRANSLATION_POLICY.FAIL_CLOSED);
    document.documentElement.removeAttribute('lang');
  });

  test('an English Academy page for a Korean reader translates in full', () => {
    document.documentElement.setAttribute('lang', 'en');
    const policy = createLocalizationPolicy({ localizedHost: true, doc: document, loc: loc('/courses/c') });
    policy.setTarget('ko');
    expect(policy.mayTranslate()).toBe(true);
    expect(policy.mayTranslateText(true)).toBe(true);
    document.documentElement.removeAttribute('lang');
  });

  test('under residue-only, only text that still reads as English may be sent', () => {
    document.documentElement.setAttribute('lang', 'ko');
    const policy = createLocalizationPolicy({ localizedHost: true, doc: document, loc: loc('/ko/courses/c') });
    policy.setTarget('ko');
    expect(policy.resolved().policy).toBe(TRANSLATION_POLICY.RESIDUE_ONLY);
    expect(policy.mayTranslateText(true)).toBe(true);
    expect(policy.mayTranslateText(false)).toBe(false);
    document.documentElement.removeAttribute('lang');
  });

  /** Render Academy's language control, which is what the policy reads. */
  const renderSelector = (label) => {
    document.body.innerHTML = '';
    const button = document.createElement('button');
    button.textContent = label;
    document.body.appendChild(button);
  };

  test('a route change leaves the locale unresolved until the DOM answers', () => {
    document.documentElement.setAttribute('lang', 'en');
    renderSelector('English');
    const policy = createLocalizationPolicy({ localizedHost: true, doc: document, loc: loc('/courses/c') });
    policy.setTarget('ko');
    expect(policy.mayTranslate()).toBe(true);

    // The address changed; the page has not. Nothing may be sent yet, because
    // the previous page's evidence does not describe the next one.
    policy.onRouteChange(loc('/es/courses/c/making-a-request'));
    expect(policy.observedLocale()).toBe('');
    expect(policy.mayTranslate()).toBe(false);

    // The Spanish page renders; the control is authoritative.
    document.documentElement.setAttribute('lang', 'es');
    renderSelector('Español');
    policy.onDomSettled(document, loc('/es/courses/c/making-a-request'));
    expect(policy.observedLocale()).toBe('es');
    expect(policy.mayTranslate()).toBe(false);
    document.documentElement.removeAttribute('lang');
  });

  test('leaving a locale-prefixed route for an English one releases the block', () => {
    // The bug this replaces: the old code only moved the baseline when the new
    // URL carried a prefix, so switching Academy to English — which drops the
    // prefix — kept the stale `ko` and blocked translation on an English page.
    document.documentElement.setAttribute('lang', 'ko');
    renderSelector('한국어');
    const policy = createLocalizationPolicy({ localizedHost: true, doc: document, loc: loc('/ko/courses/c') });
    policy.setTarget('ko');
    expect(policy.observedLocale()).toBe('ko');

    policy.onRouteChange(loc('/courses/c/lesson-two'));
    document.documentElement.setAttribute('lang', 'en');
    renderSelector('English');
    policy.onDomSettled(document, loc('/courses/c/lesson-two'));

    expect(policy.observedLocale()).toBe('en');
    expect(policy.mayTranslate()).toBe(true);
    document.documentElement.removeAttribute('lang');
  });

  test('an unprefixed URL rendering Korean is read as Korean, not as English', () => {
    // The other direction, and the reason the URL cannot be the signal: an
    // account set to Korean renders Korean with no prefix in the path.
    document.documentElement.setAttribute('lang', 'ko');
    renderSelector('한국어');
    const policy = createLocalizationPolicy({ localizedHost: true, doc: document, loc: loc('/courses/c/lesson') });
    policy.setTarget('ko');
    expect(policy.observedLocale()).toBe('ko');
    expect(policy.resolved().policy).toBe(TRANSLATION_POLICY.RESIDUE_ONLY);
    document.documentElement.removeAttribute('lang');
  });

  test('a half-hydrated page reports nothing rather than guessing', () => {
    // The control has rendered but <html lang> has not caught up. The
    // observation runs required the two to agree; so does this.
    document.documentElement.setAttribute('lang', 'en');
    renderSelector('한국어');
    const policy = createLocalizationPolicy({ localizedHost: true, doc: document, loc: loc('/courses/c/lesson') });
    policy.setTarget('ko');
    expect(policy.observedLocale()).toBe('');
    expect(policy.mayTranslate()).toBe(false);
    document.documentElement.removeAttribute('lang');
  });

  test('announces exactly once per transition into a blocking state', () => {
    document.documentElement.setAttribute('lang', 'es');
    const seen = [];
    const policy = createLocalizationPolicy({
      localizedHost: true,
      doc: document,
      loc: loc('/es/courses/c'),
      onChange: (state) => seen.push(state.policy),
    });
    policy.setTarget('es');
    policy.setTarget('es');
    expect(seen).toEqual([TRANSLATION_POLICY.BLOCKED]);
    document.documentElement.removeAttribute('lang');
  });

  test('a missing target fails closed rather than assuming English', () => {
    document.documentElement.setAttribute('lang', 'fr');
    const policy = createLocalizationPolicy({ localizedHost: true, doc: document, loc: loc('/fr/courses/c') });
    expect(policy.mayTranslate()).toBe(false);
    document.documentElement.removeAttribute('lang');
  });
});

describe('a page in a third language is a deliberate dead end', () => {
  const loc = (pathname) => ({ pathname, search: '', href: `https://academy.claude.com${pathname}` });
  const renderSelector = (label) => {
    document.body.innerHTML = '';
    const b = document.createElement('button');
    b.textContent = label;
    document.body.appendChild(b);
  };

  test('Korean Academy with an English target sends nothing', () => {
    // Confirmed against the live site: Academy renders Korean for a Korean
    // account on a URL with no locale prefix. SkillBridge did not produce that
    // Korean, so it has no English original to restore, and back-translating
    // official copy would be a new translation rather than a restoration.
    document.documentElement.setAttribute('lang', 'ko');
    renderSelector('한국어');
    const policy = createLocalizationPolicy({ localizedHost: true, doc: document, loc: loc('/courses/c/lesson') });
    policy.setTarget('en');
    expect(policy.resolved().policy).toBe(TRANSLATION_POLICY.FAIL_CLOSED);
    expect(policy.resolved().reason).toBe('no-english-baseline');
    expect(policy.mayTranslate()).toBe(false);
    document.documentElement.removeAttribute('lang');
  });

  test('the same page for a Korean reader translates residue instead', () => {
    document.documentElement.setAttribute('lang', 'ko');
    renderSelector('한국어');
    const policy = createLocalizationPolicy({ localizedHost: true, doc: document, loc: loc('/courses/c/lesson') });
    policy.setTarget('ko');
    expect(policy.resolved().policy).toBe(TRANSLATION_POLICY.RESIDUE_ONLY);
    document.documentElement.removeAttribute('lang');
  });

  test('the two blocking states are distinguishable, because the advice differs', () => {
    // "Already in your language" needs no action; a third language can only be
    // left through the site's own control. The banner branches on this.
    document.documentElement.setAttribute('lang', 'es');
    renderSelector('Español');
    const sameLang = createLocalizationPolicy({ localizedHost: true, doc: document, loc: loc('/es/courses/c') });
    sameLang.setTarget('es');
    expect(sameLang.resolved().reason).toBe('residue-indistinguishable-from-latin');

    const thirdLang = createLocalizationPolicy({ localizedHost: true, doc: document, loc: loc('/es/courses/c') });
    thirdLang.setTarget('ko');
    expect(thirdLang.resolved().reason).toBe('no-english-baseline');
    expect(sameLang.resolved().reason).not.toBe(thirdLang.resolved().reason);
    document.documentElement.removeAttribute('lang');
  });
});
