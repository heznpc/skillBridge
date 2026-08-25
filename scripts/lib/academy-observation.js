/**
 * Observation helpers for academy.claude.com.
 *
 * WHY A BROWSER IS REQUIRED. Measured 2026-08-24 against the live site:
 * a raw HTTP response never carries localized content. Requesting an
 * unprefixed course page returns ~105 KB of English SSR whatever
 * `Accept-Language` says (`ko`, `ko-KR,ko;q=0.9,en;q=0.8`, `ja-JP,ja;q=0.9`
 * all produced identical bytes with `<html lang="en">` and zero Hangul), and
 * requesting a locale-prefixed path returns a ~16 KB shell — same shell even
 * with a full set of browser navigation headers. The same prefixed URL opened
 * in a real browser renders Korean. So `Accept-Language` is not a control
 * axis for this site and is deliberately absent from this module's API.
 *
 * What that observation does NOT establish is where the localized strings
 * come from — bundle, streamed payload, embedded state, runtime transform.
 * The probe does not need to know, and nothing here should assume it.
 *
 * The functions below are pure: they take an already-rendered DOM snapshot
 * and return observations. Browser plumbing lives in the probe script, so the
 * interesting logic stays testable without launching anything.
 */

/** Locale observation confidence. */
const CONFIDENCE = Object.freeze({ HIGH: 'high', UNKNOWN: 'unknown' });

/** How localized one surface of a page is. */
const COVERAGE = Object.freeze({
  TRANSLATED: 'translated',
  ENGLISH_RESIDUE: 'english-residue',
  MIXED: 'mixed',
  UNKNOWN: 'unknown',
});

/**
 * Scripts whose presence means a string is NOT English. Latin-script target
 * locales (es, fr) cannot be separated from English this way — see
 * classifyLocalization, which reports `unknown` for them rather than
 * guessing.
 */
const TARGET_SCRIPT = Object.freeze({
  ko: /[가-힯]/,
  ja: /[぀-ヿ一-鿿]/,
  'zh-CN': /[一-鿿]/,
  'zh-TW': /[一-鿿]/,
});

/** Latin letters only — the signal that a string is still English. */
const LATIN = /[A-Za-z]/;

/**
 * Decide the locale a rendered page is actually in.
 *
 * `<html lang>` alone is not enough: it is rewritten during hydration, so a
 * snapshot taken too early reports the SSR value (`en`) for a page that will
 * render Korean. Requiring the language selector to agree means a
 * half-hydrated page fails closed instead of being recorded as English.
 *
 * @param {{htmlLang?: string, selectedLocale?: string}} evidence
 * @param {string} requestedLocale
 * @returns {{observedLocale: string|null, confidence: string, reason?: string}}
 */
function validateObservedLocale(evidence, requestedLocale) {
  const htmlLang = normalizeLocale(evidence && evidence.htmlLang);
  const selected = normalizeLocale(evidence && evidence.selectedLocale);
  const requested = normalizeLocale(requestedLocale);

  if (!htmlLang || !selected) {
    return { observedLocale: null, confidence: CONFIDENCE.UNKNOWN, reason: 'missing locale evidence' };
  }
  if (htmlLang !== selected) {
    return {
      observedLocale: null,
      confidence: CONFIDENCE.UNKNOWN,
      reason: `html lang (${htmlLang}) disagrees with the selected locale (${selected})`,
    };
  }
  if (requested && htmlLang !== requested) {
    // Not an error — the site may not serve the requested locale. It IS a
    // reason to record what was actually rendered rather than what was asked
    // for, which is why the two are separate fields everywhere.
    return {
      observedLocale: htmlLang,
      confidence: CONFIDENCE.HIGH,
      reason: `served ${htmlLang} for a ${requested} request`,
    };
  }
  return { observedLocale: htmlLang, confidence: CONFIDENCE.HIGH };
}

/**
 * Normalize a locale tag for comparison: lowercase language, uppercase region.
 * @param {string|null|undefined} tag
 * @returns {string|null}
 */
function normalizeLocale(tag) {
  if (typeof tag !== 'string') return null;
  const trimmed = tag.trim();
  if (!trimmed) return null;
  const [lang, region] = trimmed.split(/[-_]/);
  return region ? `${lang.toLowerCase()}-${region.toUpperCase()}` : lang.toLowerCase();
}

/**
 * Is this snapshot a real, hydrated Academy page?
 *
 * The generic client shell is the specific thing to reject: it answers 200,
 * looks like a page, and contains no content at all. Counting one as a
 * localized page is how a coverage number becomes garbage.
 *
 * @param {{title?: string, courseTitle?: string, bodyBlocks?: string[], byteLength?: number}} snapshot
 * @returns {{ok: boolean, reason?: string}}
 */
function validateAcademyPage(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return { ok: false, reason: 'no snapshot' };
  const blocks = Array.isArray(snapshot.bodyBlocks) ? snapshot.bodyBlocks.filter(nonEmpty) : [];
  if (!nonEmpty(snapshot.courseTitle) && !blocks.length) {
    return { ok: false, reason: 'content root is empty after hydration' };
  }
  if (!nonEmpty(snapshot.courseTitle)) return { ok: false, reason: 'no course title' };
  return { ok: true };
}

const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

/**
 * Classify one surface (a set of strings) as translated / residue / mixed.
 *
 * Script-based, not language-based. For a Latin-script target locale there is
 * no way to tell "official Spanish" from "untranslated English" by character
 * class, so those report `unknown` instead of a number that would read as
 * fact. Covering them needs real language detection, which this probe does
 * not attempt.
 *
 * @param {string[]} strings
 * @param {string} locale
 * @returns {string} one of COVERAGE
 */
function classifyLocalization(strings, locale) {
  const values = (Array.isArray(strings) ? strings : []).filter(nonEmpty);
  if (!values.length) return COVERAGE.UNKNOWN;

  const script = TARGET_SCRIPT[normalizeLocale(locale)] || TARGET_SCRIPT[String(locale).split('-')[0]];
  if (!script) return COVERAGE.UNKNOWN;

  let translated = 0;
  let english = 0;
  for (const value of values) {
    if (script.test(value)) translated += 1;
    else if (LATIN.test(value)) english += 1;
  }
  if (translated && !english) return COVERAGE.TRANSLATED;
  if (english && !translated) return COVERAGE.ENGLISH_RESIDUE;
  if (translated && english) return COVERAGE.MIXED;
  return COVERAGE.UNKNOWN;
}

/**
 * Turn a rendered snapshot into the coverage record for one locale.
 *
 * @param {object} snapshot — surfaces read out of the hydrated DOM
 * @param {string} locale — the locale actually observed, not the one requested
 * @returns {Record<string, string>}
 */
function extractLocalizationSurface(snapshot, locale) {
  const s = snapshot || {};
  return {
    courseTitle: classifyLocalization([s.courseTitle], locale),
    sectionTitles: classifyLocalization(s.sectionTitles, locale),
    lessonTitles: classifyLocalization(s.lessonTitles, locale),
    body: classifyLocalization(s.bodyBlocks, locale),
    quizTitles: classifyLocalization(s.quizTitles, locale),
  };
}

module.exports = {
  CONFIDENCE,
  COVERAGE,
  normalizeLocale,
  validateObservedLocale,
  validateAcademyPage,
  classifyLocalization,
  extractLocalizationSurface,
};
