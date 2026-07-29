/**
 * Runtime contract for the isolated Puter frame.
 */

/* global describe, test, expect, beforeEach, afterEach, jest */

const fs = require('fs');
const path = require('path');

const frameSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'bridge', 'puter-frame.js'), 'utf8');
const initSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'bridge', 'puter-frame-init.js'), 'utf8');

async function flushUntil(predicate, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Timed out waiting for frame runtime');
}

function bootFrame(chat, { authToken = null, storedToken = authToken } = {}) {
  const listeners = { message: [], disconnect: [] };
  const posted = [];
  const storage = new Map(storedToken ? [['puter.auth.token', storedToken]] : []);
  const port = {
    postMessage: jest.fn((msg) => posted.push(msg)),
    onMessage: { addListener: (fn) => listeners.message.push(fn) },
    onDisconnect: { addListener: (fn) => listeners.disconnect.push(fn) },
  };
  const puter = {
    authToken,
    resetAuthToken: jest.fn(() => {
      puter.authToken = null;
    }),
    ai: { chat },
  };
  const frameGlobal = {
    puter,
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      removeItem: (key) => storage.delete(key),
    },
  };
  const chrome = { runtime: { connect: jest.fn(() => port) } };
  new Function('chrome', 'globalThis', frameSrc)(chrome, frameGlobal);
  return { listeners, posted, puter, storage };
}

function streamOf(...texts) {
  return {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        next: jest.fn(async () =>
          index < texts.length ? { done: false, value: { text: texts[index++] } } : { done: true },
        ),
        return: jest.fn(async () => ({ done: true })),
      };
    },
  };
}

