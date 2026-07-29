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

  // ---- In-frame sign-in gate -------------------------------------------
  // Chrome scopes user activation per frame and does not propagate it into a
  // cross-origin iframe. The host page's send button therefore cannot activate
  // this frame, and Puter's window.open sign-in popup is blocked when the chat
  // call tries to authenticate implicitly. So we render our own card here and
  // start signIn() from a click that happens INSIDE this document.
  const doc = globalThis.document || null;
  const byId = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);
  const authEl = {
    root: byId('sb-auth'),
    title: byId('sb-auth-title'),
    body: byId('sb-auth-body'),
    go: byId('sb-auth-go'),
    cancel: byId('sb-auth-cancel'),
  };
  // True only when this document actually carries the sign-in card.
  const hasAuthCard = () => !!(authEl.root && authEl.go && authEl.cancel);
  let authLabels = null;

  function paintAuthCard() {
    if (!hasAuthCard() || !authLabels) return;
    authEl.title.textContent = authLabels.title || '';
    authEl.body.textContent = authLabels.body || '';
    authEl.go.textContent = authLabels.button || '';
    authEl.cancel.textContent = authLabels.cancel || '';
  }

  function showAuthCard(visible) {
    if (authEl.root && authEl.root.classList) authEl.root.classList.toggle('sb-visible', !!visible);
    send({ type: 'auth-ui', visible: !!visible });
  }

  // Resolves true once the user has completed sign-in, false if they declined.
  function requestSignIn() {
    return new Promise((resolve) => {
      // No card in this document (non-browser harness): fall back to the SDK's
      // own prompt by letting the chat call proceed, exactly as before.
      if (!hasAuthCard()) {
        send({ type: 'auth-ui', visible: true });
        return resolve(true);
      }
      paintAuthCard();
      showAuthCard(true);
      const cleanup = () => {
        authEl.go.removeEventListener('click', onGo);
        authEl.cancel.removeEventListener('click', onCancel);
        authEl.go.disabled = false;
      };
      const onCancel = () => {
        cleanup();
        showAuthCard(false);
        resolve(false);
      };
      async function onGo() {
        authEl.go.disabled = true;
        try {
          // This call now carries THIS frame's user activation.
          await globalThis.puter?.auth?.signIn?.();
          cleanup();
          showAuthCard(false);
          resolve(isAuthed());
        } catch (_e) {
          // Popup closed or sign-in cancelled — leave the card up so the user
          // can try again rather than failing the whole chat silently.
          authEl.go.disabled = false;
        }
      }
      authEl.go.addEventListener('click', onGo);
      authEl.cancel.addEventListener('click', onCancel);
    });
  }

  const hideAuthCardOnCancel = () => showAuthCard(false);

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
      hideAuthCardOnCancel();
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
      if (req.labels && typeof req.labels === 'object') authLabels = req.labels;
      if (!isAuthed()) {
        // Ask first, in this frame, so the popup inherits a real user gesture.
        const signedIn = await requestSignIn();
        if (session.cancelled) return;
        if (!signedIn) {
          throw new Error('Puter sign-in required — the AI tutor needs a free Puter session.');
        }
      }
      const wasAuthed = isAuthed();
      let authRetried = false;
      session.arm();
      const callWithAuthRecovery = async () => {
        try {
          return await callChat(req.prompt, model, session);
        } catch (err) {
          if (session.cancelled || authRetried || !wasAuthed || !isRevoked(err)) throw err;
          authRetried = true;
          resetStaleAuth();
          if (!(await requestSignIn())) throw err;
          return callChat(req.prompt, model, session);
        }
      };
      let response = await callWithAuthRecovery();
      if (!session.cancelled && !isStream(response) && wasAuthed && (isRevoked(response) || !errorText(response))) {
        if (authRetried) throw new Error(errorText(response) || 'Puter authentication failed after retry');
        authRetried = true;
        resetStaleAuth();
        if (!(await requestSignIn())) {
          throw new Error('Puter sign-in required — the AI tutor needs a free Puter session.');
        }
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
      showAuthCard(false);
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
