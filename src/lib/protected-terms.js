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
    const protectedEntries = translator.getProtectedTerms?.() || {};
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
    // Defensive: callers occasionally pass `null` (e.g. when a Gemini stream
    // aborts mid-flight), and the previous implementation would throw
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
   * Return the keep-English string for Gemini prompts.
   * @returns {string}
   */
  function getKeepEnglishTerms() {
    return _protectedKeepEnglish;
  }

  // Expose as standalone global (loaded before content.js)
  window._protectedTerms = {
    buildProtectedTermsMap,
    restoreProtectedTerms,
    resetProtectedTerms,
    getKeepEnglishTerms,
  };
})();
