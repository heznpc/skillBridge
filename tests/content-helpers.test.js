/**
 * Tests `escapeHtml` (loaded from `src/lib/gemini-block.js`) and the
 * exam/cert URL pattern constants. Helpers that live inside the content.js
 * IIFE (`t()`, queue caps, eviction loop) aren't testable in isolation and
 * are covered by manual QA / CI selector health checks.
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

// Load real constants for the URL pattern tests.
const selectorsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'selectors.js'), 'utf8');
const constantsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'constants.js'), 'utf8');
const sourceConstants = new Function(`
  ${selectorsSrc}
  ${constantsSrc}
  return { CERT_DISABLE_PATTERNS, EXAM_URL_PATTERNS };
`)();

// Load real escapeHtml from gemini-block.js.
const fakeWindow = {};
const geminiSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'gemini-block.js'), 'utf8');
new Function('window', geminiSrc)(fakeWindow);
const escapeHtml = fakeWindow._geminiBlock.escapeHtml;

describe('escapeHtml (production)', () => {
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

describe('exam / cert URL patterns (production)', () => {
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

  test('exam patterns avoid false positives on quiz-prefix words', () => {
    // The patterns require a path-segment boundary after the keyword;
    // benign URLs like "/quizlet" or "/quiz-answers-blog" must not match.
    expect(EXAM_URL_PATTERNS.some((p) => p.test('/quizlet'))).toBe(false);
    expect(EXAM_URL_PATTERNS.some((p) => p.test('/quiz-answers-blog'))).toBe(false);
    expect(EXAM_URL_PATTERNS.some((p) => p.test('/examiner-prep'))).toBe(false);
  });
});
