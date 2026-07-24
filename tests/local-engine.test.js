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

const checkMatch = bgSrc.match(/async function _checkLocalEngine\(baseUrl\)\s*\{[\s\S]*?\n\}/);
if (!checkMatch) throw new Error('Could not extract _checkLocalEngine from background.js');
// fetch is injected so the reachability probe can be exercised against fakes.
const makeCheck = (fakeFetch) =>
  new Function('fetch', `${checkMatch[0]}\nreturn _checkLocalEngine;`)(fakeFetch);

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

describe('_checkLocalEngine (local reachability probe)', () => {
  const OK_MODELS = { data: [{ id: 'gemma3:4b' }, { id: 'llama3' }] };

  test('200 with model list → { ok, status: ok, models }', async () => {
    const check = makeCheck(async () => ({ ok: true, status: 200, json: async () => OK_MODELS }));
    expect(await check('http://localhost:11434/v1')).toEqual({ ok: true, status: 'ok', models: ['gemma3:4b', 'llama3'] });
  });

  test('trailing slashes in the base URL are normalized', async () => {
    let requested = '';
    const check = makeCheck(async (url) => {
      requested = url;
      return { ok: true, status: 200, json: async () => OK_MODELS };
    });
    await check('http://localhost:11434/v1///');
    expect(requested).toBe('http://localhost:11434/v1/models');
  });

  test('403 → { status: cors } (blocked origin — OLLAMA_ORIGINS)', async () => {
    const check = makeCheck(async () => ({ ok: false, status: 403 }));
    expect(await check()).toEqual({ ok: false, status: 'cors', httpStatus: 403 });
  });

  test('network failure → { status: unreachable }', async () => {
    const check = makeCheck(async () => {
      throw new Error('Failed to fetch');
    });
    const r = await check('http://localhost:9/v1');
    expect(r.ok).toBe(false);
    expect(r.status).toBe('unreachable');
  });

  test('SW registers the CHECK_LOCAL_ENGINE handler', () => {
    expect(bgSrc).toContain("msg.type === 'CHECK_LOCAL_ENGINE'");
  });
});

describe('local engine host permission', () => {
  test('manifest declares optional localhost host permission', () => {
    const manifest = require('../manifest.json');
    expect(manifest.optional_host_permissions).toContain('http://localhost/*');
  });

  test('popup requests the optional permission before probing', () => {
    const popupSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'popup', 'popup.js'), 'utf8');
    expect(popupSrc).toContain('chrome.permissions.request({ origins: LOCALHOST_ORIGINS })');
    expect(popupSrc).toContain("type: 'CHECK_LOCAL_ENGINE'");
  });
});
