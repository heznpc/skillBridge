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
const makeCheck = (fakeFetch) => new Function('fetch', `${checkMatch[0]}\nreturn _checkLocalEngine;`)(fakeFetch);

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
    expect(bgSrc).toContain('stream: true,');
    expect(bgSrc).toContain('OLLAMA_ORIGINS');
  });
});

describe('_checkLocalEngine (local reachability probe)', () => {
  const OK_MODELS = { data: [{ id: 'gemma3:4b' }, { id: 'llama3' }] };

  test('200 with model list → { ok, status: ok, models }', async () => {
    const check = makeCheck(async () => ({ ok: true, status: 200, json: async () => OK_MODELS }));
    expect(await check('http://localhost:11434/v1')).toEqual({
      ok: true,
      status: 'ok',
      models: ['gemma3:4b', 'llama3'],
    });
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

// Review findings: the SW proxy never cancelled the upstream request on port
// disconnect (Ollama kept generating server-side) and a postMessage on the
// dead port threw inside the catch → unhandled rejection in the worker.
describe('local stream cancellation + dead-port safety (source contract)', () => {
  test('the fetch is abortable and the disconnect aborts it', () => {
    expect(bgSrc).toContain('const controller = new AbortController();');
    expect(bgSrc).toContain('signal: controller.signal,');
    // onDisconnect must abort, not just flip a flag.
    const disconnectBlock = bgSrc.slice(bgSrc.indexOf('port.onDisconnect.addListener'));
    expect(disconnectBlock.slice(0, 260)).toContain('controller.abort()');
  });

  test('the reader/body is cancelled so the local server stops generating', () => {
    expect(bgSrc).toContain('await reader.cancel()');
    expect(bgSrc).toContain('await resp.body?.cancel()');
  });

  test('every reply goes through a guarded send (never a raw postMessage in the relay)', () => {
    const fn = bgSrc.slice(bgSrc.indexOf('async function _streamLocalChat'), bgSrc.indexOf('chrome.runtime.onConnect'));
    expect(fn).toContain('const send = (msg) =>');
    // Exactly one port.postMessage in the whole function: the one inside the
    // guarded `send` helper. Any other is an unguarded call that would throw
    // on a disconnected port.
    expect(fn.match(/\bport\.postMessage\(/g)).toHaveLength(1);
    const sendHelper = fn.slice(fn.indexOf('const send = (msg) =>'), fn.indexOf('port.onDisconnect'));
    expect(sendHelper).toContain('port.postMessage(msg);');
    expect(sendHelper).toContain('if (aborted) return;');
  });

  test('an abort is not reported as a server failure', () => {
    expect(bgSrc).toContain("if (aborted || err?.name === 'AbortError') return;");
  });

  test('the port handler guards against a second start and handles rejections', () => {
    expect(bgSrc).toContain('void _streamLocalChat(port, req).catch(');
    expect(bgSrc).toMatch(/if \(!req \|\| req\.type !== 'start' \|\| started\) return;/);
  });
});

// Review finding: the local path had no timeout at all, so a stalled local
// server left the sidebar spinner running forever with send disabled.
describe('local stream watchdog', () => {
  test('a generous first-token window covers a cold model load', () => {
    const constantsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'constants.js'), 'utf8');
    const m = constantsSrc.match(/LOCAL_FIRST_TOKEN_TIMEOUT:\s*(\d+)/);
    expect(m).toBeTruthy();
    // Must exceed the measured gemma3:4b cold load (10.7s) by a wide margin.
    expect(Number(m[1])).toBeGreaterThanOrEqual(60000);
  });

  test('the watchdog is armed before the request and re-armed on every chunk', () => {
    expect(trSrc).toContain('armWatchdog(SKILLBRIDGE_THRESHOLDS.LOCAL_FIRST_TOKEN_TIMEOUT);');
    expect(trSrc).toContain('armWatchdog(SKILLBRIDGE_THRESHOLDS.CHAT_STREAM_TIMEOUT);');
    expect(trSrc).toContain("finish(reject, new Error('Local AI stream timed out'))");
  });

  test('settling clears the watchdog', () => {
    const fn = trSrc.slice(trSrc.indexOf('async _localChatStream'), trSrc.indexOf('async chatStream'));
    expect(fn).toContain('if (watchdog) clearTimeout(watchdog);');
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

  // Review finding: denying the Chrome prompt still persisted
  // sb_ai_engine='local', so every later tutor message routed to a fetch that
  // could never succeed, with no hint in the reopened popup.
  test('denying the permission reverts the stored engine and explains why', () => {
    const popupSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'popup', 'popup.js'), 'utf8');
    const fn = popupSrc.slice(
      popupSrc.indexOf('async function ensureLocalPermissionAndProbe'),
      popupSrc.indexOf('engineField.style.display'),
    );
    expect(fn).toContain('engineSelect.value = revertTo;');
    expect(fn).toContain('await chrome.storage.local.set({ sb_ai_engine: revertTo });');
    // The local block (and its status line) is hidden by the revert, so the
    // message must go to the always-visible status row.
    expect(fn).toContain('showStatus(t(ENGINE_LABELS.permDenied)');
    expect(popupSrc).toContain('ensureLocalPermissionAndProbe(previousEngine)');
  });

  // Review finding: the status line was the one string in the engine block
  // that a popup language change did not re-render.
  test('the local status line re-renders on a language change', () => {
    const popupSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'popup', 'popup.js'), 'utf8');
    expect(popupSrc).toContain('localStatusMap = map || null;');
    const fn = popupSrc.slice(popupSrc.indexOf('function renderEngineLabels'), popupSrc.indexOf('const localStatus'));
    expect(fn).toContain('if (localStatusMap && statusEl) statusEl.textContent = t(localStatusMap);');
    // Declared before renderPopupLabels' first call — otherwise the popup
    // boots into a TDZ ReferenceError.
    expect(popupSrc.indexOf('let localStatusMap')).toBeLessThan(popupSrc.indexOf('renderPopupLabels();'));
  });
});

// Review finding (v4): a deliberately-off tutor rendered the generic
// "an error occurred" bubble WITH a retry button, so it looked transient and
// retrying re-sent the same doomed request in a loop. Deterministic engine
// states must explain themselves instead.
describe('tutor error surfacing for deterministic engine states', () => {
  const sidebarSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'sidebar-chat.js'), 'utf8');
  const domSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'chat-message-dom.js'), 'utf8');

  test('a non-retryable renderer exists and is exported', () => {
    expect(domSrc).toContain('function renderFinalError(bubble, message)');
    expect(domSrc).toMatch(/dom = \{[\s\S]*renderFinalError,/);
    // It must NOT attach a retry control.
    const fn = domSrc.slice(
      domSrc.indexOf('function renderFinalError'),
      domSrc.indexOf('function renderRetryableError'),
    );
    expect(fn).not.toContain('si18n-retry-btn');
  });

  test('the sidebar routes off / sign-in / local-unreachable to the final renderer', () => {
    expect(sidebarSrc).toContain('const finalMessage = _finalErrorMessage(err);');
    expect(sidebarSrc).toContain('chatDom.renderFinalError(bubble, finalMessage);');
    const mapper = sidebarSrc.slice(
      sidebarSrc.indexOf('function _finalErrorMessage'),
      sidebarSrc.indexOf('async function sendChatMessage'),
    );
    expect(mapper).toContain('ENGINE_LABELS.tutorOff');
    expect(mapper).toContain('ENGINE_LABELS.tutorSignInRequired');
    expect(mapper).toContain('ENGINE_LABELS.tutorLocalUnreachable');
    // Transient failures keep the retry affordance.
    expect(mapper).toContain('return null;');
  });

  // Behavioral: run the REAL mapper against the REAL error strings the three
  // engines throw, with the label maps stubbed to their own names.
  const makeMapper = () => {
    const m = sidebarSrc.match(/function _finalErrorMessage\(err\)\s*\{[\s\S]*?\n {2}\}/);
    if (!m) throw new Error('Could not extract _finalErrorMessage from sidebar-chat.js');
    const label = (name) => ({ __name: name });
    return new Function('sb', 'ENGINE_LABELS', `${m[0]}\nreturn _finalErrorMessage;`)(
      { t: (map) => map.__name },
      {
        tutorOff: label('tutorOff'),
        tutorSignInRequired: label('tutorSignInRequired'),
        tutorLocalUnreachable: label('tutorLocalUnreachable'),
      },
    );
  };

  test.each([
    ['AI tutor is turned off in settings.', 'tutorOff'],
    ['Puter sign-in required — the AI tutor needs a (free) Puter session.', 'tutorSignInRequired'],
    ['Cannot reach local AI server: Failed to fetch', 'tutorLocalUnreachable'],
    ['Local AI engine unavailable: Receiving end does not exist', 'tutorLocalUnreachable'],
    ['Local AI connection closed', 'tutorLocalUnreachable'],
  ])('maps %j to the %s explanation', (message, expected) => {
    expect(makeMapper()(new Error(message))).toBe(expected);
  });

  test.each([
    ['Stream timed out'],
    ['Local AI stream timed out'],
    ['Local AI server returned HTTP 500'],
    ['Puter chat unavailable: Internal Server Error'],
  ])('keeps the retry affordance for the transient failure %j', (message) => {
    expect(makeMapper()(new Error(message))).toBeNull();
  });

  test('the thrown strings the mapper keys on still exist in the sources', () => {
    expect(trSrc).toContain("throw new Error('AI tutor is turned off in settings.')");
    const bridgeSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'page-bridge.js'), 'utf8');
    expect(bridgeSrc).toContain('Puter sign-in required');
    expect(bgSrc).toContain('Cannot reach local AI server');
    expect(trSrc).toContain('Local AI engine unavailable');
  });
});

