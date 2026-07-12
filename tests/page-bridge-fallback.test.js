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

// Extract the REAL _payloadTooLarge + _fieldChars from page-bridge.js
// rather than mirroring (audit sweep #3 — a mirror passes green even
// after the production helper drifts). _fieldChars is a sibling helper
// added for audit V5 (String coercion against non-string `.length`
// bypass); we extract both and wire them together.
const fieldCharsMatch = src.match(/function\s+_fieldChars\s*\(v\)\s*\{([\s\S]+?return[\s\S]+?)\}\s*\n/);
if (!fieldCharsMatch) throw new Error('Could not extract _fieldChars');
const _fieldChars = new Function('v', fieldCharsMatch[1]);

const payloadTooLargeMatch = src.match(/function\s+_payloadTooLarge\s*\(data\)\s*\{([\s\S]+?return[\s\S]+?)\}\s*\n/);
if (!payloadTooLargeMatch) throw new Error('Could not extract _payloadTooLarge');
// Reconstruct in the test scope so _fieldChars + _MAX_PAYLOAD_CHARS
// resolve. This way any change to the production body (e.g. adding
// a `prompt` field, or removing String coercion) breaks the tests below.
const _payloadTooLarge = new Function(
  'data',
  '_fieldChars',
  '_MAX_PAYLOAD_CHARS',
  payloadTooLargeMatch[1].replace(/_fieldChars/g, 'arguments[1]').replace(/_MAX_PAYLOAD_CHARS/g, 'arguments[2]'),
);
const _payloadTooLargeCall = (data) => _payloadTooLarge(data, _fieldChars, _MAX_PAYLOAD_CHARS);

describe('_MODEL_FALLBACKS chain', () => {
  test('Sonnet 4.6 falls back to 4.5', () => {
    expect(_MODEL_FALLBACKS['claude-sonnet-4-6']).toBe('claude-sonnet-4-5');
  });

  test('Opus 4.8 falls back to 4.7 (added 2026-05-28 with Anthropic release)', () => {
    expect(_MODEL_FALLBACKS['claude-opus-4-8']).toBe('claude-opus-4-7');
  });

  test('Opus 4.7 falls back to 4.6', () => {
    expect(_MODEL_FALLBACKS['claude-opus-4-7']).toBe('claude-opus-4-6');
  });

  test('Opus 4.6 falls back to 4.5', () => {
    expect(_MODEL_FALLBACKS['claude-opus-4-6']).toBe('claude-opus-4-5');
  });

  test('Gemini 2.0 Flash falls back to 2.0 Flash-Lite (1.5 was shut down 2026)', () => {
    // gemini-1.5-flash 404s now (Gemini 1.5/1.0 line retired), so the fallback
    // points at the live same-generation lighter sibling instead.
    expect(_MODEL_FALLBACKS['gemini-2.0-flash']).toBe('gemini-2.0-flash-lite');
  });

  test('unknown models return undefined (caller treats as no fallback)', () => {
    expect(_MODEL_FALLBACKS['gpt-5']).toBeUndefined();
    expect(_MODEL_FALLBACKS['claude-haiku-4-5']).toBeUndefined();
  });
});

describe('page-world Puter exposure hardening', () => {
  test('captures ai.chat into a closure and scrubs page-world Puter globals', () => {
    expect(src).toMatch(/let\s+_puterChatImpl\s*=\s*null/);
    expect(src).toMatch(/function\s+_captureAndHidePuter\s*\(\s*\)/);
    expect(src).toMatch(/_puterChatImpl\s*=\s*chat\.bind\(puterApi\.ai\)/);
    expect(src).toMatch(/Reflect\.deleteProperty\(globalThis,\s*name\)/);
    expect(src).toMatch(/'puter',\s*'puterParent'/);
  });

  test('does not auto-load Puter before announcing bridge readiness', () => {
    expect(src).toMatch(/type:\s*'BRIDGE_READY'/);
    expect(src).not.toMatch(/loadPuter\(\)\s*\.then/);
  });
});

