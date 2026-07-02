/**
 * @jest-environment jsdom
 *
 * Security regression for src/lib/page-bridge.js origin pinning (audit 2026-07).
 *
 * The bundled Puter SDK derives its API/GUI base from page-world globals that
 * are NOT env-gated:
 *   get defaultAPIOrigin(){return globalThis.PUTER_API_ORIGIN||"https://api.puter.com"}
 *   get defaultGUIOrigin(){return globalThis.PUTER_ORIGIN||"https://puter.com"}
 * The bridge and the SDK it injects run in the UNTRUSTED host page's main world,
 * so a page-world script could pre-seed those globals to redirect every
 * authenticated Puter request (Bearer token + prompts) and the sign-in popup to
 * a hostile origin. loadPuter() must lock them to the official Puter origins
 * (non-writable, non-configurable) BEFORE the SDK bundle executes.
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

describe('page-bridge Puter origin pinning (#security)', () => {
  let originalAppendChild;
  let originalPostMessage;
  let sent;
  let chat;
  let sdkSawApiOrigin;
  let sdkSetAPIOrigin;
  const nonce = 'origin-pin-nonce';

  beforeEach(() => {
    delete window.__SKILLBRIDGE_BRIDGE__;
    delete globalThis.puter;
    delete globalThis.puterParent;
    sent = [];
    sdkSawApiOrigin = null;
    sdkSetAPIOrigin = jest.fn();
    chat = jest.fn(async (_prompt, opts) => ({ message: { content: `model=${opts.model}` } }));

    const loader = document.createElement('script');
    loader.id = '__skillbridge_loader__';
    loader.dataset.nonce = nonce;
    loader.dataset.puterUrl = 'chrome-extension://runtime/src/bridge/puter.js';
    Object.defineProperty(document, 'currentScript', { configurable: true, get: () => loader });

    originalPostMessage = window.postMessage;
    window.postMessage = (data) => {
      sent.push(data);
    };

    originalAppendChild = document.head.appendChild.bind(document.head);
    document.head.appendChild = (node) => {
      const appended = originalAppendChild(node);
      if (node.tagName === 'SCRIPT') {
        // The real SDK reads globalThis.PUTER_API_ORIGIN at construction — by the
        // time this (the script "executing") runs, the bridge has already pinned
        // it, so a faithful stub records the pinned value.
        sdkSawApiOrigin = globalThis.PUTER_API_ORIGIN;
        globalThis.puter = { ai: { chat }, authToken: 'tok', setAPIOrigin: sdkSetAPIOrigin };
        globalThis.puterParent = { leaked: true };
        setTimeout(() => node.onload && node.onload(), 0);
      }
      return appended;
    };
  });

  afterEach(() => {
    document.head.appendChild = originalAppendChild;
    window.postMessage = originalPostMessage;
    delete globalThis.puter;
    delete globalThis.puterParent;
    delete window.__SKILLBRIDGE_BRIDGE__;
  });

  test('overrides a page-set hostile origin, pins the official origins non-writable, and still loads', async () => {
    // A malicious host-page script pre-seeds the origin globals BEFORE the bridge
    // loads the SDK — a plain writable assignment, exactly as page code would do.
    globalThis.PUTER_API_ORIGIN = 'https://evil.example';
    globalThis.PUTER_ORIGIN = 'https://evil.example';

    (0, eval)(src);

    window.dispatchEvent(
      new window.MessageEvent('message', {
        source: window,
        data: {
          __skillbridge__: true,
          __nonce__: nonce,
          type: 'CHAT_REQUEST',
          id: 'origin-pin-chat',
          userMessage: 'hi',
          stream: false,
          model: 'claude-haiku-4-5',
        },
      }),
    );

    await waitFor(() => sent.some((m) => m.type === 'CHAT_RESPONSE'));

    // The hostile pre-set value was overridden with the official origin...
    expect(globalThis.PUTER_API_ORIGIN).toBe('https://api.puter.com');
    expect(globalThis.PUTER_ORIGIN).toBe('https://puter.com');
    // ...and the SDK constructed AFTER pinning, so it never saw 'evil.example'.
    expect(sdkSawApiOrigin).toBe('https://api.puter.com');

    // The globals are locked so page code can no longer repoint them.
    const apiDesc = Object.getOwnPropertyDescriptor(globalThis, 'PUTER_API_ORIGIN');
    const guiDesc = Object.getOwnPropertyDescriptor(globalThis, 'PUTER_ORIGIN');
    expect(apiDesc).toMatchObject({ writable: false, configurable: false });
    expect(guiDesc).toMatchObject({ writable: false, configurable: false });
    expect(() => {
      'use strict';
      globalThis.PUTER_API_ORIGIN = 'https://evil2.example';
    }).toThrow(TypeError);
    expect(globalThis.PUTER_API_ORIGIN).toBe('https://api.puter.com');

    // Pinning did not break loading: the chat call ran and the SDK global was
    // scrubbed again once the call resolved.
    expect(chat).toHaveBeenCalled();
    expect(sent.find((m) => m.type === 'CHAT_RESPONSE')).toEqual(
      expect.objectContaining({ id: 'origin-pin-chat', success: true }),
    );
    // The captured instance's API origin is also forced to the official server,
    // closing the `?puter.api_origin=` query-param path the global pin can't reach.
    expect(sdkSetAPIOrigin).toHaveBeenCalledWith('https://api.puter.com');
    expect(globalThis.puter).toBeUndefined();
  });
});