// Review findings: the offline guard blocked the LOCAL engine (which talks to
// this machine and needs no internet), and structured HTML blocks were dropped
// offline instead of being deferred like plain text.
describe('offline behavior', () => {
  const sidebarSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'sidebar-chat.js'), 'utf8');
  const queueSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'gt-queue.js'), 'utf8');

  test('the chat offline guard exempts the local engine', () => {
    expect(sidebarSrc).toContain("const offlineBlocks = sb.isOffline && (await _currentEngine()) !== 'local';");
    expect(sidebarSrc).toContain('if (offlineBlocks) {');
    expect(sidebarSrc).toContain('async function _currentEngine()');
    expect(sidebarSrc).toContain("return sb_ai_engine || 'cloud';");
  });

  test('structured HTML blocks are deferred offline, not dropped', () => {
    const fn = queueSrc.slice(
      queueSrc.indexOf('async function translateHtmlItems'),
      queueSrc.indexOf('async function processGTQueue'),
    );
    expect(fn).toContain('queueOfflineItems(htmlItems);');
    // The old early-return that silently abandoned them must be gone.
    expect(fn).not.toContain('if (sb.isOffline) return true;');
  });

  test('the offline flush re-queues by element, so deferred blocks get re-classified', () => {
    expect(queueSrc).toContain('function flushOfflinePending(');
    const fn = queueSrc.slice(queueSrc.indexOf('function flushOfflinePending('), queueSrc.indexOf('sb._gt = {'));
    expect(fn).toContain('queueForGoogleTranslate(');
    expect(fn).toContain('pending.map((item) => item.el)');
  });
});
