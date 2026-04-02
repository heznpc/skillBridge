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
      if (Array.isArray(wrongForms)) {
        for (const wrong of wrongForms) map[wrong] = correct;
      }
    }
    _protectedTermsSorted = Object.entries(map).sort((a, b) => b[0].length - a[0].length);
    const terms = Object.keys(protectedEntries);
    _protectedKeepEnglish = terms.length > 0
      ? terms.join(', ')
      : DEFAULT_PROTECTED_TERMS;
  }

  /**
   * Fix mistranslated protected terms in the given text.
   * @param {string} text
   * @returns {string}
   */
  function restoreProtectedTerms(text) {
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
