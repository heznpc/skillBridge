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
