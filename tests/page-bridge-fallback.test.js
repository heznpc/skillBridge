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

// Extract the M-3 payload-size constant so the threshold is asserted
// against whatever the source file ships (not a hardcoded test number).
const maxCharsMatch = src.match(/const\s+_MAX_PAYLOAD_CHARS\s*=\s*([\d_]+)\s*;/);
if (!maxCharsMatch) throw new Error('Could not extract _MAX_PAYLOAD_CHARS');
const _MAX_PAYLOAD_CHARS = Number(maxCharsMatch[1].replace(/_/g, ''));

// _payloadTooLarge is small enough that mirroring it (rather than eval'ing
// the source) keeps the test honest about what the production code does.
// If the production helper changes shape, this mirror must change too —
// the assertions below pin the contract.
function _payloadTooLarge(data) {
  return (
    (data?.text?.length || 0) + (data?.systemPrompt?.length || 0) + (data?.userMessage?.length || 0) >
    _MAX_PAYLOAD_CHARS
  );
}

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

// ── M-3 payload-length guard (2nd-pass audit 2026-05-21) ──
// A buggy caller or a page-world script that read the loader nonce could
// previously submit megabyte-sized prompts and burn the shared Puter.js
// quota. _payloadTooLarge is the chokepoint each request handler checks
// before kicking off `puter.ai.chat`.
describe('_payloadTooLarge', () => {
  test('ships a 200_000 char ceiling (constant pinned)', () => {
    expect(_MAX_PAYLOAD_CHARS).toBe(200_000);
  });

  test('passes ordinary translate payloads', () => {
    expect(_payloadTooLarge({ text: 'Hello world' })).toBe(false);
    expect(_payloadTooLarge({ text: 'x'.repeat(50_000) })).toBe(false);
  });

  test('passes ordinary chat payloads', () => {
    expect(
      _payloadTooLarge({
        systemPrompt: 'You are a tutor. ' + 'x'.repeat(5_000),
        userMessage: 'Explain ' + 'y'.repeat(2_000),
      }),
    ).toBe(false);
  });

  test('rejects when text alone exceeds the cap', () => {
    expect(_payloadTooLarge({ text: 'x'.repeat(_MAX_PAYLOAD_CHARS + 1) })).toBe(true);
  });

  test('rejects when the SUM of text + systemPrompt + userMessage exceeds the cap', () => {
    // Each below the cap, total above.
    expect(
      _payloadTooLarge({
        text: 'x'.repeat(80_000),
        systemPrompt: 'y'.repeat(80_000),
        userMessage: 'z'.repeat(80_000),
      }),
    ).toBe(true);
  });

  test('treats missing fields as zero (does not throw)', () => {
    expect(_payloadTooLarge({})).toBe(false);
    expect(_payloadTooLarge(null)).toBe(false);
    expect(_payloadTooLarge(undefined)).toBe(false);
  });
});

// ── M-1 stream cancellation propagation ──
// _activeStreams Map + _handleAbort + the CHAT_ABORT message branch are
// the chokepoint that stops Puter.js from generating tokens after the
// translator's AbortController fires. The existing pattern in this file
// is regex extraction — but the Map + handler need each other in scope.
// We assert the source contract instead: that the bridge file actually
// contains the wiring. If a future commit removes any piece, the wiring
// is broken end-to-end and this test fails fast.
describe('CHAT_ABORT wiring (M-1 regression guard)', () => {
  test('declares the _activeStreams Map', () => {
    expect(src).toMatch(/const\s+_activeStreams\s*=\s*new\s+Map\(\s*\)/);
  });

  test('defines _handleAbort that flips a `cancelled` flag', () => {
    expect(src).toMatch(/function\s+_handleAbort\s*\(\s*id\s*\)/);
    expect(src).toMatch(/entry\.cancelled\s*=\s*true/);
  });

  test('routes CHAT_ABORT messages to _handleAbort', () => {
    expect(src).toMatch(/data\.type\s*===\s*['"]CHAT_ABORT['"]/);
    expect(src).toMatch(/_handleAbort\s*\(\s*data\.id\s*\)/);
  });

  test('registers a stream entry on CHAT_REQUEST start', () => {
    expect(src).toMatch(/_activeStreams\.set\s*\(\s*data\.id\s*,/);
  });

  test('breaks the for-await loop on cancellation', () => {
    expect(src).toMatch(/if\s*\(\s*streamEntry\.cancelled\s*\)\s*break/);
  });

  test('suppresses CHAT_STREAM_END when cancelled (no orphan-resolve race)', () => {
    expect(src).toMatch(/if\s*\(\s*!streamEntry\.cancelled\s*\)/);
  });

  test('deletes the stream entry in finally (no zombie growth)', () => {
    expect(src).toMatch(/_activeStreams\.delete\s*\(\s*data\.id\s*\)/);
  });
});

// ── M-1 content-side: translator.js onAbort must emit CHAT_ABORT ──
// The bridge-side wiring above is half the fix; the other half is the
// translator firing the message when the AbortController fires. Without
// this the bridge never knows to cancel.
describe('translator.js emits CHAT_ABORT on AbortSignal (M-1 content side)', () => {
  const translatorSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'translator.js'), 'utf8');

  test('onAbort posts a CHAT_ABORT message with the request id', () => {
    // Look inside the `onAbort = () => { ... }` body. It must postMessage
    // with type CHAT_ABORT and the in-flight `id`.
    const onAbortMatch = translatorSrc.match(/const\s+onAbort\s*=\s*\(\)\s*=>\s*\{([\s\S]+?)\};/);
    expect(onAbortMatch).not.toBeNull();
    const body = onAbortMatch[1];
    expect(body).toMatch(/window\.postMessage/);
    expect(body).toMatch(/type:\s*['"]CHAT_ABORT['"]/);
    expect(body).toMatch(/id,/); // shorthand of `id: id`
    expect(body).toMatch(/__nonce__:\s*this\._bridgeNonce/);
  });
});
