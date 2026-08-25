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

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

function load(file) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', file), 'utf8');
  const fake = { module: { exports: {} } };
  new Function('globalThis', src)(fake);
  return fake.module.exports;
}

const { TRANSLATION_POLICY, resolveTranslationPolicy, mayTranslateText, readObservedLocale } =
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
