/**
 * Unit tests for the Academy observation helpers.
 *
 * Everything here runs on fixture snapshots — no browser, no network. The
 * probe that drives a real browser is a manual script; CI must never depend
 * on academy.claude.com being up or on what it happens to serve today.
 */

/* global describe, test, expect */

const {
  CONFIDENCE,
  COVERAGE,
  normalizeLocale,
  validateObservedLocale,
  validateAcademyPage,
  classifyLocalization,
  extractLocalizationSurface,
} = require('../scripts/lib/academy-observation');

describe('validateObservedLocale', () => {
  test('agreeing html lang and selector give a high-confidence observation', () => {
    expect(validateObservedLocale({ htmlLang: 'ko', selectedLocale: 'ko' }, 'ko')).toEqual({
      observedLocale: 'ko',
      confidence: CONFIDENCE.HIGH,
    });
  });

  test('a disagreement fails closed instead of picking a side', () => {
    // This is the half-hydrated page: SSR wrote lang="en", the selector has
    // already switched to ko. Recording either one as fact would be a guess.
    const out = validateObservedLocale({ htmlLang: 'en', selectedLocale: 'ko' }, 'ko');
    expect(out.observedLocale).toBeNull();
    expect(out.confidence).toBe(CONFIDENCE.UNKNOWN);
    expect(out.reason).toMatch(/disagrees/);
  });

  test('missing evidence fails closed', () => {
    expect(validateObservedLocale({ htmlLang: 'ko' }, 'ko').confidence).toBe(CONFIDENCE.UNKNOWN);
    expect(validateObservedLocale({}, 'ko').confidence).toBe(CONFIDENCE.UNKNOWN);
    expect(validateObservedLocale(null, 'ko').confidence).toBe(CONFIDENCE.UNKNOWN);
  });

  test('serving a different locale than requested is observed, not an error', () => {
    // The request is an input; the render is the observation. A site that
    // ignores the request still produced a real, readable page.
    const out = validateObservedLocale({ htmlLang: 'en', selectedLocale: 'en' }, 'ko');
    expect(out).toMatchObject({ observedLocale: 'en', confidence: CONFIDENCE.HIGH });
    expect(out.reason).toMatch(/served en for a ko request/);
  });

  test('locale tags compare case- and separator-insensitively', () => {
    expect(normalizeLocale('zh_tw')).toBe('zh-TW');
    expect(validateObservedLocale({ htmlLang: 'zh-TW', selectedLocale: 'zh_tw' }, 'zh-TW').confidence).toBe(
      CONFIDENCE.HIGH,
    );
  });
});

describe('validateAcademyPage', () => {
  test('accepts a hydrated page', () => {
    expect(validateAcademyPage({ courseTitle: 'Building with the Claude API', bodyBlocks: ['Some prose.'] })).toEqual({
      ok: true,
    });
  });

  test('rejects the generic client shell', () => {
    // Measured: a locale-prefixed URL answers 200 with ~16 KB and no content.
    // Counting one of these as a localized page is how coverage becomes junk.
    const out = validateAcademyPage({ title: 'Claude Academy', courseTitle: '', bodyBlocks: [] });
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/empty after hydration/);
  });

  test('rejects a page whose body arrived but whose course title did not', () => {
    expect(validateAcademyPage({ bodyBlocks: ['prose'] })).toMatchObject({ ok: false });
  });

  test('rejects a missing snapshot', () => {
    expect(validateAcademyPage(null).ok).toBe(false);
  });
});

describe('classifyLocalization', () => {
  test('all target-script strings are translated', () => {
    expect(classifyLocalization(['환경 설정하기', '응답 추출하기'], 'ko')).toBe(COVERAGE.TRANSLATED);
  });

  test('all English strings are residue', () => {
    expect(classifyLocalization(['Making a request', 'Temperature'], 'ko')).toBe(COVERAGE.ENGLISH_RESIDUE);
  });

  test('a mix of both is mixed', () => {
    // The shape actually measured on Academy: Korean bodies, English titles.
    expect(classifyLocalization(['환경 설정하기', 'Making a request'], 'ko')).toBe(COVERAGE.MIXED);
  });

  test('a target-language string containing English terms still counts as translated', () => {
    expect(classifyLocalization(['Claude API를 사용하세요'], 'ko')).toBe(COVERAGE.TRANSLATED);
  });

  test('Latin-script target locales report unknown rather than guessing', () => {
    // "Realizar una solicitud" and "Making a request" are indistinguishable by
    // character class. Reporting a number here would read as fact.
    expect(classifyLocalization(['Realizar una solicitud'], 'es')).toBe(COVERAGE.UNKNOWN);
    expect(classifyLocalization(['Faire une requête'], 'fr')).toBe(COVERAGE.UNKNOWN);
  });

  test('empty input is unknown, never translated', () => {
    expect(classifyLocalization([], 'ko')).toBe(COVERAGE.UNKNOWN);
    expect(classifyLocalization(['', '   '], 'ko')).toBe(COVERAGE.UNKNOWN);
    expect(classifyLocalization(null, 'ko')).toBe(COVERAGE.UNKNOWN);
  });

  test('ja and zh are recognised', () => {
    expect(classifyLocalization(['リクエストを送る'], 'ja')).toBe(COVERAGE.TRANSLATED);
    expect(classifyLocalization(['发出请求'], 'zh-CN')).toBe(COVERAGE.TRANSLATED);
  });
});

describe('private-use glyph handling', () => {
  test('a selector label wrapped in icon-font glyphs still resolves', () => {
    // Measured: the selector's textContent is \ue082한국어\ue027 — the label
    // with icon glyphs welded on. Exact-match lookup against that returns
    // null, and the probe then reports "missing locale evidence" for a page
    // that rendered perfectly. The probe strips U+E000..U+F8FF before
    // comparing; this pins the expectation that the stripped form is what
    // reaches validateObservedLocale.
    const stripped = '\ue082한국어\ue027'.replace(/[\uE000-\uF8FF]/gu, '').trim();
    expect(stripped).toBe('한국어');
    const LABELS = { 한국어: 'ko' };
    expect(LABELS[stripped]).toBe('ko');
  });
});

describe('extractLocalizationSurface', () => {
  test('reports each surface separately', () => {
    // The whole point of the probe: find WHICH surfaces still need a fallback.
    const snapshot = {
      courseTitle: 'Claude API로 구축하기',
      sectionTitles: ['API로 Claude 액세스하기', 'Prompt engineering techniques'],
      lessonTitles: ['Making a request', 'Temperature'],
      bodyBlocks: ['먼저 노트북에 필요한 종속성을 설치하세요.'],
      quizTitles: [],
    };
    expect(extractLocalizationSurface(snapshot, 'ko')).toEqual({
      courseTitle: COVERAGE.TRANSLATED,
      sectionTitles: COVERAGE.MIXED,
      lessonTitles: COVERAGE.ENGLISH_RESIDUE,
      body: COVERAGE.TRANSLATED,
      quizTitles: COVERAGE.UNKNOWN,
    });
  });

  test('an empty snapshot is all unknown, not all translated', () => {
    expect(extractLocalizationSurface({}, 'ko')).toEqual({
      courseTitle: COVERAGE.UNKNOWN,
      sectionTitles: COVERAGE.UNKNOWN,
      lessonTitles: COVERAGE.UNKNOWN,
      body: COVERAGE.UNKNOWN,
      quizTitles: COVERAGE.UNKNOWN,
    });
  });
});
