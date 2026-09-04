/**
 * Unit tests for the local AI engine (v4 A5) — the OpenAI-compatible SSE parser
 * and the service-worker relay. The parser is exercised with real Ollama
 * `/v1/chat/completions` stream frames; relay tests execute the production
 * functions with observable Port and fetch boundaries.
 */

/* global describe, test, expect, jest, AbortSignal */

const fs = require('fs');
const path = require('path');

const bgSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'background', 'background.js'), 'utf8');

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

const streamMatch = bgSrc.match(/async function _streamLocalChat\(port, req\)\s*\{[\s\S]*?\n\}/);
if (!streamMatch) throw new Error('Could not extract _streamLocalChat from background.js');

/** Build the real relay with its platform collaborators injected. */
const makeStream = (fakeFetch) =>
  new Function(
    'fetch',
    'TextDecoder',
    'AbortController',
    `${baseMatch[0]}\n${parserMatch[0]}\n${streamMatch[0]}\nreturn _streamLocalChat;`,
  )(fakeFetch, TextDecoder, AbortController);

function makeStreamPort({ postMessage } = {}) {
  const disconnectListeners = [];
  const port = {
    posted: [],
    postMessage: postMessage || ((message) => port.posted.push(message)),
    onDisconnect: { addListener: (listener) => disconnectListeners.push(listener) },
    emitDisconnect: () => disconnectListeners.forEach((listener) => listener()),
  };
  return port;
}

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
// localized OLLAMA_ORIGINS guidance behind `status: 'cors'` was unreachable
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

// Review findings: the SW proxy once left Ollama generating after the Port
// disappeared, and posting the resulting error to that dead Port could reject
// the service worker handler. Exercise those timing windows directly.
describe('_streamLocalChat — cancellation and dead-port safety', () => {
  test('a disconnect aborts an in-flight fetch without posting a server error', async () => {
    let fetchSignal;
    const fakeFetch = jest.fn(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          fetchSignal = init.signal;
          init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    const port = makeStreamPort();
    const pending = makeStream(fakeFetch)(port, { baseUrl: 'http://localhost:11434/v1' });
    await Promise.resolve();

    port.emitDisconnect();
    await expect(pending).resolves.toBeUndefined();

    expect(fetchSignal.aborted).toBe(true);
    expect(port.posted).toEqual([]);
  });

  test('a disconnect while fetch resolves cancels the unopened response body', async () => {
    let releaseResponse;
    const cancel = jest.fn().mockResolvedValue(undefined);
    const fakeFetch = jest.fn(
      () =>
        new Promise((resolve) => {
          releaseResponse = () => resolve({ ok: true, status: 200, body: { cancel } });
        }),
    );
    const port = makeStreamPort();
    const pending = makeStream(fakeFetch)(port, { baseUrl: 'http://localhost:11434/v1' });
    await Promise.resolve();

    port.emitDisconnect();
    releaseResponse();
    await pending;

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(port.posted).toEqual([]);
  });

  test('a disconnect during reader.read cancels the active reader', async () => {
    let releaseRead;
    const cancel = jest.fn().mockResolvedValue(undefined);
    const reader = {
      read: jest.fn(
        () =>
          new Promise((resolve) => {
            releaseRead = resolve;
          }),
      ),
      cancel,
    };
    const fakeFetch = jest.fn(async () => ({ ok: true, status: 200, body: { getReader: () => reader } }));
    const port = makeStreamPort();
    const pending = makeStream(fakeFetch)(port, { baseUrl: 'http://localhost:11434/v1' });
    for (let i = 0; i < 4; i++) await Promise.resolve();

    port.emitDisconnect();
    releaseRead({ value: undefined, done: true });
    await pending;

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(port.posted).toEqual([]);
  });

  test('a postMessage throw is contained instead of rejecting the relay', async () => {
    const postMessage = jest.fn(() => {
      throw new Error('disconnected port');
    });
    const port = makeStreamPort({ postMessage });
    const fakeFetch = jest.fn(async () => ({ ok: false, status: 500 }));

    await expect(makeStream(fakeFetch)(port, { baseUrl: 'http://localhost:11434/v1' })).resolves.toBeUndefined();
    expect(postMessage).toHaveBeenCalledWith({ type: 'error', error: 'Local AI server returned HTTP 500' });
  });
});

describe('local engine host permission', () => {
  test('manifest declares optional localhost host permission', () => {
    const manifest = require('../manifest.json');
    expect(manifest.optional_host_permissions).toContain('http://localhost/*');
  });
});

// Review finding (v4): a deliberately-off tutor rendered the generic
// "an error occurred" bubble WITH a retry button, so it looked transient and
// retrying re-sent the same doomed request in a loop. Deterministic engine
// states must explain themselves instead.
describe('tutor error surfacing for deterministic engine states', () => {
  const sidebarSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'sidebar-chat.js'), 'utf8');

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
});

