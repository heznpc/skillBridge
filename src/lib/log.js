// Thin structured logger for SkillBridge content + background scripts.
//
// Why: 57+ ad-hoc `console.log/warn/error` calls are scattered across
// src/content/* and src/lib/*. They make user bug reports hard to
// triage because lines don't carry a module name and severity is
// mixed (warn-as-log, log-as-warn). This wrapper standardizes the
// prefix and log level without forcing a bulk refactor of existing
// call sites — new code uses `createLogger`, old code keeps working.
//
// Constraints honored:
//   - No external dep (POSITIONING.md "No SkillBridge servers"; we
//     keep client-side bundle small).
//   - No remote sink (no Sentry, no telemetry endpoint — see
//     POSITIONING "Things we will not do"). Errors stay in DevTools.
//   - MV3-safe: pure functions, no global state besides the level
//     threshold read from chrome.storage when available.
//
// Usage:
//   const log = createLogger('Translator');
//   log.info('cache hit', { lang, key });
//   log.warn('GT 429, backing off');
//   log.error('escapeHtml missing', err);
//
// In production builds, `info` is silenced by default; `warn` / `error`
// always print. Set chrome.storage.local.skillbridgeLogLevel = 'debug'
// to enable everything (the popup may surface this toggle later).

(function () {
  'use strict';

  const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
  // Default production level — `warn` and above visible without opt-in.
  let _threshold = LEVELS.warn;

  // Best-effort runtime override. We don't `await` chrome.storage here;
  // the threshold updates asynchronously the first time storage resolves.
  try {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local?.get) {
      chrome.storage.local.get(['skillbridgeLogLevel'], (res) => {
        const v = res?.skillbridgeLogLevel;
        if (v && Object.prototype.hasOwnProperty.call(LEVELS, v)) {
          _threshold = LEVELS[v];
        }
      });
    }
  } catch {
    // Not in extension context (e.g. unit test). Keep default.
  }

  function _emit(level, module, args) {
    if (LEVELS[level] < _threshold) return;
    const prefix = `[SkillBridge:${module}]`;
    // Route to the matching console method so DevTools severity filter
    // works. `console.debug` shows only when "Verbose" is enabled.
    const fn = console[level] || console.log;
    fn.call(console, prefix, ...args);
  }

  function createLogger(module) {
    if (!module || typeof module !== 'string') {
      throw new TypeError('createLogger requires a non-empty module name');
    }
    return {
      debug: (...a) => _emit('debug', module, a),
      info: (...a) => _emit('info', module, a),
      warn: (...a) => _emit('warn', module, a),
      error: (...a) => _emit('error', module, a),
    };
  }

  // Expose for both content-script (window) and CommonJS (tests) contexts.
  if (typeof window !== 'undefined') {
    window._skillbridgeLog = { createLogger, LEVELS };
  }
  // CommonJS export for unit tests. `module` is undefined in content-script
  // context, so this is gated behind a typeof check.
  // eslint-disable-next-line no-undef
  if (typeof module !== 'undefined' && module.exports) {
    // eslint-disable-next-line no-undef
    module.exports = { createLogger, LEVELS };
  }
})();
