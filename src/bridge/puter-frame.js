(() => {
  'use strict';

  const MAX_PAYLOAD_CHARS = 200_000;
  const STREAM_IDLE_TIMEOUT_MS = 90_000;
  const MODEL_FALLBACKS = new Map([
    ['claude-sonnet-4-6', 'claude-sonnet-4-5'],
    ['claude-opus-4-8', 'claude-opus-4-7'],
    ['claude-opus-4-7', 'claude-opus-4-6'],
    ['claude-opus-4-6', 'claude-opus-4-5'],
  ]);
  const MODELS = new Set([
    'claude-sonnet-4-6',
    'claude-sonnet-4-5',
    'claude-haiku-4-5',
    'claude-opus-4-8',
    'claude-opus-4-7',
    'claude-opus-4-6',
    'claude-opus-4-5',
  ]);
  const REVOKED_CODES = new Set([
    'reauth_required',
    'token_auth_failed',
    'token_expired',
    'invalid_token',
    'unauthorized',
  ]);
  const active = new Map();
  const port = chrome.runtime.connect({ name: 'sb-puter-frame' });

  const send = (msg) => {
    try {
      port.postMessage(msg);
    } catch (_e) {
      /* service worker unavailable */
    }
  };
  const errorText = (value) => {
    const err = value?.error;
    if (typeof err === 'string') return err;
    return err?.message || err?.code || value?.message || '';
  };
  const isStream = (value) => !!value && typeof value[Symbol.asyncIterator] === 'function';
  const isRevoked = (value) => {
    if (!value || typeof value !== 'object') return false;
    if (value.status === 401 || value.error?.status === 401) return true;
    const code = String(value.code || value.reason || value.error?.code || value.error?.reason || '').toLowerCase();
    if (REVOKED_CODES.has(code)) return true;
    return /\b(401|reauth_required|token_auth_failed|token_expired|invalid_token|unauthorized)\b/i.test(
      errorText(value),
    );
  };
  const isAuthed = () => {
    try {
      // The live SDK instance is authoritative. Frame-local storage can retain
      // a stale token after this instance has already become signed out.
      return !!globalThis.puter?.authToken;
    } catch (_e) {
      return false;
    }
  };
  const resetStaleAuth = () => {
    try {
      globalThis.puter?.resetAuthToken?.();
    } catch (_e) {
      /* storage clear below is authoritative for the next request */
    }
    try {
      globalThis.localStorage?.removeItem('puter.auth.token');
    } catch (_e) {
      /* unavailable storage */
    }
  };
  const selectModel = (model) => (MODELS.has(model) ? model : 'claude-haiku-4-5');
  const isModelError = (err) =>
    /\b(model|invalid|deprecated|unsupported|not[ _-]?found|404)\b/i.test(errorText(err) || String(err));

  class Session {
    constructor(id) {
      this.id = id;
      this.cancelled = false;
      this.iterator = null;
      this.watchdog = null;
      this.keepalive = null;
      this.responseChars = 0;
      this.keepalive = setInterval(() => send({ type: 'keepalive', id: this.id }), 20_000);
    }
    arm() {
      clearTimeout(this.watchdog);
      this.watchdog = setTimeout(() => this.cancel('Puter stream timed out'), STREAM_IDLE_TIMEOUT_MS);
    }
    async cancel(reason = '') {
      if (this.cancelled) return;
      this.cancelled = true;
      clearTimeout(this.watchdog);
      clearInterval(this.keepalive);
      active.delete(this.id);
      try {
        await this.iterator?.return?.();
      } catch (_e) {
        /* best-effort upstream cancellation */
      }
      if (reason) send({ type: 'error', id: this.id, error: reason });
      send({ type: 'auth-ui', visible: false });
    }
    finish() {
      clearTimeout(this.watchdog);
      clearInterval(this.keepalive);
      active.delete(this.id);
      send({ type: 'auth-ui', visible: false });
    }
  }

  async function callChat(prompt, model, session) {
    const opts = { model, stream: true };
    try {
      return await globalThis.puter.ai.chat(prompt, opts);
    } catch (err) {
      if (isRevoked(err)) throw err;
      const fallback = MODEL_FALLBACKS.get(model);
      if (session.cancelled || !fallback || !isModelError(err)) throw err;
      return globalThis.puter.ai.chat(prompt, { ...opts, model: fallback });
    }
  }

  async function run(req) {
    const session = new Session(req.id);
    active.set(req.id, session);
    try {
      if (!globalThis.puter?.ai?.chat) throw new Error('Puter chat unavailable');
      const model = selectModel(req.model);
      const wasAuthed = isAuthed();
      let authRetried = false;
      if (!wasAuthed) send({ type: 'auth-ui', visible: true });
      session.arm();
      const callWithAuthRecovery = async () => {
        try {
          return await callChat(req.prompt, model, session);
        } catch (err) {
          if (session.cancelled || authRetried || !wasAuthed || !isRevoked(err)) throw err;
          authRetried = true;
          resetStaleAuth();
          send({ type: 'auth-ui', visible: true });
          return callChat(req.prompt, model, session);
        }
      };
      let response = await callWithAuthRecovery();
      if (!session.cancelled && !isStream(response) && wasAuthed && (isRevoked(response) || !errorText(response))) {
        if (authRetried) throw new Error(errorText(response) || 'Puter authentication failed after retry');
        authRetried = true;
        resetStaleAuth();
        send({ type: 'auth-ui', visible: true });
        response = await callChat(req.prompt, model, session);
      }
      if (isStream(response)) session.iterator = response[Symbol.asyncIterator]();
      if (session.cancelled) {
        try {
          await session.iterator?.return?.();
        } catch (_e) {
          /* best-effort upstream cancellation after a cold-start abort */
        }
        return;
      }
      if (!isStream(response)) {
        throw new Error(errorText(response) || 'Puter sign-in required — the AI tutor needs a free Puter session.');
      }
      send({ type: 'auth-ui', visible: false });
      while (!session.cancelled) {
        session.arm();
        const next = await session.iterator.next();
        if (next.done) break;
        const text = next.value?.text || next.value?.message?.content || '';
        if (typeof text === 'string' && text) {
          session.responseChars += text.length;
          if (session.responseChars > MAX_PAYLOAD_CHARS) {
            await session.cancel(`Response exceeds ${MAX_PAYLOAD_CHARS} chars`);
            break;
          }
          send({ type: 'chunk', id: req.id, text });
        }
      }
      if (!session.cancelled) send({ type: 'done', id: req.id });
    } catch (err) {
      if (!session.cancelled) send({ type: 'error', id: req.id, error: errorText(err) || String(err) });
    } finally {
      session.finish();
    }
  }

  port.onMessage.addListener((msg) => {
    if (!msg || typeof msg.id !== 'string' || msg.id.length > 128) return;
    if (msg.type === 'abort') {
      void active.get(msg.id)?.cancel();
      return;
    }
    if (msg.type !== 'start' || active.has(msg.id)) return;
    if (typeof msg.prompt !== 'string' || msg.prompt.length === 0 || msg.prompt.length > MAX_PAYLOAD_CHARS) {
      send({ type: 'error', id: msg.id, error: `Payload exceeds ${MAX_PAYLOAD_CHARS} chars` });
      return;
    }
    void run(msg);
  });
  port.onDisconnect.addListener(() => {
    for (const session of active.values()) void session.cancel();
    active.clear();
  });
  send({ type: 'ready' });
})();
