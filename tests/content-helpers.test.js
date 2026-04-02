/**
 * Unit tests for content.js pure helper functions.
 *
 * Tests: escapeHtml, t() i18n lookup
 * These are extracted from the content.js IIFE via direct definition.
 */

/* global describe, test, expect */

// ── Direct implementations (same as content.js) ──────────────

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function t(map, lang) {
  return map[lang] || map['en'];
}

// ── Tests ──────────────────────────────────────────────────────

describe('escapeHtml', () => {
  test('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  test('escapes angle brackets', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  test('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  test('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  test('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  test('passes through safe text', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });

  test('escapes all special characters in one string', () => {
    expect(escapeHtml('<a href="test">it\'s & more</a>')).toBe(
      '&lt;a href=&quot;test&quot;&gt;it&#39;s &amp; more&lt;/a&gt;',
    );
  });
});

describe('t (i18n lookup)', () => {
  const labels = {
    en: 'Translation paused',
    ko: '번역 일시 중지',
    ja: '翻訳一時停止',
  };

  test('returns correct language entry', () => {
    expect(t(labels, 'ko')).toBe('번역 일시 중지');
    expect(t(labels, 'ja')).toBe('翻訳一時停止');
  });

  test('falls back to English for unknown language', () => {
    expect(t(labels, 'fr')).toBe('Translation paused');
    expect(t(labels, 'de')).toBe('Translation paused');
  });

  test('falls back to English for undefined lang', () => {
    expect(t(labels, undefined)).toBe('Translation paused');
  });

  test('returns English entry directly', () => {
    expect(t(labels, 'en')).toBe('Translation paused');
  });
});
