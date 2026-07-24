/**
 * Unit tests for the pure-function half of gt-queue.js — the parts that
 * don't need a DOM. Extracted via regex from the IIFE source so production
 * code stays the source of truth (same pattern as protected-terms /
 * format-response tests).
 *
 * `isLikelyEnglish` is the gate that decides whether an element / text node
 * is worth sending to Google Translate. False positives = mistranslated
 * Korean/Japanese text; false negatives = unhelpful English left untranslated.
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'gt-queue.js'), 'utf8');
const match = src.match(/function isLikelyEnglish\(text\)\s*\{[\s\S]*?\n {2}\}/);
const isLikelyEnglish = new Function(`${match[0]}\nreturn isLikelyEnglish;`)();

describe('isLikelyEnglish', () => {
  test('classic English sentence → true', () => {
    expect(isLikelyEnglish('Hello world, how are you?')).toBe(true);
  });

  test('Hangul-only string → false', () => {
    expect(isLikelyEnglish('안녕하세요 반갑습니다')).toBe(false);
  });

  test('Kana / Kanji string → false', () => {
    expect(isLikelyEnglish('こんにちは世界')).toBe(false);
  });

  test('Simplified Chinese string → false', () => {
    expect(isLikelyEnglish('你好世界，欢迎来到这里')).toBe(false);
  });

  test('mostly Cyrillic → false', () => {
    expect(isLikelyEnglish('Привет мир')).toBe(false);
  });

  test('Korean with English code-mix ("Claude를 사용하세요") → false at majority threshold', () => {
    // 6 ASCII letters out of ~13 non-space chars. Below the 50% threshold.
    expect(isLikelyEnglish('Claude를 사용하세요')).toBe(false);
  });

  test('English with a sprinkle of Korean ("Use Claude 잘") → true', () => {
    // 8 ASCII letters out of 10 non-space chars.
    expect(isLikelyEnglish('Use Claude 잘')).toBe(true);
  });

  test('whitespace and tabs do not count toward the ratio', () => {
    // Without the whitespace skip a string like "a\t\t" would count tab chars
    // toward the non-Latin denominator and flip the result.
    expect(isLikelyEnglish('a\t\tb\n')).toBe(true);
  });

  test('empty string → false', () => {
    expect(isLikelyEnglish('')).toBe(false);
  });

  test('whitespace-only string → false (no non-whitespace chars)', () => {
    expect(isLikelyEnglish('   \t\n')).toBe(false);
  });

  test('all numbers → false (digits are non-Latin in this gate)', () => {
    // "12345" has 0 Latin letters, 5 non-whitespace chars → 0/5 < 0.5.
    expect(isLikelyEnglish('12345')).toBe(false);
  });

  test('Latin letters + digits → still true when letters dominate', () => {
    // "Claude 4.6" has 6 Latin letters, 3 digits, 1 dot → 6/10 = 0.6.
    expect(isLikelyEnglish('Claude 4.6')).toBe(true);
  });

  test('exactly 50% Latin → false (strict greater-than)', () => {
    // 2 Latin out of 4 non-whitespace = 0.5 exactly; threshold is `> 0.5`.
    expect(isLikelyEnglish('ab가나')).toBe(false);
  });
});

describe('inline routing invariants', () => {
  test('interactive-bearing blocks never take the flattening GT path', () => {
    // Interactive labels must never be blanked by safeReplaceText: with the
    // bridge they ride the structure-preserving Gemini path, without it they
    // stay untranslated. Formatting-only inline blocks remain GT-eligible.
    expect(src).toContain('const useGeminiBlocks = sb.hostCaps?.bridge !== false;');
    expect(src).toContain(
      'const gtItems = uncached.filter((item) => (!item.needsGemini || !useGeminiBlocks) && !item.hasInteractive);',
    );
    expect(src).toContain('? uncached.filter((item) => item.needsGemini || item.hasInteractive)');
  });

  test('interactive detection is a deep query, not a direct-children check', () => {
    // hasInlineTags only inspects direct children, so wrapper shapes like
    // <p><span>text <a>link</a></span></p> slip past it. The routing guard
    // must therefore use a descendant query.
    expect(src).toContain("el.querySelector('a, button, summary, [role=\"button\"], [role=\"link\"]')");
    expect(src).toContain('hasInteractive: _hasInteractiveEls(el)');
  });
});