describe('Puter extension-frame runtime', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.useRealTimers());

  test('pins official origins and blocks forged token messages before the SDK listener', () => {
    const captures = [];
    const frameGlobal = {
      location: { origin: 'chrome-extension://test' },
      addEventListener: (type, fn, capture) => captures.push({ type, fn, capture }),
    };
    new Function('globalThis', initSrc)(frameGlobal);
    expect(frameGlobal.PUTER_API_ORIGIN).toBe('https://api.puter.com');
    expect(frameGlobal.PUTER_ORIGIN).toBe('https://puter.com');
    expect(captures[0]).toEqual(expect.objectContaining({ type: 'message', capture: true }));

    const forged = { data: { msg: 'puter.token', token: 'evil' }, origin: 'https://lesson.skilljar.com' };
    forged.stopImmediatePropagation = jest.fn();
    forged.preventDefault = jest.fn();
    captures[0].fn(forged);
    expect(forged.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(forged.preventDefault).toHaveBeenCalledTimes(1);

    const arbitrary = { data: { $: 'callback', payload: 'evil' }, origin: 'https://lesson.skilljar.com' };
    arbitrary.stopImmediatePropagation = jest.fn();
    arbitrary.preventDefault = jest.fn();
    captures[0].fn(arbitrary);
    expect(arbitrary.stopImmediatePropagation).toHaveBeenCalledTimes(1);

    const official = { data: { msg: 'puter.token', token: 'ok' }, origin: 'https://puter.com' };
    official.stopImmediatePropagation = jest.fn();
    official.preventDefault = jest.fn();
    captures[0].fn(official);
    expect(official.stopImmediatePropagation).not.toHaveBeenCalled();
  });

  test('enforces payload limit and model allowlist at the frame boundary', async () => {
    const chat = jest.fn(async () => streamOf('ok'));
    const runtime = bootFrame(chat, { authToken: 'valid' });
    runtime.listeners.message[0]({ type: 'start', id: 'big', prompt: 'x'.repeat(200_001), model: 'claude-sonnet-4-6' });
    expect(runtime.posted).toContainEqual(expect.objectContaining({ type: 'error', id: 'big' }));
    expect(chat).not.toHaveBeenCalled();

    runtime.listeners.message[0]({ type: 'start', id: 'model', prompt: 'hi', model: 'attacker-model' });
    await flushUntil(() => runtime.posted.some((msg) => msg.type === 'done' && msg.id === 'model'));
    expect(chat).toHaveBeenCalledWith('hi', expect.objectContaining({ model: 'claude-haiku-4-5', stream: true }));
  });

  test('sends keepalive only while a request is active and stops it on abort', async () => {
    jest.useFakeTimers();
    let resolveChat;
    const chat = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveChat = resolve;
        }),
    );
    const runtime = bootFrame(chat, { authToken: 'valid' });
    jest.advanceTimersByTime(60_000);
    expect(runtime.posted.filter((msg) => msg.type === 'keepalive')).toHaveLength(0);

    runtime.listeners.message[0]({ type: 'start', id: 'heartbeat', prompt: 'hi', model: 'claude-sonnet-4-6' });
    await Promise.resolve();
    expect(typeof resolveChat).toBe('function');
    jest.advanceTimersByTime(20_000);
    expect(runtime.posted).toContainEqual({ type: 'keepalive', id: 'heartbeat' });
    runtime.listeners.message[0]({ type: 'abort', id: 'heartbeat' });
    const countAfterAbort = runtime.posted.filter((msg) => msg.type === 'keepalive').length;
    jest.advanceTimersByTime(60_000);
    expect(runtime.posted.filter((msg) => msg.type === 'keepalive')).toHaveLength(countAfterAbort);
  });

  test('resets a revoked token once and streams the signed-out retry', async () => {
    const chat = jest.fn().mockResolvedValueOnce({ status: 401 }).mockResolvedValueOnce(streamOf('recovered'));
    const runtime = bootFrame(chat, { authToken: 'stale' });
    runtime.listeners.message[0]({ type: 'start', id: 'stale', prompt: 'hi', model: 'claude-sonnet-4-6' });
    await flushUntil(() => runtime.posted.some((msg) => msg.type === 'done' && msg.id === 'stale'));
    expect(runtime.puter.resetAuthToken).toHaveBeenCalledTimes(1);
    expect(runtime.storage.has('puter.auth.token')).toBe(false);
    expect(chat).toHaveBeenCalledTimes(2);
    expect(runtime.posted).toContainEqual({ type: 'chunk', id: 'stale', text: 'recovered' });
  });

  test.each([
    [Object.assign(new Error('token_expired'), { code: 'token_expired' }), 'token_expired'],
    [Object.assign(new Error('Unauthorized'), { status: 401 }), '401'],
  ])('resets and retries once when authenticated chat rejects with %s', async (failure) => {
    const chat = jest.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(streamOf('reauthenticated'));
    const runtime = bootFrame(chat, { authToken: 'stale' });
    runtime.listeners.message[0]({ type: 'start', id: 'thrown-auth', prompt: 'hi', model: 'claude-sonnet-4-6' });
    await flushUntil(() => runtime.posted.some((msg) => msg.type === 'done' && msg.id === 'thrown-auth'));
    expect(runtime.puter.resetAuthToken).toHaveBeenCalledTimes(1);
    expect(chat).toHaveBeenCalledTimes(2);
    expect(runtime.posted).toContainEqual({ type: 'auth-ui', visible: true });
    expect(runtime.posted).toContainEqual({ type: 'chunk', id: 'thrown-auth', text: 'reauthenticated' });
  });

  test('does not reset or retry a non-auth chat rejection', async () => {
    const chat = jest.fn().mockRejectedValue(new Error('usage_limited'));
    const runtime = bootFrame(chat, { authToken: 'valid' });
    runtime.listeners.message[0]({ type: 'start', id: 'quota', prompt: 'hi', model: 'claude-sonnet-4-6' });
    await flushUntil(() => runtime.posted.some((msg) => msg.type === 'error' && msg.id === 'quota'));
    expect(chat).toHaveBeenCalledTimes(1);
    expect(runtime.puter.resetAuthToken).not.toHaveBeenCalled();
  });

  test('auth popup cancellation fails once, does not reset/retry, and hides the auth frame', async () => {
    const chat = jest.fn().mockResolvedValue({ error: { code: 'auth_canceled', message: 'Authentication canceled' } });
    const runtime = bootFrame(chat, { authToken: null });
    runtime.listeners.message[0]({ type: 'start', id: 'cancel-auth', prompt: 'hi', model: 'claude-sonnet-4-6' });
    await flushUntil(() => runtime.posted.some((msg) => msg.type === 'error' && msg.id === 'cancel-auth'));
    expect(chat).toHaveBeenCalledTimes(1);
    expect(runtime.puter.resetAuthToken).not.toHaveBeenCalled();
    expect(runtime.posted.filter((msg) => msg.type === 'error' && msg.id === 'cancel-auth')).toHaveLength(1);
    expect(runtime.posted.filter((msg) => msg.type === 'auth-ui' && msg.visible === false)).toHaveLength(1);
  });

  test('ignores a stale stored token when the live SDK instance is signed out', async () => {
    const chat = jest.fn().mockResolvedValue(streamOf('signed-out-flow'));
    const runtime = bootFrame(chat, { authToken: null, storedToken: 'stale-storage-only' });
    runtime.listeners.message[0]({ type: 'start', id: 'storage-stale', prompt: 'hi', model: 'claude-sonnet-4-6' });
    await flushUntil(() => runtime.posted.some((msg) => msg.type === 'done' && msg.id === 'storage-stale'));
    expect(runtime.posted).toContainEqual({ type: 'auth-ui', visible: true });
    expect(runtime.puter.resetAuthToken).not.toHaveBeenCalled();
  });

  test('abort during SDK cold start closes the stream when it eventually arrives', async () => {
    let resolveChat;
    const upstreamReturn = jest.fn(async () => ({ done: true }));
    const stream = {
      [Symbol.asyncIterator]() {
        return { next: jest.fn(async () => ({ done: true })), return: upstreamReturn };
      },
    };
    const chat = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveChat = resolve;
        }),
    );
    const runtime = bootFrame(chat, { authToken: 'valid' });
    runtime.listeners.message[0]({ type: 'start', id: 'cold', prompt: 'hi', model: 'claude-sonnet-4-6' });
    await flushUntil(() => typeof resolveChat === 'function');
    runtime.listeners.message[0]({ type: 'abort', id: 'cold' });
    resolveChat(stream);
    await flushUntil(() => upstreamReturn.mock.calls.length === 1);
    expect(runtime.posted).not.toContainEqual(expect.objectContaining({ type: 'done', id: 'cold' }));
  });
});

