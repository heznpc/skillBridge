// Smoke + contract tests for src/lib/log.js.
//
// Why these tests exist: the original PR shipped log.js but never wired
// it into manifest.content_scripts.js, so the module was dead code and
// the chrome.storage.onChanged listener could never fire. The
// second-pass audit added log.js to the manifest and added these tests
// so the next regression of that shape gets caught at jest time, not
// "discovered by a contributor following CONTRIBUTING.md".

const fs = require('fs');
const path = require('path');

// Load log.js the same way the test harness loads other content scripts
// — `new Function('window', src)` so the file's `window._skillbridgeLog`
// branch runs and the CommonJS branch is left alone. We do this twice
// per test (fresh `fakeWindow`) to keep tests independent.
function loadLog(fakeWindow = {}, fakeChrome = undefined) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'log.js'), 'utf8');
  new Function('window', 'chrome', `"use strict";\n${src}`)(fakeWindow, fakeChrome);
  return fakeWindow._skillbridgeLog;
}

describe('log.js — module surface', () => {
  test('exposes window._skillbridgeLog with createLogger + LEVELS', () => {
    const win = {};
    loadLog(win);
    expect(win._skillbridgeLog).toBeDefined();
    expect(typeof win._skillbridgeLog.createLogger).toBe('function');
    expect(win._skillbridgeLog.LEVELS).toEqual({
      debug: 10,
      info: 20,
      warn: 30,
      error: 40,
      silent: 99,
    });
  });

  test('exposes the same shape via CommonJS module.exports (for tests)', () => {
    const mod = require('../src/lib/log.js');
    expect(typeof mod.createLogger).toBe('function');
    expect(mod.LEVELS.warn).toBe(30);
  });
});

describe('createLogger', () => {
  let logSpy, warnSpy, errorSpy, debugSpy, infoSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    debugSpy.mockRestore();
    infoSpy.mockRestore();
  });

  test('rejects empty / non-string module name (TypeError)', () => {
    const { createLogger } = loadLog();
    expect(() => createLogger('')).toThrow(TypeError);
    expect(() => createLogger(null)).toThrow(TypeError);
    expect(() => createLogger(123)).toThrow(TypeError);
  });

  test('builds the full 4-method API from VALID_LEVELS', () => {
    const { createLogger } = loadLog();
    const log = createLogger('Test');
    expect(typeof log.debug).toBe('function');
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
  });

  test('prefix uses [SkillBridge ModuleName] (matches existing content/* convention)', () => {
    const { createLogger } = loadLog();
    const log = createLogger('Translator');
    log.warn('boom');
    expect(warnSpy).toHaveBeenCalledWith('[SkillBridge Translator]', 'boom');
  });

  test('default threshold silences debug + info, prints warn + error', () => {
    const { createLogger } = loadLog();
    const log = createLogger('M');
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  test('routes by severity to matching console method (DevTools filter)', () => {
    const { createLogger } = loadLog();
    const log = createLogger('M');
    log.warn('w');
    log.error('e');
    expect(warnSpy).toHaveBeenCalledWith('[SkillBridge M]', 'w');
    expect(errorSpy).toHaveBeenCalledWith('[SkillBridge M]', 'e');
    // warn should not have called error and vice versa
    expect(warnSpy.mock.calls.every((c) => c[1] !== 'e')).toBe(true);
  });

  test('passes through multiple args without flattening', () => {
    const { createLogger } = loadLog();
    const log = createLogger('M');
    const err = new Error('x');
    const ctx = { lang: 'ko', cacheKey: 'k' };
    log.error('boom', err, ctx);
    expect(errorSpy).toHaveBeenCalledWith('[SkillBridge M]', 'boom', err, ctx);
  });
});

describe('chrome.storage integration', () => {
  test('registers an onChanged listener when chrome.storage is present', () => {
    const addListener = jest.fn();
    const fakeChrome = {
      storage: {
        local: { get: (_keys, cb) => cb({}) },
        onChanged: { addListener },
      },
    };
    loadLog({}, fakeChrome);
    expect(addListener).toHaveBeenCalledTimes(1);
  });

  test('applies skillbridgeLogLevel from storage.local at startup', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    try {
      const fakeChrome = {
        storage: {
          local: { get: (_keys, cb) => cb({ skillbridgeLogLevel: 'debug' }) },
          onChanged: { addListener: () => {} },
        },
      };
      const win = {};
      loadLog(win, fakeChrome);
      const log = win._skillbridgeLog.createLogger('M');
      log.debug('now visible');
      expect(debugSpy).toHaveBeenCalledWith('[SkillBridge M]', 'now visible');
    } finally {
      warnSpy.mockRestore();
      debugSpy.mockRestore();
    }
  });

  test('ignores an unknown level in storage (keeps default warn threshold)', () => {
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    try {
      const fakeChrome = {
        storage: {
          local: { get: (_keys, cb) => cb({ skillbridgeLogLevel: 'verbose-typo' }) },
          onChanged: { addListener: () => {} },
        },
      };
      const win = {};
      loadLog(win, fakeChrome);
      const log = win._skillbridgeLog.createLogger('M');
      log.debug('should not print');
      expect(debugSpy).not.toHaveBeenCalled();
    } finally {
      debugSpy.mockRestore();
    }
  });

  test('does not throw in non-extension context (chrome undefined)', () => {
    expect(() => loadLog({}, undefined)).not.toThrow();
  });
});

describe('manifest wiring (regression guard for "dead code" foot-gun)', () => {
  // The original PR shipped log.js but forgot to add it to manifest's
  // content_scripts list, so it was never loaded into the page. This
  // test fails fast if a future commit drops it from the manifest.
  test('manifest.content_scripts[0].js includes src/lib/log.js', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
    const contentJs = manifest.content_scripts[0].js;
    expect(contentJs).toContain('src/lib/log.js');
    // It must load AFTER browser-polyfill (chrome shim) but BEFORE any
    // module that wants to call createLogger.
    const polyfillIdx = contentJs.indexOf('src/lib/browser-polyfill.js');
    const logIdx = contentJs.indexOf('src/lib/log.js');
    expect(logIdx).toBeGreaterThan(polyfillIdx);
  });
});
