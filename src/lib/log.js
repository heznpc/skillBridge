// Thin structured logger for SkillBridge content + background scripts.
//
// Why: 57+ ad-hoc `console.log/warn/error` calls are scattered across
// src/content/* and src/lib/*. They make user bug reports hard to triage
// because lines don't carry a module name and severity is mixed
// (warn-as-log, log-as-warn). This wrapper standardizes the prefix and
// severity routing without forcing a bulk refactor — there's no remote
// sink by standing decision (no server-side infrastructure).
//
// Prefix format is `[SkillBridge ModuleName]` to match the existing
// hand-rolled convention in src/content/* (chat-flashcards, sidebar-chat,
// keyboard-shortcuts, etc.) so log lines from new and old call sites read
// uniformly in DevTools.
//
// Note: `src/lib/page-bridge.js` is intentionally NOT a consumer of this
// module. It runs in the host page's main world (not the extension
// context), where neither `window._skillbridgeLog` nor a `require()` of
// this file would resolve.
//
// Usage:
//   const log = createLogger('Translator');
//   log.info('cache hit', { lang, key });
//   log.warn('GT 429, backing off');
//   log.error('escapeHtml missing', err);
//
// In production builds, `info` is silenced by default; `warn` / `error`
// always print. Set `chrome.storage.local.skillbridgeLogLevel = 'debug'`
// to enable everything — changes take effect immediately via
// storage.onChanged (no reload needed).

(function () {
  'use strict';

  const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
  const VALID_LEVELS = ['debug', 'info', 'warn', 'error'];
  let _threshold = LEVELS.warn;

  function _applyLevel(v) {
    if (v && Object.hasOwn(LEVELS, v)) _threshold = LEVELS[v];
  }

  try {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local?.get) {
      chrome.storage.local.get(['skillbridgeLogLevel'], (res) => _applyLevel(res?.skillbridgeLogLevel));
      // Live-update when the popup (or any other surface) flips the level
      // — without this, a verbose-mode toggle only takes effect on next
      // page load, which makes triage-during-repro flaky.
      chrome.storage.onChanged?.addListener?.((changes, area) => {
        if (area === 'local' && changes.skillbridgeLogLevel) {
          _applyLevel(changes.skillbridgeLogLevel.newValue);
        }
      });
    }
  } catch {
    // Not in extension context (e.g. unit test). Keep default.
  }

  function _emit(level, module, args) {
    if (LEVELS[level] < _threshold) return;
    const prefix = `[SkillBridge ${module}]`;
    // Route to the matching console method so DevTools severity filter
    // works. `console.debug` shows only when "Verbose" is enabled.
    const fn = console[level] || console.log;
    fn.call(console, prefix, ...args);
  }

  function createLogger(module) {
    if (!module || typeof module !== 'string') {
      throw new TypeError('createLogger requires a non-empty module name');
    }
    // Narrowing dispatch: build the 4-method API by iterating VALID_LEVELS
    // instead of hand-listing each call to `_emit('debug', ...)`. A typo
    // in the level name now fails at module load via the LEVELS lookup,
    // not silently at the first log call.
    const api = {};
    for (const level of VALID_LEVELS) {
      api[level] = (...a) => _emit(level, module, a);
    }
    return api;
  }

  if (typeof window !== 'undefined') {
    window._skillbridgeLog = { createLogger, LEVELS };
  }
  // eslint-disable-next-line no-undef
  if (typeof module !== 'undefined' && module.exports) {
    // eslint-disable-next-line no-undef
    module.exports = { createLogger, LEVELS };
  }
})();
