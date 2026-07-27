/**
 * Unit tests for translator.js bridge-readiness message handling.
 */

/* global describe, test, expect, beforeEach */

const fs = require('fs');
const path = require('path');

// ── Minimal browser mocks ──────────────────────────────────────
const messageListeners = [];
global.chrome = { runtime: { getURL: (p) => p } };
global.indexedDB = { open: () => ({ onupgradeneeded: null, onsuccess: null, onerror: null }) };
global.window = {
  addEventListener: (type, handler) => {
    if (type === 'message') messageListeners.push(handler);
  },
  removeEventListener: () => {},
  postMessage: () => {},
  location: { origin: 'https://test.skilljar.com' },
};
global.crypto = { randomUUID: () => `uuid-${Date.now()}-${Math.random()}` };

// Load source
const sharedSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'shared', 'runtime-constants.js'), 'utf8');
const selectorsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'selectors.js'), 'utf8');
const constantsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'constants.js'), 'utf8');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'translator.js'), 'utf8');

let SkilljarTranslator;
try {
  const combined = `(function() { ${sharedSrc}; ${selectorsSrc}; ${constantsSrc}; ${src}; return SkilljarTranslator; })()`;
  SkilljarTranslator = eval(combined);
} catch (_e) {
  eval(sharedSrc);
  eval(selectorsSrc);
  eval(constantsSrc);
  eval(src);
  SkilljarTranslator = global.SkilljarTranslator;
}

// ── Tests ──────────────────────────────────────────────────────

describe('nonce validation in _setupMessageListener', () => {
  let translator;

  beforeEach(() => {
    messageListeners.length = 0;
    translator = new SkilljarTranslator();
    translator._bridgeNonce = 'correct-nonce';
    translator._setupMessageListener();
  });

  test('accepts messages with correct nonce', () => {
    translator.isReady = false;
    const handler = messageListeners[messageListeners.length - 1];

    handler({
      source: global.window,
      data: { __skillbridge__: true, __nonce__: 'correct-nonce', type: 'BRIDGE_READY' },
    });

    expect(translator.isReady).toBe(true);
  });

  test('rejects messages with wrong nonce', () => {
    translator.isReady = false;
    const handler = messageListeners[messageListeners.length - 1];

    handler({
      source: global.window,
      data: { __skillbridge__: true, __nonce__: 'wrong-nonce', type: 'BRIDGE_READY' },
    });

    expect(translator.isReady).toBe(false);
  });

  test('rejects messages without __skillbridge__ flag', () => {
    translator.isReady = false;
    const handler = messageListeners[messageListeners.length - 1];

    handler({
      source: global.window,
      data: { __nonce__: 'correct-nonce', type: 'BRIDGE_READY' },
    });

    expect(translator.isReady).toBe(false);
  });

  test('rejects messages from different source', () => {
    translator.isReady = false;
    const handler = messageListeners[messageListeners.length - 1];

    handler({
      source: {}, // Different window
      data: { __skillbridge__: true, __nonce__: 'correct-nonce', type: 'BRIDGE_READY' },
    });

    expect(translator.isReady).toBe(false);
  });

  test('ignores retired background translation responses', () => {
    const handler = messageListeners[messageListeners.length - 1];
    handler({
      source: global.window,
      data: {
        __skillbridge__: true,
        __nonce__: 'correct-nonce',
        type: 'TRANSLATE_RESPONSE',
        id: 'unknown-id',
        result: 'data',
      },
    });
    expect(translator.isReady).toBe(false);
  });
});