describe('offline engine lookup fails open without weakening the send gate', () => {
  const sidebarSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'sidebar-chat.js'), 'utf8');
  const currentEngineMatch = sidebarSrc.match(/async function _currentEngine\(\)\s*\{[\s\S]*?\n {2}\}/);
  if (!currentEngineMatch) throw new Error('Could not extract _currentEngine from sidebar-chat.js');

  const makeCurrentEngine = (storageGet, setTimer = setTimeout, clearTimer = clearTimeout) =>
    new Function('chrome', 'setTimeout', 'clearTimeout', `${currentEngineMatch[0]}\nreturn _currentEngine;`)(
      { storage: { local: { get: storageGet } } },
      setTimer,
      clearTimer,
    );

  test('returns the stored local engine and clears the losing timeout', async () => {
    const clearTimer = jest.fn();
    const currentEngine = makeCurrentEngine(
      jest.fn().mockResolvedValue({ sb_ai_engine: 'local' }),
      jest.fn(() => 77),
      clearTimer,
    );
    await expect(currentEngine()).resolves.toBe('local');
    expect(clearTimer).toHaveBeenCalledWith(77);
  });

  test('falls back to cloud only for offline-message selection when storage rejects or stalls', async () => {
    const rejected = makeCurrentEngine(jest.fn().mockRejectedValue(new Error('storage unavailable')));
    await expect(rejected()).resolves.toBe('cloud');

    const stalled = makeCurrentEngine(
      jest.fn(() => new Promise(() => {})),
      (callback) => {
        callback();
        return 1;
      },
    );
    await expect(stalled()).resolves.toBe('cloud');
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

// ============================================================
// SSE STREAM LOOP
// ============================================================
//
// _parseSseDelta is tested line by line above, but nothing exercised the loop
// that feeds it. That loop owns the buffering, and the buffering is where the
// last frame used to be lost.
describe('_streamLocalChat — frame buffering', () => {
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

  test('posts an OpenAI-compatible streaming request to the normalized local endpoint', async () => {
    let request;
    const fakeFetch = async (url, init) => {
      request = { url, init };
      return fetchYielding([])();
    };
    const port = makeStreamPort();

    await makeStream(fakeFetch)(port, {
      baseUrl: 'http://localhost:11434/v1///',
      model: 'fixture-model',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(request.url).toBe('http://localhost:11434/v1/chat/completions');
    expect(request.init.method).toBe('POST');
    expect(request.init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(request.init.body)).toEqual({
      model: 'fixture-model',
      stream: true,
      messages: [{ role: 'user', content: 'hello' }],
    });
    expect(request.init.signal).toBeInstanceOf(AbortSignal);
  });

  test('rejects a remote base URL before fetch and reports the reason through the Port', async () => {
    const fakeFetch = jest.fn();
    const port = makeStreamPort();

    await makeStream(fakeFetch)(port, { baseUrl: 'https://remote.example/v1' });

    expect(fakeFetch).not.toHaveBeenCalled();
    expect(port.posted).toEqual([
      {
        type: 'error',
        error: 'Local AI server URL must be http://localhost or http://127.0.0.1',
      },
    ]);
  });

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
