/**
 * Unit tests for the extension-only cloud Tutor Port protocol.
 */

/* global describe, test, expect, beforeEach, afterEach, jest */

const fs = require('fs');
const path = require('path');

const ports = [];
function makePort() {
  const messageListeners = [];
  const disconnectListeners = [];
  const port = {
    posted: [],
    closed: false,
    postMessage: jest.fn((msg) => {
      if (port.closed) throw new Error('Attempting to use a disconnected port object');
      port.posted.push(msg);
    }),
    disconnect: jest.fn(() => {
      port.closed = true;
    }),
    onMessage: { addListener: (fn) => messageListeners.push(fn) },
    onDisconnect: { addListener: (fn) => disconnectListeners.push(fn) },
    emitMessage: (msg) => messageListeners.forEach((fn) => fn(msg)),
    emitDisconnect: () => {
      port.closed = true;
      disconnectListeners.forEach((fn) => fn());
    },
  };
  ports.push(port);
  return port;
}

const elements = new Map();
global.chrome = {
  runtime: {
    getURL: (p) => `chrome-extension://test/${p}`,
    connect: jest.fn(() => makePort()),
  },
  storage: { local: { get: jest.fn(async () => ({})) } },
};
global.indexedDB = { open: () => ({ onupgradeneeded: null, onsuccess: null, onerror: null }) };
global.document = {
  getElementById: (id) => elements.get(id) || null,
  createElement: () => {
    const attrs = {};
    const el = {
      style: {},
      setAttribute: (name, value) => {
        attrs[name] = value;
      },
      getAttribute: (name) => attrs[name],
      remove: () => elements.delete(el.id),
    };
    return el;
  },
  documentElement: {
    appendChild: (el) => {
      elements.set(el.id, el);
      return el;
    },
  },
  dispatchEvent: () => {},
};
global.window = { dispatchEvent: () => {} };
global.crypto = { randomUUID: () => 'request-uuid' };

const sharedSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'shared', 'runtime-constants.js'), 'utf8');
const selectorsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'selectors.js'), 'utf8');
const constantsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'constants.js'), 'utf8');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'translator.js'), 'utf8');
const SkilljarTranslator = eval(
  `(function() { ${sharedSrc}; ${selectorsSrc}; ${constantsSrc}; ${src}; return SkilljarTranslator; })()`,
);

async function flushUntil(predicate, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Timed out waiting for translator condition');
}

