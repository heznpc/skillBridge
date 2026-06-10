/**
 * SkillBridge — Shadow stylesheet loader
 *
 * Loads content.css, rewrites its host-page (ancestor) theme selectors into
 * :host(...) form, and adopts the result into a shadow root. Standalone module
 * loaded before sidebar-chat.js (which owns the shadow UI root).
 *
 * Why a transform: content.css themes via ancestor selectors
 *   html.si18n-dark X / body:is(.si18n-lang-ar,.si18n-lang-he) X /
 *   body.si18n-lang-XX X
 * Inside a shadow root those ancestors are out of reach, so they're rewritten
 * to :host(...) and the shadow host carries the mirrored state classes (see
 * sidebar-chat.js `syncHostThemeClasses`). CSS custom properties (--si18n-*)
 * inherit through the boundary, so var() references need no rewrite.
 *
 * Exposes: window._sbShadowCss = { transformForShadow, loadShadowSheet,
 *                                  ensureShadowStylesheet }
 */

(function () {
  'use strict';

  /**
   * Rewrite content.css ancestor theme selectors into :host(...) form.
   * Pure + side-effect free so it can be unit-tested without a browser.
   * The negative lookaheads keep `html.si18n-dark` from matching inside a
   * longer token (there is none today, but it guards future class names).
   * @param {string} css
   * @returns {string}
   */
  function transformForShadow(css) {
    if (typeof css !== 'string') return '';
    return css
      .replace(/html\.si18n-dark(?![\w-])/g, ':host(.si18n-dark)')
      .replace(/body:is\(\.si18n-lang-ar,\s*\.si18n-lang-he\)/g, ':host(:is(.si18n-lang-ar, .si18n-lang-he))')
      .replace(/body\.si18n-lang-([A-Za-z]+(?:-[A-Za-z]+)*)/g, ':host(.si18n-lang-$1)')
      .replace(/body\.si18n-rtl(?![\w-])/g, ':host(.si18n-rtl)');
  }

  let _sheetPromise = null;

  /**
   * Fetch + transform content.css once and return a shared CSSStyleSheet.
   * Cached so every shadow root adopts the same constructed sheet.
   * @returns {Promise<CSSStyleSheet|null>}
   */
  function loadShadowSheet() {
    if (_sheetPromise) return _sheetPromise;
    // Resolve the stylesheet path from the manifest so this works in both the
    // unbundled dev build (src/content/content.css) and the production bundle
    // (content.bundle.css). The file must be web-accessible (see manifest /
    // build-bundle.js).
    const m = chrome.runtime.getManifest();
    const cssPath = m.content_scripts?.[0]?.css?.[0] || 'src/content/content.css';
    _sheetPromise = fetch(chrome.runtime.getURL(cssPath))
      .then((r) => r.text())
      .then((css) => {
        const sheet = new window.CSSStyleSheet();
        sheet.replaceSync(transformForShadow(css));
        return sheet;
      })
      .catch((err) => {
        // Non-fatal — but reset the cache so the next ensureShadowStylesheet
        // call retries instead of pinning the failure for the page's lifetime.
        // (The fetch targets a local chrome-extension:// resource, so failures
        // are edge cases like an invalidated extension context.)
        _sheetPromise = null;
        console.warn('[SkillBridge] shadow stylesheet load failed:', err && err.message);
        return null;
      });
    return _sheetPromise;
  }

  /**
   * Adopt the shared transformed sheet into a shadow root. Idempotent.
   * @param {ShadowRoot} root
   */
  function ensureShadowStylesheet(root) {
    if (!root) return;
    loadShadowSheet().then((sheet) => {
      if (sheet && !root.adoptedStyleSheets.includes(sheet)) {
        root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      }
    });
  }

  window._sbShadowCss = { transformForShadow, loadShadowSheet, ensureShadowStylesheet };
})();
