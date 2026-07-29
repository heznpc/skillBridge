(() => {
  'use strict';

  const MAX_PAYLOAD_CHARS = 200_000;
  const STREAM_IDLE_TIMEOUT_MS = 90_000;
  const TOKEN_STORAGE_KEY = 'sb_puter_auth_token';
  const APP_UID_STORAGE_KEY = 'sb_puter_app_uid';
  const SDK_TOKEN_KEY = 'puter.auth.token';
  const SDK_APP_KEY = 'puter.app.id';
  const SAFE_AUTH_ERROR = 'Puter sign-in required — the AI tutor needs a free Puter session.';
  const SAFE_CHAT_ERROR = 'Puter chat unavailable';
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
  const DEFAULT_LABELS = Object.freeze({
    title: 'Sign in to use the AI Tutor',
    body: 'Continue with Puter to ask questions about this lesson.',
    button: 'Sign in',
    cancel: 'Cancel',
    error: 'Sign-in did not complete. Please try again.',
  });
  const active = new Map();
  // Session ids currently awaiting the shared sign-in overlay. Only the last
  // waiter may close the overlay on cancel; without this, aborting one
  // request (e.g. a sub-panel switch) yanked the overlay out from under a
  // concurrent session, which then failed with SAFE_AUTH_ERROR.
  const authWaiters = new Set();
  const privateStorage = globalThis.__SKILLBRIDGE_PUTER_STORAGE__;
  if (!privateStorage || globalThis.localStorage !== privateStorage) {
    throw new Error('SkillBridge private Puter storage is unavailable');
  }
  let port = null;
  let hydrated = false;
  let authLabels = { ...DEFAULT_LABELS };
  let authGatePromise = null;
  let cancelAuthGate = null;
  let acceptedToken = null;
  let acceptedAppUid = null;

  // SDK evaluation has completed by the time this file runs. Keep its already
  // guarded singleton listener, but restore normal message registration for
  // the rest of SkillBridge's isolated-world content scripts.
  globalThis.__SKILLBRIDGE_RELEASE_PUTER_INIT_GATE__?.();

  const send = (message) => {
    if (!port) return false;
    try {
      port.postMessage(message);
      return true;
    } catch (_e) {
      return false;
    }
  };
  const usableString = (value) => {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    const normalized = text.toLowerCase();
    if (!text || normalized === 'null' || normalized === 'undefined') return null;
    return text;
  };
  const liveToken = () => usableString(globalThis.puter?.authToken);
  const isAuthed = () => !!liveToken();
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
  const selectModel = (model) => (MODELS.has(model) ? model : 'claude-haiku-4-5');
  const isModelError = (value) =>
    /\b(model|invalid|deprecated|unsupported|not[ _-]?found|404)\b/i.test(errorText(value) || String(value));
  const safeLabel = (value, fallback) => {
    const text = typeof value === 'string' ? value.trim() : '';
    return text ? text.slice(0, 500) : fallback;
  };
  const applyLabels = (labels) => {
    if (!labels || typeof labels !== 'object') return;
    authLabels = {
      title: safeLabel(labels.title, DEFAULT_LABELS.title),
      body: safeLabel(labels.body, DEFAULT_LABELS.body),
      button: safeLabel(labels.button, DEFAULT_LABELS.button),
      cancel: safeLabel(labels.cancel, DEFAULT_LABELS.cancel),
      error: safeLabel(labels.error, DEFAULT_LABELS.error),
    };
  };

  function createAuthOverlay() {
    const doc = globalThis.document;
    if (!doc?.createElement) return null;
    const host = doc.createElement('div');
    host.setAttribute?.('data-skillbridge-puter-auth', '');
    const shadow = host.attachShadow?.({ mode: 'closed' });
    if (!shadow) return null;

    const style = doc.createElement('style');
    style.textContent = `
      :host { all: initial; position: fixed; inset: 0; z-index: 2147483647; display: none; }
      :host([data-open]) { display: block; }
      .backdrop { box-sizing: border-box; width: 100%; height: 100%; display: grid; place-items: center;
        padding: 24px; background: rgba(15, 23, 42, .62); font-family: -apple-system, BlinkMacSystemFont,
        "Segoe UI", sans-serif; color: #172033; }
      .card { box-sizing: border-box; width: min(420px, 100%); padding: 24px; border-radius: 16px;
        background: #fff; box-shadow: 0 18px 55px rgba(0, 0, 0, .28); }
      h2 { margin: 0 0 10px; font: 700 20px/1.35 inherit; }
      p { margin: 0; font: 400 15px/1.55 inherit; }
      .error { min-height: 1.45em; margin-top: 12px; color: #b42318; }
      .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
      button { border: 1px solid #cbd5e1; border-radius: 9px; padding: 9px 14px; background: #fff;
        color: #172033; font: 600 14px/1.2 inherit; cursor: pointer; }
      button.primary { border-color: #2563eb; background: #2563eb; color: #fff; }
      button:disabled { cursor: wait; opacity: .65; }
    `;
    const backdrop = doc.createElement('div');
    backdrop.className = 'backdrop';
    const card = doc.createElement('section');
    card.className = 'card';
    card.setAttribute?.('role', 'dialog');
    card.setAttribute?.('aria-modal', 'true');
    const title = doc.createElement('h2');
    const body = doc.createElement('p');
    const error = doc.createElement('p');
    error.className = 'error';
    error.setAttribute?.('role', 'status');
    const actions = doc.createElement('div');
    actions.className = 'actions';
    const cancel = doc.createElement('button');
    cancel.type = 'button';
    cancel.dataset.sbAction = 'cancel';
    const go = doc.createElement('button');
    go.type = 'button';
    go.className = 'primary';
    go.dataset.sbAction = 'sign-in';
    actions.append?.(cancel, go);
    card.append?.(title, body, error, actions);
    backdrop.append?.(card);
    shadow.append?.(style, backdrop);
    (doc.documentElement || doc.body)?.append?.(host);
    return { host, title, body, error, cancel, go };
  }

  const authUi = createAuthOverlay();
  const paintAuth = () => {
    if (!authUi) return;
    authUi.title.textContent = authLabels.title;
    authUi.body.textContent = authLabels.body;
    authUi.go.textContent = authLabels.button;
    authUi.cancel.textContent = authLabels.cancel;
  };
  // `auth-ui` / `auth-failed` are deliberately id-less local signals: the
  // background relay drops them, and the overlay itself is the user-facing
  // surface. They exist so the broker runtime tests (and future diagnostics)
  // can observe overlay state on the Port without a DOM harness.
  const showAuth = (visible) => {
    if (authUi?.host) {
      if (visible) authUi.host.setAttribute?.('data-open', '');
      else authUi.host.removeAttribute?.('data-open');
    }
    send({ type: 'auth-ui', visible: !!visible });
  };

  function applyAcceptedAuth() {
    const puter = globalThis.puter;
    if (acceptedToken) {
      try {
        puter?.setAuthToken?.(acceptedToken);
      } catch (_e) {
        if (puter) puter.authToken = acceptedToken;
      }
      privateStorage?.setItem(SDK_TOKEN_KEY, acceptedToken);
    } else {
      try {
        puter?.resetAuthToken?.();
      } catch (_e) {
        /* facade clear below is authoritative */
      }
      if (puter) puter.authToken = null;
      privateStorage?.removeItem(SDK_TOKEN_KEY);
    }

    if (acceptedToken && acceptedAppUid) {
      try {
        puter?.setAppID?.(acceptedAppUid);
      } catch (_e) {
        if (puter) puter.appID = acceptedAppUid;
      }
      privateStorage?.setItem(SDK_APP_KEY, acceptedAppUid);
    } else {
      try {
        puter?.setAppID?.('');
      } catch (_e) {
        /* facade clear below is authoritative */
      }
      if (puter) puter.appID = null;
      privateStorage?.removeItem(SDK_APP_KEY);
    }
  }

  async function clearAuth({ persistent = true } = {}) {
    acceptedToken = null;
    acceptedAppUid = null;
    applyAcceptedAuth();
    if (persistent) await chrome.storage.local.remove([TOKEN_STORAGE_KEY, APP_UID_STORAGE_KEY]);
  }

  async function persistAuth(token, appUid) {
    acceptedToken = token;
    acceptedAppUid = appUid || null;
    applyAcceptedAuth();
    const data = { [TOKEN_STORAGE_KEY]: token };
    if (appUid) {
      data[APP_UID_STORAGE_KEY] = appUid;
    } else {
      await chrome.storage.local.remove(APP_UID_STORAGE_KEY);
    }
    await chrome.storage.local.set(data);
  }

  function discardLateSdkAuth() {
    // auth.signIn() mutates the SDK token immediately before resolving. If the
    // user cancels or the Port closes first, re-assert only broker-accepted
    // state so that a late popup result cannot silently authenticate the next
    // Tutor request. This also restores a newer accepted attempt if an older
    // popup resolves out of order.
    applyAcceptedAuth();
  }

  function beginSdkSignIn() {
    const auth = globalThis.puter?.auth;
    const ui = globalThis.puter?.ui;
    const start = () => {
      if (typeof auth?.signIn === 'function') return auth.signIn();
      if (typeof ui?.authenticateWithPuter === 'function') return ui.authenticateWithPuter();
      throw new Error('Puter sign-in unavailable');
    };
    const gated = globalThis.__SKILLBRIDGE_WITH_PUTER_MESSAGE_GATE__;
    return typeof gated === 'function' ? gated(start) : start();
  }

  async function requestSignInFor(sessionId, labels) {
    authWaiters.add(sessionId);
    try {
      return await requestSignIn(labels);
    } finally {
      authWaiters.delete(sessionId);
    }
  }

  function requestSignIn(labels) {
    applyLabels(labels);
    paintAuth();
    if (authGatePromise) return authGatePromise;
    if (!authUi) return Promise.resolve(false);
    authGatePromise = new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        authUi?.go.removeEventListener?.('click', onGo);
        authUi?.cancel.removeEventListener?.('click', onCancel);
        if (authUi?.go) authUi.go.disabled = false;
        cancelAuthGate = null;
        authGatePromise = null;
        showAuth(false);
        resolve(result);
      };
      const onCancel = () => finish(false);
      const onGo = (event) => {
        if (event?.isTrusted !== true || authUi?.go.disabled) return;
        authUi.go.disabled = true;
        authUi.error.textContent = '';
        let attempt;
        try {
          // Invoke synchronously in the trusted click stack so window.open()
          // receives the user activation. Awaiting before this call blocks the
          // Puter popup in Chrome.
          attempt = beginSdkSignIn();
        } catch (_e) {
          attempt = Promise.reject(_e);
        }
        void Promise.resolve(attempt).then(
          async (result) => {
            if (settled) {
              discardLateSdkAuth();
              return;
            }
            const token = result?.success === true ? usableString(result.token) : null;
            const appUid = usableString(result?.app_uid);
            if (!token) {
              await clearAuth({ persistent: false });
              authUi.error.textContent = authLabels.error;
              send({ type: 'auth-failed', error: SAFE_AUTH_ERROR });
              authUi.go.disabled = false;
              return;
            }
            try {
              await persistAuth(token, appUid);
              finish(true);
            } catch (_e) {
              await clearAuth();
              authUi.error.textContent = authLabels.error;
              send({ type: 'auth-failed', error: SAFE_AUTH_ERROR });
              authUi.go.disabled = false;
            }
          },
          async () => {
            if (settled) {
              discardLateSdkAuth();
              return;
            }
            await clearAuth({ persistent: false });
            authUi.error.textContent = authLabels.error;
            send({ type: 'auth-failed', error: SAFE_AUTH_ERROR });
            authUi.go.disabled = false;
          },
        );
      };
      cancelAuthGate = () => finish(false);
      authUi?.go.addEventListener?.('click', onGo);
      authUi?.cancel.addEventListener?.('click', onCancel);
      showAuth(true);
    });
    return authGatePromise;
  }

  class Session {
    constructor(id) {
      this.id = id;
      this.cancelled = false;
      this.iterator = null;
      this.watchdog = null;
      this.responseChars = 0;
      this.keepalive = setInterval(() => send({ type: 'keepalive', id: this.id }), 20_000);
    }
    arm() {
      clearTimeout(this.watchdog);
      this.watchdog = setTimeout(() => void this.cancel('Puter stream timed out'), STREAM_IDLE_TIMEOUT_MS);
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
      authWaiters.delete(this.id);
      if (authWaiters.size === 0) cancelAuthGate?.();
    }
    finish() {
      clearTimeout(this.watchdog);
      clearInterval(this.keepalive);
      active.delete(this.id);
    }
  }

  async function callChat(prompt, model, session) {
    const options = { model, stream: true };
    try {
      return await globalThis.puter.ai.chat(prompt, options);
    } catch (err) {
      if (isRevoked(err)) throw err;
      const fallback = MODEL_FALLBACKS.get(model);
      if (session.cancelled || !fallback || !isModelError(err)) throw err;
      return globalThis.puter.ai.chat(prompt, { ...options, model: fallback });
    }
  }

  async function run(request) {
    const session = new Session(request.id);
    active.set(request.id, session);
    try {
      await bootPromise;
      if (!globalThis.puter?.ai?.chat) throw new Error(SAFE_CHAT_ERROR);
      applyLabels(request.labels);
      if (!isAuthed()) {
        if (!(await requestSignInFor(request.id, request.labels))) throw new Error(SAFE_AUTH_ERROR);
        if (session.cancelled) return;
      }
      const model = selectModel(request.model);
      let authRetried = false;
      const callWithRecovery = async () => {
        try {
          return await callChat(request.prompt, model, session);
        } catch (err) {
          if (session.cancelled || authRetried || !isRevoked(err)) throw err;
          authRetried = true;
          clearTimeout(session.watchdog);
          await clearAuth();
          if (!(await requestSignInFor(request.id, request.labels)) || session.cancelled) throw err;
          session.arm();
          return callChat(request.prompt, model, session);
        }
      };

      session.arm();
      let response = await callWithRecovery();
      if (!session.cancelled && !isStream(response) && isRevoked(response)) {
        if (authRetried) throw new Error(SAFE_AUTH_ERROR);
        authRetried = true;
        clearTimeout(session.watchdog);
        await clearAuth();
        if (!(await requestSignInFor(request.id, request.labels)) || session.cancelled)
          throw new Error(SAFE_AUTH_ERROR);
        session.arm();
        response = await callChat(request.prompt, model, session);
      }
      if (!isStream(response)) throw new Error(SAFE_CHAT_ERROR);
      session.iterator = response[Symbol.asyncIterator]();
      if (session.cancelled) {
        await session.iterator.return?.();
        return;
      }
      showAuth(false);
      while (!session.cancelled) {
        session.arm();
        const next = await session.iterator.next();
        if (next.done) break;
        const text = next.value?.text || next.value?.message?.content || '';
        if (typeof text !== 'string' || !text) continue;
        session.responseChars += text.length;
        if (session.responseChars > MAX_PAYLOAD_CHARS) {
          await session.cancel(`Response exceeds ${MAX_PAYLOAD_CHARS} chars`);
          break;
        }
        send({ type: 'chunk', id: request.id, text });
      }
      if (!session.cancelled) send({ type: 'done', id: request.id });
    } catch (err) {
      if (!session.cancelled) {
        const publicError = isRevoked(err) || err?.message === SAFE_AUTH_ERROR ? SAFE_AUTH_ERROR : SAFE_CHAT_ERROR;
        send({ type: 'error', id: request.id, error: publicError });
      }
    } finally {
      session.finish();
    }
  }

  async function hydrate() {
    try {
      const stored = await chrome.storage.local.get([TOKEN_STORAGE_KEY, APP_UID_STORAGE_KEY]);
      const token = usableString(stored?.[TOKEN_STORAGE_KEY]);
      const appUid = usableString(stored?.[APP_UID_STORAGE_KEY]);
      const invalidKeys = [];
      const hasToken = !!stored && Object.hasOwn(stored, TOKEN_STORAGE_KEY);
      const hasAppUid = !!stored && Object.hasOwn(stored, APP_UID_STORAGE_KEY);
      if (hasToken && !token) invalidKeys.push(TOKEN_STORAGE_KEY);
      // An app UID without an authenticated session is orphaned state. Remove
      // it even if its own string is syntactically valid, and never hydrate it
      // into the SDK independently.
      if (hasAppUid && (!token || !appUid)) invalidKeys.push(APP_UID_STORAGE_KEY);
      if (invalidKeys.length) await chrome.storage.local.remove(invalidKeys);
      if (token) {
        acceptedToken = token;
        acceptedAppUid = appUid || null;
        applyAcceptedAuth();
      }
    } catch (_e) {
      await clearAuth({ persistent: false });
    } finally {
      hydrated = true;
      if (!send({ type: 'ready' })) connectBrokerPort();
    }
  }

  const bootPromise = hydrate();

  function handlePortMessage(message) {
    if (!message || typeof message.id !== 'string' || message.id.length > 128) return;
    if (message.type === 'abort') {
      void active.get(message.id)?.cancel();
      return;
    }
    if (message.type !== 'start' || active.has(message.id)) return;
    if (typeof message.prompt !== 'string' || !message.prompt || message.prompt.length > MAX_PAYLOAD_CHARS) {
      send({ type: 'error', id: message.id, error: `Payload exceeds ${MAX_PAYLOAD_CHARS} chars` });
      return;
    }
    void run(message);
  }

  function handlePortDisconnect(disconnectedPort) {
    if (port !== disconnectedPort) return;
    port = null;
    for (const session of active.values()) void session.cancel();
    active.clear();
    cancelAuthGate?.();
  }

  function connectBrokerPort() {
    // A long-lived Port does not make an MV3 service worker immortal. Once the
    // worker idles out Chrome disconnects this content-side endpoint. Do not
    // immediately wake the worker in a loop; the Tutor client calls this
    // function on its next user-driven connection attempt.
    if (port) {
      if (!hydrated || send({ type: 'ready' })) return true;
      port = null;
    }
    let nextPort;
    try {
      nextPort = chrome.runtime.connect({ name: 'sb-puter-content' });
    } catch (_e) {
      return false;
    }
    port = nextPort;
    nextPort.onMessage.addListener(handlePortMessage);
    nextPort.onDisconnect.addListener(() => handlePortDisconnect(nextPort));
    if (hydrated) send({ type: 'ready' });
    return true;
  }

  Object.defineProperty(globalThis, '__SKILLBRIDGE_ENSURE_PUTER_BROKER__', {
    value: connectBrokerPort,
    writable: false,
    configurable: false,
    enumerable: false,
  });
  connectBrokerPort();

  // Keep this read so tests and future refactors cannot accidentally move
  // ready ahead of asynchronous hydration.
  void hydrated;
})();
