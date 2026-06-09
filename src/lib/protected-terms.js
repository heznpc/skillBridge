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
        map[wrong] = correct;
      }
    }
    _protectedTermsSorted = Object.entries(map).sort((a, b) => b[0].length - a[0].length);
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
   * Known limitation — CJK substring corruption: a Hangul/Hanzi/Kana wrong-form
   * that happens to be a prefix of a legitimate longer word will still be
   * replaced (e.g. wrong-form "기술" ("skill") inside "기술자" ("technician")
   * yields "skill자"). The fix lives in the per-language dictionary itself:
   * add the longer compound as its own entry (mapping to its correct form)
   * and the longer-first sort below will match it before the shorter prefix.
   * See `src/data/<lang>.json` `_protected` section.
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
    for (const [wrong, correct] of _protectedTermsSorted) {
      if (result.includes(wrong)) result = result.replaceAll(wrong, correct);
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
