/**
 * Unit tests for the model-fallback chain in `src/lib/page-bridge.js`
 * (added in v3.5.7).
 *
 * page-bridge.js runs in the page world and references `puter.ai.chat` /
 * `_currentScript` etc., so we can't load the whole IIFE in Node. Instead
 * we extract the two pure pieces — `_MODEL_FALLBACKS` and `_isModelError`
 * — via regex and validate them in isolation. Same pattern as
 * `tests/format-response.test.js`.
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'page-bridge.js'), 'utf8');

// Extract `const _MODEL_FALLBACKS = { ... };` from the IIFE body.
const fallbackMatch = src.match(/const\s+_MODEL_FALLBACKS\s*=\s*(\{[^}]+\})\s*;/);
if (!fallbackMatch) throw new Error('Could not extract _MODEL_FALLBACKS');
const _MODEL_FALLBACKS = eval(`(${fallbackMatch[1]})`);

// Extract `function _isModelError(err) { ... }` body.
const errorMatch = src.match(/function\s+_isModelError\s*\(err\)\s*\{([^}]+?return[^}]+?)\}/);
if (!errorMatch) throw new Error('Could not extract _isModelError');
const _isModelError = new Function('err', errorMatch[1]);

describe('_MODEL_FALLBACKS chain', () => {
  test('Sonnet 4.6 falls back to 4.5', () => {
    expect(_MODEL_FALLBACKS['claude-sonnet-4-6']).toBe('claude-sonnet-4-5');
  });

  test('Opus 4.7 falls back to 4.6', () => {
    expect(_MODEL_FALLBACKS['claude-opus-4-7']).toBe('claude-opus-4-6');
  });

  test('Opus 4.6 falls back to 4.5', () => {
    expect(_MODEL_FALLBACKS['claude-opus-4-6']).toBe('claude-opus-4-5');
  });

  test('Gemini 2.0 Flash falls back to 1.5 Flash', () => {
    expect(_MODEL_FALLBACKS['gemini-2.0-flash']).toBe('gemini-1.5-flash');
  });

  test('unknown models return undefined (caller treats as no fallback)', () => {
    expect(_MODEL_FALLBACKS['gpt-5']).toBeUndefined();
    expect(_MODEL_FALLBACKS['claude-haiku-4-5']).toBeUndefined();
  });
});

describe('_isModelError', () => {
  test('matches typical Puter / Anthropic deprecation messages', () => {
    expect(_isModelError({ message: 'model not found: claude-sonnet-4-6' })).toBe(true);
    expect(_isModelError({ message: 'invalid model parameter' })).toBe(true);
    expect(_isModelError({ message: 'this model has been deprecated' })).toBe(true);
    expect(_isModelError({ message: 'Unsupported model identifier' })).toBe(true);
    expect(_isModelError({ message: 'HTTP 404: model unavailable' })).toBe(true);
  });

  test('matches errors carried in `error` field instead of `message`', () => {
    expect(_isModelError({ error: 'Model not found' })).toBe(true);
  });

  test('matches plain string errors', () => {
    expect(_isModelError('Invalid model: claude-x')).toBe(true);
  });

  test('does not match generic network errors (so we do not fallback for the wrong reason)', () => {
    expect(_isModelError({ message: 'Network request failed' })).toBe(false);
    expect(_isModelError({ message: 'fetch error: timeout' })).toBe(false);
    expect(_isModelError({ message: 'CORS policy blocked' })).toBe(false);
  });

  test('does not match content-policy / rate-limit (different recovery path)', () => {
    expect(_isModelError({ message: 'Rate limit exceeded' })).toBe(false);
    expect(_isModelError({ message: 'Content policy violation' })).toBe(false);
  });

  test('handles nullish errors gracefully', () => {
    expect(_isModelError(null)).toBe(false);
    expect(_isModelError(undefined)).toBe(false);
    expect(_isModelError({})).toBe(false);
  });
});
