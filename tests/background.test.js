/**
 * Unit tests for background.js pure functions.
 *
 * Tests: gtLangCode, parseGTResponse
 */

/* global describe, test, expect, beforeEach, afterEach, jest */

const fs = require('fs');
const path = require('path');

const runtimeMessageListeners = [];

// Minimal chrome mock for background.js
global.chrome = {
  runtime: { id: 'test', getManifest: () => ({ version: '1.0.0' }), getURL: (p) => p },
  alarms: { create: () => {}, onAlarm: { addListener: () => {} } },
  action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
  storage: { local: { set: () => {} }, onChanged: { addListener: () => {} } },
  tabs: { query: () => Promise.resolve([]) },
};
global.chrome.runtime.onInstalled = { addListener: () => {} };
global.chrome.runtime.onMessage = { addListener: (fn) => runtimeMessageListeners.push(fn) };

const sharedSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'shared', 'runtime-constants.js'), 'utf8');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'background', 'background.js'), 'utf8');
const originalSetTimeout = setTimeout;
const originalClearTimeout = clearTimeout;
let timerDelegate = (...args) => originalSetTimeout(...args);
let clearTimerDelegate = (...args) => originalClearTimeout(...args);

// Extract pure functions via eval
const fns = new Function(
  'setTimer',
  'clearTimer',
  `
  const setTimeout = (...args) => setTimer(...args);
	  const clearTimeout = (...args) => clearTimer(...args);
	  ${sharedSrc}
	  ${src}
  return {
    gtLangCode, parseGTResponse, _rateLimiter, fetchWithRetry,
    registerAlarms, _gtFetchDedup, _inflightGT, _gtKey,
    _isPuterBrokerPort, _isAllowedCloudClient, _registerCloudBroker, _registerCloudClient,
    _cloudBrokers, _cloudClients, _cloudActive,
    _isTrustedTutorOrigin, _isLocalChatPort, _isLocalRefinementPort,
  };
`,
)(
  (...args) => timerDelegate(...args),
  (...args) => clearTimerDelegate(...args),
);

const {
  _isTrustedTutorOrigin,
  gtLangCode,
  parseGTResponse,
  _rateLimiter,
  fetchWithRetry,
  registerAlarms,
  _gtFetchDedup,
  _inflightGT,
  _gtKey,
  _isPuterBrokerPort,
  _isAllowedCloudClient,
  _isLocalChatPort,
  _isLocalRefinementPort,
  _registerCloudBroker,
  _registerCloudClient,
  _cloudBrokers,
  _cloudClients,
  _cloudActive,
} = fns;

// ── Tests ──────────────────────────────────────────────────────

describe('gtLangCode', () => {
  test('maps zh-CN to zh-CN', () => {
    expect(gtLangCode('zh-CN')).toBe('zh-CN');
  });

  test('maps zh-TW to zh-TW', () => {
    expect(gtLangCode('zh-TW')).toBe('zh-TW');
  });

  test('maps pt-BR to pt', () => {
    expect(gtLangCode('pt-BR')).toBe('pt');
  });

  test('passes through unmapped codes', () => {
    expect(gtLangCode('ko')).toBe('ko');
    expect(gtLangCode('ja')).toBe('ja');
    expect(gtLangCode('en')).toBe('en');
  });
});

describe('parseGTResponse', () => {
  test('extracts translated text from GT response format', () => {
    const data = [
      [
        ['안녕하세요', 'Hello'],
        ['세계', 'World'],
      ],
    ];
    expect(parseGTResponse(data, 'fallback')).toBe('안녕하세요세계');
  });

  test('returns fallback for null data', () => {
    expect(parseGTResponse(null, 'fallback')).toBe('fallback');
  });

  test('returns fallback for empty data', () => {
    expect(parseGTResponse([], 'fallback')).toBe('fallback');
  });

  test('returns fallback when data[0] is null', () => {
    expect(parseGTResponse([null], 'fallback')).toBe('fallback');
  });

  test('handles segments with null first element', () => {
    const data = [
      [
        [null, 'Hello'],
        ['test', 'Test'],
      ],
    ];
    expect(parseGTResponse(data, 'fallback')).toBe('test');
  });

  test('returns fallback for empty translation', () => {
    const data = [[[null], [null]]];
    expect(parseGTResponse(data, 'fallback')).toBe('fallback');
  });

  // ── M-6 regression guards (2nd-pass audit 2026-05-21) ──
  // Without the typeof === 'string' check, parseGTResponse silently
  // concatenated `[object Object]` into the translation and cached it
  // for the 30-day TTL when GT returned an unexpected segment shape.
  test('returns fallback when data[0] is not an array (object wrapper)', () => {
    expect(parseGTResponse([{ unexpected: 'shape' }], 'fallback')).toBe('fallback');
    expect(parseGTResponse(['string-where-array-expected'], 'fallback')).toBe('fallback');
  });

  test('skips segments whose first element is an object (no [object Object] poisoning)', () => {
    const data = [
      [
        ['valid', 'V'],
        [{ nested: 'thing' }, 'X'],
        ['more', 'M'],
      ],
    ];
    expect(parseGTResponse(data, 'fallback')).toBe('validmore');
  });

  test('skips segments that are not arrays at all', () => {
    const data = [['valid', null, 'not-an-array', ['more']]];
    expect(parseGTResponse(data, 'fallback')).toBe('more');
  });

  test('skips segments where first element is a number (defensive)', () => {
    const data = [
      [
        ['valid', 'V'],
        [42, 'X'],
      ],
    ];
    expect(parseGTResponse(data, 'fallback')).toBe('valid');
  });
});

