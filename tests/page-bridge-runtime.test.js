/**
 * @jest-environment jsdom
 *
 * Runtime harness for src/lib/page-bridge.js. The regex tests in
 * page-bridge-fallback.test.js pin source-level contracts; this file proves
 * the page-world bridge actually applies the model allowlist and scrubs Puter
 * globals when a request reaches the listener.
 */

/* global describe, test, expect, beforeEach, afterEach, jest, window, document */

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'page-bridge.js'), 'utf8');

function waitFor(predicate, timeoutMs = 2000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('Timed out waiting for page-bridge runtime condition'));
        return;
      }
      setTimeout(tick, 20);
    };
    tick();
  });
}

describe('page-bridge runtime hardening', () => {
  let originalAppendChild;
  let originalPostMessage;
  let sent;
  let chat;
  let nonceSeq = 0;
  let nonce;
  // Per-test Puter auth state. Default 'signed in' so the model-routing tests
  // exercise the real chat path; the unauthenticated-skip tests set it null.
  let puterAuthToken;

  beforeEach(() => {
    delete window.__SKILLBRIDGE_BRIDGE__;
    delete globalThis.puter;
    delete globalThis.puterParent;
    sent = [];
    nonce = `runtime-nonce-${++nonceSeq}`;
    puterAuthToken = 'test-token';
    chat = jest.fn(async (_prompt, opts) => {
      if (opts.stream) {
        return (async function* streamWithSdkSelfReference() {
          yield { text: `stream-auth=${globalThis.puter?.authToken || 'none'}` };
          await Promise.resolve();
          yield { text: `stream-parent=${globalThis.puterParent?.leaked ? 'yes' : 'no'}` };
        })();
      }
      return { message: { content: `model=${opts.model};auth=${globalThis.puter?.authToken || 'none'}` } };
    });

    const loader = document.createElement('script');
    loader.id = '__skillbridge_loader__';
    loader.dataset.nonce = nonce;
    loader.dataset.puterUrl = 'chrome-extension://runtime/src/bridge/puter.js';
    Object.defineProperty(document, 'currentScript', {
      configurable: true,
      get: () => loader,
    });

    originalPostMessage = window.postMessage;
    window.postMessage = (data) => {
      sent.push(data);
    };

    originalAppendChild = document.head.appendChild.bind(document.head);
    document.head.appendChild = (node) => {
      const appended = originalAppendChild(node);
      if (node.tagName === 'SCRIPT') {
        globalThis.puter = { ai: { chat }, authToken: puterAuthToken };
        globalThis.puterParent = { leaked: true };
        setTimeout(() => node.onload && node.onload(), 0);
      }
      return appended;
    };

    (0, eval)(src);
  });

  afterEach(() => {
    document.head.appendChild = originalAppendChild;
    window.postMessage = originalPostMessage;
    delete globalThis.puter;
    delete globalThis.puterParent;
    delete window.__SKILLBRIDGE_BRIDGE__;
  });

  test('VERIFY_REQUEST rejects page-supplied Claude model and uses Gemini fallback', async () => {
    window.dispatchEvent(
      new window.MessageEvent('message', {
        source: window,
        data: {
          __skillbridge__: true,
          __nonce__: nonce,
          type: 'VERIFY_REQUEST',
          id: 'verify-1',
          systemPrompt: 'verify this',
          model: 'claude-sonnet-4-6',
        },
      }),
    );

    await waitFor(() => sent.some((m) => m.type === 'VERIFY_RESPONSE'));

    expect(chat).toHaveBeenCalledWith(
      'verify this',
      expect.objectContaining({ model: 'gemini-2.0-flash', stream: false }),
    );
    expect(sent.find((m) => m.type === 'VERIFY_RESPONSE')).toEqual(
      expect.objectContaining({ id: 'verify-1', success: true, result: 'model=gemini-2.0-flash;auth=test-token' }),
    );
    expect(globalThis.puter).toBeUndefined();
    expect(globalThis.puterParent).toBeUndefined();
  });

  test('non-streaming CHAT_REQUEST rejects page-supplied Gemini model and uses Claude fallback', async () => {
    window.dispatchEvent(
      new window.MessageEvent('message', {
        source: window,
        data: {
          __skillbridge__: true,
          __nonce__: nonce,
          type: 'CHAT_REQUEST',
          id: 'chat-1',
          userMessage: 'hello',
          stream: false,
          model: 'gemini-2.0-flash',
        },
      }),
    );

    await waitFor(() => sent.some((m) => m.type === 'CHAT_RESPONSE'));

    expect(chat).toHaveBeenCalledWith('hello', expect.objectContaining({ model: 'claude-haiku-4-5', stream: false }));
    expect(sent.find((m) => m.type === 'CHAT_RESPONSE')).toEqual(
      expect.objectContaining({ id: 'chat-1', success: true, result: 'model=claude-haiku-4-5;auth=test-token' }),
    );
  });

  test('streaming CHAT_REQUEST keeps Puter globals available until the stream is consumed, then scrubs them', async () => {
    window.dispatchEvent(
      new window.MessageEvent('message', {
        source: window,
        data: {
          __skillbridge__: true,
          __nonce__: nonce,
          type: 'CHAT_REQUEST',
          id: 'chat-stream',
          userMessage: 'stream please',
          stream: true,
          model: 'claude-haiku-4-5',
        },
      }),
    );

    await waitFor(() => sent.some((m) => m.type === 'CHAT_STREAM_END'));

    const chunks = sent.filter((m) => m.type === 'CHAT_STREAM_CHUNK').map((m) => m.text);
    expect(chunks).toEqual(['stream-auth=test-token', 'stream-parent=yes']);
    expect(sent.find((m) => m.type === 'CHAT_STREAM_END')).toEqual(
      expect.objectContaining({ id: 'chat-stream', success: true }),
    );
    expect(globalThis.puter).toBeUndefined();
    expect(globalThis.puterParent).toBeUndefined();
  });

  test('stream watchdog releases Puter globals even when the SDK stream never settles', async () => {
    jest.useFakeTimers();
    const iterator = {
      next: jest.fn(() => new Promise(() => {})),
      return: jest.fn(async () => ({ done: true })),
    };
    chat.mockImplementation(async () => ({
      [Symbol.asyncIterator]() {
        return iterator;
      },
    }));

    try {
      window.dispatchEvent(
        new window.MessageEvent('message', {
          source: window,
          data: {
            __skillbridge__: true,
            __nonce__: nonce,
            type: 'CHAT_REQUEST',
            id: 'chat-hung-stream',
            userMessage: 'stall please',
            stream: true,
            model: 'claude-haiku-4-5',
          },
        }),
      );

      await Promise.resolve();
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      await Promise.resolve();

      expect(globalThis.puter?.authToken).toBe('test-token');

      jest.advanceTimersByTime(90_000);
      await Promise.resolve();

      expect(globalThis.puter).toBeUndefined();
      expect(globalThis.puterParent).toBeUndefined();
      expect(iterator.return).toHaveBeenCalledTimes(1);
      expect(sent.some((m) => m.type === 'CHAT_STREAM_END')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test('CHAT_ABORT releases Puter globals for a hung SDK stream without waiting for the watchdog', async () => {
    const iterator = {
      next: jest.fn(() => new Promise(() => {})),
      return: jest.fn(async () => ({ done: true })),
    };
    chat.mockImplementation(async () => ({
      [Symbol.asyncIterator]() {
        return iterator;
      },
    }));

    window.dispatchEvent(
      new window.MessageEvent('message', {
        source: window,
        data: {
          __skillbridge__: true,
          __nonce__: nonce,
          type: 'CHAT_REQUEST',
          id: 'chat-abort-hung',
          userMessage: 'stall please',
          stream: true,
          model: 'claude-haiku-4-5',
        },
      }),
    );

    await waitFor(() => globalThis.puter?.authToken === 'test-token' && iterator.next.mock.calls.length === 1);

    window.dispatchEvent(
      new window.MessageEvent('message', {
        source: window,
        data: {
          __skillbridge__: true,
          __nonce__: nonce,
          type: 'CHAT_ABORT',
          id: 'chat-abort-hung',
        },
      }),
    );

    await waitFor(() => globalThis.puter === undefined && globalThis.puterParent === undefined);
    expect(iterator.return).toHaveBeenCalledTimes(1);
    expect(sent.some((m) => m.type === 'CHAT_STREAM_END')).toBe(false);
  });

  test('CHAT_ABORT while Puter is pending closes the returned stream without reading it', async () => {
    let resolveChat;
    const iterator = {
      next: jest.fn(() => Promise.resolve({ done: true })),
      return: jest.fn(async () => ({ done: true })),
    };
    chat.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveChat = resolve;
        }),
    );

    window.dispatchEvent(
      new window.MessageEvent('message', {
        source: window,
        data: {
          __skillbridge__: true,
          __nonce__: nonce,
          type: 'CHAT_REQUEST',
          id: 'chat-abort-pending',
          userMessage: 'stall before stream',
          stream: true,
          model: 'claude-haiku-4-5',
        },
      }),
    );

    await waitFor(() => typeof resolveChat === 'function' && globalThis.puter?.authToken === 'test-token');

    window.dispatchEvent(
      new window.MessageEvent('message', {
        source: window,
        data: {
          __skillbridge__: true,
          __nonce__: nonce,
          type: 'CHAT_ABORT',
          id: 'chat-abort-pending',
        },
      }),
    );

    await waitFor(() => globalThis.puter === undefined && globalThis.puterParent === undefined);

    resolveChat({
      [Symbol.asyncIterator]() {
        return iterator;
      },
    });

    await waitFor(() => iterator.return.mock.calls.length === 1);
    expect(iterator.next).not.toHaveBeenCalled();
    expect(sent.some((m) => m.type === 'CHAT_STREAM_END')).toBe(false);
  });

  test('CHAT_ABORT suppresses fallback retry and error response after a pending model error', async () => {
    let rejectChat;
    chat.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectChat = reject;
        }),
    );

    window.dispatchEvent(
      new window.MessageEvent('message', {
        source: window,
        data: {
          __skillbridge__: true,
          __nonce__: nonce,
          type: 'CHAT_REQUEST',
          id: 'chat-abort-error',
          userMessage: 'fail after abort',
          stream: true,
          model: 'claude-sonnet-4-6',
        },
      }),
    );

    await waitFor(() => typeof rejectChat === 'function' && globalThis.puter?.authToken === 'test-token');

    window.dispatchEvent(
      new window.MessageEvent('message', {
        source: window,
        data: {
          __skillbridge__: true,
          __nonce__: nonce,
          type: 'CHAT_ABORT',
          id: 'chat-abort-error',
        },
      }),
    );

    await waitFor(() => globalThis.puter === undefined && globalThis.puterParent === undefined);
    rejectChat(new Error('model not found'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chat).toHaveBeenCalledTimes(1);
    expect(sent.some((m) => m.type === 'CHAT_RESPONSE')).toBe(false);
    expect(sent.some((m) => m.type === 'CHAT_STREAM_END')).toBe(false);
  });

  // ── "No account required" guard ────────────────────────────────
  // The bundled Puter SDK opens its own sign-in prompt when ai.chat() is called
  // while signed out (env "web"). Background paths (verify / block-translate) run
  // automatically during translation, so they MUST NOT reach ai.chat() for a
  // signed-out user — otherwise the public "no account required" claim breaks.
  // These exercise the REAL auth gate (not the e2e Puter stub, which is ungated).

  test('VERIFY_REQUEST is skipped (no chat call, no auth prompt) when signed out', async () => {
    puterAuthToken = null;
    window.dispatchEvent(
      new window.MessageEvent('message', {
        source: window,
        data: {
          __skillbridge__: true,
          __nonce__: nonce,
          type: 'VERIFY_REQUEST',
          id: 'verify-anon',
          systemPrompt: 'verify this',
          model: 'gemini-2.0-flash',
        },
      }),
    );

    await waitFor(() => sent.some((m) => m.type === 'VERIFY_RESPONSE'));

    // ai.chat — the call that would trip Puter's sign-in prompt — never ran.
    expect(chat).not.toHaveBeenCalled();
    expect(sent.find((m) => m.type === 'VERIFY_RESPONSE')).toEqual(
      expect.objectContaining({ id: 'verify-anon', success: true, result: '', skipped: 'unauthenticated' }),
    );
  });

  test('TRANSLATE_REQUEST is skipped (keeps the GT text) when signed out', async () => {
    puterAuthToken = null;
    window.dispatchEvent(
      new window.MessageEvent('message', {
        source: window,
        data: {
          __skillbridge__: true,
          __nonce__: nonce,
          type: 'TRANSLATE_REQUEST',
          id: 'tr-anon',
          systemPrompt: 'translate this',
          text: 'google-translate output',
          model: 'gemini-2.0-flash',
        },
      }),
    );

    await waitFor(() => sent.some((m) => m.type === 'TRANSLATE_RESPONSE'));

    expect(chat).not.toHaveBeenCalled();
    expect(sent.find((m) => m.type === 'TRANSLATE_RESPONSE')).toEqual(
      expect.objectContaining({
        id: 'tr-anon',
        success: true,
        result: 'google-translate output',
        skipped: 'unauthenticated',
      }),
    );
  });

  test('CHAT_REQUEST still runs when signed out — the tutor is a deliberate user action', async () => {
    puterAuthToken = null;
    window.dispatchEvent(
      new window.MessageEvent('message', {
        source: window,
        data: {
          __skillbridge__: true,
          __nonce__: nonce,
          type: 'CHAT_REQUEST',
          id: 'chat-anon',
          userMessage: 'hi',
          stream: false,
          model: 'claude-haiku-4-5',
        },
      }),
    );

    await waitFor(() => sent.some((m) => m.type === 'CHAT_RESPONSE'));

    // CHAT is NOT gated — an explicit user action is allowed to authenticate.
    expect(chat).toHaveBeenCalled();
  });
});