describe('extension-only cloud Tutor broker', () => {
  let translator;

  beforeEach(() => {
    ports.length = 0;
    elements.clear();
    jest.clearAllMocks();
    translator = new SkilljarTranslator();
  });

  afterEach(() => jest.useRealTimers());

  test('creates a chrome-extension iframe and serializes duplicate connection attempts', async () => {
    const first = translator._ensureCloudBroker();
    const duplicate = translator._ensureCloudBroker();
    expect(duplicate).toBe(first);
    expect(chrome.runtime.connect).toHaveBeenCalledTimes(1);
    const frame = elements.get('__skillbridge_puter_frame__');
    expect(frame.src).toBe('chrome-extension://test/src/bridge/puter-frame.html');
    expect(frame.style.display).toBe('none');
    expect(translator.isReady).toBe(false);

    ports[0].emitMessage({ type: 'ready' });
    await expect(first).resolves.toBeUndefined();
    expect(translator.isReady).toBe(true);
  });

  test('relays prompt/chunks over Port and never uses host window messages', async () => {
    const connecting = translator._ensureCloudBroker();
    ports[0].emitMessage({ type: 'ready' });
    await connecting;
    translator._getAiEngine = jest.fn(async () => 'cloud');

    const chunks = [];
    const result = translator.chatStream('question', 'ko', 'lesson', (delta) => chunks.push(delta));
    await Promise.resolve();
    await Promise.resolve();
    const start = ports[0].posted.find((msg) => msg.type === 'start');
    expect(start).toEqual(expect.objectContaining({ id: 'request-uuid', model: expect.any(String) }));
    expect(start.prompt).toContain('question');
    expect(start).not.toHaveProperty('userMessage');
    expect(start).not.toHaveProperty('systemPrompt');
    expect(start).not.toHaveProperty('token');

    ports[0].emitMessage({ type: 'chunk', id: start.id, text: '안녕' });
    ports[0].emitMessage({ type: 'done', id: start.id });
    await expect(result).resolves.toBe('안녕');
    expect(chunks).toEqual(['안녕']);
  });

  test('lazily reconnects after MV3 Port disconnect and the next cloud chat succeeds', async () => {
    const initial = translator._ensureCloudBroker();
    ports[0].emitMessage({ type: 'ready' });
    await initial;
    ports[0].emitDisconnect();
    expect(translator.isReady).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(ports).toHaveLength(1);

    translator._getAiEngine = jest.fn(async () => 'cloud');
    const result = translator.chatStream('after restart', 'ko', '', null);
    await flushUntil(() => ports.length === 2);
    ports[1].emitMessage({ type: 'ready' });
    await flushUntil(() => ports[1].posted.some((msg) => msg.type === 'start'));
    const start = ports[1].posted.find((msg) => msg.type === 'start');
    expect(start.prompt).toContain('after restart');
    ports[1].emitMessage({ type: 'chunk', id: start.id, text: '복구' });
    ports[1].emitMessage({ type: 'done', id: start.id });
    await expect(result).resolves.toBe('복구');
  });

  test('recovers when postMessage throws even if caller-side onDisconnect never fires', async () => {
    const initial = translator._ensureCloudBroker();
    ports[0].emitMessage({ type: 'ready' });
    await initial;
    ports[0].disconnect(); // Chrome does not guarantee caller-side onDisconnect.
    expect(translator.isReady).toBe(true);

    translator._getAiEngine = jest.fn(async () => 'cloud');
    const result = translator.chatStream('recover thrown post', 'ko', '', null);
    await flushUntil(() => ports.length === 2);
    ports[1].emitMessage({ type: 'ready' });
    await flushUntil(() => ports[1].posted.some((msg) => msg.type === 'start'));
    const start = ports[1].posted.find((msg) => msg.type === 'start');
    ports[1].emitMessage({ type: 'chunk', id: start.id, text: '재전송' });
    ports[1].emitMessage({ type: 'done', id: start.id });
    await expect(result).resolves.toBe('재전송');
  });

  test('does not send a recovered request when it was aborted before reconnect became ready', async () => {
    const initial = translator._ensureCloudBroker();
    ports[0].emitMessage({ type: 'ready' });
    await initial;
    ports[0].disconnect();
    translator._getAiEngine = jest.fn(async () => 'cloud');
    const controller = new AbortController();
    const result = translator.chatStream('abort during reconnect', 'ko', '', null, { signal: controller.signal });
    await flushUntil(() => ports.length === 2);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });

    ports[1].emitMessage({ type: 'ready' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(ports[1].posted.filter((msg) => msg.type === 'start')).toHaveLength(0);
  });

  test('cloud timeout is an idle watchdog rearmed by every chunk', async () => {
    jest.useFakeTimers();
    const connecting = translator._ensureCloudBroker();
    ports[0].emitMessage({ type: 'ready' });
    await connecting;
    translator._getAiEngine = jest.fn(async () => 'cloud');
    const result = translator.chatStream('long stream', 'ko', '', null);
    await Promise.resolve();
    await Promise.resolve();
    const start = ports[0].posted.find((msg) => msg.type === 'start');

    jest.advanceTimersByTime(89_000);
    ports[0].emitMessage({ type: 'chunk', id: start.id, text: 'a' });
    jest.advanceTimersByTime(89_000);
    ports[0].emitMessage({ type: 'chunk', id: start.id, text: 'b' });
    ports[0].emitMessage({ type: 'done', id: start.id });
    await expect(result).resolves.toBe('ab');
    expect(ports[0].posted.filter((msg) => msg.type === 'abort')).toHaveLength(0);
  });

  test('shows the isolated frame only during broker-declared auth UI', async () => {
    const connecting = translator._ensureCloudBroker();
    ports[0].emitMessage({ type: 'ready' });
    await connecting;
    const frame = elements.get('__skillbridge_puter_frame__');
    ports[0].emitMessage({ type: 'auth-ui', visible: true });
    expect(frame.style.display).toBe('block');
    expect(frame.getAttribute('aria-hidden')).toBe('false');
    ports[0].emitMessage({ type: 'auth-ui', visible: false });
    expect(frame.style.display).toBe('none');
  });
});