// ── M-4 regression guards: in-flight GT deduplication ──
// Without dedup, 10 simultaneous identical translate calls each consumed
// a rate-limit slot AND a real GT fetch, multiplying 429-risk for no
// benefit. The Map keyed on `text+sl+tl` is the chokepoint.
describe('_gtFetchDedup — in-flight dedup', () => {
  let originalFetch;
  beforeEach(() => {
    originalFetch = global.fetch;
    _inflightGT.clear();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    _inflightGT.clear();
  });

  test('shares a single network request for concurrent identical calls', async () => {
    let resolveFetch;
    let fetchCallCount = 0;
    global.fetch = jest.fn(() => {
      fetchCallCount++;
      return new Promise((resolve) => {
        resolveFetch = () => resolve({ ok: true, json: async () => [[['translated', 'src']]] });
      });
    });

    const p1 = _gtFetchDedup('hello', 'ko', 'en');
    const p2 = _gtFetchDedup('hello', 'ko', 'en');
    const p3 = _gtFetchDedup('hello', 'ko', 'en');

    // Synchronous check — fetch is called in the same tick as _gtFetchDedup
    expect(fetchCallCount).toBe(1);
    // Flush microtasks too — audit sweep #8: a future refactor that
    // defers the fetch into a microtask would leave fetchCallCount at 0
    // here and the synchronous assertion above would falsely still
    // pass. After awaiting a microtask we re-assert.
    await Promise.resolve();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    resolveFetch();

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1).toBe('translated');
    expect(r2).toBe('translated');
    expect(r3).toBe('translated');
    expect(fetchCallCount).toBe(1);
  });

  test('different keys (different text) do NOT share a request', async () => {
    let fetchCallCount = 0;
    global.fetch = jest.fn(() => {
      fetchCallCount++;
      return Promise.resolve({ ok: true, json: async () => [[['x', 'y']]] });
    });

    await Promise.all([_gtFetchDedup('a', 'ko', 'en'), _gtFetchDedup('b', 'ko', 'en')]);
    expect(fetchCallCount).toBe(2);
  });

  test('different targetLang does NOT share a request (key includes tl)', async () => {
    let fetchCallCount = 0;
    global.fetch = jest.fn(() => {
      fetchCallCount++;
      return Promise.resolve({ ok: true, json: async () => [[['x', 'y']]] });
    });

    await Promise.all([_gtFetchDedup('hello', 'ko', 'en'), _gtFetchDedup('hello', 'ja', 'en')]);
    expect(fetchCallCount).toBe(2);
  });

  test('map entry is deleted after success so the next call re-fetches', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: async () => [[['x', 'y']]] }));

    await _gtFetchDedup('hello', 'ko', 'en');
    expect(_inflightGT.has(_gtKey('hello', 'ko', 'en'))).toBe(false);
    global.fetch.mockClear();

    await _gtFetchDedup('hello', 'ko', 'en');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('map entry is deleted after failure too (no zombie blocking)', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('network')));

    await expect(_gtFetchDedup('hello', 'ko', 'en')).rejects.toThrow();
    expect(_inflightGT.has(_gtKey('hello', 'ko', 'en'))).toBe(false);
  });

  test('_gtKey distinguishes sourceLang too', () => {
    expect(_gtKey('hello', 'ko', 'en')).not.toBe(_gtKey('hello', 'ko', 'auto'));
  });

  // ── Audit V14 + GT hang fix: `fetch` has no built-in timeout, so before the
  //    per-attempt AbortController existed a black-holed request left the whole
  //    GT pipeline pending forever. These tests assert the request is really
  //    CANCELLED — the previous version only checked that the dedup map entry
  //    disappeared, which let a hung fetch survive as "expected" behaviour.
  test('timeout constants pinned, and a full retry chain fits inside the TTL', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'src', 'background', 'background.js'),
      'utf8',
    );
    const num = (name) => {
      const m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*([\\d_]+)\\s*;`));
      expect(m).not.toBeNull();
      return Number(m[1].replace(/_/g, ''));
    };
    const attempt = num('_GT_ATTEMPT_TIMEOUT_MS');
    const ttl = num('_GT_INFLIGHT_TTL_MS');
    expect(attempt).toBe(6_000);
    expect(ttl).toBe(30_000);
    // 4 attempts (maxRetries 3) plus exponential backoff of 500+1000+2000ms.
    // The TTL is a backstop for when aborting itself fails, so it must sit
    // OUTSIDE the normal chain — otherwise it would cut healthy retries short.
    expect(attempt * 4 + 3_500).toBeLessThan(ttl);
  });

  test('a hung attempt is aborted and the chain retries to success', async () => {
    jest.useFakeTimers();
    timerDelegate = (...args) => setTimeout(...args);
    clearTimerDelegate = (...args) => clearTimeout(...args);
    try {
      const signals = [];
      global.fetch = jest.fn((url, opts) => {
        signals.push(opts.signal);
        // First attempt black-holes until something aborts it; second succeeds.
        if (signals.length === 1) {
          return new Promise((_res, rej) => opts.signal.addEventListener('abort', () => rej(opts.signal.reason)));
        }
        return Promise.resolve({ ok: true, status: 200 });
      });

      const p = fetchWithRetry('https://gt.test', {}, 3, 500);
      await jest.advanceTimersByTimeAsync(6_000);
      // The load-bearing assertion: the hung request was actually cancelled.
      expect(signals[0].aborted).toBe(true);
      expect(String(signals[0].reason?.message)).toMatch(/timed out/);

      await jest.advanceTimersByTimeAsync(1_000); // backoff
      await expect(p).resolves.toMatchObject({ ok: true });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    } finally {
      timerDelegate = (...args) => originalSetTimeout(...args);
      clearTimerDelegate = (...args) => originalClearTimeout(...args);
      jest.useRealTimers();
    }
  });

  test('every attempt timing out rejects instead of hanging', async () => {
    jest.useFakeTimers();
    timerDelegate = (...args) => setTimeout(...args);
    clearTimerDelegate = (...args) => clearTimeout(...args);
    try {
      global.fetch = jest.fn(
        (url, opts) => new Promise((_res, rej) => opts.signal.addEventListener('abort', () => rej(opts.signal.reason))),
      );
      const p = fetchWithRetry('https://gt.test', {}, 3, 500);
      p.catch(() => {}); // keep the rejection handled while timers advance
      await jest.advanceTimersByTimeAsync(60_000);
      await expect(p).rejects.toThrow(/timed out/);
      expect(global.fetch).toHaveBeenCalledTimes(4); // maxRetries 3 => 4 attempts
    } finally {
      timerDelegate = (...args) => originalSetTimeout(...args);
      clearTimerDelegate = (...args) => originalClearTimeout(...args);
      jest.useRealTimers();
    }
  });

  test('TTL aborts the in-flight request, not just the dedup entry', async () => {
    jest.useFakeTimers();
    timerDelegate = (...args) => setTimeout(...args);
    clearTimerDelegate = (...args) => clearTimeout(...args);
    try {
      const signals = [];
      // A fetch that ignores its abort signal — the backstop case the TTL
      // exists for. The per-attempt abort fires but cannot end the operation,
      // so the TTL must both evict the key AND signal cancellation downstream.
      global.fetch = jest.fn((url, opts) => {
        signals.push(opts.signal);
        return new Promise(() => {});
      });

      const p = _gtFetchDedup('hung-key', 'ko', 'en');
      p.catch(() => {});
      expect(_inflightGT.has(_gtKey('hung-key', 'ko', 'en'))).toBe(true);

      await jest.advanceTimersByTimeAsync(31_000);

      expect(_inflightGT.has(_gtKey('hung-key', 'ko', 'en'))).toBe(false);
      expect(signals[0].aborted).toBe(true);
    } finally {
      timerDelegate = (...args) => originalSetTimeout(...args);
      clearTimerDelegate = (...args) => originalClearTimeout(...args);
      jest.useRealTimers();
    }
  });
});

// ── Rate Limiter Tests ────────────────────────────────────────

describe('_rateLimiter', () => {
  beforeEach(() => {
    _rateLimiter.timestamps = [];
    _rateLimiter.maxPerMin = 120;
  });

  test('allows requests under the limit', () => {
    expect(_rateLimiter.check()).toBe(true);
    expect(_rateLimiter.timestamps.length).toBe(1);
  });

  test('allows multiple requests under the limit', () => {
    for (let i = 0; i < 10; i++) {
      expect(_rateLimiter.check()).toBe(true);
    }
    expect(_rateLimiter.timestamps.length).toBe(10);
  });

  test('blocks requests at the limit', () => {
    _rateLimiter.maxPerMin = 3;
    expect(_rateLimiter.check()).toBe(true);
    expect(_rateLimiter.check()).toBe(true);
    expect(_rateLimiter.check()).toBe(true);
    expect(_rateLimiter.check()).toBe(false);
  });

  test('evicts timestamps older than 60 seconds', () => {
    const now = Date.now();
    _rateLimiter.timestamps = [now - 61000, now - 62000, now - 100];
    _rateLimiter.maxPerMin = 3;
    expect(_rateLimiter.check()).toBe(true);
    // Old timestamps should be evicted, only recent one + new one remain
    expect(_rateLimiter.timestamps.length).toBe(2);
  });

  test('recovers after time window passes', () => {
    _rateLimiter.maxPerMin = 2;
    expect(_rateLimiter.check()).toBe(true);
    expect(_rateLimiter.check()).toBe(true);
    expect(_rateLimiter.check()).toBe(false);
    // Simulate time passing by clearing old timestamps
    _rateLimiter.timestamps = [];
    expect(_rateLimiter.check()).toBe(true);
  });
});

// ── fetchWithRetry Tests ──────────────────────────────────────

describe('fetchWithRetry', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('returns response on first successful attempt', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    const resp = await fetchWithRetry('https://example.com', {}, 3, 10);
    expect(resp.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('retries on server error and succeeds', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    const resp = await fetchWithRetry('https://example.com', {}, 3, 10);
    expect(resp.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('retries on 429 rate limit', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    const resp = await fetchWithRetry('https://example.com', {}, 3, 10);
    expect(resp.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  // Non-retryable client errors must fail on the first attempt. Retrying
  // a 4xx just looks abusive to the upstream API and risks a hard block.
  test.each([[400], [403], [404]])('does not retry on %i client error', async (status) => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status });
    await expect(fetchWithRetry('https://example.com', {}, 3, 10)).rejects.toThrow(`HTTP ${status}`);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('throws after max retries exhausted', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(fetchWithRetry('https://example.com', {}, 2, 10)).rejects.toThrow('HTTP 500');
    expect(global.fetch).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  test('retries on network error', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('Network failed'))
      .mockResolvedValueOnce({ ok: true, status: 200 });
    const resp = await fetchWithRetry('https://example.com', {}, 3, 10);
    expect(resp.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('throws network error after max retries', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network failed'));
    await expect(fetchWithRetry('https://example.com', {}, 1, 10)).rejects.toThrow('Network failed');
    expect(global.fetch).toHaveBeenCalledTimes(2); // initial + 1 retry
  });
});

// ── registerAlarms Tests ──────────────────────────────────────

describe('registerAlarms', () => {
  test('registers only the cache-cleanup alarm', () => {
    const created = [];
    chrome.alarms.create = (name, opts) => created.push({ name, ...opts });
    chrome.alarms.clear = () => {};
    registerAlarms();
    expect(created).toEqual([{ name: 'cache-cleanup', periodInMinutes: 1440 }]);
  });

  // Chrome persists alarms across extension updates, so every user upgrading
  // from a build that registered the weekly GitHub Releases poll still carries
  // it. Without this the retired alarm keeps firing for the life of the install,
  // reaching for a host permission the manifest no longer requests.
  test('clears the retired version-check alarm left behind by an upgrade', () => {
    const cleared = [];
    chrome.alarms.create = () => {};
    chrome.alarms.clear = (name) => cleared.push(name);
    registerAlarms();
    expect(cleared).toEqual(['version-check']);
  });
});

describe('runtime message dispatch — GOOGLE_TRANSLATE rate-limit path', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    _inflightGT.clear();
    _rateLimiter.timestamps = [];
    _rateLimiter.maxPerMin = 120;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    _inflightGT.clear();
    _rateLimiter.timestamps = [];
    _rateLimiter.maxPerMin = 120;
  });

  test('registered listener returns a rate-limit response before any GT fetch', () => {
    const listener = runtimeMessageListeners[runtimeMessageListeners.length - 1];
    expect(typeof listener).toBe('function');
    global.fetch = jest.fn();
    _rateLimiter.maxPerMin = 0;
    const sendResponse = jest.fn();

    const keepAlive = listener(
      { type: 'GOOGLE_TRANSLATE', text: 'Hello', targetLang: 'ko', sourceLang: 'en' },
      { id: 'test' },
      sendResponse,
    );

    expect(keepAlive).toBe(true);
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'Rate limit exceeded' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('registered listener ignores messages from other extension senders', () => {
    const listener = runtimeMessageListeners[runtimeMessageListeners.length - 1];
    const sendResponse = jest.fn();

    const keepAlive = listener(
      { type: 'GOOGLE_TRANSLATE', text: 'Hello', targetLang: 'ko', sourceLang: 'en' },
      { id: 'other-extension' },
      sendResponse,
    );

    expect(keepAlive).toBeUndefined();
    expect(sendResponse).not.toHaveBeenCalled();
  });
});

// Review finding: lesson text was sent in the Google Translate URL's `q=`
// query string. CWS guidance is to keep user data out of URLs, and since v4
// sends whole HTML blocks the query also overruns practical URL length
// limits. Verified live 2026-07-27 that the endpoint accepts POST with a
// form-encoded `q` and returns the identical response shape.
describe('Google Translate request shape', () => {
  let originalFetch;
  beforeEach(() => {
    originalFetch = global.fetch;
    _inflightGT.clear();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    _inflightGT.clear();
  });

  test('sends the text in the POST body, never in the URL', async () => {
    let seen = null;
    global.fetch = jest.fn((url, opts) => {
      seen = { url, opts };
      return Promise.resolve({ ok: true, json: async () => [[['t', 's']]] });
    });

    const secret = 'Lesson body with <a href="/private/path">a link</a>';
    await _gtFetchDedup(secret, 'ko', 'en');

    expect(seen.opts.method).toBe('POST');
    expect(seen.opts.headers['Content-Type']).toMatch(/application\/x-www-form-urlencoded/);
    // The URL keeps only the non-sensitive routing parameters.
    expect(seen.url).not.toContain('q=');
    expect(seen.url).not.toContain('private');
    expect(seen.url).toContain('client=gtx');
    expect(seen.url).toContain('tl=ko');
    // ...and the text travels in the body, correctly encoded.
    expect(new URLSearchParams(seen.opts.body).get('q')).toBe(secret);
  });

  test('a multi-kB HTML block that would overrun a URL is still sent whole', async () => {
    let body = null;
    global.fetch = jest.fn((_url, opts) => {
      body = opts.body;
      return Promise.resolve({ ok: true, json: async () => [[['t', 's']]] });
    });

    const block = '<p>See <a href="/docs">the documentation</a> for details.</p> '.repeat(60);
    expect(block.length).toBeGreaterThan(3000);
    await _gtFetchDedup(block, 'ko', 'en');

    expect(new URLSearchParams(body).get('q')).toBe(block);
  });
});

function brokerPort({
  name,
  url,
  tabId = 7,
  frameId = 0,
  id = 'test',
  documentId = `document-${tabId}`,
  documentLifecycle = 'active',
}) {
  const messageListeners = [];
  const disconnectListeners = [];
  const port = {
    name,
    sender: { id, url, frameId, documentId, documentLifecycle, tab: { id: tabId, url } },
    posted: [],
    disconnected: false,
    postMessage: jest.fn((msg) => port.posted.push(msg)),
    disconnect: jest.fn(() => {
      port.disconnected = true;
      disconnectListeners.forEach((fn) => fn());
    }),
    onMessage: { addListener: (fn) => messageListeners.push(fn) },
    onDisconnect: { addListener: (fn) => disconnectListeners.push(fn) },
    emitMessage: (msg) => messageListeners.forEach((fn) => fn(msg)),
  };
  return port;
}

describe('isolated cloud broker replacement', () => {
  beforeEach(() => {
    _cloudBrokers.clear();
    _cloudClients.clear();
    _cloudActive.clear();
  });

  test('aborts and deterministically fails active requests before replacing a broker', () => {
    const client = brokerPort({
      name: 'sb-cloud-chat-client',
      url: 'https://anthropic.skilljar.com/lesson',
    });
    const firstFrame = brokerPort({
      name: 'sb-puter-content',
      url: 'https://anthropic.skilljar.com/lesson',
    });
    _registerCloudClient(client);
    _registerCloudBroker(firstFrame);
    firstFrame.emitMessage({ type: 'ready' });
    client.emitMessage({ type: 'start', id: 'active', prompt: 'hello', model: 'claude-sonnet-4-6' });
    expect(_cloudActive.size).toBe(1);
    const clientMessagesBeforeHeartbeat = client.posted.length;
    // A keepalive on an actually active request is relayed so the client can
    // rearm its idle watchdog through a long sign-in; a stale/forged id is
    // dropped and never reaches any client.
    firstFrame.emitMessage({ type: 'keepalive', id: 'active' });
    firstFrame.emitMessage({ type: 'keepalive', id: 'stale-id' });
    expect(_cloudActive.size).toBe(1);
    expect(client.posted).toHaveLength(clientMessagesBeforeHeartbeat + 1);
    expect(client.posted).toContainEqual({ type: 'keepalive', id: 'active' });
    expect(client.posted).not.toContainEqual({ type: 'keepalive', id: 'stale-id' });

    const replacement = brokerPort({
      name: 'sb-puter-content',
      url: 'https://anthropic.skilljar.com/lesson',
    });
    _registerCloudBroker(replacement);

    expect(firstFrame.posted).toContainEqual({ type: 'abort', id: 'active' });
    expect(firstFrame.disconnected).toBe(true);
    expect(_cloudActive.size).toBe(0);
    expect(client.posted).toContainEqual({ type: 'error', id: 'active', error: 'Puter broker replaced' });
    expect(_cloudBrokers.get(7)?.port).toBe(replacement);
    expect(client.posted).not.toContainEqual({ type: 'unavailable' });
  });

  test('accepts only the exact trusted top-frame content broker', () => {
    const trusted = brokerPort({
      name: 'sb-puter-content',
      url: 'https://anthropic.skilljar.com/course',
    });
    const tenant = brokerPort({ name: 'sb-puter-content', url: 'https://other.skilljar.com/course' });
    const subframe = brokerPort({
      name: 'sb-puter-content',
      url: 'https://anthropic.skilljar.com/course',
      frameId: 2,
    });
    const wrongExtension = brokerPort({
      name: 'sb-puter-content',
      url: 'https://anthropic.skilljar.com/course',
      id: 'attacker-extension',
    });
    const wrongProtocol = brokerPort({
      name: 'sb-puter-content',
      url: 'http://anthropic.skilljar.com/course',
    });
    const prerender = brokerPort({
      name: 'sb-puter-content',
      url: 'https://anthropic.skilljar.com/course',
      documentLifecycle: 'prerender',
    });
    const missingDocument = brokerPort({
      name: 'sb-puter-content',
      url: 'https://anthropic.skilljar.com/course',
      documentId: null,
    });

    expect(_isPuterBrokerPort(trusted)).toBe(true);
    expect(_isPuterBrokerPort(tenant)).toBe(false);
    expect(_isPuterBrokerPort(subframe)).toBe(false);
    expect(_isPuterBrokerPort(wrongExtension)).toBe(false);
    expect(_isPuterBrokerPort(wrongProtocol)).toBe(false);
    expect(_isPuterBrokerPort(prerender)).toBe(false);
    expect(_isPuterBrokerPort(missingDocument)).toBe(false);
  });

  // ────────────────────────────────────────────────────────────────
  // The trust boundary is ONE list, and both halves read it.
  //
  // It used to be written out twice — once for the broker port, once for the
  // client port — with the host literal inline in both. Two copies of a
  // security boundary is one copy that gets updated, and the failure is silent
  // either way: the tutor refuses to connect on a host somebody forgot, or a
  // host somebody added lands in only the permissive half.
  // ────────────────────────────────────────────────────────────────
  test('academy.claude.com is trusted by BOTH halves, or by neither', () => {
    const url = 'https://academy.claude.com/courses/building-with-the-claude-api/accessing-the-api';
    const broker = brokerPort({ name: 'sb-puter-content', url, documentId: 'academy-document' });
    const client = brokerPort({ name: 'sb-cloud-chat-client', url, documentId: 'academy-document' });
    expect(_isPuterBrokerPort(broker)).toBe(true);
    expect(_isAllowedCloudClient(client)).toBe(true);
  });

  test('a lookalike host is trusted by neither', () => {
    // Exact hostname, not a suffix match. claude.com serves the marketing site
    // and the tutorials; platform.claude.com and code.claude.com are different
    // products; and an attacker-controlled academy.claude.com.evil.test must
    // never satisfy a sloppy endsWith.
    for (const host of [
      'claude.com',
      'platform.claude.com',
      'academy.claude.com.evil.test',
      'evil-academy.claude.com',
    ]) {
      const url = `https://${host}/courses/a/b`;
      expect(_isPuterBrokerPort(brokerPort({ name: 'sb-puter-content', url }))).toBe(false);
      expect(_isAllowedCloudClient(brokerPort({ name: 'sb-cloud-chat-client', url }))).toBe(false);
    }
  });

  test('an Academy broker still has to satisfy every structural check', () => {
    // Being on a trusted host is necessary, not sufficient. The frame, the
    // extension id, the document lifecycle and the protocol all still apply.
    const url = 'https://academy.claude.com/courses/a/b';
    expect(_isPuterBrokerPort(brokerPort({ name: 'sb-puter-content', url, frameId: 2 }))).toBe(false);
    expect(_isPuterBrokerPort(brokerPort({ name: 'sb-puter-content', url, id: 'attacker-extension' }))).toBe(false);
    expect(_isPuterBrokerPort(brokerPort({ name: 'sb-puter-content', url, documentLifecycle: 'prerender' }))).toBe(
      false,
    );
    expect(
      _isPuterBrokerPort(brokerPort({ name: 'sb-puter-content', url: 'http://academy.claude.com/courses/a/b' })),
    ).toBe(false);
  });

  test('accepts only exact active top-frame clients and pairs the same document', () => {
    const broker = brokerPort({
      name: 'sb-puter-content',
      url: 'https://anthropic.skilljar.com/course',
      documentId: 'broker-document',
    });
    const matching = brokerPort({
      name: 'sb-cloud-chat-client',
      url: 'https://anthropic.skilljar.com/course',
      documentId: 'broker-document',
    });
    const stale = brokerPort({
      name: 'sb-cloud-chat-client',
      url: 'https://anthropic.skilljar.com/course',
      documentId: 'old-document',
    });
    const prerender = brokerPort({
      name: 'sb-cloud-chat-client',
      url: 'https://anthropic.skilljar.com/course',
      documentLifecycle: 'prerender',
    });
    const tenant = brokerPort({
      name: 'sb-cloud-chat-client',
      url: 'https://other.skilljar.com/course',
    });
    const wrongExtension = brokerPort({
      name: 'sb-cloud-chat-client',
      url: 'https://anthropic.skilljar.com/course',
      id: 'attacker-extension',
    });
    const subframe = brokerPort({
      name: 'sb-cloud-chat-client',
      url: 'https://anthropic.skilljar.com/course',
      frameId: 1,
    });
    const wrongProtocol = brokerPort({
      name: 'sb-cloud-chat-client',
      url: 'http://anthropic.skilljar.com/course',
    });
    const missingDocument = brokerPort({
      name: 'sb-cloud-chat-client',
      url: 'https://anthropic.skilljar.com/course',
      documentId: null,
    });

    expect(_isAllowedCloudClient(matching)).toBe(true);
    expect(_isAllowedCloudClient(prerender)).toBe(false);
    expect(_isAllowedCloudClient(tenant)).toBe(false);
    expect(_isAllowedCloudClient(wrongExtension)).toBe(false);
    expect(_isAllowedCloudClient(subframe)).toBe(false);
    expect(_isAllowedCloudClient(wrongProtocol)).toBe(false);
    expect(_isAllowedCloudClient(missingDocument)).toBe(false);

    _registerCloudBroker(broker);
    _registerCloudClient(matching);
    _registerCloudClient(stale);
    broker.emitMessage({ type: 'ready' });
    expect(matching.posted).toContainEqual({ type: 'ready' });
    expect(stale.posted).not.toContainEqual({ type: 'ready' });

    stale.emitMessage({ type: 'start', id: 'stale', prompt: 'hello', model: 'claude-sonnet-4-6' });
    expect(stale.posted).toContainEqual({
      type: 'error',
      id: 'stale',
      error: 'Puter broker is not ready',
    });
    expect(broker.posted).not.toContainEqual(expect.objectContaining({ id: 'stale' }));
  });
});

