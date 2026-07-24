/**
 * Unit tests for the local AI engine (v4 A5) — the OpenAI-compatible SSE parser
 * and the tutor engine routing. The parser is exercised with real Ollama
 * `/v1/chat/completions` stream frames; the routing is asserted against the
 * live source (the streaming Port itself is integration-only).
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

const bgSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'background', 'background.js'), 'utf8');
const trSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'translator.js'), 'utf8');

const parserMatch = bgSrc.match(/function _parseSseDelta\(line\)\s*\{[\s\S]*?\n\}/);
if (!parserMatch) throw new Error('Could not extract _parseSseDelta from background.js');
const _parseSseDelta = new Function(`${parserMatch[0]}\nreturn _parseSseDelta;`)();

describe('_parseSseDelta (local OpenAI-compatible SSE)', () => {
  test('token delta line → { delta }', () => {
    expect(_parseSseDelta('data: {"choices":[{"delta":{"content":"안녕"}}]}')).toEqual({ delta: '안녕' });
  });

  test('[DONE] sentinel → { done: true }', () => {
    expect(_parseSseDelta('data: [DONE]')).toEqual({ done: true });
  });

  test('role-only opening frame (no content) → null', () => {
    expect(_parseSseDelta('data: {"choices":[{"delta":{"role":"assistant"}}]}')).toBeNull();
  });

  test('comment / keep-alive / blank line → null', () => {
    expect(_parseSseDelta(': keep-alive')).toBeNull();
    expect(_parseSseDelta('')).toBeNull();
    expect(_parseSseDelta('event: message')).toBeNull();
  });

  test('malformed JSON → null (never throws)', () => {
    expect(_parseSseDelta('data: {broken')).toBeNull();
  });
});

describe('tutor engine routing', () => {
  test('chatStream branches on the selected engine before the Puter path', () => {
    expect(trSrc).toContain('const engine = await this._getAiEngine();');
    expect(trSrc).toContain("if (engine === 'off') throw new Error('AI tutor is turned off in settings.');");
    expect(trSrc).toContain("if (engine === 'local') return this._localChatStream(prompt, onChunk, opts);");
  });

  test('engine defaults to cloud when unset', () => {
    expect(trSrc).toContain("return sb_ai_engine || 'cloud';");
  });

  test('local engine uses the SW proxy Port and honors AbortSignal', () => {
    expect(trSrc).toContain("chrome.runtime.connect({ name: 'sb-local-chat' })");
    expect(bgSrc).toContain("if (port.name !== 'sb-local-chat') return;");
    expect(trSrc).toContain("opts.signal.addEventListener('abort', onAbort, { once: true });");
  });

  test('SW proxy posts an OpenAI-shaped body and handles 403 (Ollama origins)', () => {
    expect(bgSrc).toContain('/chat/completions');
    expect(bgSrc).toContain("stream: true,");
    expect(bgSrc).toContain('OLLAMA_ORIGINS');
  });
});
