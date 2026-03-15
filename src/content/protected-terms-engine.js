/**
 * SkillBridge — Protected Terms Engine
 * Builds and applies the protected-terms correction map.
 * Accesses shared state via window._sb namespace.
 */

(function () {
  'use strict';

  let _protectedTermsSorted = [];
  let _protectedTermsLang = null;
  let _protectedKeepEnglish = '';

  function buildProtectedTermsMap(targetLang) {
    if (_protectedTermsLang === targetLang) return;
    _protectedTermsLang = targetLang;

    const sb = window._sb;
    const map = {};
    const protectedEntries = sb.translator?.getProtectedTerms?.() || {};
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

  function restoreProtectedTerms(text) {
    if (_protectedTermsSorted.length === 0) return text;
    let result = text;
    for (const [wrong, correct] of _protectedTermsSorted) {
      if (result.includes(wrong)) result = result.replaceAll(wrong, correct);
    }
    return result;
  }

  function resetProtectedTermsLang() {
    _protectedTermsLang = null;
  }

  function getProtectedKeepEnglish() {
    return _protectedKeepEnglish;
  }

  // Expose on window._sb
  const sb = window._sb;
  sb.buildProtectedTermsMap = buildProtectedTermsMap;
  sb.restoreProtectedTerms = restoreProtectedTerms;
  sb.resetProtectedTermsLang = resetProtectedTermsLang;
  sb.getProtectedKeepEnglish = getProtectedKeepEnglish;
})();
