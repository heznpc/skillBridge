/**
 * Page Bridge - Injected into the HOST PAGE's main world (not extension context)
 * Raw-developer bridge: loads the packaged Puter SDK entry file from extension
 * resources. That SDK contains lazy remote JS/WASM paths, so this bridge and
 * the SDK are omitted from the CWS bundle; packaging the entry file locally
 * does not by itself establish MV3 remote-code compliance.
 * Communicates with the content script via window.postMessage.
 */

(function () {
  'use strict';

  if (window.__SKILLBRIDGE_BRIDGE__) return;
  window.__SKILLBRIDGE_BRIDGE__ = true;

  // Read nonce and local Puter.js URL from injecting script element.
  // document.currentScript may be null for dynamically injected scripts in some
  // browsers/contexts, so fall back to getElementById with a known marker.
  const _currentScript = document.currentScript || document.getElementById('__skillbridge_loader__');
  const _bridgeNonce = _currentScript?.dataset?.nonce || crypto.randomUUID();
  const _puterUrl = _currentScript?.dataset?.puterUrl || '';

  let puterReady = false;
  let puterLoadPromise = null;
  let _puterChatImpl = null;
  let _puterApi = null;
  let _puterParentApi = null;
  let _puterParentCaptured = false;
  let _puterGlobalDepth = 0;
  let _puterPreviousGlobal = null;
  let _puterPreviousParentGlobal = null;
  let _puterPreviousHadGlobal = false;
  let _puterPreviousHadParentGlobal = false;
  // Live read of the bundled Puter SDK's auth state, captured before the SDK
  // global is scrubbed. Background AI paths (verify / block-translate) gate on
  // this so a signed-out user never trips Puter's sign-in prompt (see
  // _isPuterAuthed). null until the SDK is captured.
  let _puterAuthCheck = null;

  function log(...args) {
    console.warn('[SkillBridge PageBridge]', ...args);
  }

  // Whether the bundled Puter SDK currently holds an auth token. Calling
  // puter.ai.chat() while signed out (env "web") makes the SDK open its own
  // sign-in prompt — which would contradict SkillBridge's "no account required"
  // promise if it fired from a BACKGROUND path the user never invoked. Returns
  // false (→ skip) whenever auth state is unknown, so we never prompt by surprise.
  function _isPuterAuthed() {
    try {
      return _puterAuthCheck ? _puterAuthCheck() : false;
    } catch (_e) {
      return false;
    }
  }

  // Reply that a background AI request was skipped because the user is signed
  // out. success:true with a benign result keeps the caller's existing
  // Google-Translate output (verify/block-translate both no-op on empty/echo),
  // and crucially the SDK's auth prompt was never reached.
  function _replyUnauthedSkip(type, id, result) {
    window.postMessage(
      { __skillbridge__: true, __nonce__: _bridgeNonce, type, id, success: true, result, skipped: 'unauthenticated' },
      window.location.origin,
    );
  }

  // Hard upper bound on request payload sizes. Real translations top out
  // at a few kB; chat prompts in the 10-20 kB range. 200 kB sits well
  // above legitimate usage and well below any reasonable Claude / Gemini
  // context limit. Without this guard a buggy caller — or a page-world
  // script that managed to read the loader nonce — could burn the
  // shared Puter.js quota by submitting megabyte-sized prompts.
  const _MAX_PAYLOAD_CHARS = 200_000;

  // Watchdog timeout for streaming CHAT — if no chunk arrives within
  // this window, the for-await is presumed stuck and we flip cancelled
  // + delete the Map entry to prevent the leak described in audit V3.
  // Picked > the translator's CHAT_STREAM_TIMEOUT so well-behaved long
  // responses still go through; bridge fires only when Puter genuinely
  // stalls (network hang, upstream stuck).
  const _CHAT_STREAM_BRIDGE_TIMEOUT_MS = 90_000;

  // Use String(...) coercion rather than `.length` directly: a page-world
  // adversary that read the loader nonce could otherwise pass
  // `data.text = new Array(10).fill('x'.repeat(1_000_000))` and bypass the
  // cap because `.length === 10`. After coercion the array stringifies to
  // its actual character size, so the cap holds. (Audit V5.)
  function _fieldChars(v) {
    return v == null ? 0 : String(v).length;
  }

  function _payloadTooLarge(data) {
    return (
      _fieldChars(data?.text) + _fieldChars(data?.systemPrompt) + _fieldChars(data?.userMessage) > _MAX_PAYLOAD_CHARS
    );
  }

  function _replyTooLarge(type, id, fallbackText) {
    window.postMessage(
      {
        __skillbridge__: true,
        __nonce__: _bridgeNonce,
        type,
        id,
        success: false,
        error: `Payload exceeds ${_MAX_PAYLOAD_CHARS} chars`,
        result: fallbackText || '',
      },
      window.location.origin,
    );
  }

  function _postBridgeMessage(type, id, payload = {}) {
    window.postMessage(
      {
        ...payload,
        __skillbridge__: true,
        __nonce__: _bridgeNonce,
        type,
        id,
      },
      window.location.origin,
    );
  }

  function _postBridgeError(type, id, err, result) {
    const errMsg = err?.error || err?.message || String(err);
    _postBridgeMessage(type, id, {
      success: false,
      error: errMsg,
      result,
    });
    return errMsg;
  }

  // Map of in-flight streaming-CHAT request id → StreamSession.
  // The translator's AbortController previously stopped the UI from
  // *displaying* further chunks but did NOT stop Puter.js from generating
  // them — so a user clicking "send" 3x in a row left two zombie streams
  // burning the shared Puter.js quota until completion. CHAT_ABORT flips
  // the flag and the for-await loop breaks on next iteration, which lets
  // the async iterator's `return()` close the underlying connection.
  const _activeStreams = new Map();

  class StreamSession {
    constructor(id) {
      this.id = id;
      this.cancelled = false;
      this.response = null;
      this.releasePuterGlobals = null;
      this.watchdog = null;
    }

    setReleasePuterGlobals(releaseGlobals) {
      this.releasePuterGlobals = releaseGlobals;
    }

    setResponse(response) {
      this.response = response;
    }

    async closeUpstream() {
      try {
        const closed = this.response?.return?.();
        if (closed && typeof closed.then === 'function') await closed;
      } catch (_) {
        // Best-effort upstream cancellation only.
      }
    }

    clearWatchdog() {
      if (!this.watchdog) return;
      clearTimeout(this.watchdog);
      this.watchdog = null;
    }

    armWatchdog() {
      this.clearWatchdog();
      this.watchdog = setTimeout(() => {
        this.cancelled = true;
        // The for-await may still be waiting on next() forever. Release the
        // SDK globals and remove the session even if upstream never settles.
        void this.closeUpstream();
        this.releasePuterGlobals?.();
        _activeStreams.delete(this.id);
        this.watchdog = null;
      }, _CHAT_STREAM_BRIDGE_TIMEOUT_MS);
    }

    cancel() {
      this.cancelled = true;
      void this.closeUpstream();
      this.releasePuterGlobals?.();
      this.clearWatchdog();
      _activeStreams.delete(this.id);
    }

    finish() {
      this.clearWatchdog();
      _activeStreams.delete(this.id);
    }
  }

  function _handleAbort(id) {
    _activeStreams.get(id)?.cancel();
  }

  // Fallback chain — used when a primary model is rejected by Puter
  // (deprecation, rename, regional availability). Hardcoded here because
  // page-bridge runs in the page world and can't import constants.js.
  //
  // 2026-05-28: Anthropic released Claude Opus 4.8. The default tutor
  // model stays at Sonnet 4.6 (`SKILLBRIDGE_MODELS.CLAUDE` in
  // src/lib/constants.js) — Sonnet is faster, cheaper for Puter's
  // free tier, and the in-page tutor doesn't need Opus-class
  // reasoning. The Opus chain below extends to 4.8 anyway so callers
  // that explicitly opt into Opus (e.g. via a future user setting)
  // get a working fallback if Puter hasn't propagated the new model.
  const _MODEL_FALLBACKS = {
    'claude-sonnet-4-6': 'claude-sonnet-4-5',
    'claude-opus-4-8': 'claude-opus-4-7',
    'claude-opus-4-7': 'claude-opus-4-6',
    'claude-opus-4-6': 'claude-opus-4-5',
    // 2026-06-24: gemini-1.5-flash was shut down (the whole Gemini 1.5/1.0 line
    // 404s now), so the old fallback gave zero resilience — if gemini-2.0-flash
    // were ever rejected, the retry would 404 too. Fall back to the live
    // same-generation lighter sibling gemini-2.0-flash-lite (verified available
    // on Puter). gemini-2.0-flash itself is still active and stays the primary.
    'gemini-2.0-flash': 'gemini-2.0-flash-lite',
  };

  const _REQUEST_MODEL_ALLOWLIST = {
    TRANSLATE_REQUEST: new Set(['gemini-2.0-flash', 'gemini-2.0-flash-lite']),
    VERIFY_REQUEST: new Set(['gemini-2.0-flash', 'gemini-2.0-flash-lite']),
    CHAT_REQUEST: new Set([
      'claude-sonnet-4-6',
      'claude-sonnet-4-5',
      'claude-haiku-4-5',
      'claude-opus-4-8',
      'claude-opus-4-7',
      'claude-opus-4-6',
      'claude-opus-4-5',
    ]),
  };

  function _selectModel(requestType, requested, fallback) {
    const allowed = _REQUEST_MODEL_ALLOWLIST[requestType];
    return allowed && allowed.has(requested) ? requested : fallback;
  }

  function _isModelError(err) {
    const msg = (err?.message || err?.error || String(err) || '').toLowerCase();
    return /\b(model|invalid|deprecated|unsupported|not[ _-]?found|404)\b/.test(msg);
  }

  function _restoreGlobal(name, hadValue, previousValue) {
    try {
      if (hadValue) {
        globalThis[name] = previousValue;
      } else if (!Reflect.deleteProperty(globalThis, name)) {
        globalThis[name] = undefined;
      }
    } catch (_e) {
      try {
        globalThis[name] = hadValue ? previousValue : undefined;
      } catch (_ignored) {
        /* best-effort global restore */
      }
    }
  }

  function _enterPuterCallGlobals() {
    if (!_puterApi) return () => {};

    if (_puterGlobalDepth === 0) {
      _puterPreviousHadGlobal = Object.prototype.hasOwnProperty.call(globalThis, 'puter');
      _puterPreviousHadParentGlobal = Object.prototype.hasOwnProperty.call(globalThis, 'puterParent');
      _puterPreviousGlobal = globalThis.puter;
      _puterPreviousParentGlobal = globalThis.puterParent;
      globalThis.puter = _puterApi;
      if (_puterParentCaptured) globalThis.puterParent = _puterParentApi;
    }

    _puterGlobalDepth++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      _puterGlobalDepth = Math.max(0, _puterGlobalDepth - 1);
      if (_puterGlobalDepth !== 0) return;
      _restoreGlobal('puter', _puterPreviousHadGlobal, _puterPreviousGlobal);
      _restoreGlobal('puterParent', _puterPreviousHadParentGlobal, _puterPreviousParentGlobal);
      _puterPreviousGlobal = null;
      _puterPreviousParentGlobal = null;
      _puterPreviousHadGlobal = false;
      _puterPreviousHadParentGlobal = false;
    };
  }

  function _wrapPuterStream(stream, releaseGlobals) {
    const iterator = stream[Symbol.asyncIterator]();
    let released = false;
    let closed = false;
    const releaseOnce = () => {
      if (released) return;
      released = true;
      releaseGlobals();
    };

    const wrapped = {
      [Symbol.asyncIterator]() {
        return this;
      },
      async next(...args) {
        try {
          const result = await iterator.next(...args);
          if (result?.done) releaseOnce();
          return result;
        } catch (err) {
          releaseOnce();
          throw err;
        }
      },
      async return(...args) {
        if (closed) {
          releaseOnce();
          return { done: true };
        }
        closed = true;
        try {
          if (typeof iterator.return === 'function') return await iterator.return(...args);
          return { done: true };
        } finally {
          releaseOnce();
        }
      },
      async throw(...args) {
        closed = true;
        try {
          if (typeof iterator.throw === 'function') return await iterator.throw(...args);
          throw args[0];
        } finally {
          releaseOnce();
        }
      },
    };
    Object.defineProperty(wrapped, '__skillbridgeReleaseGlobals', {
      value: releaseOnce,
      enumerable: false,
    });
    return wrapped;
  }

  function _holdGlobalsForStreamIfNeeded(response, opts, releaseGlobals) {
    if (opts?.stream && response && typeof response[Symbol.asyncIterator] === 'function') {
      return { response: _wrapPuterStream(response, releaseGlobals), streamHoldsGlobals: true };
    }
    return { response, streamHoldsGlobals: false };
  }

  async function _puterChat(prompt, opts, onReleaseReady, shouldCancel) {
    if (!_puterChatImpl) throw new Error('Puter chat unavailable');
    const releaseGlobals = _enterPuterCallGlobals();
    if (typeof onReleaseReady === 'function') onReleaseReady(releaseGlobals);
    let streamHoldsGlobals = false;
    try {
      const first = await _puterChatImpl(prompt, opts);
      const wrapped = _holdGlobalsForStreamIfNeeded(first, opts, releaseGlobals);
      streamHoldsGlobals = wrapped.streamHoldsGlobals;
      return wrapped.response;
    } catch (err) {
      const fallback = opts?.model && _MODEL_FALLBACKS[opts.model];
      if (typeof shouldCancel === 'function' && shouldCancel()) throw err;
      if (!fallback || !_isModelError(err)) throw err;
      log(`Model "${opts.model}" rejected (${err?.message}); retrying with "${fallback}"`);
      const retry = await _puterChatImpl(prompt, { ...opts, model: fallback });
      const wrapped = _holdGlobalsForStreamIfNeeded(retry, opts, releaseGlobals);
      streamHoldsGlobals = wrapped.streamHoldsGlobals;
      return wrapped.response;
    } finally {
      if (!streamHoldsGlobals) releaseGlobals();
    }
  }

  function _captureAndHidePuter() {
    const puterApi = globalThis.puter;
    const puterParentApi = globalThis.puterParent;
    const puterParentCaptured = Object.prototype.hasOwnProperty.call(globalThis, 'puterParent');
    const chat = puterApi?.ai?.chat;
    if (typeof chat !== 'function') return false;
    _puterApi = puterApi;
    _puterParentApi = puterParentApi;
    _puterParentCaptured = puterParentCaptured;
    _puterChatImpl = chat.bind(puterApi.ai);
    // Capture a live auth-state read BEFORE the global is scrubbed below. The
    // SDK object stays private to page-bridge except for the narrow _puterChat
    // call/stream window, and it reflects sign-in that happens later via the
    // AI Tutor.
    _puterAuthCheck = () => !!puterApi.authToken;

    // Defense in depth: re-assert the official API origin on the captured
    // instance in case anything re-derived it at runtime. This runs
    // POST-construction, so it does NOT by itself stop the SDK's
    // construction-time requests — the `?puter.*` origin params that would poison
    // the origin at construction are blocked earlier in loadPuter
    // (_refuseIfPuterAppParams), which is what actually closes that path.
    try {
      puterApi.setAPIOrigin?.('https://api.puter.com');
    } catch (_e) {
      /* older SDK without setAPIOrigin — the page-global pin still applies */
    }

    // SkillBridge only needs ai.chat. Leaving the full SDK (`fs`, `apps`,
    // `kv`, `workers`, auth helpers, etc.) on page-world `globalThis.puter`
    // unnecessarily expands the blast radius of any same-page script/XSS on
    // the trusted host. Capture the chat function, then remove the globals the
    // bundled SDK creates. If deletion is blocked, fall back to setting the
    // property to undefined; either way SkillBridge uses the closure above.
    for (const name of ['puter', 'puterParent']) {
      try {
        if (!Reflect.deleteProperty(globalThis, name)) globalThis[name] = undefined;
      } catch (_e) {
        try {
          globalThis[name] = undefined;
        } catch (_ignored) {
          /* best-effort global scrub */
        }
      }
    }
    return true;
  }

  // Official Puter origins. The bundled SDK resolves its API/GUI base from
  // page-world globals that are NOT env-gated:
  //   get defaultAPIOrigin(){return globalThis.PUTER_API_ORIGIN||"https://api.puter.com"}
  //   get defaultGUIOrigin(){return globalThis.PUTER_ORIGIN||"https://puter.com"}
  // Because this bridge and the SDK it injects run in the UNTRUSTED host page's
  // main world, any page-world script could pre-set those globals to redirect
  // every authenticated Puter request (Bearer token + prompts) and the sign-in
  // popup to a hostile origin. SkillBridge never targets a non-default Puter
  // deployment, so pinning them removes no intended behaviour.
  const _PUTER_OFFICIAL_ORIGINS = {
    PUTER_API_ORIGIN: 'https://api.puter.com',
    PUTER_ORIGIN: 'https://puter.com',
  };

  // Lock the origin globals to the official servers as non-writable /
  // non-configurable BEFORE the SDK bundle executes, closing the poisoning
  // vector. Runs synchronously right before script injection so no page code
  // executes between the pin and the SDK's construction. Throws (→ Puter load is
  // aborted) only if a page script already locked a global to a hostile value.
  function _pinPuterOrigins() {
    for (const [name, official] of Object.entries(_PUTER_OFFICIAL_ORIGINS)) {
      const desc = Object.getOwnPropertyDescriptor(globalThis, name);
      if (desc && desc.configurable === false) {
        // Non-configurable means we cannot redefine it. Accept it ONLY if it is
        // already exactly what we would pin — a non-writable DATA property equal
        // to the official origin. A writable data property (a page could reassign
        // it after us) or an accessor (its getter could return a hostile value on
        // a later read) is unsafe, so fail closed instead of trusting it.
        const alreadyPinned = 'value' in desc && desc.writable === false && desc.value === official;
        if (!alreadyPinned) {
          throw new Error(`Puter origin global ${name} is locked to an unsafe descriptor`);
        }
        continue;
      }
      Object.defineProperty(globalThis, name, {
        value: official,
        writable: false,
        configurable: false,
        enumerable: false,
      });
    }
  }

  // The bundled SDK derives its API origin from Puter "app" query params on the
  // HOST page URL at construction: `?puter.app_instance_id=` flips env to "app",
  // which unlocks `?puter.api_origin=` / `?puter.domain=` to override the origin
  // (and fire construction-time authenticated /rao + /whoami requests carrying
  // the user's Bearer token) BEFORE our post-load setAPIOrigin can re-pin it.
  // These params never legitimately appear on a Skilljar/claude tutorial URL, so
  // their presence means a crafted link — refuse to load rather than let the SDK
  // construct against a page-supplied origin.
  const _PUTER_APP_URL_PARAMS = ['puter.app_instance_id', 'puter.api_origin', 'puter.domain'];

  function _refuseIfPuterAppParams() {
    let params;
    try {
      params = new URLSearchParams(globalThis.location?.search || '');
    } catch (_e) {
      return;
    }
    for (const name of _PUTER_APP_URL_PARAMS) {
      if (params.has(name)) throw new Error(`Refusing to load Puter — host URL carries ${name}`);
    }
  }

  function loadPuter() {
    if (puterLoadPromise) return puterLoadPromise;
    puterLoadPromise = new Promise((resolve, reject) => {
      if (_puterChatImpl || _captureAndHidePuter()) {
        puterReady = true;
        resolve();
        return;
      }
      if (!_puterUrl) {
        reject(new Error('No local Puter.js URL provided'));
        return;
      }
      // Before the bundle executes: (1) refuse if the host URL carries Puter
      // "app" params that would poison the SDK's API origin at construction, and
      // (2) pin the API/GUI origin globals to the official servers so a
      // page-world script can't redirect authenticated requests or the sign-in
      // popup to a hostile origin.
      try {
        _refuseIfPuterAppParams();
        _pinPuterOrigins();
      } catch (e) {
        log('Refusing to load Puter:', e?.message || e);
        reject(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      const script = document.createElement('script');
      script.src = _puterUrl;
      script.onload = () => {
        // Capture + scrub synchronously if the SDK is already reachable: the
        // bundle assigns globalThis.puter during script evaluation, which
        // completes before onload fires. Doing it here closes the ~100ms window
        // in which the full SDK would otherwise sit exposed on the page-world
        // global before the first poll tick. The interval below stays as a
        // fallback for the case where `ai.chat` is wired up asynchronously.
        if (_captureAndHidePuter()) {
          puterReady = true;
          resolve();
          return;
        }
        let checks = 0;
        const interval = setInterval(() => {
          checks++;
          if (_captureAndHidePuter()) {
            clearInterval(interval);
            puterReady = true;
            resolve();
          } else if (checks > 50) {
            clearInterval(interval);
            reject(new Error('puter.ai not available'));
          }
        }, 100);
      };
      script.onerror = () => reject(new Error('Failed to load Puter.js'));
      document.head.appendChild(script);
    });
    return puterLoadPromise;
  }

  /**
   * Single-prompt call to puter.ai.chat (confirmed working format)
   */
  async function callAI(prompt, model, requestType = 'VERIFY_REQUEST', fallbackModel = 'gemini-2.0-flash') {
    const response = await _puterChat(prompt, {
      model: _selectModel(requestType, model, fallbackModel),
      stream: false,
    });
    if (typeof response === 'string') return response;

    // Handle different model response formats
    const content = response?.message?.content;
    if (typeof content === 'string') return content;
    // Claude returns content as array: [{type:"text", text:"..."}]
    if (Array.isArray(content)) {
      return content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n');
    }
    return response?.text || '';
  }

  async function _handleTranslateRequest(data) {
    if (_payloadTooLarge(data)) {
      _replyTooLarge('TRANSLATE_RESPONSE', data.id, data.text);
      return;
    }
    try {
      if (!puterReady) await loadPuter();
      // Never trigger the SDK sign-in prompt from this background path —
      // keep the caller's Google-Translate text instead (see _replyUnauthedSkip).
      if (!_isPuterAuthed()) {
        _replyUnauthedSkip('TRANSLATE_RESPONSE', data.id, data.text || '');
        return;
      }
      // systemPrompt already contains the full prompt including the text
      const prompt = data.systemPrompt || 'Translate to target language:\n' + data.text;
      const result = await callAI(prompt, data.model, 'TRANSLATE_REQUEST');

      _postBridgeMessage('TRANSLATE_RESPONSE', data.id, {
        success: true,
        result: result || data.text,
      });
    } catch (err) {
      const errMsg = _postBridgeError('TRANSLATE_RESPONSE', data.id, err, data.text);
      log('Translate error:', errMsg);
    }
  }

  async function _handleVerifyRequest(data) {
    if (_payloadTooLarge(data)) {
      _replyTooLarge('VERIFY_RESPONSE', data.id, '');
      return;
    }
    try {
      if (!puterReady) await loadPuter();
      // Background quality check — must stay silent for signed-out users so it
      // never opens Puter's sign-in prompt. The caller keeps its GT result.
      if (!_isPuterAuthed()) {
        _replyUnauthedSkip('VERIFY_RESPONSE', data.id, '');
        return;
      }
      const prompt = data.systemPrompt;
      const result = await callAI(prompt, data.model, 'VERIFY_REQUEST');

      _postBridgeMessage('VERIFY_RESPONSE', data.id, {
        success: true,
        result: result || '',
      });
    } catch (err) {
      const errMsg = _postBridgeError('VERIFY_RESPONSE', data.id, err, '');
      log('Verify error:', errMsg);
    }
  }

  async function _handleStreamingChat(data, prompt, streamEntry) {
    streamEntry.armWatchdog();
    const response = await _puterChat(
      prompt,
      {
        // SkillBridge is Claude-focused; default to Haiku as a cheap,
        // fast Claude fallback if content.js forgets to pass `model`.
        model: _selectModel('CHAT_REQUEST', data.model, 'claude-haiku-4-5'),
        stream: true,
      },
      (releaseGlobals) => streamEntry.setReleasePuterGlobals(releaseGlobals),
      () => streamEntry.cancelled,
    );
    streamEntry.setResponse(response);

    if (streamEntry.cancelled) {
      // Abort may land while `_puterChat` is waiting on Puter's first
      // response. Do not enter the iterator after cancellation.
      await streamEntry.closeUpstream();
      return;
    }

    for await (const chunk of response) {
      // Breaking out of for-await calls the iterator's `return()` and asks
      // Puter to stop generating further tokens.
      if (streamEntry.cancelled) break;
      streamEntry.armWatchdog();
      const text = chunk?.text || chunk?.message?.content || '';
      if (text) _postBridgeMessage('CHAT_STREAM_CHUNK', data.id, { text });
    }

    // A cancelled stream already rejected on the content side. Emitting END
    // here would race that AbortError and resolve the orphan as "No response".
    if (!streamEntry.cancelled) {
      _postBridgeMessage('CHAT_STREAM_END', data.id, { success: true });
    }
  }

  async function _handleChatRequest(data) {
    if (_payloadTooLarge(data)) {
      _replyTooLarge('CHAT_RESPONSE', data.id, '');
      return;
    }

    // Register before awaiting Puter so CHAT_ABORT can cancel a cold-start.
    const streamEntry = data.stream ? new StreamSession(data.id) : null;
    if (streamEntry) _activeStreams.set(data.id, streamEntry);

    try {
      if (!puterReady) await loadPuter();

      // Abort may arrive during the SDK cold-start. Do not pay for a request
      // after the content side has already cancelled it.
      if (streamEntry?.cancelled) return;

      const prompt = data.systemPrompt || data.userMessage;
      if (data.stream) {
        await _handleStreamingChat(data, prompt, streamEntry);
        return;
      }

      const result = await callAI(prompt, data.model, 'CHAT_REQUEST', 'claude-haiku-4-5');
      _postBridgeMessage('CHAT_RESPONSE', data.id, {
        success: true,
        result: result || 'No response',
      });
    } catch (err) {
      if (streamEntry?.cancelled) return;
      const errMsg = err?.error || err?.message || String(err);
      log('Chat error:', errMsg);
      _postBridgeMessage('CHAT_RESPONSE', data.id, {
        success: false,
        error: errMsg,
        result: 'Error: ' + errMsg,
      });
    } finally {
      streamEntry?.finish();
    }
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || !data.__skillbridge__) return;
    // Nonce check. NOTE: the nonce lives in the loader script's
    // data-attribute and is therefore readable by any same-page script.
    // It does NOT secure us against malicious page-world code — the
    // actual gate is `manifest.json` `host_permissions` (the bridge
    // only ever runs on Skilljar pages we trust). This check just stops
    // accidental message echoes from unrelated libraries.
    if (data.__nonce__ !== _bridgeNonce) return;

    // === CHAT_ABORT === (fire-and-forget; no response expected)
    if (data.type === 'CHAT_ABORT') {
      _handleAbort(data.id);
      return;
    }

    // === TRANSLATE ===
    if (data.type === 'TRANSLATE_REQUEST') {
      await _handleTranslateRequest(data);
      return;
    }

    // === GEMINI VERIFY (background quality check) ===
    if (data.type === 'VERIFY_REQUEST') {
      await _handleVerifyRequest(data);
      return;
    }

    // === CHAT (streaming) ===
    if (data.type === 'CHAT_REQUEST') {
      await _handleChatRequest(data);
      return;
    }
  });

  // Signal that the bridge itself is installed. Puter is deliberately lazy-
  // loaded on the first AI request so a passive page load does not expose the
  // full SDK to page-world scripts before the user or verifier needs it.
  window.postMessage({ __skillbridge__: true, __nonce__: _bridgeNonce, type: 'BRIDGE_READY' }, window.location.origin);
})();
