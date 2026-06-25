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
    chat = jest.fn(async (_prompt, opts) => ({ message: { content: `model=${opts.model}` } }));

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
      expect.objectContaining({ id: 'verify-1', success: true, result: 'model=gemini-2.0-flash' }),
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
      expect.objectContaining({ id: 'chat-1', success: true, result: 'model=claude-haiku-4-5' }),
    );
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
