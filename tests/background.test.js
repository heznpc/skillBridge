/**
 * Unit tests for background.js pure functions.
 *
 * Tests: gtLangCode, parseGTResponse, isYouTubeUrl, isAllowedFetchUrl, isNewerVersion
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

// Minimal chrome mock for background.js
global.chrome = {
  runtime: { id: 'test', getManifest: () => ({ version: '1.0.0' }), getURL: (p) => p },
  alarms: { create: () => {}, onAlarm: { addListener: () => {} } },
  action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
  storage: { local: { set: () => {} }, onChanged: { addListener: () => {} } },
  tabs: { query: () => Promise.resolve([]) },
};
global.chrome.runtime.onInstalled = { addListener: () => {} };
global.chrome.runtime.onMessage = { addListener: () => {} };

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'background', 'background.js'), 'utf8');

// Extract pure functions via eval
const fns = new Function(`
  ${src}
  return { gtLangCode, parseGTResponse, isYouTubeUrl, isAllowedFetchUrl, isNewerVersion, _rateLimiter, fetchWithRetry, registerAlarms };
`)();

const {
  gtLangCode,
  parseGTResponse,
  isYouTubeUrl,
  isAllowedFetchUrl,
  isNewerVersion,
  _rateLimiter,
  fetchWithRetry,
  registerAlarms,
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
});

describe('isYouTubeUrl', () => {
  test('accepts www.youtube.com', () => {
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=abc')).toBe(true);
  });

  test('accepts subdomains of youtube.com', () => {
    expect(isYouTubeUrl('https://m.youtube.com/watch?v=abc')).toBe(true);
  });

  test('rejects non-YouTube URLs', () => {
    expect(isYouTubeUrl('https://www.google.com')).toBe(false);
  });

  test('rejects invalid URLs', () => {
    expect(isYouTubeUrl('not-a-url')).toBe(false);
  });

  test('rejects spoofed hostnames', () => {
    expect(isYouTubeUrl('https://fake-youtube.com/embed')).toBe(false);
  });
});

describe('isAllowedFetchUrl', () => {
  test('allows www.youtube.com', () => {
    expect(isAllowedFetchUrl('https://www.youtube.com/watch?v=test')).toBe(true);
  });

  test('allows translate.googleapis.com', () => {
    expect(isAllowedFetchUrl('https://translate.googleapis.com/translate?q=test')).toBe(true);
  });

  test('allows m.youtube.com', () => {
    expect(isAllowedFetchUrl('https://m.youtube.com/embed/abc')).toBe(true);
  });

  test('rejects arbitrary domains', () => {
    expect(isAllowedFetchUrl('https://evil.com')).toBe(false);
  });

  test('rejects invalid URLs', () => {
    expect(isAllowedFetchUrl('not-a-url')).toBe(false);
  });

  test('rejects spoofed subdomains', () => {
    expect(isAllowedFetchUrl('https://fake-youtube.com/embed')).toBe(false);
  });
});

describe('isNewerVersion', () => {
  test('detects newer major version', () => {
    expect(isNewerVersion('2.0.0', '1.0.0')).toBe(true);
  });

  test('detects newer minor version', () => {
    expect(isNewerVersion('1.1.0', '1.0.0')).toBe(true);
  });

  test('detects newer patch version', () => {
    expect(isNewerVersion('1.0.1', '1.0.0')).toBe(true);
  });

  test('returns false for same version', () => {
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
  });

  test('returns false for older version', () => {
    expect(isNewerVersion('1.0.0', '2.0.0')).toBe(false);
  });

  test('handles different length versions', () => {
    expect(isNewerVersion('1.0.1', '1.0')).toBe(true);
    expect(isNewerVersion('1.0', '1.0.1')).toBe(false);
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
  test('registers cache-cleanup and version-check alarms', () => {
    const created = [];
    chrome.alarms.create = (name, opts) => created.push({ name, ...opts });
    registerAlarms();
    expect(created).toEqual([
      { name: 'cache-cleanup', periodInMinutes: 1440 },
      { name: 'version-check', periodInMinutes: 10080 },
    ]);
  });
});
