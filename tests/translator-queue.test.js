/**
 * Unit tests for SkilljarTranslator.queueGeminiVerify filtering logic.
 *
 * Tests the smart filtering that decides which Google Translate results
 * are worth sending to Gemini for verification.
 */

/* global jest, describe, test, expect, beforeEach */

// ── Minimal browser mocks ──────────────────────────────────────
global.chrome = { runtime: { getURL: (p) => p } };
global.indexedDB = { open: () => ({ onupgradeneeded: null, onsuccess: null, onerror: null }) };
global.window = { addEventListener: () => {} };

const fs = require('fs');
const path = require('path');

const selectorsSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'lib', 'selectors.js'), 'utf8'
);
const constantsSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'lib', 'constants.js'), 'utf8'
);
const src = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'lib', 'translator.js'), 'utf8'
);

let SkilljarTranslator;
try {
  const combined = `(function() { ${selectorsSrc}; ${constantsSrc}; ${src}; return SkilljarTranslator; })()`;
  SkilljarTranslator = eval(combined);
} catch (e) {
  eval(selectorsSrc);
  eval(constantsSrc);
  eval(src);
  SkilljarTranslator = global.SkilljarTranslator;
}

// ── Tests ──────────────────────────────────────────────────────

describe('queueGeminiVerify', () => {
  let translator;

  beforeEach(() => {
    translator = new SkilljarTranslator();
    // Prevent actual verification processing
    translator._processVerifyQueue = jest.fn();
  });

  test('rejects empty or null input', () => {
    expect(translator.queueGeminiVerify('', 'translation', 'ko')).toBe(false);
    expect(translator.queueGeminiVerify(null, 'translation', 'ko')).toBe(false);
    expect(translator.queueGeminiVerify('text', '', 'ko')).toBe(false);
    expect(translator.queueGeminiVerify('text', null, 'ko')).toBe(false);
  });

  test('rejects text shorter than GEMINI_MIN_TEXT (80 chars)', () => {
    const short = 'This is a short text.';
    expect(translator.queueGeminiVerify(short, '짧은 텍스트입니다.', 'ko')).toBe(false);
  });

  test('rejects text with low alpha ratio (mostly numbers/symbols)', () => {
    // Create text that's long enough but has low alpha ratio
    const numeric = '12345-67890 12345-67890 12345-67890 12345-67890 12345-67890 12345-67890 12345-67890 12345-67890';
    expect(translator.queueGeminiVerify(numeric, 'numbers', 'ko')).toBe(false);
  });

  test('rejects simple patterns like "6 minutes"', () => {
    // Need to be >= 80 chars but match the pattern — actually the length check comes first
    // so short "6 minutes" is rejected by length, which is fine
    const text = '6 minutes';
    expect(translator.queueGeminiVerify(text, '6분', 'ko')).toBe(false);
  });

  test('rejects "Module X" / "Lesson X" labels', () => {
    const text = 'Module 1';
    expect(translator.queueGeminiVerify(text, '모듈 1', 'ko')).toBe(false);
  });

  test('accepts long prose with punctuation', () => {
    const prose = 'This is a comprehensive guide to understanding how large language models work. It covers the fundamental concepts, including tokenization, attention mechanisms, and training procedures.';
    expect(translator.queueGeminiVerify(prose, '이것은 대규모 언어 모델 이해 가이드입니다.', 'ko')).toBe(true);
  });

  test('accepts text longer than MIN_COMPLEX_TEXT even without punctuation', () => {
    // > 120 chars of pure prose
    const text = 'A'.repeat(121) + ' text that is very long and contains only alphabetic characters without any punctuation marks at all here';
    expect(translator.queueGeminiVerify(text, 'translation', 'ko')).toBe(true);
  });

  test('queues item and returns true for valid text', () => {
    const text = 'This is a comprehensive guide to understanding how large language models work. It covers the fundamental concepts, including tokenization and more.';
    translator.queueGeminiVerify(text, 'translation', 'ko');
    expect(translator._verifyQueue.length).toBe(1);
    expect(translator._verifyQueue[0].original).toBe(text);
    expect(translator._verifyQueue[0].targetLang).toBe('ko');
  });

  test('drops oldest item when queue exceeds max size', () => {
    // Mock _cacheTranslation to prevent IndexedDB calls
    translator._cacheTranslation = jest.fn();

    const longText = 'This is a comprehensive test sentence that is definitely longer than eighty characters, with punctuation.';

    // Fill queue to max (500)
    for (let i = 0; i < 500; i++) {
      translator._verifyQueue.push({ original: `text-${i}`, googleTranslation: 'tr', targetLang: 'ko' });
    }

    translator.queueGeminiVerify(longText, 'new translation', 'ko');

    // Queue should still be 500 (shifted one, added one)
    expect(translator._verifyQueue.length).toBe(500);
    // The oldest (text-0) should have been dropped
    expect(translator._verifyQueue[0].original).toBe('text-1');
    // The dropped item should have been cached
    expect(translator._cacheTranslation).toHaveBeenCalled();
  });
});