describe('request model allowlist', () => {
  test('declares per-request allowlists for Gemini and Claude paths', () => {
    expect(src).toMatch(/const\s+_REQUEST_MODEL_ALLOWLIST\s*=/);
    expect(src).toMatch(/TRANSLATE_REQUEST:\s*new Set\(\['gemini-2\.0-flash',\s*'gemini-2\.0-flash-lite'\]\)/);
    expect(src).toMatch(/VERIFY_REQUEST:\s*new Set\(\['gemini-2\.0-flash',\s*'gemini-2\.0-flash-lite'\]\)/);
    expect(src).toMatch(/CHAT_REQUEST:\s*new Set\(\[/);
    expect(src).toMatch(/'claude-sonnet-4-6'/);
    expect(src).toMatch(/'claude-haiku-4-5'/);
  });

  test('all page-provided model values pass through _selectModel', () => {
    expect(src).toMatch(/callAI\(prompt,\s*data\.model,\s*'TRANSLATE_REQUEST'\)/);
    expect(src).toMatch(/callAI\(prompt,\s*data\.model,\s*'VERIFY_REQUEST'\)/);
    expect(src).toMatch(/_selectModel\('CHAT_REQUEST',\s*data\.model,\s*'claude-haiku-4-5'\)/);
    expect(src).toMatch(/callAI\(prompt,\s*data\.model,\s*'CHAT_REQUEST',\s*'claude-haiku-4-5'\)/);
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
    expect(_payloadTooLargeCall({ text: 'Hello world' })).toBe(false);
    expect(_payloadTooLargeCall({ text: 'x'.repeat(50_000) })).toBe(false);
  });

  test('passes ordinary chat payloads', () => {
    expect(
      _payloadTooLargeCall({
        systemPrompt: 'You are a tutor. ' + 'x'.repeat(5_000),
        userMessage: 'Explain ' + 'y'.repeat(2_000),
      }),
    ).toBe(false);
  });

  test('rejects when text alone exceeds the cap', () => {
    expect(_payloadTooLargeCall({ text: 'x'.repeat(_MAX_PAYLOAD_CHARS + 1) })).toBe(true);
  });

  test('rejects when the SUM of text + systemPrompt + userMessage exceeds the cap', () => {
    // Each below the cap, total above.
    expect(
      _payloadTooLargeCall({
        text: 'x'.repeat(80_000),
        systemPrompt: 'y'.repeat(80_000),
        userMessage: 'z'.repeat(80_000),
      }),
    ).toBe(true);
  });

  test('treats missing fields as zero (does not throw)', () => {
    expect(_payloadTooLargeCall({})).toBe(false);
    expect(_payloadTooLargeCall(null)).toBe(false);
    expect(_payloadTooLargeCall(undefined)).toBe(false);
  });

  // ── Audit V5: non-string `.length` bypass via String coercion ──
  // Without String(...) coercion, `data.text = new Array(N).fill('x'.repeat(M))`
  // had `.length === N`, bypassing the cap while the array stringified
  // to ~N*M characters in the prompt sent to Puter.js. _fieldChars now
  // forces String(...) before reading `.length`.
  test('_fieldChars treats null/undefined as 0', () => {
    expect(_fieldChars(null)).toBe(0);
    expect(_fieldChars(undefined)).toBe(0);
  });

  test('_fieldChars coerces non-strings to their stringified length', () => {
    // An array of 10 items each 100 chars → stringified is ~1010 chars
    // (joined with commas). The point: NOT 10 (the array's own length).
    const arr = new Array(10).fill('x'.repeat(100));
    expect(_fieldChars(arr)).toBeGreaterThan(1000);
  });

  test('rejects when data.text is an array whose joined size exceeds the cap', () => {
    // Adversary trick: 10-item array, each ~25K chars → stringified ~250K.
    // .length === 10 would pass the old guard; String coercion catches it.
    const bigArray = new Array(10).fill('x'.repeat(25_000));
    expect(_payloadTooLargeCall({ text: bigArray })).toBe(true);
  });

  test('catches an object whose toString dumps bytes beyond .length=10', () => {
    // The point of String coercion: an attacker can't smuggle a huge
    // payload past the cap by passing an object whose .length lies.
    // String(obj) calls toString() and returns whatever it produces;
    // if that's a huge string, _fieldChars catches it.
    const hostile = {
      length: 10,
      toString: () => 'x'.repeat(_MAX_PAYLOAD_CHARS + 1),
    };
    expect(_payloadTooLargeCall({ text: hostile })).toBe(true);
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
  test('tracks active StreamSession instances by request id', () => {
    expect(src).toMatch(/const\s+_activeStreams\s*=\s*new\s+Map\(\s*\)/);
    expect(src).toMatch(/class\s+StreamSession\s*\{/);
    expect(src).toMatch(/_activeStreams\.set\s*\(\s*data\.id\s*,\s*streamEntry\s*\)/);
  });

  test('routes CHAT_ABORT through StreamSession.cancel()', () => {
    expect(src).toMatch(/function\s+_handleAbort\s*\(\s*id\s*\)/);
    expect(src).toMatch(/_activeStreams\.get\(id\)\?\.cancel\(\)/);
    expect(src).toMatch(/data\.type\s*===\s*['"]CHAT_ABORT['"]/);
    expect(src).toMatch(/_handleAbort\s*\(\s*data\.id\s*\)/);
  });

  test('StreamSession cancellation closes upstream, releases globals, and removes the map entry', () => {
    expect(src).toMatch(
      /cancel\(\)\s*\{[\s\S]*?this\.cancelled\s*=\s*true[\s\S]*?this\.closeUpstream\(\)[\s\S]*?this\.releasePuterGlobals\?\.\(\)[\s\S]*?this\.clearWatchdog\(\)[\s\S]*?_activeStreams\.delete\(this\.id\)/,
    );
  });

  test('breaks streaming and suppresses CHAT_STREAM_END after cancellation', () => {
    expect(src).toMatch(/if\s*\(\s*streamEntry\.cancelled\s*\)\s*break/);
    expect(src).toMatch(/if\s*\(\s*!streamEntry\.cancelled\s*\)/);
  });

  test('finalizes the session in the chat handler finally block', () => {
    expect(src).toMatch(/finally\s*\{\s*streamEntry\?\.finish\(\);\s*\}/);
    expect(src).toMatch(/finish\(\)\s*\{[\s\S]*?this\.clearWatchdog\(\)[\s\S]*?_activeStreams\.delete\(this\.id\)/);
  });

  test('watchdog cancels, closes, releases, and removes a stalled session', () => {
    expect(src).toMatch(
      /armWatchdog\(\)\s*\{[\s\S]*?setTimeout\([\s\S]*?this\.cancelled\s*=\s*true[\s\S]*?this\.closeUpstream\(\)[\s\S]*?this\.releasePuterGlobals\?\.\(\)[\s\S]*?_activeStreams\.delete\(this\.id\)/,
    );
    expect(src).toMatch(/_CHAT_STREAM_BRIDGE_TIMEOUT_MS/);
  });

  test('clearWatchdog owns timer cleanup', () => {
    expect(src).toMatch(
      /clearWatchdog\(\)\s*\{[\s\S]*?clearTimeout\(this\.watchdog\)[\s\S]*?this\.watchdog\s*=\s*null/,
    );
  });

  test('skips fallback retry and error responses after a stream is cancelled', () => {
    expect(src).toMatch(/shouldCancel\s*\)/);
    expect(src).toMatch(/streamEntry\?\.cancelled[\s\S]*?return;/);
    expect(src).toMatch(/\(\)\s*=>\s*streamEntry\.cancelled/);
  });

  test('checks cancellation after loadPuter before starting the streaming handler', () => {
    const handlerStart = src.indexOf('async function _handleChatRequest');
    const handlerEnd = src.indexOf("window.addEventListener('message'", handlerStart);
    const handler = src.slice(handlerStart, handlerEnd);
    const loadIdx = handler.indexOf('await loadPuter()');
    const cancelCheckIdx = handler.indexOf('streamEntry?.cancelled', loadIdx);
    const streamCallIdx = handler.indexOf('_handleStreamingChat(', cancelCheckIdx);
    expect(handlerStart).toBeGreaterThan(0);
    expect(loadIdx).toBeGreaterThan(0);
    expect(cancelCheckIdx).toBeGreaterThan(loadIdx);
    expect(streamCallIdx).toBeGreaterThan(cancelCheckIdx);
  });
});

// ── M-1 content-side: translator.js must emit CHAT_ABORT on BOTH the
//    user-initiated abort path AND the stream timeout path (audit V1).
describe('translator.js emits CHAT_ABORT on both abort and timeout', () => {
  const translatorSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'translator.js'), 'utf8');

  test('_postAbort helper builds CHAT_ABORT with full required shape', () => {
    // _postAbort is the shared chokepoint used by both onAbort and the
    // setTimeout. The PR consolidated to avoid the V1 regression where
    // the timeout path quietly let the bridge keep streaming. Pin the
    // helper's structure here so a future refactor that drops fields
    // (id, nonce, target origin) fails fast.
    const m = translatorSrc.match(/const\s+_postAbort\s*=\s*\(\)\s*=>\s*\{([\s\S]+?)\};/);
    expect(m).not.toBeNull();
    const body = m[1];
    expect(body).toMatch(/window\.postMessage\s*\(/);
    expect(body).toMatch(/type:\s*['"]CHAT_ABORT['"]/);
    expect(body).toMatch(/\bid,/); // shorthand `id: id`
    expect(body).toMatch(/__nonce__:\s*this\._bridgeNonce/);
    expect(body).toMatch(/window\.location\.origin/);
  });

  test('onAbort calls _postAbort() then cleanup() then reject(AbortError)', () => {
    // Order matters: cleanup() removes the message listener; calling it
    // before _postAbort would let the abort message race against
    // teardown.
    const m = translatorSrc.match(/const\s+onAbort\s*=\s*\(\)\s*=>\s*\{([\s\S]+?)\};/);
    expect(m).not.toBeNull();
    const body = m[1];
    const postIdx = body.indexOf('_postAbort()');
    const cleanupIdx = body.indexOf('cleanup()');
    const rejectIdx = body.indexOf('reject(');
    expect(postIdx).toBeGreaterThanOrEqual(0);
    expect(cleanupIdx).toBeGreaterThan(postIdx);
    expect(rejectIdx).toBeGreaterThan(cleanupIdx);
    expect(body).toMatch(/AbortError/);
  });

  test('stream timeout body ALSO calls _postAbort (audit V1 regression guard)', () => {
    // Before this fix, the setTimeout callback was `cleanup() + reject` —
    // bridge kept generating tokens until Puter completed naturally on
    // every 60s timeout. Assert _postAbort is in the callback.
    const m = translatorSrc.match(
      /setTimeout\s*\(\s*\(\)\s*=>\s*\{([\s\S]+?)\},\s*SKILLBRIDGE_THRESHOLDS\.CHAT_STREAM_TIMEOUT/,
    );
    expect(m).not.toBeNull();
    const body = m[1];
    expect(body).toMatch(/_postAbort\(\)/);
    expect(body).toMatch(/Stream timed out/);
  });
});
