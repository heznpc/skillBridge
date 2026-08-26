/**
 * SkillBridge — Translation policy for a site that is already localized.
 *
 * Skilljar is English, so "translate the page" needed no policy. Academy
 * ships seven official locales, and the observation run found every non-English
 * one to be PARTIAL: course titles translated, section and lesson titles and
 * body copy `mixed`, and in one case a course title that was pure English
 * residue under a Korean locale. So the page a learner sees is genuinely two
 * languages at once, and the question is which half may be sent anywhere.
 *
 * Getting that wrong has a specific cost: re-translating Anthropic's own
 * published Spanish through Google Translate produces worse Spanish than the
 * text already on screen, and spends quota to do it.
 *
 * Whether we can even tell is script-dependent, and the observation data says
 * so plainly. Under ko/ja/zh the run could classify every surface — Hangul,
 * kana/kanji and Han separate cleanly from Latin. Under es/fr it classified
 * NOTHING; every coverage field came back `unknown`. The existing detector is
 * a Latin-character ratio (`latin / total > 0.5` in gt-queue.js), and official
 * Spanish and French sit on the same side of that line as English. There is no
 * signal there to act on.
 *
 * Hence fail-closed. Where the residue cannot be identified, nothing is sent —
 * an untranslated page is a visible non-event, while re-translating official
 * copy is silent damage the learner may never trace back to us.
 *
 * Pure functions: a locale pair goes in, a policy comes out. Nothing here
 * touches the DOM or the network.
 */

/** What may be sent for translation on an already-localized page. */
const TRANSLATION_POLICY = Object.freeze({
  /** The page is English; translate it as usual. */
  FULL: 'full',
  /** The page is already in the target language; translate English residue only. */
  RESIDUE_ONLY: 'residue-only',
  /** The page is localized but residue cannot be identified; send nothing. */
  BLOCKED: 'blocked',
  /** Page and target disagree and no English baseline is available; send nothing. */
  FAIL_CLOSED: 'fail-closed',
});

/**
 * Scripts whose characters separate cleanly from Latin.
 *
 * Membership means residue detection is reliable, not that the language is
 * supported generally. Latin-script locales are absent on purpose: telling
 * official Spanish from English needs real language identification, and the
 * ratio heuristic the codebase has today cannot do it.
 */
const NON_LATIN_TARGETS = Object.freeze(new Set(['ko', 'ja', 'zh-CN', 'zh-TW', 'zh']));

/**
 * Decide what may be translated, from the page's own locale and the target.
 *
 * `observedLocale` is the site's native locale, read from the page. It is NOT
 * the SkillBridge target and must not share a state variable with it —
 * updateLangClass() rewrites <html lang> to the target, so anything reading
 * that attribute afterwards would see our value echoed back instead of the
 * site's.
 *
 * @param {object} args
 * @param {string} args.observedLocale  The locale the page is actually in.
 * @param {string} args.targetLang      The language the learner asked for.
 * @returns {{ policy: string, reason: string, mayTranslate: boolean }}
 */
function resolveTranslationPolicy({ observedLocale, targetLang } = {}) {
  const observed = String(observedLocale || '').trim();
  const target = String(targetLang || '').trim();

  if (!observed) {
    // Unknown page locale is the fail-closed case by definition: we cannot say
    // what re-translating would overwrite.
    return { policy: TRANSLATION_POLICY.FAIL_CLOSED, reason: 'observed-locale-unknown', mayTranslate: false };
  }

  if (observed === 'en') {
    return { policy: TRANSLATION_POLICY.FULL, reason: 'page-is-english', mayTranslate: true };
  }

  if (observed === target) {
    if (NON_LATIN_TARGETS.has(target)) {
      return { policy: TRANSLATION_POLICY.RESIDUE_ONLY, reason: 'residue-detectable-by-script', mayTranslate: true };
    }
    // es/fr and any other Latin-script locale. The observation run could not
    // classify a single surface under these, so there is nothing to act on.
    return { policy: TRANSLATION_POLICY.BLOCKED, reason: 'residue-indistinguishable-from-latin', mayTranslate: false };
  }

  // The page is in some third language — most commonly Academy rendering
  // Korean for a Korean account while the learner has asked SkillBridge for
  // English. Doing nothing is the intended contract, not a gap.
  //
  // SkillBridge's model is restoration: English source in, translation out,
  // English back on demand. A page Academy published in Korean was never
  // translated BY us, so there is no original to restore. The three ways to
  // reach English from here are switching Academy's own locale, fetching an
  // English baseline from Academy, or back-translating the Korean. The last
  // is the tempting one and the wrong one: running official copy through
  // Google Translate produces a new translation of a translation, and it
  // would be worse than the text already on the page while looking like the
  // feature working.
  //
  // So the source of truth stays with the site, and the banner points the
  // learner at the site's own language control.
  return { policy: TRANSLATION_POLICY.FAIL_CLOSED, reason: 'no-english-baseline', mayTranslate: false };
}

