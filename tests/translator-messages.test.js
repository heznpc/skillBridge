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
    global.__SKILLBRIDGE_ENSURE_PUTER_BROKER__ = jest.fn(() => true);
    translator = new SkilljarTranslator();
  });

  afterEach(() => jest.useRealTimers());

  test('connects to the isolated broker without page DOM transport and serializes duplicate attempts', async () => {
    const first = translator._ensureCloudBroker();
    const duplicate = translator._ensureCloudBroker();
    expect(duplicate).toBe(first);
    expect(chrome.runtime.connect).toHaveBeenCalledTimes(1);
    expect(global.__SKILLBRIDGE_ENSURE_PUTER_BROKER__).toHaveBeenCalledTimes(1);
    expect(elements.has('__skillbridge_puter_frame__')).toBe(false);
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
    expect(start.labels.error).toBeTruthy();
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
    expect(global.__SKILLBRIDGE_ENSURE_PUTER_BROKER__).toHaveBeenCalledTimes(2);
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

  test('ignores broker-internal auth UI messages without mutating the host DOM', async () => {
    const connecting = translator._ensureCloudBroker();
    ports[0].emitMessage({ type: 'ready' });
    await connecting;
    ports[0].emitMessage({ type: 'auth-ui', visible: true });
    ports[0].emitMessage({ type: 'auth-ui', visible: false });
    expect(elements.has('__skillbridge_puter_frame__')).toBe(false);
  });
});

// ============================================================
// BRAND-TERM MASKING WIRING (source contract)
// ============================================================
//
// The masking itself is behaviourally tested in protected-terms.test.js; these
// assertions pin that the GT senders actually route through it. Sending an
// unmasked payload is the exact defect this fixes, and it is invisible in any
// output-shape assertion — the request simply carries the brand name again.
describe('Google Translate senders mask protected terms', () => {
  const fs = require('fs');
  const path = require('path');
  const trSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'translator.js'), 'utf8');
  const single = trSrc.slice(trSrc.indexOf('async googleTranslate('), trSrc.indexOf('async googleTranslateBatch('));
  const batch = trSrc.slice(trSrc.indexOf('async googleTranslateBatch('));

  // The whole mask object is passed, not just `mask.tokens`: unmasking also
  // needs the delimiter counts the SOURCE contributed, so it can tell our
  // leaked placeholder from a lesson's own ⟦ ⟧ notation.
  test('single-text sender masks before send and unmasks after', () => {
    expect(single).toContain('pt.maskProtectedTerms(text.trim())');
    expect(single).toContain('text: masked?.tokens.length ? masked.text : text.trim()');
    expect(single).toContain('pt.unmaskProtectedTerms(response.translated, masked)');
  });

  test('batch sender masks per text and unmasks positionally', () => {
    expect(batch).toContain('trimmed.map((t) => pt.maskProtectedTerms(t))');
    expect(batch).toContain('masks.map((m, i) => (m.tokens.length ? m.text : trimmed[i]))');
    expect(batch).toContain('pt.unmaskProtectedTerms(translated, masks[i]) ?? texts[i]');
  });

  test('batch falls back to the source text when unmasking fails', () => {
    // applyGoogleTranslations skips entries equal to their source, so the
    // block stays English rather than rendering a placeholder or a mangled
    // brand — the failure mode this whole change exists to prevent.
    expect(batch).toContain('?? texts[i]');
  });
});
