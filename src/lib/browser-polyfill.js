/**
 * SkillBridge — Lightweight Browser API Compatibility Layer
 *
 * Ensures `chrome.*` APIs work across Chrome, Firefox, and Edge.
 *
 * Background:
 * - Chrome uses the `chrome.*` namespace (callback-based, with Promise support in MV3)
 * - Firefox MV3 supports `chrome.*` as a compatibility alias for `browser.*`
 * - Edge (Chromium-based) uses `chrome.*` natively
 *
 * This shim handles the edge case where `chrome` is not defined but `browser` is
 * (older Firefox versions or certain contexts). It does NOT attempt to polyfill
 * Promise-based wrappers -- the extension already uses `chrome.*` with both
 * callbacks and Promises in a way that works across all MV3 browsers.
 */

(function () {
  'use strict';

  // If chrome is already defined (Chrome, Edge, modern Firefox), nothing to do.
  if (typeof globalThis.chrome !== 'undefined' && globalThis.chrome.runtime) {
    return;
  }

  // Firefox exposes `browser.*` -- alias it to `chrome` for compatibility.
  if (typeof globalThis.browser !== 'undefined' && globalThis.browser.runtime) {
    globalThis.chrome = globalThis.browser;
  }
})();