/**
 * True when a text run may be sent, given a resolved policy.
 *
 * Under RESIDUE_ONLY this is the whole guard: text already in the target
 * language must not be re-sent, and `looksEnglish` is the caller's existing
 * script check — reliable here precisely because the policy only reaches this
 * branch for non-Latin targets.
 *
 * @param {{policy: string}} resolved
 * @param {boolean} looksEnglish
 * @returns {boolean}
 */
function mayTranslateText(resolved, looksEnglish) {
  switch (resolved?.policy) {
    case TRANSLATION_POLICY.FULL:
      return true;
    case TRANSLATION_POLICY.RESIDUE_ONLY:
      return !!looksEnglish;
    default:
      return false;
  }
}

/**
 * Read the page's own locale, before anything of ours has overwritten it.
 *
 * Prefers an explicit locale in the URL, then <html lang>. Callers must
 * capture this EARLY — once updateLangClass() has run, <html lang> reports the
 * SkillBridge target and this would return our own value.
 *
 * @param {Document} [doc]
 * @param {Location} [loc]
 * @returns {string} A locale tag, or '' when nothing declares one.
 */
function readObservedLocale(doc, loc) {
  doc = doc || (typeof document !== 'undefined' ? document : null);
  loc = loc || (typeof location !== 'undefined' ? location : null);

  const fromQuery = loc && /[?&]locale=([A-Za-z-]+)/.exec(loc.search || '');
  if (fromQuery) return fromQuery[1];

  const fromPath = loc && /^\/([a-z]{2}(?:-[A-Za-z]{2,4})?)\//.exec(loc.pathname || '');
  if (fromPath && fromPath[1] !== 'co') return fromPath[1];

  const lang = doc?.documentElement?.getAttribute('lang');
  return lang ? lang.trim() : '';
}

/**
 * Hold the page's own locale as state, and re-resolve the policy when either
 * half of the pair changes.
 *
 * The baseline has to be captured at construction, before anything of ours
 * runs: `updateLangClass()` rewrites <html lang> to the SkillBridge target, so
 * a later read of that attribute returns our own value and every page would
 * classify as "already in the target language". Academy puts the locale in the
 * first path segment for every non-English locale (`/es/courses/...`), so a
 * client-side navigation can be re-read from the URL alone; English carries no
 * prefix, and there the captured baseline is what survives.
 *
 * `localizedHost` is the host-capability flag. Off — Skilljar, claude.com
 * tutorials — the page is English by construction and the policy is FULL, so
 * this adds no behaviour to hosts that never had a locale to respect.
 *
 * @param {object} opts
 * @param {boolean} opts.localizedHost  True only for hosts that ship official locales.
 * @param {Document} [opts.doc]
 * @param {Location} [opts.loc]
 * @param {(state: {policy: string, reason: string, observedLocale: string, targetLang: string}) => void} [opts.onChange]
 */
/**
 * The locale labels Academy's own language selector shows.
 *
 * Each label is written in its own language, which is what makes reading the
 * control possible without knowing the site's internals.
 */
const ACADEMY_LOCALE_LABELS = Object.freeze({
  English: 'en',
  Español: 'es',
  Français: 'fr',
  日本語: 'ja',
  한국어: 'ko',
  简体中文: 'zh-CN',
  繁體中文: 'zh-TW',
});

/**
 * Read the locale from the site's own language control.
 *
 * This is the authoritative signal, and it is the one the observation runs
 * used: <html lang> alone is not enough, because an unprefixed URL can still
 * render Korean for a learner whose account is set that way. Requiring the
 * selector to AGREE with <html lang> is what makes a half-hydrated page report
 * nothing instead of reporting English.
 *
 * Three outcomes, and they are not interchangeable:
 *
 *   agreed   the control and <html lang> name the same language — authoritative
 *   conflict the control has rendered and they DISAGREE — the page is
 *            mid-hydration, which is positive evidence that no other signal is
 *            trustworthy either, so the caller must not fall back to one
 *   absent   no control yet — genuinely no evidence, fall back
 *
 * @returns {{state: string, locale: string}}
 */
function readSelectorState(doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) return { state: 'absent', locale: '' };
  const clean = (el) =>
    String((el && el.textContent) || '')
      .replace(/[\uE000-\uF8FF]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  const labels = Object.keys(ACADEMY_LOCALE_LABELS);
  const control = Array.from(d.querySelectorAll('button, [role="button"]')).find((el) => labels.includes(clean(el)));
  const selected = control ? ACADEMY_LOCALE_LABELS[clean(control)] : '';
  if (!selected) return { state: 'absent', locale: '' };
  const htmlLang = String(d.documentElement?.getAttribute('lang') || '').trim();
  // Compare on the base subtag: the selector says zh-CN where <html lang> may
  // say zh-Hans, and disagreeing on region is not disagreeing on language.
  const base = (v) => v.split('-')[0].toLowerCase();
  if (!htmlLang || base(htmlLang) !== base(selected)) return { state: 'conflict', locale: '' };
  return { state: 'agreed', locale: selected };
}

