/**
 * Runtime contract for the top-frame, isolated-world Puter broker.
 */

/* global describe, test, expect, beforeEach, afterEach, jest */

const fs = require('fs');
const path = require('path');

const initSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'bridge', 'puter-content-init.js'), 'utf8');
const brokerSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'bridge', 'puter-content-broker.js'), 'utf8');

const TOKEN_KEY = 'sb_puter_auth_token';
const APP_KEY = 'sb_puter_app_uid';

async function flushUntil(predicate, attempts = 60) {
  for (let index = 0; index < attempts; index++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Timed out waiting for Puter content broker');
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.attributes = new Map();
    this.children = [];
    this.dataset = {};
    this.disabled = false;
    this.textContent = '';
    this.listeners = new Map();
  }
  append(...children) {
    this.children.push(...children);
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  attachShadow(options) {
    this.shadowMode = options.mode;
    this.shadowRootForTest = new FakeElement('shadow-root');
    return this.shadowRootForTest;
  }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener) {
    this.listeners.set(
      type,
      (this.listeners.get(type) || []).filter((candidate) => candidate !== listener),
    );
  }
  emit(type, event = {}) {
    for (const listener of [...(this.listeners.get(type) || [])]) listener(event);
  }
}

function createDocument() {
  const created = [];
  const documentElement = new FakeElement('html');
  return {
    created,
    documentElement,
    createElement(tagName) {
      const element = new FakeElement(tagName);
      created.push(element);
      return element;
    },
  };
}

function createIsolatedGlobal() {
  const rawListeners = new Map();
  let hostStorageReads = 0;
  // Legacy v3.5.x page-world state: the SDK persisted its token into the host
  // page's REAL localStorage. Init must scrub `puter.*` keys on boot (exactly
  // one host-storage access) and leave the host app's own keys alone.
  const hostStorageData = new Map([
    ['puter.auth.token', 'legacy-page-world-token'],
    ['puter.app.id', 'legacy-app'],
    ['skilljar.pref', 'keep-me'],
  ]);
  const hostStorage = {
    get length() {
      return hostStorageData.size;
    },
    key(index) {
      const name = Array.from(hostStorageData.keys())[Number(index)];
      return name === undefined ? null : name;
    },
    getItem(key) {
      return hostStorageData.has(key) ? hostStorageData.get(key) : null;
    },
    setItem(key, value) {
      hostStorageData.set(key, String(value));
    },
    removeItem(key) {
      hostStorageData.delete(key);
    },
    clear() {
      hostStorageData.clear();
    },
  };
  const isolatedGlobal = {
    document: createDocument(),
    location: { search: '' },
    addEventListener(type, listener) {
      const listeners = rawListeners.get(type) || [];
      listeners.push(listener);
      rawListeners.set(type, listeners);
    },
    removeEventListener(type, listener) {
      rawListeners.set(
        type,
        (rawListeners.get(type) || []).filter((candidate) => candidate !== listener),
      );
    },
  };
  Object.defineProperty(isolatedGlobal, 'localStorage', {
    configurable: true,
    enumerable: true,
    get() {
      hostStorageReads += 1;
      return hostStorage;
    },
  });
  new Function('globalThis', initSrc)(isolatedGlobal);
  return {
    isolatedGlobal,
    hostStorageReads: () => hostStorageReads,
    hostStorageData,
    dispatchWindowMessage(event) {
      // Mirror DOM semantics for stopImmediatePropagation so the init file's
      // first-registered capture filter can actually block later listeners.
      let stopped = false;
      const original = event.stopImmediatePropagation;
      event.stopImmediatePropagation = () => {
        stopped = true;
        if (typeof original === 'function') original.call(event);
      };
      for (const listener of [...(rawListeners.get('message') || [])]) {
        if (stopped) break;
        listener(event);
      }
    },
  };
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

function bootBroker({ stored = {}, chat, signIn, authenticateWithPuter, deferredGet = null } = {}) {
  const isolated = createIsolatedGlobal();
  const { isolatedGlobal } = isolated;
  const values = new Map(Object.entries(stored));
  const posted = [];
  const portRecords = [];
  const createPort = () => {
    const listeners = { message: [], disconnect: [] };
    const messages = [];
    const port = {
      postMessage: jest.fn((message) => {
        posted.push(message);
        messages.push(message);
      }),
      onMessage: { addListener: (listener) => listeners.message.push(listener) },
      onDisconnect: { addListener: (listener) => listeners.disconnect.push(listener) },
    };
    return { port, listeners, messages };
  };
  const storage = {
    get: jest.fn(async () => {
      if (deferredGet) await deferredGet.promise;
      return Object.fromEntries(values);
    }),
    set: jest.fn(async (entries) => {
      for (const [key, value] of Object.entries(entries)) values.set(key, value);
    }),
    remove: jest.fn(async (keys) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) values.delete(key);
    }),
  };
  const whoami = jest.fn(async () => ({ username: 'must-not-be-read' }));
  const puter = {
    authToken: null,
    appID: null,
    setAuthToken: jest.fn((token) => {
      puter.authToken = token;
      isolatedGlobal.__SKILLBRIDGE_PUTER_STORAGE__.setItem('puter.auth.token', token);
    }),
    resetAuthToken: jest.fn(() => {
      puter.authToken = null;
      isolatedGlobal.__SKILLBRIDGE_PUTER_STORAGE__.removeItem('puter.auth.token');
    }),
    setAppID: jest.fn((appUid) => {
      puter.appID = appUid;
      isolatedGlobal.__SKILLBRIDGE_PUTER_STORAGE__.setItem('puter.app.id', appUid);
    }),
    auth: {
      signIn: signIn || jest.fn(async () => ({ success: false })),
      whoami,
    },
    ai: { chat: chat || jest.fn(async () => streamOf('ok')) },
  };
  if (authenticateWithPuter) puter.ui = { authenticateWithPuter };
  isolatedGlobal.puter = puter;
  const connect = jest.fn(() => {
    const record = createPort();
    portRecords.push(record);
    return record.port;
  });
  const chrome = { runtime: { connect }, storage: { local: storage } };
  new Function('chrome', 'globalThis', brokerSrc)(chrome, isolatedGlobal);
  const firstPort = portRecords[0];
  const element = (action) => isolatedGlobal.document.created.find((node) => node.dataset.sbAction === action);
  return {
    ...isolated,
    listeners: firstPort.listeners,
    posted,
    port: firstPort.port,
    portRecords,
    connect,
    storage,
    values,
    puter,
    whoami,
    click(action) {
      element(action)?.emit('click', { isTrusted: true });
    },
    element,
  };
}

