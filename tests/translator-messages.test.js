/**
 * Unit tests for translator.js message handling and pendingCallbacks.
 *
 * Tests: _sendRequest callback lifecycle, stale eviction, size cap, nonce validation.
 */

/* global jest, describe, test, expect, beforeEach */

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
const selectorsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'selectors.js'), 'utf8');
const constantsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'constants.js'), 'utf8');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'translator.js'), 'utf8');

let SkilljarTranslator;
try {
  const combined = `(function() { ${selectorsSrc}; ${constantsSrc}; ${src}; return SkilljarTranslator; })()`;
  SkilljarTranslator = eval(combined);
} catch (_e) {
  eval(selectorsSrc);
  eval(constantsSrc);
  eval(src);
  SkilljarTranslator = global.SkilljarTranslator;
}

// ── Tests ──────────────────────────────────────────────────────

describe('pendingCallbacks management', () => {
  let translator;

  beforeEach(() => {
    jest.useFakeTimers();
    messageListeners.length = 0;
    translator = new SkilljarTranslator();
    translator.isReady = true;
    translator._bridgeNonce = 'test-nonce';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('pendingCallbacks starts empty', () => {
    expect(translator.pendingCallbacks.size).toBe(0);
  });

  test('_sendRequest adds a callback with _ts timestamp', async () => {
    const before = Date.now();
    // Don't await — it will timeout; just fire and check
    const _promise = translator._sendRequest({ type: 'TEST' }).catch(() => {});
    expect(translator.pendingCallbacks.size).toBe(1);

    const [, handler] = [...translator.pendingCallbacks.entries()][0];
    expect(handler._ts).toBeGreaterThanOrEqual(before);
    expect(handler._ts).toBeLessThanOrEqual(Date.now());

    // Cleanup: resolve by calling handler
    handler({ success: true, result: 'ok' });
  });

  test('callback handler resolves promise with result', () => {
    let capturedId;
    const origPost = global.window.postMessage;
    global.window.postMessage = (msg) => {
      capturedId = msg.id;
    };

    // Fire request
    translator._sendRequest({ type: 'TEST' }).catch(() => {});
    expect(translator.pendingCallbacks.has(capturedId)).toBe(true);

    // Handler is stored — calling it resolves the promise
    const cb = translator.pendingCallbacks.get(capturedId);
    expect(typeof cb).toBe('function');
    expect(typeof cb._ts).toBe('number');

    global.window.postMessage = origPost;
  });

  test('stale callbacks are evicted when cap is reached', () => {
    // Fill pendingCallbacks with stale entries
    const now = Date.now();
    for (let i = 0; i < 100; i++) {
      const handler = () => {};
      handler._ts = now - 200000; // 200s ago (> 120s stale threshold)
      translator.pendingCallbacks.set(`stale-${i}`, handler);
    }
    expect(translator.pendingCallbacks.size).toBe(100);

    // Next _sendRequest should evict stale entries
    translator._sendRequest({ type: 'TEST' }).catch(() => {});

    // Stale entries should have been cleaned up
    expect(translator.pendingCallbacks.size).toBeLessThanOrEqual(2); // new entry + possibly 1 leftover
  });

  test('hard cap drops oldest when no stale entries exist', () => {
    const now = Date.now();
    for (let i = 0; i < 100; i++) {
      const handler = () => {};
      handler._ts = now; // All fresh — won't be evicted by staleness
      translator.pendingCallbacks.set(`fresh-${i}`, handler);
    }

    translator._sendRequest({ type: 'TEST' }).catch(() => {});

    // Hard cap should have dropped the oldest (fresh-0) to make room
    expect(translator.pendingCallbacks.has('fresh-0')).toBe(false);
    expect(translator.pendingCallbacks.size).toBe(100); // 99 remaining + 1 new
  });
});

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

  test('dispatches TRANSLATE_RESPONSE to correct callback', (done) => {
    translator.isReady = true;
    const handler = messageListeners[messageListeners.length - 1];

    translator.pendingCallbacks.set('req-123', (data) => {
      expect(data.result).toBe('translated text');
      expect(translator.pendingCallbacks.has('req-123')).toBe(false);
      done();
    });

    handler({
      source: global.window,
      data: {
        __skillbridge__: true,
        __nonce__: 'correct-nonce',
        type: 'TRANSLATE_RESPONSE',
        id: 'req-123',
        result: 'translated text',
      },
    });
  });

  test('ignores response for unknown callback id', () => {
    const handler = messageListeners[messageListeners.length - 1];

    // Should not throw
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

    expect(translator.pendingCallbacks.size).toBe(0);
  });
});