/** The confirmed locale, or '' when the control is absent or mid-hydration. */
function readSelectorLocale(doc) {
  return readSelectorState(doc).locale;
}

/**
 * Combine the control with the fallbacks, in evidence order.
 *
 * A conflict short-circuits: falling back to <html lang> there would read the
 * half of the page that has not caught up and report it as settled.
 */
function resolveObserved(doc, loc) {
  const selector = readSelectorState(doc);
  if (selector.state === 'agreed') return selector.locale;
  if (selector.state === 'conflict') return '';
  return readObservedLocale(doc, loc) || '';
}

function createLocalizationPolicy({ localizedHost, doc, loc, onChange } = {}) {
  // 'en' rather than a read on non-localized hosts: Skilljar's <html lang> is
  // English anyway, but pinning it means a future host that mislabels itself
  // cannot accidentally block translation everywhere.
  let pendingLoc = null;
  // The selector is authoritative where it has rendered; the URL and <html
  // lang> are the fallback for first paint.
  let observed = localizedHost ? resolveObserved(doc, loc) : 'en';
  let target = 'en';
  let resolved = resolveTranslationPolicy({ observedLocale: observed, targetLang: target });

  function reresolve() {
    const next = resolveTranslationPolicy({ observedLocale: observed, targetLang: target });
    const changed = next.policy !== resolved.policy;
    resolved = next;
    if (changed && typeof onChange === 'function') {
      onChange({ ...resolved, observedLocale: observed, targetLang: target });
    }
    return resolved;
  }

  return {
    /** The locale the page itself is published in — never the SkillBridge target. */
    observedLocale: () => observed,
    /** The resolved policy object, for logging and tests. */
    resolved: () => resolved,
    /** True when anything at all may be sent for translation. */
    mayTranslate: () => resolved.mayTranslate,
    /**
     * True when one text run may be sent.
     *
     * Under RESIDUE_ONLY this is the guard that makes the policy real: only
     * text that still reads as English may go, and `looksEnglish` is the
     * caller's own script check — trustworthy in this branch precisely because
     * the policy only reaches it for non-Latin targets.
     */
    mayTranslateText: (looksEnglish) => mayTranslateText(resolved, looksEnglish),

    /** The learner picked a language. */
    setTarget(nextTarget) {
      target = String(nextTarget || '').trim();
      return reresolve();
    },

    /**
     * A client-side navigation happened. The new DOM is not here yet.
     *
     * The locale goes UNRESOLVED rather than being carried over or guessed at
     * from the URL. Carrying it over is a real bug: leaving /ko/courses/… for
     * /courses/… by switching the site to English kept the stale `ko` and
     * blocked translation on an English page. Guessing from the absent prefix
     * is equally wrong in the other direction, because an unprefixed URL still
     * renders Korean for an account set that way.
     *
     * Unresolved means fail-closed until the DOM can answer — the same shape
     * as the assessment lifecycle, and for the same reason: the previous
     * page's evidence does not describe the next page.
     */
    onRouteChange(nextLoc) {
      if (!localizedHost) return resolved;
      pendingLoc = nextLoc || null;
      observed = '';
      return reresolve();
    },

    /**
     * The DOM for the current route has settled. Authoritative.
     *
     * Prefers the site's own language control, which is the signal the
     * observation runs treated as evidence. Falls back to the URL only when
     * the control has not rendered, and stays unresolved when neither speaks.
     */
    onDomSettled(nextDoc, nextLoc) {
      if (!localizedHost) return resolved;
      const d = nextDoc || doc;
      const l = nextLoc || pendingLoc || loc;
      observed = resolveObserved(d, l);
      pendingLoc = null;
      return reresolve();
    },
  };
}

if (typeof window !== 'undefined') {
  window._sbAcademyLocalization = {
    createLocalizationPolicy,
    ACADEMY_LOCALE_LABELS,
    readSelectorLocale,
    readSelectorState,
    TRANSLATION_POLICY,
    resolveTranslationPolicy,
    mayTranslateText,
    readObservedLocale,
  };
}

if (typeof globalThis !== 'undefined' && typeof globalThis.module !== 'undefined') {
  globalThis.module.exports = {
    TRANSLATION_POLICY,
    NON_LATIN_TARGETS,
    createLocalizationPolicy,
    resolveTranslationPolicy,
    mayTranslateText,
    readObservedLocale,
  };
}
