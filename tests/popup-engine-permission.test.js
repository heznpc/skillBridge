/**
 * @jest-environment jsdom
 */

/* global describe, test, expect, beforeEach, afterEach, jest */

const fs = require('fs');
const path = require('path');
const { readProductionSource } = require('./helpers/production-source');

const ROOT = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
const popupSource = readProductionSource('src', 'popup', 'popup.js');
const popupDocument = new DOMParser().parseFromString(read('src', 'popup', 'popup.html'), 'text/html');
const constants = new Function(
  `${read('src', 'shared', 'runtime-constants.js')}
   ${read('src', 'lib', 'selectors.js')}
   ${read('src', 'lib', 'constants.js')}
   return {
     SKILLBRIDGE_MODEL_LABELS, POPUP_LABELS, MENU_LABELS, COMMENT_TRANSLATE_LABELS,
     ENGINE_LABELS, REFINE_LABELS, PREMIUM_LANGUAGES, PREMIUM_LANGUAGE_CODES,
     AVAILABLE_LANGUAGES
   };`,
)();

function createChrome(initial = {}) {
  const store = { targetLanguage: 'en', autoTranslate: false, ...initial };
  const get = jest.fn((keys, callback) => {
    const names = Array.isArray(keys) ? keys : [keys];
    const result = Object.fromEntries(names.filter((key) => key in store).map((key) => [key, store[key]]));
    if (callback) {
      callback(result);
      return undefined;
    }
    return Promise.resolve(result);
  });
  const set = jest.fn((values, callback) => {
    Object.assign(store, values);
    callback?.();
    return Promise.resolve();
  });
  return {
    chrome: {
      tabs: {
        query: jest.fn().mockResolvedValue([{ id: 7, url: 'https://anthropic.skilljar.com/lesson' }]),
        sendMessage: jest.fn((_tabId, _message, callback) => callback?.({ ready: true })),
      },
      runtime: {
        lastError: null,
        sendMessage: jest.fn().mockResolvedValue({ status: 'ok' }),
      },
      storage: { local: { get, set } },
      permissions: { request: jest.fn().mockResolvedValue(false) },
    },
    store,
  };
}

async function settlePopup() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

function loadPopup(chrome) {
  document.body.innerHTML = popupDocument.body.innerHTML;
  const names = ['chrome', ...Object.keys(constants)];
  const values = [chrome, ...Object.values(constants)];
  new Function(...names, popupSource)(...values);
  document.dispatchEvent(new document.defaultView.Event('DOMContentLoaded'));
}

describe('popup local-engine permission denial', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, '__SKILLBRIDGE_AI_GATEWAY_ENABLED__', {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    delete globalThis.__SKILLBRIDGE_AI_GATEWAY_ENABLED__;
    document.body.innerHTML = '';
  });

  test.each([
    ['cloud', 'cloud'],
    ['off', 'off'],
  ])('reverts to the previous %s engine and never probes localhost', async (initialEngine, expectedEngine) => {
    const { chrome, store } = createChrome({ sb_ai_engine: initialEngine });
    loadPopup(chrome);
    await settlePopup();

    const engine = document.getElementById('engine-select');
    expect(engine.value).toBe(initialEngine);
    engine.value = 'local';
    engine.dispatchEvent(new document.defaultView.Event('change'));
    await settlePopup();

    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['http://localhost/*', 'http://127.0.0.1/*'],
    });
    expect(engine.value).toBe(expectedEngine);
    expect(store.sb_ai_engine).toBe(expectedEngine);
    expect(document.getElementById('local-config').style.display).toBe('none');
    expect(document.getElementById('local-status').textContent).toBe('');
    expect(document.getElementById('status').textContent).toBe(constants.ENGINE_LABELS.permDenied.en);
    expect(document.getElementById('status').className).toBe('status error');
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});