describe('Puter isolated-world initialization', () => {
  test('pins official origins, guards only Puter listeners, and never reads host localStorage', () => {
    const isolated = createIsolatedGlobal();
    const global = isolated.isolatedGlobal;
    const sdkListener = jest.fn();
    global.addEventListener('message', sdkListener);
    global.__SKILLBRIDGE_RELEASE_PUTER_INIT_GATE__();

    const normalPageListener = jest.fn();
    global.addEventListener('message', normalPageListener);
    isolated.dispatchWindowMessage({ isTrusted: true, origin: 'https://lesson.skilljar.com', data: 'host' });
    isolated.dispatchWindowMessage({ isTrusted: false, origin: 'https://puter.com', data: 'forged' });
    isolated.dispatchWindowMessage({ isTrusted: true, origin: 'https://account.puter.com', data: 'subdomain' });
    expect(sdkListener).not.toHaveBeenCalled();
    expect(normalPageListener).toHaveBeenCalledTimes(3);

    isolated.dispatchWindowMessage({ isTrusted: true, origin: 'https://puter.com', data: 'official' });
    expect(sdkListener).toHaveBeenCalledTimes(1);
    expect(normalPageListener).toHaveBeenCalledTimes(4);

    const popupListener = jest.fn();
    global.__SKILLBRIDGE_WITH_PUTER_MESSAGE_GATE__(() => global.addEventListener('message', popupListener));
    isolated.dispatchWindowMessage({ isTrusted: true, origin: 'https://lesson.skilljar.com', data: 'host' });
    isolated.dispatchWindowMessage({ isTrusted: true, origin: 'https://puter.com', data: 'popup' });
    expect(popupListener).toHaveBeenCalledTimes(1);
    global.removeEventListener('message', popupListener);
    isolated.dispatchWindowMessage({ isTrusted: true, origin: 'https://puter.com', data: 'removed' });
    expect(popupListener).toHaveBeenCalledTimes(1);
    expect(global.PUTER_API_ORIGIN).toBe('https://api.puter.com');
    expect(global.PUTER_ORIGIN).toBe('https://puter.com');
    expect(global.localStorage).toBe(global.__SKILLBRIDGE_PUTER_STORAGE__);
    // Exactly one host-storage access: the legacy v3 page-world token scrub.
    expect(isolated.hostStorageReads()).toBe(1);
    expect(isolated.hostStorageData.has('puter.auth.token')).toBe(false);
    expect(isolated.hostStorageData.has('puter.app.id')).toBe(false);
    expect(isolated.hostStorageData.get('skilljar.pref')).toBe('keep-me');

    global.localStorage.setItem('puter.auth.token', 'private');
    expect(global.localStorage.getItem('puter.auth.token')).toBe('private');
    expect(global.localStorage.length).toBe(1);
  });

  test('drops forged puter.* control messages before listeners registered outside any gate', () => {
    const isolated = createIsolatedGlobal();
    const global = isolated.isolatedGlobal;
    global.__SKILLBRIDGE_RELEASE_PUTER_INIT_GATE__();

    // The SDK's driver layer registers its auth-dialog listener asynchronously
    // after a 401 — outside the init/broker gates and with no origin check of
    // its own. The first-registered capture filter must protect it anyway.
    const unguardedSdkListener = jest.fn();
    global.addEventListener('message', unguardedSdkListener);

    isolated.dispatchWindowMessage({
      isTrusted: true,
      origin: 'https://lesson.skilljar.com',
      data: { msg: 'puter.token', token: 'attacker-token' },
    });
    isolated.dispatchWindowMessage({
      isTrusted: false,
      origin: 'https://puter.com',
      data: { msg: 'puter.token', token: 'attacker-token' },
    });
    expect(unguardedSdkListener).not.toHaveBeenCalled();

    // Non-Puter host messaging is untouched, and genuine Puter control
    // messages from the official origin still arrive.
    isolated.dispatchWindowMessage({ isTrusted: true, origin: 'https://lesson.skilljar.com', data: { kind: 'host' } });
    isolated.dispatchWindowMessage({
      isTrusted: true,
      origin: 'https://puter.com',
      data: { msg: 'puter.token', token: 'genuine' },
    });
    expect(unguardedSdkListener).toHaveBeenCalledTimes(2);
  });

  test('fails closed without reading host storage when localStorage cannot be replaced', () => {
    const hostStorage = { getItem: jest.fn(() => 'host-token') };
    const isolatedGlobal = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
    Object.defineProperty(isolatedGlobal, 'localStorage', {
      value: hostStorage,
      configurable: false,
      writable: false,
    });

    expect(() => new Function('globalThis', initSrc)(isolatedGlobal)).toThrow();
    expect(hostStorage.getItem).not.toHaveBeenCalled();
    expect(isolatedGlobal.__SKILLBRIDGE_PUTER_STORAGE__).toBeUndefined();
    expect(isolatedGlobal.localStorage).toBe(hostStorage);
  });

  test.each([
    '?puter.app_instance_id=attacker&puter.api_origin=https%3A%2F%2Fevil.example',
    '?puter.domain=evil.example',
    '?puter.auth.token=attacker-token',
    '?puter%2Eapp_instance_id=encoded',
  ])('fails closed before publishing auth state for host Puter query parameters: %s', (search) => {
    const hostStorage = { getItem: jest.fn(() => 'host-token') };
    const isolatedGlobal = {
      location: { search },
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
    Object.defineProperty(isolatedGlobal, 'localStorage', {
      value: hostStorage,
      configurable: true,
    });

    expect(() => new Function('globalThis', initSrc)(isolatedGlobal)).toThrow(
      'SkillBridge: refusing Puter bootstrap parameters on a lesson URL',
    );
    expect(hostStorage.getItem).not.toHaveBeenCalled();
    expect(isolatedGlobal.__SKILLBRIDGE_PUTER_STORAGE__).toBeUndefined();
    expect(isolatedGlobal.__SKILLBRIDGE_WITH_PUTER_MESSAGE_GATE__).toBeUndefined();
    expect(isolatedGlobal.PUTER_API_ORIGIN).toBeUndefined();
  });
});

describe('Puter isolated-world content broker', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.useRealTimers());

  test('hydrates private token/app state before ready without a profile lookup', async () => {
    let releaseGet;
    const deferredGet = { promise: new Promise((resolve) => (releaseGet = resolve)) };
    const broker = bootBroker({
      stored: { [TOKEN_KEY]: 'persisted-token', [APP_KEY]: 'persisted-app' },
      deferredGet,
    });
    await Promise.resolve();
    expect(broker.posted).not.toContainEqual({ type: 'ready' });

    releaseGet();
    await flushUntil(() => broker.posted.some((message) => message.type === 'ready'));
    expect(broker.puter.setAuthToken).toHaveBeenCalledWith('persisted-token');
    expect(broker.puter.setAppID).toHaveBeenCalledWith('persisted-app');
    expect(broker.isolatedGlobal.localStorage.getItem('puter.auth.token')).toBe('persisted-token');
    expect(broker.isolatedGlobal.localStorage.getItem('puter.app.id')).toBe('persisted-app');
    expect(broker.whoami).not.toHaveBeenCalled();
    // The single permitted host-storage access is init's legacy-token scrub.
    expect(broker.hostStorageReads()).toBe(1);
  });

  test('reconnects the broker on demand after an MV3 service-worker Port disconnect', async () => {
    const chat = jest.fn(async () => streamOf('reconnected'));
    const broker = bootBroker({ stored: { [TOKEN_KEY]: 'persisted-token' }, chat });
    await flushUntil(() => broker.posted.some((message) => message.type === 'ready'));
    expect(broker.connect).toHaveBeenCalledTimes(1);
    expect(broker.storage.get).toHaveBeenCalledTimes(1);

    broker.listeners.disconnect[0]();
    expect(broker.isolatedGlobal.__SKILLBRIDGE_ENSURE_PUTER_BROKER__()).toBe(true);
    expect(broker.connect).toHaveBeenCalledTimes(2);
    const replacement = broker.portRecords[1];
    expect(replacement.messages).toContainEqual({ type: 'ready' });
    replacement.listeners.message[0]({ type: 'start', id: 'after-idle', prompt: 'question' });
    await flushUntil(() => replacement.messages.some((message) => message.type === 'done'));

    expect(chat).toHaveBeenCalledWith('question', { model: 'claude-haiku-4-5', stream: true });
    expect(replacement.messages).toContainEqual({ type: 'chunk', id: 'after-idle', text: 'reconnected' });
    expect(broker.storage.get).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['null', null],
    ['literal null', 'null'],
    ['uppercase literal null', ' NULL '],
    ['undefined', undefined],
    ['literal undefined', 'undefined'],
    ['mixed-case literal undefined', ' Undefined '],
    ['empty', ''],
  ])('rejects and removes a %s token during hydration', async (_label, token) => {
    const broker = bootBroker({ stored: { [TOKEN_KEY]: token, [APP_KEY]: 'app' } });
    await flushUntil(() => broker.posted.some((message) => message.type === 'ready'));
    expect(broker.puter.setAuthToken).not.toHaveBeenCalled();
    expect(broker.puter.setAppID).not.toHaveBeenCalled();
    expect(broker.values.has(TOKEN_KEY)).toBe(false);
    expect(broker.values.has(APP_KEY)).toBe(false);
    expect(broker.isolatedGlobal.localStorage.getItem('puter.auth.token')).toBeNull();
    expect(broker.whoami).not.toHaveBeenCalled();
  });

  test('waits for a trusted button click, prefers auth.signIn, then persists and streams', async () => {
    const chat = jest.fn(async () => streamOf('hello', ' world'));
    const signIn = jest.fn(async () => ({ success: true, token: 'fresh-token', app_uid: 'fresh-app' }));
    const fallback = jest.fn();
    const broker = bootBroker({ chat, signIn, authenticateWithPuter: fallback });
    await flushUntil(() => broker.posted.some((message) => message.type === 'ready'));
    broker.listeners.message[0]({
      type: 'start',
      id: 'signed-out',
      prompt: 'question',
      model: 'claude-sonnet-4-6',
      labels: { title: '제목', body: '설명', button: '로그인', cancel: '취소', error: '다시 시도하세요' },
    });
    await flushUntil(() => broker.posted.some((message) => message.type === 'auth-ui' && message.visible));
    expect(signIn).not.toHaveBeenCalled();
    expect(chat).not.toHaveBeenCalled();
    expect(broker.element('sign-in').textContent).toBe('로그인');
    const overlayHost = broker.isolatedGlobal.document.documentElement.children[0];
    expect(overlayHost.shadowMode).toBe('closed');

    broker.click('sign-in');
    await flushUntil(() => broker.posted.some((message) => message.type === 'done'));
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
    expect(chat).toHaveBeenCalledWith('question', { model: 'claude-sonnet-4-6', stream: true });
    expect(broker.values.get(TOKEN_KEY)).toBe('fresh-token');
    expect(broker.values.get(APP_KEY)).toBe('fresh-app');
    expect(broker.puter.setAppID).toHaveBeenCalledWith('fresh-app');
    expect(broker.posted.filter((message) => message.type === 'chunk').map((message) => message.text)).toEqual([
      'hello',
      ' world',
    ]);
    expect(broker.whoami).not.toHaveBeenCalled();
    // The single permitted host-storage access is init's legacy-token scrub.
    expect(broker.hostStorageReads()).toBe(1);
  });

  test.each([
    ['null', null],
    ['literal null', 'null'],
    ['uppercase literal null', ' NULL '],
    ['undefined', undefined],
    ['literal undefined', 'undefined'],
    ['mixed-case literal undefined', ' Undefined '],
    ['empty', ''],
  ])('never persists or adopts a %s token returned by signIn', async (_label, token) => {
    const chat = jest.fn(async () => streamOf('never'));
    const signIn = jest.fn(async () => ({
      success: true,
      token,
      app_uid: 'should-not-persist',
      error: 'raw upstream identity/token detail',
    }));
    const broker = bootBroker({ chat, signIn });
    await flushUntil(() => broker.posted.some((message) => message.type === 'ready'));
    broker.listeners.message[0]({ type: 'start', id: `bad-${_label}`, prompt: 'question' });
    await flushUntil(() => broker.posted.some((message) => message.type === 'auth-ui' && message.visible));
    broker.click('sign-in');
    await flushUntil(() => broker.posted.some((message) => message.type === 'auth-failed'));

    expect(chat).not.toHaveBeenCalled();
    expect(broker.storage.set).not.toHaveBeenCalled();
    expect(broker.values.has(TOKEN_KEY)).toBe(false);
    expect(broker.values.has(APP_KEY)).toBe(false);
    expect(broker.puter.authToken).toBeNull();
    expect(broker.whoami).not.toHaveBeenCalled();
    expect(JSON.stringify(broker.posted)).not.toContain('raw upstream');
    expect(broker.element('sign-in').textContent).toBe('Sign in');

    broker.click('cancel');
    await flushUntil(() => broker.posted.some((message) => message.type === 'error'));
  });

  test('aborting one request keeps the shared sign-in overlay open for a concurrent waiter', async () => {
    const broker = bootBroker();
    await flushUntil(() => broker.posted.some((message) => message.type === 'ready'));
    broker.listeners.message[0]({ type: 'start', id: 'first', prompt: 'question' });
    broker.listeners.message[0]({ type: 'start', id: 'second', prompt: 'question' });
    await flushUntil(() => broker.posted.some((message) => message.type === 'auth-ui' && message.visible));
    const host = broker.isolatedGlobal.document.created.find((node) =>
      node.attributes.has('data-skillbridge-puter-auth'),
    );
    expect(host.attributes.has('data-open')).toBe(true);

    // One session cancelling must not yank the overlay from the other waiter.
    broker.listeners.message[0]({ type: 'abort', id: 'first' });
    await Promise.resolve();
    await Promise.resolve();
    expect(host.attributes.has('data-open')).toBe(true);

    // The last waiter leaving closes it.
    broker.listeners.message[0]({ type: 'abort', id: 'second' });
    await flushUntil(() => !host.attributes.has('data-open'));
  });

  test('returns the upstream iterator on abort and stops without done', async () => {
    let resolveNext;
    const upstreamReturn = jest.fn(async () => {
      resolveNext({ done: true });
      return { done: true };
    });
    const iterator = {
      next: jest.fn(() => new Promise((resolve) => (resolveNext = resolve))),
      return: upstreamReturn,
    };
    const chat = jest.fn(async () => ({ [Symbol.asyncIterator]: () => iterator }));
    const broker = bootBroker({ stored: { [TOKEN_KEY]: 'valid' }, chat });
    await flushUntil(() => broker.posted.some((message) => message.type === 'ready'));
    broker.listeners.message[0]({ type: 'start', id: 'abort-me', prompt: 'question' });
    await flushUntil(() => iterator.next.mock.calls.length === 1);
    broker.listeners.message[0]({ type: 'abort', id: 'abort-me' });
    await flushUntil(() => upstreamReturn.mock.calls.length === 1);
    expect(broker.posted).not.toContainEqual({ type: 'done', id: 'abort-me' });
  });

  test('does not persist a late sign-in result after the runtime port disconnects', async () => {
    let resolveSignIn;
    const signIn = jest.fn(() => new Promise((resolve) => (resolveSignIn = resolve)));
    const broker = bootBroker({ signIn });
    await flushUntil(() => broker.posted.some((message) => message.type === 'ready'));
    broker.listeners.message[0]({ type: 'start', id: 'disconnect-auth', prompt: 'question' });
    await flushUntil(() => broker.posted.some((message) => message.type === 'auth-ui' && message.visible));
    broker.click('sign-in');
    expect(signIn).toHaveBeenCalledTimes(1);
    broker.listeners.disconnect[0]();
    // Real auth.signIn() mutates the SDK token immediately before resolving.
    broker.puter.setAuthToken('late-token');
    resolveSignIn({ success: true, token: 'late-token', app_uid: 'late-app' });
    await Promise.resolve();
    await Promise.resolve();

    expect(broker.storage.set).not.toHaveBeenCalled();
    expect(broker.values.has(TOKEN_KEY)).toBe(false);
    expect(broker.values.has(APP_KEY)).toBe(false);
    expect(broker.puter.authToken).toBeNull();
    expect(broker.isolatedGlobal.localStorage.getItem('puter.auth.token')).toBeNull();
    expect(broker.whoami).not.toHaveBeenCalled();
  });

  test('discards an SDK token that resolves after the user cancels sign-in', async () => {
    let resolveSignIn;
    const signIn = jest.fn(() => new Promise((resolve) => (resolveSignIn = resolve)));
    const chat = jest.fn(async () => streamOf('must-not-run'));
    const broker = bootBroker({ signIn, chat });
    await flushUntil(() => broker.posted.some((message) => message.type === 'ready'));
    broker.listeners.message[0]({ type: 'start', id: 'cancel-auth', prompt: 'question' });
    await flushUntil(() => broker.posted.some((message) => message.type === 'auth-ui' && message.visible));
    broker.click('sign-in');
    broker.click('cancel');
    broker.puter.setAuthToken('late-cancelled-token');
    resolveSignIn({ success: true, token: 'late-cancelled-token', app_uid: 'late-app' });
    await flushUntil(() => broker.puter.authToken === null);

    expect(broker.storage.set).not.toHaveBeenCalled();
    expect(broker.values.has(TOKEN_KEY)).toBe(false);
    expect(broker.values.has(APP_KEY)).toBe(false);
    expect(chat).not.toHaveBeenCalled();

    broker.listeners.message[0]({ type: 'start', id: 'after-cancel', prompt: 'question' });
    await flushUntil(
      () => broker.posted.filter((message) => message.type === 'auth-ui' && message.visible).length >= 2,
    );
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(chat).not.toHaveBeenCalled();
    broker.click('cancel');
  });

  test('clears a revoked session and performs exactly one user-driven re-login', async () => {
    const revoked = Object.assign(new Error('raw revoked token detail'), { status: 401, code: 'invalid_token' });
    const chat = jest.fn().mockRejectedValueOnce(revoked).mockResolvedValueOnce(streamOf('recovered'));
    const signIn = jest.fn(async () => ({ success: true, token: 'replacement', app_uid: 'replacement-app' }));
    const broker = bootBroker({
      stored: { [TOKEN_KEY]: 'stale-token', [APP_KEY]: 'stale-app' },
      chat,
      signIn,
    });
    await flushUntil(() => broker.posted.some((message) => message.type === 'ready'));
    broker.puter.resetAuthToken.mockClear();
    broker.listeners.message[0]({ type: 'start', id: 'revoked', prompt: 'question', model: 'claude-haiku-4-5' });
    await flushUntil(() => broker.posted.some((message) => message.type === 'auth-ui' && message.visible));
    expect(broker.values.has(TOKEN_KEY)).toBe(false);
    expect(broker.values.has(APP_KEY)).toBe(false);
    expect(signIn).not.toHaveBeenCalled();

    broker.click('sign-in');
    await flushUntil(() => broker.posted.some((message) => message.type === 'done' && message.id === 'revoked'));
    expect(broker.puter.resetAuthToken).toHaveBeenCalledTimes(1);
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(chat).toHaveBeenCalledTimes(2);
    expect(broker.values.get(TOKEN_KEY)).toBe('replacement');
    expect(broker.values.get(APP_KEY)).toBe('replacement-app');
    expect(broker.posted).toContainEqual({ type: 'chunk', id: 'revoked', text: 'recovered' });
    expect(JSON.stringify(broker.posted)).not.toContain('raw revoked token detail');
    expect(broker.whoami).not.toHaveBeenCalled();
  });

  test('uses model fallback, emits keepalive only while active, and cancels on port disconnect', async () => {
    jest.useFakeTimers();
    let resolveNext;
    const upstreamReturn = jest.fn(async () => {
      resolveNext({ done: true });
      return { done: true };
    });
    const iterator = {
      next: jest.fn(() => new Promise((resolve) => (resolveNext = resolve))),
      return: upstreamReturn,
    };
    const chat = jest
      .fn()
      .mockRejectedValueOnce(new Error('model not found'))
      .mockResolvedValueOnce({ [Symbol.asyncIterator]: () => iterator });
    const broker = bootBroker({ stored: { [TOKEN_KEY]: 'valid' }, chat });
    await jest.advanceTimersByTimeAsync(0);
    expect(broker.posted).toContainEqual({ type: 'ready' });
    jest.advanceTimersByTime(40_000);
    expect(broker.posted.filter((message) => message.type === 'keepalive')).toHaveLength(0);

    broker.listeners.message[0]({ type: 'start', id: 'disconnect', prompt: 'question', model: 'claude-sonnet-4-6' });
    await jest.advanceTimersByTimeAsync(0);
    expect(chat).toHaveBeenNthCalledWith(2, 'question', { model: 'claude-sonnet-4-5', stream: true });
    jest.advanceTimersByTime(20_000);
    expect(broker.posted).toContainEqual({ type: 'keepalive', id: 'disconnect' });
    broker.listeners.disconnect[0]();
    await jest.advanceTimersByTimeAsync(0);
    expect(upstreamReturn).toHaveBeenCalledTimes(1);
    const keepaliveCount = broker.posted.filter((message) => message.type === 'keepalive').length;
    jest.advanceTimersByTime(60_000);
    expect(broker.posted.filter((message) => message.type === 'keepalive')).toHaveLength(keepaliveCount);
  });
});