// Regression: the cloud Tutor could never be signed into.
//
// Chrome scopes user activation per frame and does not propagate it into a
// cross-origin iframe. The send button lives in the host page, so the
// extension-origin Puter frame was never activated and the SDK's window.open
// sign-in popup was blocked — the user saw the frame's own empty overlay flash
// for a few seconds and the chat failed with a generic error. The sign-in must
// therefore be started by a click INSIDE the frame.
describe('Puter frame — in-frame sign-in gate', () => {
  function bootFrameWithCard(chat, { authToken = null, signIn } = {}) {
    const listeners = { message: [], disconnect: [] };
    const posted = [];
    const handlers = new Map();
    const el = (id) => ({
      id,
      disabled: false,
      textContent: '',
      classList: { toggle: jest.fn() },
      addEventListener: (type, fn) => handlers.set(`${id}:${type}`, fn),
      removeEventListener: () => {},
    });
    const nodes = {
      'sb-auth': el('sb-auth'),
      'sb-auth-title': el('sb-auth-title'),
      'sb-auth-body': el('sb-auth-body'),
      'sb-auth-go': el('sb-auth-go'),
      'sb-auth-cancel': el('sb-auth-cancel'),
    };
    const port = {
      postMessage: jest.fn((m) => posted.push(m)),
      onMessage: { addListener: (fn) => listeners.message.push(fn) },
      onDisconnect: { addListener: (fn) => listeners.disconnect.push(fn) },
    };
    const puter = {
      authToken,
      resetAuthToken: jest.fn(() => {
        puter.authToken = null;
      }),
      ai: { chat },
      auth: { signIn: signIn || jest.fn(async () => {}) },
    };
    const frameGlobal = {
      puter,
      document: { getElementById: (id) => nodes[id] || null },
      localStorage: { getItem: () => null, removeItem: () => {} },
    };
    new Function('chrome', 'globalThis', frameSrc)({ runtime: { connect: jest.fn(() => port) } }, frameGlobal);
    return { listeners, posted, puter, nodes, click: (id) => handlers.get(`${id}:click`)?.() };
  }

  test('a signed-out request shows the card and does NOT call chat until the user clicks', async () => {
    const chat = jest.fn(async () => streamOf('hi'));
    const f = bootFrameWithCard(chat, { authToken: null });
    f.listeners.message[0]({
      type: 'start',
      id: 'r1',
      prompt: 'q',
      model: 'claude-haiku-4-5',
      labels: { title: 'T', body: 'B', button: 'Go', cancel: 'No' },
    });
    await new Promise((r) => setTimeout(r, 0));

    // Card is painted and shown; chat has NOT been called yet.
    expect(chat).not.toHaveBeenCalled();
    expect(f.nodes['sb-auth-title'].textContent).toBe('T');
    expect(f.nodes['sb-auth-go'].textContent).toBe('Go');
    expect(f.posted.some((m) => m.type === 'auth-ui' && m.visible === true)).toBe(true);

    // Unwind: a gate left open keeps the session's 20s keepalive interval
    // alive and would hold the test runner open.
    f.click('sb-auth-cancel');
    await flushUntil(() => f.posted.some((m) => m.type === 'error'));
  });

  test('clicking the in-frame button runs signIn() and then the chat', async () => {
    const chat = jest.fn(async () => streamOf('answer'));
    const signIn = jest.fn(async function () {
      this && null;
    });
    const f = bootFrameWithCard(chat, { authToken: null, signIn });
    f.listeners.message[0]({ type: 'start', id: 'r2', prompt: 'q', model: 'claude-haiku-4-5' });
    await new Promise((r) => setTimeout(r, 0));
    // Simulate the real user gesture happening inside the frame.
    f.puter.authToken = 'fresh-token';
    f.click('sb-auth-go');
    await flushUntil(() => f.posted.some((m) => m.type === 'done'));

    expect(signIn).toHaveBeenCalledTimes(1);
    expect(chat).toHaveBeenCalledTimes(1);
    expect(f.posted.filter((m) => m.type === 'chunk').map((m) => m.text)).toEqual(['answer']);
    // The card is dismissed once the stream starts.
    expect(f.posted.some((m) => m.type === 'auth-ui' && m.visible === false)).toBe(true);
  });

  test('declining the card fails the request with the sign-in reason and never calls chat', async () => {
    const chat = jest.fn(async () => streamOf('never'));
    const f = bootFrameWithCard(chat, { authToken: null });
    f.listeners.message[0]({ type: 'start', id: 'r3', prompt: 'q', model: 'claude-haiku-4-5' });
    await new Promise((r) => setTimeout(r, 0));
    f.click('sb-auth-cancel');
    await flushUntil(() => f.posted.some((m) => m.type === 'error'));

    expect(chat).not.toHaveBeenCalled();
    expect(f.posted.find((m) => m.type === 'error').error).toMatch(/sign-in required/i);
  });

  test('an already-signed-in request never shows the card', async () => {
    const chat = jest.fn(async () => streamOf('ok'));
    const f = bootFrameWithCard(chat, { authToken: 'existing' });
    f.listeners.message[0]({ type: 'start', id: 'r4', prompt: 'q', model: 'claude-haiku-4-5' });
    await flushUntil(() => f.posted.some((m) => m.type === 'done'));

    expect(chat).toHaveBeenCalledTimes(1);
    expect(f.posted.some((m) => m.type === 'auth-ui' && m.visible === true)).toBe(false);
  });
});
