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
  return { gtLangCode, parseGTResponse, isYouTubeUrl, isAllowedFetchUrl, isNewerVersion };
`)();

const { gtLangCode, parseGTResponse, isYouTubeUrl, isAllowedFetchUrl, isNewerVersion } = fns;

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
