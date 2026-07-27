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
  // Handle to the fake SDK instance (created lazily at script-append time) so
  // reauth-recovery tests can assert resetAuthToken calls / auth-state flips.
  let fakePuter;

  beforeEach(() => {
    delete window.__SKILLBRIDGE_BRIDGE__;
    delete globalThis.puter;
    delete globalThis.puterParent;
    window.localStorage.clear();
    fakePuter = null;
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
        fakePuter = {
          ai: { chat },
          authToken: puterAuthToken,
          // Mirrors the real SDK's instance method (clears the in-memory
          // token; the real one also drops the localStorage copy).
          resetAuthToken: jest.fn(function () {
            this.authToken = null;
          }),
        };
        globalThis.puter = fakePuter;
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

  test('ignores background translation and verification requests', async () => {
    for (const type of ['TRANSLATE_REQUEST', 'VERIFY_REQUEST']) {
      window.dispatchEvent(
        new window.MessageEvent('message', {
          source: window,
          data: {
            __skillbridge__: true,
            __nonce__: nonce,
            type,
            id: `ignored-${type}`,
            text: 'course text',
            systemPrompt: 'background AI request',
            model: 'gemini-2.0-flash',
          },
        }),
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(chat).not.toHaveBeenCalled();
    expect(sent.some((message) => /^(TRANSLATE|VERIFY)_RESPONSE$/.test(message.type))).toBe(false);
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

  // Regression guard for the permanent-scrub defect fixed in #250.
  //
  // The bundled Puter SDK dereferences `globalThis.puter` UNGUARDED at call time
  // (its driver/request path reads `globalThis.puter.apiCallLogger`,
  // `.driverRequestInfo`, `._puterRequestId`). An earlier build (50e4490) scrubbed
  // `globalThis.puter` permanently right after binding `ai.chat`, so every REAL
  // chat/verify call threw `TypeError` the instant the SDK reached for the global —
  // a total break of the AI Tutor that the other stubs hide because they read the
  // global with optional chaining (`globalThis.puter?.authToken`), which softly
  // yields `undefined` instead of throwing.
  //
  // This stub mirrors the SDK's HARD dependency: it dereferences the global without
  // a guard, so it throws if `globalThis.puter` is absent at the moment `ai.chat`
  // runs. The bridge must keep the global reachable for the duration of the call
  // (re-exposed by `_enterPuterCallGlobals`, released in `finally`) — otherwise this
  // comes back as `success:false`. Asserting the success path pins that contract.
  test('regression: bridge keeps globalThis.puter reachable for an unguarded SDK deref at chat call-time (#250)', async () => {
    chat.mockImplementation(async (_prompt, opts) => {
      // NOT optional-chained, on purpose — this is what the bundled SDK does.
      const token = globalThis.puter.authToken;
      return { message: { content: `model=${opts.model};auth=${token}` } };
    });

    window.dispatchEvent(
      new window.MessageEvent('message', {
        source: window,
        data: {
          __skillbridge__: true,
          __nonce__: nonce,
          type: 'CHAT_REQUEST',
          id: 'chat-sdk-deref',
          userMessage: 'hi',
          stream: false,
          model: 'claude-haiku-4-5',
        },
      }),
    );

    await waitFor(() => sent.some((m) => m.type === 'CHAT_RESPONSE'));

    // If a future change re-scrubs the global before the call, the unguarded deref
    // above throws and this lands as { success: false, result: 'Error: ...' }.
    expect(sent.find((m) => m.type === 'CHAT_RESPONSE')).toEqual(
      expect.objectContaining({
        id: 'chat-sdk-deref',
        success: true,
        result: 'model=claude-haiku-4-5;auth=test-token',
      }),
    );
    // And the call window closes: the global is scrubbed again once chat resolves.
    expect(globalThis.puter).toBeUndefined();
    expect(globalThis.puterParent).toBeUndefined();
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

  // === v4 reauth recovery (Puter revoked v1 tokens → 401 reauth_required) ===
  //
  // Observed live 2026-07-25: a chat under a revoked token makes the SDK's
  // internal re-auth flow die against the scrubbed global, so chat RESOLVES
  // with a non-stream value instead of prompting, and the old code crashed
  // with a bare "response is not async iterable" TypeError.

  test('streaming CHAT with a revoked session resets the dead token and retries into a working stream', async () => {
    window.localStorage.setItem('puter.auth.token', 'stale-v1-token');
    // Most hostile shape the SDK produced live: a resolution that is not a
    // stream at all. The retry (token cleared → signed-out path) streams.
    chat.mockResolvedValueOnce(undefined);

    window.dispatchEvent(
      new window.MessageEvent('message', {
        source: window,
        data: {
          __skillbridge__: true,
          __nonce__: nonce,
          type: 'CHAT_REQUEST',
          id: 'chat-reauth-recover',
          userMessage: 'hi',
          stream: true,
          model: 'claude-sonnet-4-6',
        },
      }),
    );

    await waitFor(() => sent.some((m) => m.type === 'CHAT_STREAM_END'));

    expect(chat).toHaveBeenCalledTimes(2);
    expect(fakePuter.resetAuthToken).toHaveBeenCalledTimes(1);
    // The bridge also drops the localStorage copy of the dead token.
    expect(window.localStorage.getItem('puter.auth.token')).toBeNull();
    expect(sent.filter((m) => m.type === 'CHAT_STREAM_CHUNK').length).toBeGreaterThan(0);
    expect(sent.find((m) => m.type === 'CHAT_STREAM_END')).toEqual(
      expect.objectContaining({ id: 'chat-reauth-recover', success: true }),
    );
    // Call window closed after the stream: globals scrubbed again.
    expect(globalThis.puter).toBeUndefined();
  });

  test('streaming CHAT surfaces a clean error (no bare TypeError) when the recovery retry also fails', async () => {
    chat
      .mockResolvedValueOnce({ error: { code: 'reauth_required', message: 'Re-authentication required' } })
      .mockResolvedValueOnce({ error: { code: 'auth_canceled', message: 'Authentication canceled' } });

    window.dispatchEvent(
      new window.MessageEvent('message', {
        source: window,
        data: {
          __skillbridge__: true,
          __nonce__: nonce,
          type: 'CHAT_REQUEST',
          id: 'chat-reauth-cancel',
          userMessage: 'hi',
          stream: true,
          model: 'claude-sonnet-4-6',
        },
      }),
    );

    await waitFor(() => sent.some((m) => m.type === 'CHAT_RESPONSE'));

    expect(chat).toHaveBeenCalledTimes(2);
    const resp = sent.find((m) => m.type === 'CHAT_RESPONSE');
    expect(resp).toEqual(expect.objectContaining({ id: 'chat-reauth-cancel', success: false }));
    // The SDK's actual reason survives — not "response is not async iterable".
    expect(resp.error).toMatch(/Authentication canceled/);
    expect(resp.error).not.toMatch(/async iterable/);
  });

  test('signed-out streaming CHAT that cannot stream fails cleanly without touching auth state', async () => {
    puterAuthToken = null;
    // Signed out, the SDK prompts inside chat() itself; a non-stream
    // resolution here means the user closed the prompt. No reset, no retry.
    chat.mockResolvedValueOnce({ error: { code: 'auth_canceled', message: 'Authentication canceled' } });

    window.dispatchEvent(
      new window.MessageEvent('message', {
        source: window,
        data: {
          __skillbridge__: true,
          __nonce__: nonce,
          type: 'CHAT_REQUEST',
          id: 'chat-anon-cancel',
          userMessage: 'hi',
          stream: true,
          model: 'claude-sonnet-4-6',
        },
      }),
    );

    await waitFor(() => sent.some((m) => m.type === 'CHAT_RESPONSE'));

    expect(chat).toHaveBeenCalledTimes(1);
    expect(fakePuter.resetAuthToken).not.toHaveBeenCalled();
    expect(sent.find((m) => m.type === 'CHAT_RESPONSE')).toEqual(
      expect.objectContaining({ id: 'chat-anon-cancel', success: false }),
    );
  });

  // Regression guard for the review finding: the recovery used to fire on ANY
  // non-iterable resolution while signed in, so a quota/permission/5xx
  // envelope destroyed a WORKING token, popped a sign-in prompt that could not
  // fix the real problem, and disabled the Tutor for the rest of the session.
  test.each([
    ['insufficient_funds', { error: { code: 'insufficient_funds', message: 'Insufficient funds' } }],
    ['usage_limited', { error: { code: 'usage_limited', message: 'Usage limit reached' } }],
    ['permission_denied', { error: { code: 'permission_denied', message: 'Permission denied' } }],
    ['server error', { error: { code: 'internal_error', message: 'Internal Server Error' } }],
  ])('non-auth failure (%s) surfaces cleanly and KEEPS the session', async (_label, envelope) => {
    window.localStorage.setItem('puter.auth.token', 'valid-token');
    chat.mockResolvedValueOnce(envelope);

    window.dispatchEvent(
      new window.MessageEvent('message', {
        source: window,
        data: {
          __skillbridge__: true,
          __nonce__: nonce,
          type: 'CHAT_REQUEST',
          id: 'chat-nonauth',
          userMessage: 'hi',
          stream: true,
          model: 'claude-sonnet-4-6',
        },
      }),
    );

    await waitFor(() => sent.some((m) => m.type === 'CHAT_RESPONSE'));

    // No reset, no retry — one call only.
    expect(chat).toHaveBeenCalledTimes(1);
    expect(fakePuter.resetAuthToken).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('puter.auth.token')).toBe('valid-token');
    const resp = sent.find((m) => m.type === 'CHAT_RESPONSE');
    expect(resp).toEqual(expect.objectContaining({ id: 'chat-nonauth', success: false }));
    expect(resp.error).toMatch(new RegExp(envelope.error.message));
    expect(resp.error).not.toMatch(/async iterable/);
  });

  test('an SDK 401 resolution IS treated as a revoked session and recovers', async () => {
    window.localStorage.setItem('puter.auth.token', 'stale-token');
    // The bundled SDK's own 401 branch resolves this shape.
    chat.mockResolvedValueOnce({ status: 401, message: 'Unauthorized' });

    window.dispatchEvent(
      new window.MessageEvent('message', {
        source: window,
        data: {
          __skillbridge__: true,
          __nonce__: nonce,
          type: 'CHAT_REQUEST',
          id: 'chat-401',
          userMessage: 'hi',
          stream: true,
          model: 'claude-sonnet-4-6',
        },
      }),
    );

    await waitFor(() => sent.some((m) => m.type === 'CHAT_STREAM_END'));

    expect(chat).toHaveBeenCalledTimes(2);
    expect(fakePuter.resetAuthToken).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('puter.auth.token')).toBeNull();
  });

  test('an anomalous plain-string resolution never costs the user their token', async () => {
    window.localStorage.setItem('puter.auth.token', 'valid-token');
    chat.mockResolvedValueOnce('not a stream');

    window.dispatchEvent(
      new window.MessageEvent('message', {
        source: window,
        data: {
          __skillbridge__: true,
          __nonce__: nonce,
          type: 'CHAT_REQUEST',
          id: 'chat-string',
          userMessage: 'hi',
          stream: true,
          model: 'claude-sonnet-4-6',
        },
      }),
    );

    await waitFor(() => sent.some((m) => m.type === 'CHAT_RESPONSE'));

    expect(chat).toHaveBeenCalledTimes(1);
    expect(fakePuter.resetAuthToken).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('puter.auth.token')).toBe('valid-token');
  });

  test('non-streaming CHAT error envelope is surfaced as a failure, not fake-success "No response"', async () => {
    chat.mockResolvedValueOnce({ error: { code: 'reauth_required', message: 'Re-authentication required' } });

    window.dispatchEvent(
      new window.MessageEvent('message', {
        source: window,
        data: {
          __skillbridge__: true,
          __nonce__: nonce,
          type: 'CHAT_REQUEST',
          id: 'chat-nonstream-reauth',
          userMessage: 'hi',
          stream: false,
          model: 'claude-haiku-4-5',
        },
      }),
    );

    await waitFor(() => sent.some((m) => m.type === 'CHAT_RESPONSE'));

    expect(sent.find((m) => m.type === 'CHAT_RESPONSE')).toEqual(
      expect.objectContaining({
        id: 'chat-nonstream-reauth',
        success: false,
        error: 'Re-authentication required',
      }),
    );
  });
});
