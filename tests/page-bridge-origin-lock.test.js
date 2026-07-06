/**
 * @jest-environment jsdom
 *
 * Security regression: _pinPuterOrigins must FAIL CLOSED when a page pre-locks an
 * origin global with an unsafe descriptor. A non-configurable-but-WRITABLE data
 * property (the page can reassign it after we "pin") or a non-configurable
 * ACCESSOR (its getter can return a hostile value on a later read) must NOT be
 * trusted — loadPuter rejects and the SDK never loads, rather than run against a
 * page-controlled origin.
 */

/* global describe, test, expect, beforeEach, afterEach, jest, window, document */

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'page-bridge.js'), 'utf8');

function waitFor(predicate, timeoutMs = 2000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('Timed out waiting for page-bridge condition'));
      setTimeout(tick, 20);
    };
    tick();
  });
}

function installBridge(nonce, chat) {
  const loader = document.createElement('script');
  loader.id = '__skillbridge_loader__';
  loader.dataset.nonce = nonce;
  loader.dataset.puterUrl = 'chrome-extension://runtime/src/bridge/puter.js';
  Object.defineProperty(document, 'currentScript', { configurable: true, get: () => loader });

  const original = document.head.appendChild.bind(document.head);
  document.head.appendChild = (node) => {
    const appended = original(node);
    if (node.tagName === 'SCRIPT') {
      globalThis.puter = { ai: { chat }, authToken: 'tok' };
      globalThis.puterParent = { leaked: true };
      setTimeout(() => node.onload && node.onload(), 0);
    }
    return appended;
  };
  return original;
}

function chatReq(nonce, id) {
  return new window.MessageEvent('message', {
    source: window,
    data: {
      __skillbridge__: true,
      __nonce__: nonce,
      type: 'CHAT_REQUEST',
      id,
      userMessage: 'hi',
      stream: false,
      model: 'claude-haiku-4-5',
    },
  });
}

describe('page-bridge origin pin — fail closed on unsafe pre-locked global (#security)', () => {
  let originalAppendChild;
  let originalPostMessage;
  let sent;
  let chat;

  beforeEach(() => {
    delete window.__SKILLBRIDGE_BRIDGE__;
    delete globalThis.puter;
    delete globalThis.puterParent;
    sent = [];
    chat = jest.fn(async () => ({ message: { content: 'ok' } }));
    originalPostMessage = window.postMessage;
    window.postMessage = (data) => sent.push(data);
  });

  afterEach(() => {
    if (originalAppendChild) document.head.appendChild = originalAppendChild;
    window.postMessage = originalPostMessage;
    delete globalThis.puter;
    delete globalThis.puterParent;
    delete window.__SKILLBRIDGE_BRIDGE__;
    window.history.replaceState({}, '', '/');
  });

  test('refuses to load Puter when a page pre-locks PUTER_API_ORIGIN as non-configurable but writable', async () => {
    const nonce = 'origin-lock-nonce';
    // configurable:false, writable:true, value === official: passes a naive
    // value-only check, but the page can still reassign it after we "pin".
    Object.defineProperty(globalThis, 'PUTER_API_ORIGIN', {
      value: 'https://api.puter.com',
      configurable: false,
      writable: true,
      enumerable: false,
    });

    originalAppendChild = installBridge(nonce, chat);
    (0, eval)(src);

    window.dispatchEvent(chatReq(nonce, 'lock-chat'));
    await waitFor(() => sent.some((m) => m.type === 'CHAT_RESPONSE'));

    // Load was refused (the pin threw) — no chat call, and an error response.
    expect(chat).not.toHaveBeenCalled();
    expect(sent.find((m) => m.type === 'CHAT_RESPONSE')).toEqual(
      expect.objectContaining({ id: 'lock-chat', success: false }),
    );
  });

  test('refuses to load Puter when the host URL carries Puter app params (?puter.app_instance_id / api_origin)', async () => {
    const nonce = 'origin-param-nonce';
    // A crafted link: ?puter.app_instance_id= flips the SDK env to "app", which
    // unlocks ?puter.api_origin= to poison the origin at construction — before
    // any post-load fix can run. loadPuter must refuse outright.
    window.history.replaceState({}, '', '/lesson?puter.app_instance_id=x&puter.api_origin=https://evil.example');

    originalAppendChild = installBridge(nonce, chat);
    (0, eval)(src);

    window.dispatchEvent(chatReq(nonce, 'param-chat'));
    await waitFor(() => sent.some((m) => m.type === 'CHAT_RESPONSE'));

    // The SDK never even loads, so no bundle construction and no chat call.
    expect(chat).not.toHaveBeenCalled();
    expect(sent.find((m) => m.type === 'CHAT_RESPONSE')).toEqual(
      expect.objectContaining({ id: 'param-chat', success: false }),
    );
  });
});
