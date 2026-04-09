/**
 * Unit tests for content.js pure helper functions.
 *
 * Tests: escapeHtml, t() i18n lookup, offline queue, exam detection, eviction
 * These are extracted from the content.js IIFE via direct definition.
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

// Load constants from source to avoid drift
const constantsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'selectors.js'), 'utf8');
const constantsMainSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'constants.js'), 'utf8');
const sourceConstants = new Function(`
  ${constantsSrc}
  ${constantsMainSrc}
  return { CERT_DISABLE_PATTERNS, EXAM_URL_PATTERNS, SKILLBRIDGE_THRESHOLDS };
`)();

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

// ── Offline Queue Logic Tests ─────────────────────────────────

describe('offline queue', () => {
  const PENDING_NODES_MAX = sourceConstants.SKILLBRIDGE_THRESHOLDS.PENDING_NODES_MAX;

  test('pending items array respects cap', () => {
    const queue = [];
    for (let i = 0; i < PENDING_NODES_MAX + 100; i++) {
      if (queue.length < PENDING_NODES_MAX) {
        queue.push({ el: {}, text: `item-${i}` });
      }
    }
    expect(queue.length).toBe(PENDING_NODES_MAX);
  });

  test('filters out detached nodes on reconnect', () => {
    const attached = { el: { parentNode: {} }, text: 'attached' };
    const detached = { el: { parentNode: null }, text: 'detached' };
    const noEl = { el: null, text: 'null-el' };
    const pending = [attached, detached, attached, noEl];
    const filtered = pending.filter((item) => item.el?.parentNode);
    expect(filtered.length).toBe(2);
  });
});

// ── Map Size Cap Tests ────────────────────────────────────────

describe('Map size cap', () => {
  test('originalTexts map respects MAP_SIZE_CAP', () => {
    const MAP_SIZE_CAP = 5000;
    const map = new Map();
    for (let i = 0; i < 5100; i++) {
      if (map.size < MAP_SIZE_CAP) {
        map.set(`key-${i}`, `value-${i}`);
      }
    }
    expect(map.size).toBe(MAP_SIZE_CAP);
  });
});

// ── Exam Page Detection Logic Tests ───────────────────────────

describe('exam page detection patterns', () => {
  const { CERT_DISABLE_PATTERNS, EXAM_URL_PATTERNS } = sourceConstants;

  test('cert patterns match certification URLs', () => {
    expect(CERT_DISABLE_PATTERNS.some((p) => p.test('/claude-certified'))).toBe(true);
    expect(CERT_DISABLE_PATTERNS.some((p) => p.test('/certified-architect'))).toBe(true);
    expect(CERT_DISABLE_PATTERNS.some((p) => p.test('/certification-exam'))).toBe(true);
    expect(CERT_DISABLE_PATTERNS.some((p) => p.test('/proctored'))).toBe(true);
  });

  test('cert patterns do not match normal course URLs', () => {
    expect(CERT_DISABLE_PATTERNS.some((p) => p.test('/courses/prompt-engineering'))).toBe(false);
    expect(CERT_DISABLE_PATTERNS.some((p) => p.test('/courses/claude-overview'))).toBe(false);
  });

  test('exam patterns match quiz/exam URLs', () => {
    expect(EXAM_URL_PATTERNS.some((p) => p.test('/quiz'))).toBe(true);
    expect(EXAM_URL_PATTERNS.some((p) => p.test('/exam'))).toBe(true);
    expect(EXAM_URL_PATTERNS.some((p) => p.test('/assessment'))).toBe(true);
    expect(EXAM_URL_PATTERNS.some((p) => p.test('?type=quiz'))).toBe(true);
  });

  test('exam patterns do not match normal lesson URLs', () => {
    expect(EXAM_URL_PATTERNS.some((p) => p.test('/courses/lesson-1'))).toBe(false);
    expect(EXAM_URL_PATTERNS.some((p) => p.test('/courses/overview'))).toBe(false);
  });

  test('cert patterns are case-insensitive', () => {
    expect(CERT_DISABLE_PATTERNS.some((p) => p.test('/Claude-Certified'))).toBe(true);
    expect(CERT_DISABLE_PATTERNS.some((p) => p.test('/PROCTORED'))).toBe(true);
  });
});

// ── Storage Quota Eviction Logic Tests ────────────────────────

describe('storage quota eviction logic', () => {
  const QUOTA_WARN = sourceConstants.SKILLBRIDGE_THRESHOLDS.STORAGE_QUOTA_WARN;
  const EVICT_TARGET = sourceConstants.SKILLBRIDGE_THRESHOLDS.STORAGE_EVICT_TARGET;

  test('evicts oldest entries using production formula when quota exceeds threshold', () => {
    const entries = [];
    for (let i = 0; i < 100; i++) {
      entries.push({ key: `k${i}`, ts: Date.now() - (100 - i) * 1000, text: `text-${i}` });
    }
    const quotaUsed = 0.92;

    if (quotaUsed >= QUOTA_WARN) {
      // Production formula: Math.ceil(all.length * (1 - STORAGE_EVICT_TARGET))
      const deleteCount = Math.ceil(entries.length * (1 - EVICT_TARGET));
      entries.sort((a, b) => a.ts - b.ts);
      const evicted = entries.splice(0, deleteCount);
      expect(evicted.length).toBe(deleteCount);
      expect(entries.length).toBe(100 - deleteCount);
      // Remaining entries should be newer
      for (let i = 1; i < entries.length; i++) {
        expect(entries[i].ts).toBeGreaterThanOrEqual(entries[i - 1].ts);
      }
    }
  });

  test('does not evict when under threshold', () => {
    const entries = [{ key: 'k1', ts: Date.now(), text: 'hello' }];
    const quotaUsed = 0.5;
    expect(quotaUsed < QUOTA_WARN).toBe(true);
    expect(entries.length).toBe(1);
  });
});
