/**
 * SkillBridge — Protected Terms
 * Builds a mapping of commonly mistranslated terms and restores them
 * after Google Translate mangles brand names / technical terms.
 *
 * Standalone module — loaded BEFORE content.js.
 * Exposes: window._protectedTerms = { buildProtectedTermsMap, restoreProtectedTerms }
 */

(function () {
  'use strict';

  let _protectedTermsSorted = [];
  let _protectedTermsLang = null;
  let _protectedKeepEnglish = '';
  let _selfDupRe = null;
  let _maskTermsSorted = [];

  // Placeholder used to hide protected terms from Google Translate. Verified
  // 2026-08-19 against the live `translate_a/single` endpoint across all 12
  // curated locales, including multi-token sentences in SOV languages that
  // reorder clauses: the token survives byte-identical and its index stays
  // addressable, so restoration maps by index rather than by position.
  const MASK_OPEN = '\u27E6';
  const MASK_CLOSE = '\u27E7';
  const MASK_TOKEN_RE = /\u27E6(\d+)\u27E7/g;
  const maskToken = (i) => `${MASK_OPEN}${i}${MASK_CLOSE}`;

  const CORE_PROTECTED_TERMS = Object.freeze({
    Claude: [],
    Anthropic: [],
    API: [],
    SDK: [],
  });

  /**
   * Build the map of wrong->correct term replacements for the given language.
   * No-ops if the map is already built for the same language.
   * @param {string} targetLang — ISO 639-1
   * @param {SkilljarTranslator} translator — needs .getProtectedTerms()
   * @returns {void}
   */
  function buildProtectedTermsMap(targetLang, translator) {
    if (_protectedTermsLang === targetLang) return;
    _protectedTermsLang = targetLang;

    const map = {};
    const protectedEntries = { ...CORE_PROTECTED_TERMS, ...(translator.getProtectedTerms?.() || {}) };
    for (const [correct, wrongForms] of Object.entries(protectedEntries)) {
      if (!Array.isArray(wrongForms)) continue;
      for (const wrong of wrongForms) {
        // Skip nullish/empty/non-string forms — `String.prototype.replaceAll`
        // on an empty needle inserts the correct form between every char,
        // which silently corrupts every translation. The glossary checker
        // also flags these, but defending here keeps a stale dictionary
        // from blowing up in production.
        if (typeof wrong !== 'string' || wrong.length === 0) continue;
        // Self-mapping (correct → correct) is a no-op; skip to avoid
        // wasted iterations on long pages.
        if (wrong === correct) continue;
        // A wrong-form that is a SUBSTRING of its own correct term would corrupt
        // the correct term on restore (e.g. wrong "subagen" inside correct
        // "subagent" → "subagentt"). Longest-first sort can't save a true prefix,
        // so drop these entirely. (check-glossary also rejects them at build.)
        if (correct.includes(wrong)) continue;
        map[wrong] = correct;
      }
    }
    // Sort longest-first AND precompile a per-wrong-form matcher whose boundary
    // rule depends on script (see the branch below): Latin/Cyrillic use a Unicode
    // letter boundary so a form never matches inside a longer word ("Claudio" in
    // "Claudios"); CJK/Kana/Hangul instead guard against a foreign-name interpunct
    // so a person name like Claude Monet keeps its rendering. Falls back to plain
    // replaceAll only if a form can't compile into a valid regex.
    _protectedTermsSorted = Object.entries(map)
      .sort((a, b) => b[0].length - a[0].length)
      .map(([wrong, correct]) => {
        let re;
        const isCJK = /[぀-ヿ㐀-鿿가-힯豈-﫿ｦ-ￜ]/.test(wrong);
        const escaped = wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        try {
          // CJK/Kana/Hangul: NO letter boundary (would block 클로드는 → Claude는);
          // instead guard against a foreign-name interpunct (·/・/･/‧) on either
          // side, so "克洛德·莫奈" / "クロード・モネ" (Claude Monet) keep the person name
          // while standalone product "克洛德" still restores. Space-separated names
          // (ko/ru) are not covered. Latin/Cyrillic/… use a Unicode letter boundary.
          re = isCJK
            ? new RegExp('(?<![\\u00B7\\u30FB\\uFF65\\u2027])' + escaped + '(?![\\u00B7\\u30FB\\uFF65\\u2027])', 'gu')
            : new RegExp('(?<!\\p{L})' + escaped + '(?!\\p{L})', 'gu');
        } catch (_e) {
          re = null; // invalid form → fall back to literal replaceAll below
        }
        return { wrong, correct, re };
      });
    const terms = Object.keys(protectedEntries);
    _protectedKeepEnglish = terms.length > 0 ? terms.join(', ') : DEFAULT_PROTECTED_TERMS;

    // Precompile a regex that collapses Google-Translate gloss self-duplicates.
    // GT often appends the English term in parens when translating a proper
    // noun ("Claude" → "클로드(Claude)"); restoring the transliteration then
    // yields "Claude(Claude)". Match a canonical term immediately followed by
    // "(same term)" via a backreference, so ONLY an exact self-duplication
    // collapses — never legitimate prose or code like `fn(fn)` (fn isn't a
    // canonical term). Longest-first so "Claude Code" wins over "Claude".
    const canonical = terms
      .filter((t) => typeof t === 'string' && t.length > 0)
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .sort((a, b) => b.length - a.length);
    _selfDupRe = canonical.length ? new RegExp('(' + canonical.join('|') + ')\\s*[(（]\\s*\\1\\s*[)）]', 'g') : null;

    // Masking table for the pre-send chokepoint (see maskProtectedTerms).
    // Longest-first so "Anthropic Academy" masks as one unit before the bare
    // "Anthropic" can claim its first word. Letter-boundary anchored for the
    // same reason restore is: "API" must not match inside "APIs", and "Claude"
    // must not match inside "Claudio".
    _maskTermsSorted = terms
      .filter((t) => typeof t === 'string' && t.length > 0)
      .sort((a, b) => b.length - a.length)
      .map((term) => {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let re;
        try {
          re = new RegExp('(?<!\\p{L})' + escaped + '(?!\\p{L})', 'gu');
        } catch (_e) {
          re = null;
        }
        return { term, re };
      })
      .filter((t) => t.re);
  }

  /**
   * Hide protected terms behind index placeholders before text is handed to
   * Google Translate.
   *
   * This is the structural fix for brand-name loss. GT reads "Anthropic" as the
   * adjective (anthropic/anthropology) and renders it as 인류학적 / 人類 /
   * antrópico / Антропный in every curated locale, and no post-hoc wrong-form
   * blocklist covers that reliably: GT's output varies between runs, and the
   * wrong forms collide with legitimate vocabulary in the target language
   * ("인류" is an ordinary Korean word) — which is exactly why the blocklist
   * entries had to be removed in #172. Masking removes the term from GT's view
   * entirely, so there is nothing to mistranslate and nothing to repair.
   *
   * @param {string|null|undefined} text
   * @returns {{ text: string, tokens: string[] }} masked text + ordered originals
   */
  /** Count occurrences of a single character. */
  function _countChar(text, ch) {
    let n = 0;
    for (let i = 0; i < text.length; i += 1) if (text[i] === ch) n += 1;
    return n;
  }

  function maskProtectedTerms(text) {
    if (typeof text !== 'string' || !text || _maskTermsSorted.length === 0) {
      return { text: typeof text === 'string' ? text : '', tokens: [], foreign: { open: 0, close: 0 } };
    }
    const tokens = [];
    let result = text;
    for (const { term, re } of _maskTermsSorted) {
      if (!result.includes(term)) continue;
      result = result.replace(re, () => {
        tokens.push(term);
        return maskToken(tokens.length - 1);
      });
    }
    // Delimiters the SOURCE already contained. Without this the integrity check
    // below cannot tell "our placeholder leaked" from "the lesson legitimately
    // uses ⟦ ⟧" (denotational-semantics notation shows up in ML material), and
    // every such block failed closed forever — silently untranslatable.
    return {
      text: result,
      tokens,
      foreign: { open: _countChar(text, MASK_OPEN), close: _countChar(text, MASK_CLOSE) },
    };
  }

  /**
   * Put masked terms back after Google Translate returns.
   *
   * Fails CLOSED: if a placeholder was dropped or mangled in transit the caller
   * is told the round trip is unusable, rather than being handed text with a
   * visible placeholder or a silently missing brand name. Callers then keep the
   * untranslated source, which is a strictly better failure than shipping a
   * corrupted brand.
   *
   * @param {string|null|undefined} text — translated text containing placeholders
   * @param {{tokens: string[], foreign?: {open: number, close: number}}} mask
   *   — the object returned by maskProtectedTerms
   * @returns {string|null} restored text, or null if placeholder integrity broke
   */
  function unmaskProtectedTerms(text, mask) {
    const tokens = mask?.tokens;
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return typeof text === 'string' ? text : null;
    }
    if (typeof text !== 'string' || !text) return null;
    // Count occurrences per index, not just which indices appeared. Google
    // Translate sometimes emits a placeholder twice (it glosses proper nouns
    // that way), and a set-based check waves that through — silently printing
    // the brand name more often than the source did.
    const counts = new Map();
    let broken = false;
    const restored = text.replace(MASK_TOKEN_RE, (match, idx) => {
      const i = Number(idx);
      if (!Number.isInteger(i) || i < 0 || i >= tokens.length) {
        broken = true;
        return match;
      }
      counts.set(i, (counts.get(i) || 0) + 1);
      return tokens[i];
    });
    if (broken || counts.size !== tokens.length) return null;
    for (const n of counts.values()) if (n !== 1) return null;
    // Our own syntax must be fully consumed. Compare against the delimiters the
    // source already had rather than requiring zero, so a lesson that uses ⟦ ⟧
    // for its own notation stays translatable.
    const foreign = mask.foreign || { open: 0, close: 0 };
    if (_countChar(restored, MASK_OPEN) !== foreign.open) return null;
    if (_countChar(restored, MASK_CLOSE) !== foreign.close) return null;
    return restored;
  }

  /**
   * Fix mistranslated protected terms in the given text.
   *
   * Matching is script-aware (see buildProtectedTermsMap): Latin/Cyrillic forms
   * are Unicode letter-boundary-anchored so a form never corrupts a longer word
   * that merely CONTAINS it ("subagen" in "subagent"); CJK forms are guarded
   * against a foreign-name interpunct so a person name (Claude Monet, written with
   * a ·/・ separator) is preserved while the standalone product term restores.
   * What neither guard resolves is a wrong-form that is a legitimate STANDALONE
   * word/name in the target language (e.g. "Claudio" is both GT's mistranslation
   * of "Claude" AND a real Italian name, or a space-separated foreign name like
   * "클로드 모네") — those must be handled in the per-language `_protected` data.
   *
   * @param {string|null|undefined} text
   * @returns {string}
   */
  function restoreProtectedTerms(text) {
    // Defensive: callers occasionally pass `null` (e.g. when a translation
    // request aborts), and the previous implementation would throw
    // "Cannot read .includes of null" instead of returning a safe fallback.
    if (text == null) return '';
    if (typeof text !== 'string') return text;
    if (_protectedTermsSorted.length === 0) return text;
    let result = text;
    for (const { wrong, correct, re } of _protectedTermsSorted) {
      // Cheap pre-filter: the literal must be present for either matcher to fire.
      if (!result.includes(wrong)) continue;
      result = re ? result.replace(re, correct) : result.replaceAll(wrong, correct);
    }
    // Collapse "Claude(Claude)"-style GT gloss duplicates the restore above can
    // produce. Cheap paren guard keeps the common (no-paren) node off the regex.
    if (_selfDupRe && (result.indexOf('(') !== -1 || result.indexOf('（') !== -1)) {
      result = result.replace(_selfDupRe, '$1');
    }
    return result;
  }

  /**
   * Reset cached language so the map is rebuilt on next call.
   * @returns {void}
   */
  function resetProtectedTerms() {
    _protectedTermsLang = null;
  }

  /**
   * Return the locale's keep-English term list.
   * @returns {string}
   */
  function getKeepEnglishTerms() {
    return _protectedKeepEnglish;
  }

  /**
   * The protected-term inventory, longest-first — the same list masking uses.
   *
   * Exposed for MEASUREMENT (see isLikelyEnglish in gt-queue.js), which needs
   * to discount terms that stay English in every locale before judging whether
   * a block is English. Callers get the raw strings rather than the compiled
   * matchers on purpose: masking must be conservative, because a wrong
   * substitution corrupts text the user reads, while measurement can afford to
   * be liberal — over-removing only biases the answer toward "leave this block
   * alone", which is the safe direction on an already-localized page.
   *
   * @returns {string[]}
   */
  function getProtectedTermList() {
    return _maskTermsSorted.map(({ term }) => term);
  }

  // Expose as standalone global (loaded before content.js)
  window._protectedTerms = {
    buildProtectedTermsMap,
    restoreProtectedTerms,
    resetProtectedTerms,
    getKeepEnglishTerms,
    getProtectedTermList,
    maskProtectedTerms,
    unmaskProtectedTerms,
  };
})();