describe('Tutor transport origin scope', () => {
  test('an Academy course unit is trusted', () => {
    expect(_isTrustedTutorOrigin('https://academy.claude.com/courses/a-course/a-lesson')).toBe(true);
  });

  test('a locale-prefixed course unit is trusted', () => {
    expect(_isTrustedTutorOrigin('https://academy.claude.com/ko/courses/a-course/a-lesson')).toBe(true);
  });

  test("the learner's account pages are not", () => {
    // Host alone used to be enough, which put the transport on every page the
    // origin serves — including the ones where a page-level compromise would
    // be worth the most.
    for (const path of ['/profile', '/settings', '/', '/account/billing']) {
      expect(_isTrustedTutorOrigin(`https://academy.claude.com${path}`)).toBe(false);
    }
  });

  test('the course catalog is not a unit page', () => {
    expect(_isTrustedTutorOrigin('https://academy.claude.com/courses/a-course')).toBe(false);
  });

  test('Skilljar keeps host-only matching', () => {
    // Its tenant root IS the catalog and its lesson paths share no prefix to
    // anchor on, so narrowing there would be a guess rather than a boundary.
    expect(_isTrustedTutorOrigin('https://anthropic.skilljar.com/a-course/287726')).toBe(true);
  });

  test('another Claude host is not trusted', () => {
    expect(_isTrustedTutorOrigin('https://claude.com/courses/a/b')).toBe(false);
    expect(_isTrustedTutorOrigin('https://evil.example/courses/a/b')).toBe(false);
  });

  test('http is refused even on a course path', () => {
    expect(_isTrustedTutorOrigin('http://academy.claude.com/courses/a/b')).toBe(false);
  });
});

