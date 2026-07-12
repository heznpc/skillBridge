/**
 * SkillBridge — content-script UI surface helpers.
 *
 * Loaded before content.js. This file deliberately does not read window._sb:
 * content.js owns that namespace and passes it in after construction.
 */

(function () {
  'use strict';

  const CERTIFICATION_SURFACE_SELECTORS = [
    '#si18n-header-lang',
    '#si18n-dark-toggle',
    '#si18n-welcome-banner',
    '#si18n-term-preview',
    '#si18n-exam-banner',
    '#si18n-reading-bar',
    '.si18n-ask-tutor-btn',
  ];

  const NON_AI_CONTENT_SURFACE_SELECTORS = [
    ...CERTIFICATION_SURFACE_SELECTORS,
    '#si18n-toc-toggle',
    '#si18n-toc-panel',
  ];

  function removeUiHost(doc, sb) {
    doc.getElementById('skillbridge-root')?.remove();
    if (sb) sb._uiHost = null;
  }

  function removeSelectors(doc, selectors) {
    for (const selector of selectors) {
      doc.querySelectorAll(selector).forEach((element) => element.remove());
    }
  }

  function removeContentSurfaces(doc, sb, selectors) {
    removeUiHost(doc, sb);
    removeSelectors(doc, selectors);
  }

  window._sbContentSurface = {
    CERTIFICATION_SURFACE_SELECTORS,
    NON_AI_CONTENT_SURFACE_SELECTORS,
    removeContentSurfaces,
  };
})();
