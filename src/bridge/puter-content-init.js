(() => {
  'use strict';

  const PUTER_ORIGIN = 'https://puter.com';

  // v3.5.x ran the Puter SDK in the page world, which persisted the auth
  // token into the host page's REAL localStorage. Scrub that legacy state on
  // every boot, before anything below can throw and before the shim hides the
  // host store from this world: a leftover token would otherwise stay
  // readable by page scripts indefinitely.
  try {
    const hostStorage = globalThis.localStorage;
    const legacyKeys = [];
    for (let i = 0; i < hostStorage.length; i += 1) {
      const key = hostStorage.key(i);
      if (typeof key === 'string' && key.startsWith('puter.')) legacyKeys.push(key);
    }
    for (const key of legacyKeys) hostStorage.removeItem(key);
  } catch (_e) {
    /* host storage unavailable (sandboxed document) — nothing to scrub */
  }

  // Puter treats a number of `puter.*` query parameters as trusted app
  // bootstrap state. On a lesson URL that would let an attacker-selected link
  // switch the SDK into app mode and replace its API origin before the broker
  // hydrates a stored token. Reject the entire Puter query namespace before
  // publishing any private storage or auth helpers. The shipped SDK also has
  // host-query parsing removed by the build sanitizer (defence in depth).
  const unsafeQueryKey = Array.from(new URLSearchParams(globalThis.location?.search || '').keys()).find((key) =>
    key.startsWith('puter.'),
  );
  if (unsafeQueryKey) {
    throw new Error('SkillBridge: refusing Puter bootstrap parameters on a lesson URL');
  }

  // A content script's isolated world has NO custom-element registry:
  // `customElements` is null there while `HTMLElement` is still a function.
  // The Puter SDK registers a `puter-dialog` element guarded only on the
  // prototype —
  //
  //     cn.__proto__ === globalThis.HTMLElement && customElements.define(…)
  //
  // — so the guard passes, the call throws "Cannot read properties of null
  // (reading 'define')", and the remainder of the SDK's init IIFE never runs.
  // Its auth-state wiring is in that tail, which is why the Tutor answered
  // "Sorry, an error occurred" with nothing on the wire. This happened on
  // every supported host, not just Academy; the E2E suite stubs the transport
  // and so never evaluates the real SDK.
  //
  // A no-op registry is the honest shim rather than a workaround: custom
  // elements genuinely cannot upgrade in this world, so `define` has nothing
  // to do and `get` has nothing to return. The SDK's sign-in runs through
  // window.open, not through the dialog element.
  if (globalThis.customElements === null || globalThis.customElements === undefined) {
    const defined = new Map();
    Object.defineProperty(globalThis, 'customElements', {
      value: Object.freeze({
        define(name, constructor) {
          defined.set(String(name), constructor);
        },
        get(name) {
          return defined.get(String(name));
        },
        getName(constructor) {
          for (const [name, ctor] of defined) if (ctor === constructor) return name;
          return null;
        },
        upgrade() {},
        whenDefined(name) {
          return Promise.resolve(defined.get(String(name)));
        },
      }),
      writable: false,
      configurable: false,
      enumerable: false,
    });
  }

  // The Puter SDK expects the synchronous Web Storage interface. Content
  // scripts otherwise inherit the host origin's localStorage, which would put
  // the Tutor token in a store that page scripts can read. Give the isolated
  // world its own in-memory facade before the SDK evaluates; the broker below
  // is the only code that persists approved values to chrome.storage.local.
  const values = new Map();
  const privateStorage = Object.freeze({
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      const name = String(key);
      return values.has(name) ? values.get(name) : null;
    },
    key(index) {
      const name = Array.from(values.keys())[Number(index)];
      return name === undefined ? null : name;
    },
    removeItem(key) {
      values.delete(String(key));
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
  });

  // Install the replacement first. If the isolated-world wrapper ever makes
  // localStorage non-configurable, throw before publishing an "init complete"
  // facade; the broker then cannot start with a host-storage fallback.
  Object.defineProperty(globalThis, 'localStorage', {
    value: privateStorage,
    writable: false,
    configurable: false,
    enumerable: true,
  });
  Object.defineProperty(globalThis, '__SKILLBRIDGE_PUTER_STORAGE__', {
    value: privateStorage,
    writable: false,
    configurable: false,
    enumerable: false,
  });

  // Lock routing before the SDK evaluates. A lesson URL cannot redirect the
  // Bearer token, prompts, or sign-in popup through query parameters/globals.
  for (const [name, value] of Object.entries({
    PUTER_API_ORIGIN: 'https://api.puter.com',
    PUTER_ORIGIN,
  })) {
    Object.defineProperty(globalThis, name, {
      value,
      writable: false,
      configurable: false,
      enumerable: false,
    });
  }

  // Puter 2.2.11 registers message listeners that do not all validate origin.
  // A capture listener with stopImmediatePropagation is safe in the old
  // extension iframe but not in the lesson's top frame: it can break the host
  // app's own messaging. Instead, wrap only listeners registered by Puter.
  // The initial gate covers SDK evaluation; the broker briefly re-opens it
  // around auth.signIn(), whose popup listener is registered synchronously.
  const nativeAdd = globalThis.addEventListener;
  const nativeRemove = globalThis.removeEventListener;
  const records = [];
  let gateDepth = 0;

  // The SDK also registers message listeners OUTSIDE any gate: its driver
  // layer reacts to a 401 by asynchronously opening the auth dialog, whose
  // listener accepts `{msg: 'puter.token', token}` with no origin check. This
  // capture listener is registered before the SDK evaluates, so it runs first
  // and drops forged Puter control messages before any SDK listener sees
  // them. It only touches events carrying the `puter.*` control shape, so
  // host-page messaging is unaffected.
  nativeAdd.call(
    globalThis,
    'message',
    (event) => {
      const msg = event?.data?.msg;
      if (typeof msg !== 'string' || !msg.startsWith('puter.')) return;
      if (event.isTrusted !== true || event.origin !== PUTER_ORIGIN) {
        event.stopImmediatePropagation();
      }
    },
    true,
  );

  const captureFlag = (options) => (typeof options === 'boolean' ? options : !!options?.capture);
  const dispatch = (listener, event) => {
    if (typeof listener === 'function') listener.call(globalThis, event);
    else listener?.handleEvent?.(event);
  };
  const guardedAdd = function (type, listener, options) {
    if (type !== 'message' || !listener) return nativeAdd.call(this, type, listener, options);
    const capture = captureFlag(options);
    if (
      records.some((record) => record.target === this && record.listener === listener && record.capture === capture)
    ) {
      return;
    }
    const wrapped = (event) => {
      if (event?.isTrusted !== true || event.origin !== PUTER_ORIGIN) return;
      dispatch(listener, event);
    };
    records.push({ target: this, listener, capture, wrapped });
    return nativeAdd.call(this, type, wrapped, options);
  };
  const guardedRemove = function (type, listener, options) {
    if (type === 'message' && listener) {
      const capture = captureFlag(options);
      const index = records.findIndex(
        (record) => record.target === this && record.listener === listener && record.capture === capture,
      );
      if (index !== -1) {
        const [record] = records.splice(index, 1);
        return nativeRemove.call(this, type, record.wrapped, options);
      }
    }
    return nativeRemove.call(this, type, listener, options);
  };
  const installGate = () => {
    gateDepth += 1;
    if (gateDepth === 1) globalThis.addEventListener = guardedAdd;
  };
  const releaseGate = () => {
    if (gateDepth === 0) return;
    gateDepth -= 1;
    if (gateDepth === 0) globalThis.addEventListener = nativeAdd;
  };

  // Keep removeEventListener wrapped so a Puter popup listener registered
  // during a short gate can later remove its guarded counterpart correctly.
  globalThis.removeEventListener = guardedRemove;
  installGate();

  Object.defineProperty(globalThis, '__SKILLBRIDGE_WITH_PUTER_MESSAGE_GATE__', {
    value(callback) {
      installGate();
      try {
        return callback();
      } finally {
        releaseGate();
      }
    },
    writable: false,
    configurable: false,
    enumerable: false,
  });
  Object.defineProperty(globalThis, '__SKILLBRIDGE_RELEASE_PUTER_INIT_GATE__', {
    value: releaseGate,
    writable: false,
    configurable: false,
    enumerable: false,
  });
})();