describe('Local Tutor transport uses the shared origin boundary', () => {
  test.each([
    'https://academy.claude.com/courses/a-course/a-lesson',
    'https://academy.claude.com/ko/courses/a-course/a-lesson',
    'https://anthropic.skilljar.com/a-course/287726',
  ])('allows a trusted active top-frame document: %s', (url) => {
    expect(_isLocalChatPort(brokerPort({ name: 'sb-local-chat', url }))).toBe(true);
  });

  test.each([
    'https://academy.claude.com/',
    'https://academy.claude.com/profile',
    'https://academy.claude.com/settings',
    'https://academy.claude.com/courses/a-course',
    'https://other.skilljar.com/a-course/287726',
    'https://claude.com/resources/tutorials/example',
    'https://academy.claude.com.evil.test/courses/a/b',
    'http://academy.claude.com/courses/a/b',
  ])('rejects a surface outside the shared Tutor boundary: %s', (url) => {
    expect(_isLocalChatPort(brokerPort({ name: 'sb-local-chat', url }))).toBe(false);
  });

  test('keeps the shared structural checks', () => {
    const url = 'https://academy.claude.com/courses/a/b';
    expect(_isLocalChatPort(brokerPort({ name: 'sb-local-chat', url, frameId: 1 }))).toBe(false);
    expect(_isLocalChatPort(brokerPort({ name: 'sb-local-chat', url, id: 'attacker-extension' }))).toBe(false);
    expect(_isLocalChatPort(brokerPort({ name: 'sb-local-chat', url, documentLifecycle: 'prerender' }))).toBe(false);
    expect(_isLocalChatPort(brokerPort({ name: 'sb-local-chat', url, documentId: null }))).toBe(false);
  });
});

describe('Local refinement keeps its explicitly wider surface', () => {
  test.each([
    'https://other.skilljar.com/a-course/287726',
    'https://skilljar.com/a-course/287726',
    'https://claude.com/resources/tutorials/example',
    'https://academy.claude.com/courses/a-course/a-lesson',
  ])('allows a refinement document without widening Tutor: %s', (url) => {
    const port = brokerPort({ name: 'sb-local-refinement', url });
    expect(_isLocalRefinementPort(port)).toBe(true);
    if (url.includes('other.skilljar.com') || url.includes('claude.com/resources')) {
      expect(_isLocalChatPort(port)).toBe(false);
    }
  });

  test.each([
    'https://academy.claude.com/profile',
    'https://evil.example/resources/tutorials/example',
    'https://claude.com.evil.test/resources/tutorials/example',
    'http://other.skilljar.com/a-course/287726',
  ])('rejects a page outside the local-refinement surface: %s', (url) => {
    expect(_isLocalRefinementPort(brokerPort({ name: 'sb-local-refinement', url }))).toBe(false);
  });
});
