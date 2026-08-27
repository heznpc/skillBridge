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

/**
 * A stream shaped like the one the vendored SDK actually returns.
 *
 * dist/bundled/src/bridge/puter.js resolves `ai.chat` with an `async function*`
 * that yields each parsed ndjson line VERBATIM — including the lines carrying
 * an error or a usage limit instead of text — and between lines it is
 * suspended inside `await`, not at a `yield`. Both matter. `streamOf` above is
 * a copy of what the broker assumes it will be handed: every value has `text`,
 * and `return()` always settles. Neither is true of the real thing, so the
 * contract tests below use this instead.
 */
function sdkStream(lines, { stallAfter = Infinity } = {}) {
  const never = new Promise(() => {});
  return (async function* () {
    for (let index = 0; index < lines.length; index += 1) {
      if (index >= stallAfter) await never;
      yield lines[index];
    }
    if (lines.length >= stallAfter) await never;
  })();
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

// The sign-in card used to offer only "sign in" and "cancel". Cancelling threw
// SAFE_AUTH_ERROR and the card came straight back on the next question, so a
// user who does not want a cloud tutor had no way to stop being asked — the
// first dead end a v1.0.1 upgrader meets, on top of an already 25% uninstall
// rate. The card now also persists sb_ai_engine='off', which is the same key
// translator._getAiEngine reads, so the choice actually sticks.
describe('Puter sign-in card — declining has a durable exit', () => {
  const ENGINE_KEY = 'sb_ai_engine';

  test('renders a turn-off action and an on-device hint alongside sign in', async () => {
    const broker = bootBroker({});
    await flushUntil(() => broker.posted.some((message) => message.type === 'ready'));
    broker.listeners.message[0]({ type: 'start', id: 'shape', prompt: 'question' });
    await flushUntil(() => broker.posted.some((message) => message.type === 'auth-ui' && message.visible));

    expect(broker.element('sign-in')).toBeTruthy();
    expect(broker.element('cancel')).toBeTruthy();
    expect(broker.element('disable')).toBeTruthy();
    expect(broker.element('disable').textContent).not.toBe('');

    // The on-device engine needs chrome.permissions.request(), which a content
    // script cannot call, so the card points at the popup rather than shipping a
    // fourth button that cannot finish the job. That pointer is the only way a
    // user learns the local engine exists without opening the popup first.
    const hint = broker.isolatedGlobal.document.created.find((node) => node.className === 'hint');
    expect(hint).toBeTruthy();
    expect(hint.textContent).toContain('device');
    broker.click('cancel');
  });

  test('turning the tutor off persists the preference and answers with that reason', async () => {
    const chat = jest.fn(async () => streamOf('must-not-run'));
    const broker = bootBroker({ chat });
    await flushUntil(() => broker.posted.some((message) => message.type === 'ready'));
    broker.listeners.message[0]({
      type: 'start',
      id: 'turn-off',
      prompt: 'question',
      labels: { off: 'Tutor is off. Re-enable it from the popup.' },
    });
    await flushUntil(() => broker.posted.some((message) => message.type === 'auth-ui' && message.visible));

    broker.click('disable');
    await flushUntil(() => broker.posted.some((message) => message.type === 'error' && message.id === 'turn-off'));

    expect(broker.values.get(ENGINE_KEY)).toBe('off');
    const error = broker.posted.find((message) => message.type === 'error' && message.id === 'turn-off');
    // Not the generic sign-in-required string: the reply must be about the
    // choice the user just made.
    expect(error.error).toBe('Tutor is off. Re-enable it from the popup.');
    expect(chat).not.toHaveBeenCalled();
    // No session was ever authenticated, so nothing may have been stored.
    expect(broker.values.has(TOKEN_KEY)).toBe(false);
  });

  test('a failed preference write does not claim the tutor is off', async () => {
    const broker = bootBroker({});
    await flushUntil(() => broker.posted.some((message) => message.type === 'ready'));
    broker.storage.set.mockRejectedValueOnce(new Error('storage backend gone'));
    broker.listeners.message[0]({
      type: 'start',
      id: 'write-fails',
      prompt: 'question',
      labels: { off: 'Tutor is off.', error: 'Could not save that.' },
    });
    await flushUntil(() => broker.posted.some((message) => message.type === 'auth-ui' && message.visible));

    broker.click('disable');
    await flushUntil(() => broker.element('disable')?.disabled === false);

    expect(broker.values.has(ENGINE_KEY)).toBe(false);
    // The gate stays open — reporting "off" while the preference is still
    // 'cloud' would send the next question straight back to Puter.
    expect(broker.posted.some((message) => message.type === 'error' && message.id === 'write-fails')).toBe(false);
    broker.click('cancel');
  });

  test('cancel still reports sign-in required, not the turned-off reason', async () => {
    const broker = bootBroker({});
    await flushUntil(() => broker.posted.some((message) => message.type === 'ready'));
    broker.listeners.message[0]({
      type: 'start',
      id: 'plain-cancel',
      prompt: 'question',
      labels: { off: 'Tutor is off.' },
    });
    await flushUntil(() => broker.posted.some((message) => message.type === 'auth-ui' && message.visible));

    broker.click('cancel');
    await flushUntil(() => broker.posted.some((message) => message.type === 'error' && message.id === 'plain-cancel'));

    const error = broker.posted.find((message) => message.type === 'error' && message.id === 'plain-cancel');
    expect(error.error).not.toBe('Tutor is off.');
    expect(broker.values.has(ENGINE_KEY)).toBe(false);
  });

  test('a later gate does not inherit the previous turn-off outcome', async () => {
    const broker = bootBroker({});
    await flushUntil(() => broker.posted.some((message) => message.type === 'ready'));
    broker.listeners.message[0]({
      type: 'start',
      id: 'first-off',
      prompt: 'question',
      labels: { off: 'Tutor is off.' },
    });
    await flushUntil(() => broker.posted.some((message) => message.type === 'auth-ui' && message.visible));
    broker.click('disable');
    await flushUntil(() => broker.posted.some((message) => message.type === 'error' && message.id === 'first-off'));

    broker.listeners.message[0]({
      type: 'start',
      id: 'second-cancel',
      prompt: 'question',
      labels: { off: 'Tutor is off.' },
    });
    await flushUntil(
      () => broker.posted.filter((message) => message.type === 'auth-ui' && message.visible).length >= 2,
    );
    broker.click('cancel');
    await flushUntil(() => broker.posted.some((message) => message.type === 'error' && message.id === 'second-cancel'));

    const error = broker.posted.find((message) => message.type === 'error' && message.id === 'second-cancel');
    expect(error.error).not.toBe('Tutor is off.');
  });
});

// What `ai.chat` actually hands back, read off the vendored SDK rather than
// assumed. Its ndjson generator yields whatever line the server sent: a text
// line, an `{error: {...}}` line, or a `{metadata: {usage_limited: true}}`
// line. And because it sits in `await` between lines, `return()` on a stalled
// stream cannot settle until the response moves again — which is precisely
// what the idle watchdog exists to handle.
describe('Puter SDK stream contract', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.useRealTimers());

  const startAndRun = async (chat, id = 'sdk') => {
    const broker = bootBroker({ stored: { [TOKEN_KEY]: 'valid' }, chat });
    await flushUntil(() => broker.posted.some((message) => message.type === 'ready'));
    broker.listeners.message[0]({ type: 'start', id, prompt: 'question' });
    return broker;
  };

  test('a text stream still streams', async () => {
    // The shape the fix must not break, stated in the SDK's own terms.
    const chat = jest.fn(async () => sdkStream([{ text: 'Hel' }, { text: 'lo' }]));
    const broker = await startAndRun(chat);
    await flushUntil(() => broker.posted.some((message) => message.type === 'done'));
    expect(broker.posted.filter((m) => m.type === 'chunk').map((m) => m.text)).toEqual(['Hel', 'lo']);
  });

  test('a line with neither text nor an error is skipped, not treated as a failure', async () => {
    // Trailing usage/finish metadata is normal and must not read as an error.
    const chat = jest.fn(async () => sdkStream([{ text: 'hi' }, { usage: { tokens: 4 }, finish_reason: 'stop' }]));
    const broker = await startAndRun(chat);
    await flushUntil(() => broker.posted.some((message) => message.type === 'done'));
    expect(broker.posted).not.toContainEqual(expect.objectContaining({ type: 'error' }));
  });

  test('an error line is reported as an error, not as an answer with no text', async () => {
    // The line the SDK yields when a free account runs out. It has no `text`,
    // so skipping it ended the stream with `done` and no chunks — which the
    // Tutor client renders as the model having replied "No response".
    const chat = jest.fn(async () =>
      sdkStream([{ error: { code: 'insufficient_funds', message: 'Not enough funds' } }]),
    );
    const broker = await startAndRun(chat, 'funds');
    await flushUntil(() => broker.posted.some((message) => message.type === 'error'));
    expect(broker.posted).toContainEqual({ type: 'error', id: 'funds', error: 'Puter chat unavailable' });
    expect(broker.posted).not.toContainEqual({ type: 'done', id: 'funds' });
  });

  test('a usage-limit line is reported too', async () => {
    const chat = jest.fn(async () => sdkStream([{ metadata: { usage_limited: true } }]));
    const broker = await startAndRun(chat, 'limit');
    await flushUntil(() => broker.posted.some((message) => message.type === 'error'));
    expect(broker.posted).toContainEqual({ type: 'error', id: 'limit', error: 'Puter chat unavailable' });
  });

  test('a token revoked mid-stream is reported as sign-in required', async () => {
    // Revocation arriving as a line rather than a rejection is the one case
    // the pre-call recovery path cannot see.
    const chat = jest.fn(async () => sdkStream([{ text: 'partial' }, { error: { code: 'token_auth_failed' } }]));
    const broker = await startAndRun(chat, 'revoked');
    await flushUntil(() => broker.posted.some((message) => message.type === 'error'));
    expect(broker.posted).toContainEqual({
      type: 'error',
      id: 'revoked',
      error: 'Puter sign-in required — the AI tutor needs a free Puter session.',
    });
    expect(broker.posted).toContainEqual({ type: 'chunk', id: 'revoked', text: 'partial' });
  });

  test('an idle stream reports its own timeout instead of waiting on a return that cannot settle', async () => {
    // The generator is suspended in `await`, so `return()` is queued behind a
    // response that has stopped arriving. Awaiting it before reporting meant
    // the watchdog fired, the keepalives stopped, and the reason never
    // reached the client — which then had to wait out its own idle timeout.
    jest.useFakeTimers();
    const stream = sdkStream([], { stallAfter: 0 });
    const chat = jest.fn(async () => stream);
    const broker = bootBroker({ stored: { [TOKEN_KEY]: 'valid' }, chat });
    await jest.advanceTimersByTimeAsync(0);
    broker.listeners.message[0]({ type: 'start', id: 'stalled', prompt: 'question' });
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(90_000);
    expect(broker.posted).toContainEqual({ type: 'error', id: 'stalled', error: 'Puter stream timed out' });
  });
  test('an oversized response is cut off and reported, not streamed on', async () => {
    // 200k chars is the cap, and the chunk that crosses it is dropped whole
    // rather than truncated. The stream is stopped mid-flight, so this is the
    // one cancellation that happens while the generator is suspended at a
    // `yield` rather than inside `await`.
    const big = 'x'.repeat(150_000);
    const chat = jest.fn(async () => sdkStream([{ text: big }, { text: big }, { text: 'never' }]));
    const broker = await startAndRun(chat, 'big');
    await flushUntil(() => broker.posted.some((message) => message.type === 'error'));
    expect(broker.posted).toContainEqual({
      type: 'error',
      id: 'big',
      error: 'Response exceeds 200000 chars',
    });
    expect(broker.posted.filter((m) => m.type === 'chunk')).toHaveLength(1);
    expect(broker.posted).not.toContainEqual({ type: 'done', id: 'big' });
  });

  test('a non-streaming answer is refused rather than delivered as an empty one', async () => {
    // What the SDK resolves when the response is not ndjson: the completion
    // object, with the toString/valueOf shims its transform adds. The broker
    // requires a stream, and the boundary is pinned here so a change to that
    // is a decision rather than an accident — an unrecognised success must
    // still surface as a failure, never as a silent no-answer.
    const completion = { index: 0, message: { role: 'assistant', content: 'whole answer' } };
    completion.toString = () => completion.message.content;
    const chat = jest.fn(async () => completion);
    const broker = await startAndRun(chat, 'nonstream');
    await flushUntil(() => broker.posted.some((message) => message.type === 'error'));
    expect(broker.posted).toContainEqual({ type: 'error', id: 'nonstream', error: 'Puter chat unavailable' });
    expect(broker.posted).not.toContainEqual({ type: 'done', id: 'nonstream' });
  });
});
