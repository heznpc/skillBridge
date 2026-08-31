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
// The probe delegates URL validation, so that helper has to come along too.
const baseMatch = bgSrc.match(/function _allowedLocalBase\(baseUrl\)\s*\{[\s\S]*?\n\}/);
if (!baseMatch) throw new Error('Could not extract _allowedLocalBase from background.js');
const allowedLocalBase = new Function(`${baseMatch[0]}\nreturn _allowedLocalBase;`)();
// fetch is injected so the reachability probe can be exercised against fakes.
const makeCheck = (fakeFetch) =>
  new Function('fetch', `${baseMatch[0]}\n${checkMatch[0]}\nreturn _checkLocalEngine;`)(fakeFetch);

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

  test('engine defaults to cloud when unset, and the pref read is time-bounded', () => {
    // The storage read is raced against a timeout so a stalled chrome.storage
    // IPC can never gate the tutor (source of a batch-load E2E flake where the
    // offline notice/chat reply never appeared).
    expect(trSrc).toContain("return result?.sb_ai_engine || 'cloud';");
    expect(trSrc).toMatch(/Promise\.race\(\[read, timeout\]\)/);
  });

  test('local engine uses the SW proxy Port and honors AbortSignal', () => {
    expect(trSrc).toContain("opts.purpose === 'refinement' ? 'sb-local-refinement' : 'sb-local-chat'");
    expect(bgSrc).toContain("port.name === 'sb-local-chat'");
    expect(bgSrc).toContain("port.name === 'sb-local-refinement'");
    expect(trSrc).toContain("opts.signal.addEventListener('abort', onAbort, { once: true });");
  });

  test('local refinement uses its own Port instead of widening Local Tutor', () => {
    const refine = trSrc.slice(trSrc.indexOf('async refineText('), trSrc.indexOf('async chatStream('));
    expect(refine).toContain("purpose: 'refinement'");
    expect(bgSrc).toContain('function _isLocalRefinementPort(port)');
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

  test('trailing slashes in the base URL are normalized on both probe requests', async () => {
    const requested = [];
    const check = makeCheck(async (url) => {
      requested.push(url);
      return { ok: true, status: 200, json: async () => OK_MODELS };
    });
    await check('http://localhost:11434/v1///');
    expect(requested).toEqual(['http://localhost:11434/v1/models', 'http://localhost:11434/v1/chat/completions']);
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

// Measured against a real Ollama 0.32.3 on 2026-07-30, driving the packaged
// bundle in Chromium:
//
//   SW GET  /v1/models           -> 200   (Chrome sends no Origin on a bodyless GET)
//   SW POST /v1/chat/completions -> 403   (Chrome attaches chrome-extension://<id>)
//
// So the reachability GET structurally cannot observe the block the tutor's
// POST will hit. Before this, the popup rendered "Connected to local server"
// and the first question failed with an untranslated English error, while the
// 13-language OLLAMA_ORIGINS guidance behind `status: 'cors'` was unreachable
// for a default install. The probe now matches the chat request's shape.
describe('_checkLocalEngine — origin block is detected at probe time, not first chat', () => {
  const OK_MODELS = { data: [{ id: 'gemma3:4b' }] };
  const reply = (url, { chatStatus }) =>
    url.endsWith('/models')
      ? { ok: true, status: 200, json: async () => OK_MODELS }
      : { ok: chatStatus < 400, status: chatStatus };

  test('models 200 + chat 403 → cors, so the popup shows the OLLAMA_ORIGINS guidance', async () => {
    const check = makeCheck(async (url) => reply(url, { chatStatus: 403 }));
    expect(await check('http://localhost:11434/v1')).toEqual({
      ok: false,
      status: 'cors',
      httpStatus: 403,
    });
  });

  test('models 200 + chat 400 → ok: an allowed origin fails validation, not authorization', async () => {
    const check = makeCheck(async (url) => reply(url, { chatStatus: 400 }));
    expect(await check('http://localhost:11434/v1')).toEqual({
      ok: true,
      status: 'ok',
      models: ['gemma3:4b'],
    });
  });

  test('the origin probe sends the chat shape but cannot load a model', async () => {
    let chatInit = null;
    const check = makeCheck(async (url, init) => {
      if (url.endsWith('/chat/completions')) chatInit = init;
      return reply(url, { chatStatus: 400 });
    });
    await check('http://localhost:11434/v1');
    // Same method and content type as the real tutor request — that is what
    // makes Chrome attach the Origin header the server judges.
    expect(chatInit.method).toBe('POST');
    expect(chatInit.headers['Content-Type']).toBe('application/json');
    // An empty object cannot name a model or carry messages, so a permitted
    // origin is rejected by request validation before any inference starts.
    expect(chatInit.body).toBe('{}');
    expect(chatInit.body).not.toContain('model');
    expect(chatInit.body).not.toContain('messages');
  });

  test('a transport failure on the origin probe keeps the reachable verdict', async () => {
    const check = makeCheck(async (url) => {
      if (url.endsWith('/chat/completions')) throw new Error('socket hang up');
      return { ok: true, status: 200, json: async () => OK_MODELS };
    });
    // The GET already proved the server is there; a flaky second probe must
    // not report a working local engine as unusable.
    expect(await check('http://localhost:11434/v1')).toEqual({
      ok: true,
      status: 'ok',
      models: ['gemma3:4b'],
    });
  });

  test('a 403 on the reachability GET still short-circuits to cors', async () => {
    // Servers that do reject the bodyless GET must not need the second probe.
    let chatProbed = false;
    const check = makeCheck(async (url) => {
      if (url.endsWith('/chat/completions')) chatProbed = true;
      return { ok: false, status: 403 };
    });
    expect(await check()).toEqual({ ok: false, status: 'cors', httpStatus: 403 });
    expect(chatProbed).toBe(false);
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
    const localStream = bgSrc.slice(
      bgSrc.indexOf('async function _streamLocalChat'),
      bgSrc.indexOf('chrome.runtime.onConnect'),
    );
    const disconnectBlock = localStream.slice(localStream.indexOf('port.onDisconnect.addListener'));
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
    const brokerSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'bridge', 'puter-content-broker.js'), 'utf8');
    expect(brokerSrc).toContain('Puter sign-in required');
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
    expect(sidebarSrc).toContain("return result?.sb_ai_engine || 'cloud';");
  });

  // `translator._getAiEngine()` and `sidebar._currentEngine()` are otherwise
  // identical — same storage key, same 1500 ms race, same final fallback line.
  // They differ in ONE word: the translator's timeout rejects, the sidebar's
  // resolves. That asymmetry is the privacy boundary. Someone tidying the two
  // into a shared helper, or "fixing the inconsistency", would either make the
  // send path default into the cloud against a stored 'local'/'off' preference
  // (fail open, the serious direction) or make a stalled read swallow the
  // offline notice entirely. Neither shows up in any behavioural test, so pin
  // the shapes.
  test('only the send-path gate fails closed; the offline-notice helper does not', () => {
    const trSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'translator.js'), 'utf8');
    const gate = trSource.slice(trSource.indexOf('async _getAiEngine()'), trSource.indexOf('async _localChatStream('));
    expect(gate).toMatch(/new Promise\(\(_resolve, reject\) =>/);
    expect(gate).toContain('Tutor engine preference read timed out');
    // No swallowing try/catch around the race — a rejected read must propagate.
    expect(gate).not.toMatch(/catch\s*\(/);

    const helper = sidebarSrc.slice(
      // From the doc comment, not the signature — the rationale lives above it.
      sidebarSrc.indexOf("// Selected tutor engine ('cloud' | 'local' | 'off'); defaults to cloud."),
      sidebarSrc.indexOf('function _finalErrorMessage('),
    );
    expect(helper).toMatch(/new Promise\(\(resolve\) => setTimeout\(\(\) => resolve\(null\)/);
    expect(helper).not.toContain('reject');
    // And it must say why, so the next reader does not "align" them.
    expect(helper).toContain('DELIBERATELY NOT');
  });

  test('the send path re-reads the preference through the fail-closed gate', () => {
    // This is what makes the sidebar helper safe to fail open: it is not the
    // last word on where the prompt goes.
    expect(trSrc).toContain('const engine = await this._getAiEngine();');
  });

  test('structured HTML uses cache offline and defers only misses', () => {
    const fn = queueSrc.slice(
      queueSrc.indexOf('async function translateHtmlItems'),
      queueSrc.indexOf('async function processGTQueue'),
    );
    const cacheAt = fn.indexOf('translator.cachedLookup(_htmlCacheKey(source), targetLang)');
    const offlineAt = fn.indexOf('if (sb.isOffline)');
    expect(cacheAt).toBeGreaterThan(-1);
    expect(offlineAt).toBeGreaterThan(cacheAt);
    expect(fn).toContain('queueOfflineItems(uncached.flatMap((source) => bySource.get(source)));');
    // The original early-return dropped cached and uncached blocks alike.
    expect(fn).not.toContain('if (sb.isOffline) return true;');
  });

  test('the offline flush re-queues by element, so deferred blocks get re-classified', () => {
    expect(queueSrc).toContain('function flushOfflinePending(');
    const fn = queueSrc.slice(queueSrc.indexOf('function flushOfflinePending('), queueSrc.indexOf('sb._gt = {'));
    expect(fn).toContain('queueForGoogleTranslate(');
    expect(fn).toContain('pending.map((item) => item.el)');
  });
});

// ============================================================
// LOCAL ENGINE TRUST BOUNDARY
// ============================================================
//
// The service worker is the one context that can fetch localhost cross-origin,
// so whatever base URL reaches it is fetched as the extension. The value comes
// from chrome.storage.local — writable by every extension context — and used to
// be trusted after nothing but a trailing-slash trim. `optional_host_permissions`
// already narrows the blast radius, but the prompt travels in the request BODY,
// so a request that merely leaves is already a leak even when the response is
// unreadable. These pin the check rather than leaving the boundary implicit in
// one manifest key.
describe('_allowedLocalBase', () => {
  test('accepts the shapes a real local server uses', () => {
    expect(allowedLocalBase('http://localhost:11434/v1')).toBe('http://localhost:11434/v1');
    expect(allowedLocalBase('http://127.0.0.1:8080/v1')).toBe('http://127.0.0.1:8080/v1');
    expect(allowedLocalBase('http://localhost:11434/v1///')).toBe('http://localhost:11434/v1');
    // Unset config falls back to the documented Ollama default.
    expect(allowedLocalBase('')).toBe('http://localhost:11434/v1');
    expect(allowedLocalBase(undefined)).toBe('http://localhost:11434/v1');
  });

  test('refuses a remote host — the prompt would leave the machine', () => {
    expect(allowedLocalBase('http://evil.test/v1')).toBeNull();
    expect(allowedLocalBase('https://evil.test/v1')).toBeNull();
    // Lookalikes that are NOT loopback.
    expect(allowedLocalBase('http://localhost.evil.test/v1')).toBeNull();
    expect(allowedLocalBase('http://127.0.0.1.evil.test/v1')).toBeNull();
  });

  test('refuses non-http schemes', () => {
    expect(allowedLocalBase('file:///etc/passwd')).toBeNull();
    expect(allowedLocalBase('ftp://localhost/v1')).toBeNull();
    // https on loopback is not in optional_host_permissions either; accepting
    // it here would promise a host Chrome never granted.
    expect(allowedLocalBase('https://localhost:11434/v1')).toBeNull();
  });

  test('refuses embedded credentials', () => {
    // Would be forwarded to the local server verbatim, and no legitimate
    // Ollama/OpenAI-compatible base carries them.
    expect(allowedLocalBase('http://user:pass@localhost:11434/v1')).toBeNull();
  });

  test('strips query and fragment so the appended path stays a path', () => {
    // The caller appends `/chat/completions`; without this a trailing `?`
    // would swallow that suffix into a query string.
    expect(allowedLocalBase('http://localhost:11434/v1?x=1')).toBe('http://localhost:11434/v1');
    expect(allowedLocalBase('http://localhost:11434/v1#frag')).toBe('http://localhost:11434/v1');
  });

  test('garbage input is rejected rather than thrown on', () => {
    expect(allowedLocalBase('not a url')).toBeNull();
    expect(allowedLocalBase('://')).toBeNull();
  });
});

describe('local chat port gating (source contract)', () => {
  test('the port is validated before any stream starts', () => {
    // Ordering matters: validation has to run before `started` is latched or a
    // rejected port could still kick off one stream.
    const handler = bgSrc.slice(bgSrc.indexOf('const localPortGate ='));
    const gateAt = handler.indexOf('if (!localPortGate(port))');
    const startedAt = handler.indexOf('let started = false;');
    expect(gateAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(startedAt);
    expect(handler.slice(gateAt, gateAt + 120)).toContain('port.disconnect()');
  });

  test('the gate reuses the shared Tutor shape and origin boundary', () => {
    const fn = bgSrc.slice(
      bgSrc.indexOf('function _isLocalChatPort'),
      bgSrc.indexOf('function _isLocalRefinementOrigin'),
    );
    expect(fn).toContain('_isTutorPortShape(port)');
    expect(fn).toContain('_isTrustedTutorOrigin(');
    expect(fn).not.toContain("endsWith('.skilljar.com')");
    expect(fn).not.toContain("url.hostname === 'claude.com'");
  });

  test('the wider refinement surfaces live behind a distinct gate', () => {
    const fn = bgSrc.slice(
      bgSrc.indexOf('function _isLocalRefinementOrigin'),
      bgSrc.indexOf('async function _streamLocalChat'),
    );
    expect(fn).toContain("endsWith('.skilljar.com')");
    expect(fn).toContain("url.hostname === 'claude.com'");
    expect(fn).toContain('function _isLocalRefinementPort(port)');
  });

  test('the invalid-URL reply goes through the guarded send, like every other reply', () => {
    const fn = bgSrc.slice(bgSrc.indexOf('async function _streamLocalChat'), bgSrc.indexOf('chrome.runtime.onConnect'));
    expect(fn.match(/\bport\.postMessage\(/g)).toHaveLength(1);
    expect(fn).toContain("send({ type: 'error', error: 'Local AI server URL must be");
  });
});

// ============================================================
// SSE STREAM LOOP
// ============================================================
//
// _parseSseDelta is tested line by line above, but nothing exercised the loop
// that feeds it. That loop owns the buffering, and the buffering is where the
// last frame used to be lost.
describe('_streamLocalChat — frame buffering', () => {
  const streamMatch = bgSrc.match(/async function _streamLocalChat\(port, req\)\s*\{[\s\S]*?\n\}/);
  if (!streamMatch) throw new Error('Could not extract _streamLocalChat from background.js');
  const parseMatch = bgSrc.match(/function _parseSseDelta\(line\)\s*\{[\s\S]*?\n\}/);

  /** Build the real function with its collaborators injected. */
  const makeStream = (fakeFetch) =>
    new Function(
      'fetch',
      'TextDecoder',
      'AbortController',
      `${baseMatch[0]}\n${parseMatch[0]}\n${streamMatch[0]}\nreturn _streamLocalChat;`,
    )(fakeFetch, TextDecoder, AbortController);

  /** A fetch whose body yields exactly the given string chunks. */
  const fetchYielding = (chunks) => async () => ({
    ok: true,
    status: 200,
    body: {
      getReader: () => {
        let i = 0;
        return {
          read: async () =>
            i < chunks.length
              ? { value: new TextEncoder().encode(chunks[i++]), done: false }
              : { value: undefined, done: true },
          cancel: async () => {},
        };
      },
    },
  });

  const collect = async (chunks) => {
    const msgs = [];
    const port = {
      postMessage: (m) => msgs.push(m),
      onDisconnect: { addListener: () => {} },
    };
    await makeStream(fetchYielding(chunks))(port, { baseUrl: 'http://localhost:11434/v1' });
    return msgs;
  };

  const deltas = (msgs) =>
    msgs
      .filter((m) => m.type === 'chunk')
      .map((m) => m.delta)
      .join('');

  test('a well-behaved stream ending in [DONE] delivers every token once', async () => {
    const msgs = await collect([
      'data: {"choices":[{"delta":{"content":"안녕"}}]}\n',
      'data: {"choices":[{"delta":{"content":"하세요"}}]}\n',
      'data: [DONE]\n',
    ]);
    expect(deltas(msgs)).toBe('안녕하세요');
    expect(msgs.filter((m) => m.type === 'done')).toHaveLength(1);
  });

  test('a final frame with NO trailing newline is not dropped', async () => {
    // Regression: the loop broke on `done` and never parsed what was left in
    // the buffer, so a server that closes right after its last `data:` line
    // silently lost that token. Ollama terminates properly, which is why this
    // went unnoticed — but the popup advertises any OpenAI-compatible server.
    const msgs = await collect([
      'data: {"choices":[{"delta":{"content":"first"}}]}\n',
      'data: {"choices":[{"delta":{"content":"LAST"}}]}',
    ]);
    expect(deltas(msgs)).toBe('firstLAST');
    expect(msgs.filter((m) => m.type === 'done')).toHaveLength(1);
  });

  test('a frame split across two reads is reassembled, not mangled', async () => {
    const msgs = await collect(['data: {"choices":[{"delta":{"con', 'tent":"split"}}]}\n', 'data: [DONE]\n']);
    expect(deltas(msgs)).toBe('split');
  });

  test('a multi-byte character split across the final two reads survives', async () => {
    // "한" is three UTF-8 bytes; cutting between them is only resolved by the
    // decoder's final non-streaming flush.
    const payload = Buffer.from('data: {"choices":[{"delta":{"content":"한"}}]}', 'utf8');
    const cut = payload.length - 2;
    const msgs = [];
    const port = { postMessage: (m) => msgs.push(m), onDisconnect: { addListener: () => {} } };
    const parts = [payload.subarray(0, cut), payload.subarray(cut)];
    let i = 0;
    const fakeFetch = async () => ({
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => (i < parts.length ? { value: parts[i++], done: false } : { value: undefined, done: true }),
          cancel: async () => {},
        }),
      },
    });
    await makeStream(fakeFetch)(port, { baseUrl: 'http://localhost:11434/v1' });
    expect(deltas(msgs)).toBe('한');
  });

  test('exactly one done is sent even when [DONE] arrives without a newline', async () => {
    const msgs = await collect(['data: {"choices":[{"delta":{"content":"x"}}]}\n', 'data: [DONE]']);
    expect(deltas(msgs)).toBe('x');
    expect(msgs.filter((m) => m.type === 'done')).toHaveLength(1);
  });
});
