/**
 * SkillBridge — AI Course Translator - Background Service Worker
 *
 * Handles:
 * 1. Google Translate API proxy (fast initial translation)
 * 2. Badge management
 * 3. Periodic maintenance via Chrome Alarms (cache cleanup, version check)
 */

try {
  if (
    !globalThis.SB_SHARED_CONSTANTS &&
    typeof importScripts === 'function' &&
    typeof chrome !== 'undefined' &&
    chrome.runtime?.getURL
  ) {
    importScripts(chrome.runtime.getURL('src/shared/runtime-constants.js'));
  }
} catch (err) {
  console.warn('[SkillBridge BG] Failed to load shared runtime constants:', err?.message);
}

const _BG_SHARED_CONSTANTS = globalThis.SB_SHARED_CONSTANTS || {};
if (!_BG_SHARED_CONSTANTS.GT_LANG_MAP) {
  console.warn('[SkillBridge BG] Shared runtime constants missing or incomplete.');
}

function gtLangCode(lang) {
  return _BG_SHARED_CONSTANTS.GT_LANG_MAP?.[lang] || lang;
}

function parseGTResponse(data, fallback) {
  if (!data || !Array.isArray(data[0])) return fallback;
  let translated = '';
  for (const seg of data[0]) {
    // GT returns each segment as [translatedText, originalText, ...]. Older
    // responses occasionally swap in `null` or an object wrapper; without
    // the strict-string check we'd silently concatenate `[object Object]`
    // into the translated text and cache it for the 30-day TTL.
    if (Array.isArray(seg) && typeof seg[0] === 'string') {
      translated += seg[0];
    }
  }
  return translated || fallback;
}

// ==================== RATE LIMITER ====================

const _rateLimiter = {
  timestamps: [],
  maxPerMin: 120, // will be overridden by constant from content script messages
  check() {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < 60000);
    if (this.timestamps.length >= this.maxPerMin) return false;
    this.timestamps.push(now);
    return true;
  },
  /**
   * Wait until a slot is available, up to maxWaitMs. Returns true if acquired,
   * false on timeout. Lets large batches pace naturally instead of dropping
   * items into the original-English passthrough that callers can't detect.
   */
  async acquire(maxWaitMs = 60000) {
    const start = Date.now();
    while (!this.check()) {
      if (Date.now() - start > maxWaitMs) return false;
      await new Promise((r) => setTimeout(r, 200));
    }
    return true;
  },
};

// ==================== IN-FLIGHT GT DEDUPLICATION ====================
//
// When content scripts fan out many translate requests for the same string
// in a short window (SPA navigation re-fires, MutationObserver bursts,
// rapid language switches), the cache hasn't populated yet but the same
// `text+sourceLang+targetLang` keeps hitting this worker. Without dedup
// each one consumed a rate-limit slot AND a real GT fetch, multiplying
// 429-risk for no benefit. With dedup, concurrent identical calls share
// one outgoing fetch.

const _inflightGT = new Map();

// Hard ceiling on a single fetch attempt. `fetch` has no built-in timeout: a
// TCP black hole or a stuck upstream leaves the promise pending forever, and
// before this existed the whole GT pipeline (and the progress UI waiting on it)
// stalled with it. Each attempt gets its own AbortController, so a timeout
// cancels that attempt and falls through to the existing backoff instead of
// hanging. 6s is ~30x the normal GT response time.
const _GT_ATTEMPT_TIMEOUT_MS = 6_000;

// Max age for an in-flight entry. Two jobs: force-expire the dedup entry so a
// stuck request can't keep bypassing the rate limiter (audit V14), AND abort
// the underlying request — deleting the map entry alone left the fetch running
// and the caller waiting. Sized to sit just outside a full retry chain
// (4 attempts × 6s + ~3.5s backoff ≈ 27.5s) so it only fires as a backstop when
// the per-attempt aborts themselves fail to end the operation.
const _GT_INFLIGHT_TTL_MS = 30_000;

function _gtKey(text, tl, sl) {
  return `${sl}|${tl}|${text}`;
}

function _gtFetchDedup(text, tl, sl) {
  const key = _gtKey(text, tl, sl);
  const existing = _inflightGT.get(key);
  if (existing) return existing;

  // Lesson text goes in the POST BODY, never the URL. Two reasons:
  //   1. Chrome Web Store guidance is to keep user data out of URLs/query
  //      strings, which end up in logs, history, and referrers.
  //   2. Since v4 translates inline-mixed blocks as HTML, `text` can be a
  //      whole block's markup — several kB — which overruns practical URL
  //      length limits. Verified 2026-07-27: the same endpoint accepts POST
  //      with a form-encoded `q` and returns the identical response shape
  //      (checked against a 3.4 kB HTML block, tags and hrefs preserved).
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t`;
  // The TTL must cancel the work, not just forget about it. The signal stays
  // attached to the Response, so this also tears down a body that stopped
  // streaming after the headers arrived — a stall the per-attempt timeout
  // cannot see.
  const ttlController = new AbortController();
  const expireTimer = setTimeout(() => {
    ttlController.abort(new Error('GT request exceeded the in-flight TTL'));
    _inflightGT.delete(key);
  }, _GT_INFLIGHT_TTL_MS);
  const promise = fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ q: text }).toString(),
    signal: ttlController.signal,
  })
    .then((resp) => resp.json())
    .then((data) => parseGTResponse(data, text))
    .finally(() => {
      clearTimeout(expireTimer);
      _inflightGT.delete(key);
    });
  _inflightGT.set(key, promise);
  return promise;
}

// ==================== EXPONENTIAL BACKOFF FETCH ====================

/**
 * Forward an external abort onto a per-attempt controller.
 * @returns {() => void} detach function
 */
function _linkAbort(external, controller) {
  if (!external) return () => {};
  if (external.aborted) {
    controller.abort(external.reason);
    return () => {};
  }
  const onAbort = () => controller.abort(external.reason);
  external.addEventListener('abort', onAbort, { once: true });
  return () => external.removeEventListener('abort', onAbort);
}

async function fetchWithRetry(url, opts = {}, maxRetries = 3, baseDelay = 500) {
  const external = opts.signal;
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Per-attempt controller: a timeout kills THIS attempt and lets the retry
    // chain continue, whereas aborting a shared controller would end all of them.
    const attemptController = new AbortController();
    const detach = _linkAbort(external, attemptController);
    const timer = setTimeout(
      () => attemptController.abort(new Error(`GT request timed out after ${_GT_ATTEMPT_TIMEOUT_MS}ms`)),
      _GT_ATTEMPT_TIMEOUT_MS,
    );
    let resp;
    try {
      resp = await fetch(url, { ...opts, signal: attemptController.signal });
      // On success `detach` deliberately stays attached: the signal still
      // governs the Response body, so an external abort can cancel a stalled
      // read. It is released when the operation's controller is collected.
      if (resp.ok) {
        clearTimeout(timer);
        return resp;
      }
    } catch (err) {
      clearTimeout(timer);
      detach();
      // Surface WHY it aborted — a bare AbortError says nothing about whether
      // this was our timeout, the TTL, or a caller cancelling.
      lastErr = attemptController.signal.reason ?? err;
      // A caller/TTL abort is terminal; retrying would ignore the cancellation.
      if (external?.aborted) throw lastErr;
      if (attempt === maxRetries) throw lastErr;
      await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt) + Math.random() * 200));
      continue;
    }
    clearTimeout(timer);
    detach();
    // Non-retryable client error (4xx except 429): fail immediately.
    if (resp.status >= 400 && resp.status < 500 && resp.status !== 429) {
      throw new Error(`HTTP ${resp.status}`);
    }
    // Retryable: 5xx, 429, etc.
    lastErr = new Error(`HTTP ${resp.status}`);
    if (attempt === maxRetries) throw lastErr;
    await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt) + Math.random() * 200));
  }
  throw lastErr;
}

// ==================== CHROME ALARMS (MAINTENANCE) ====================

const _ALARM_CACHE_CLEANUP = 'cache-cleanup';

// A weekly GitHub Releases poll used to live here, badging the toolbar icon
// when a newer tag existed. Removed for v4.0.0: the Chrome Web Store updates
// installed extensions on its own, so the badge told users something Chrome had
// already handled — while costing a required `api.github.com` host permission,
// a third-party data-flow row in the privacy policy, a store permission
// justification, and one outbound request per user per week. Nothing advertised
// the feature (it is absent from the README and the listing copy), so dropping
// it removes review surface without removing a capability anyone was promised.
// The developer build does not keep it either: checking the repository is what
// a developer does anyway.

/**
 * Register maintenance alarms on install/update.
 * - cache-cleanup: fires every 24 hours (1440 min)
 */
function registerAlarms() {
  chrome.alarms.create(_ALARM_CACHE_CLEANUP, { periodInMinutes: 1440 });
  // Chrome persists alarms across extension updates, so every user upgrading
  // from a build that registered the weekly release poll still carries it.
  // Clear it here instead of waiting up to 7 days for its one stray fire.
  // Safe to delete once no supported upgrade path can still hold it.
  chrome.alarms.clear('version-check');
}

/**
 * Cache cleanup — purge expired IndexedDB entries.
 * Sends a message to any active Skilljar tabs; if none are open,
 * the cleanup will happen naturally on next page load.
 */
async function handleCacheCleanup() {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://*.skilljar.com/*' });
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { action: 'cacheCleanup' }).catch(() => {
        // Tab may not have content script loaded — that is fine
      });
    }
    console.debug(`[SkillBridge] Cache cleanup alarm: notified ${tabs.length} tab(s)`);
  } catch (err) {
    console.warn('[SkillBridge] Cache cleanup error:', err.message);
  }
}

// Alarm listener
chrome.alarms.onAlarm.addListener((alarm) => {
  switch (alarm.name) {
    case _ALARM_CACHE_CLEANUP:
      handleCacheCleanup();
      break;
    default:
      // Reached on upgrade from a build that registered other alarms: Chrome
      // persists alarms across updates, so the retired weekly `version-check`
      // keeps firing for existing users until it is cleared. Drop it rather
      // than logging a warning every 7 days forever.
      console.debug(`[SkillBridge] Clearing retired alarm: ${alarm.name}`);
      chrome.alarms.clear(alarm.name);
  }
});

// Install handler
chrome.runtime.onInstalled.addListener((details) => {
  // Register maintenance alarms on install or update
  registerAlarms();

  if (details.reason === 'install') {
    chrome.storage.local.set({
      targetLanguage: 'en',
      autoTranslate: false,
    });
  }
});

// ==================== MESSAGE DISPATCH CONVENTION ====================
//
// All cross-context messages use ONE of two discriminator fields:
//
//   { type: 'SCREAMING_SNAKE' }   — addressed to the background worker
//                                   (GOOGLE_TRANSLATE, ...)
//   { action: 'camelCase' }       — addressed to a content script
//                                   (cacheCleanup, setLanguage, toggleSidebar, ...)
//
// Mixing the two (action→bg or type→content) was the v3.5.6 cache-cleanup
// bug. The `__messageDispatchSanityCheck` below catches a recurrence in dev
// builds where the wrong discriminator reaches the wrong handler.

function _logMisroutedMessage(msg) {
  if (msg && typeof msg === 'object' && 'action' in msg && !('type' in msg)) {
    // Got an `action`-shaped message at the background — almost certainly a
    // copy-paste from the popup→content path. Real bg messages use `type`.
    console.warn(
      '[SkillBridge BG] Unhandled `action`-shaped message — should this go to a content script instead?',
      msg.action,
    );
  }
}

// Message handlers
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Verify sender is this extension
  if (sender.id !== chrome.runtime.id) return;

  // Local AI engine reachability probe (v4 A5.3). Content/popup can't fetch
  // localhost cross-origin, so the SW does it and classifies the result:
  // ok / cors (403 → OLLAMA_ORIGINS) / unreachable (server down or no
  // host permission). GET /models is cheap and needs no model loaded.
  if (msg.type === 'CHECK_LOCAL_ENGINE') {
    _checkLocalEngine(msg.baseUrl)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, status: 'unreachable', error: err.message }));
    return true;
  }

  // Google Translate: single text (with rate limiting + exponential backoff)
  if (msg.type === 'GOOGLE_TRANSLATE') {
    const { text, targetLang, sourceLang } = msg;
    const sl = sourceLang || 'en';
    const tl = gtLangCode(targetLang);
    // Skip the rate-limit slot if an identical request is already in-flight
    // — piggybacking on it doesn't generate a new outgoing GT fetch, so
    // charging a slot would over-throttle legitimate fan-out callers.
    if (!_inflightGT.has(_gtKey(text, tl, sl)) && !_rateLimiter.check()) {
      sendResponse({ ok: false, error: 'Rate limit exceeded' });
      return true;
    }

    _gtFetchDedup(text, tl, sl)
      .then((translated) => {
        sendResponse({ ok: true, translated });
      })
      .catch((err) => {
        console.warn('[SkillBridge] Google Translate error:', err.message);
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }

  // Google Translate: batch (with rate limiting + exponential backoff)
  if (msg.type === 'GOOGLE_TRANSLATE_BATCH') {
    const { texts, targetLang, sourceLang } = msg;
    const sl = sourceLang || 'en';
    const tl = gtLangCode(targetLang);

    // Audit V9: previously each item independently did
    // `if (!_inflightGT.has(key))` + `await acquire()`. With concurrent
    // identical items, all N saw has()=false (the first hasn't yet
    // populated the map) and all N consumed slots — N slots burned for
    // 1 actual fetch. Fix: dedup inside the synchronous Promise.all map
    // call BEFORE any await fires, so duplicates within a batch share
    // a single in-flight promise and consume one slot total.
    const seenInBatch = new Map(); // key → promise

    Promise.all(
      texts.map((text) => {
        const key = _gtKey(text, tl, sl);
        if (seenInBatch.has(key)) return seenInBatch.get(key);

        const itemPromise = (async () => {
          // Wait for a rate-limit slot only if no in-flight global entry.
          if (!_inflightGT.has(key)) {
            // Falling back to original English would be silently
            // dropped by content.js (translated === original is no-op),
            // so we pace instead.
            const ok = await _rateLimiter.acquire();
            if (!ok) {
              console.warn('[SkillBridge] GT rate-limit acquire timed out');
              return null;
            }
          }
          return _gtFetchDedup(text, tl, sl).catch((err) => {
            console.warn('[SkillBridge] GT batch item failed:', err.message);
            return null;
          });
        })();
        seenInBatch.set(key, itemPromise);
        return itemPromise;
      }),
    )
      .then((results) => sendResponse({ ok: true, translations: results }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // Fell through every `msg.type === ...` branch — surface anything that
  // looks like a misrouted content-script message instead of swallowing it.
  _logMisroutedMessage(msg);
});

// ==================== CLOUD AI BROKER (isolated Puter content script) ====================

const _CLOUD_MAX_PAYLOAD_CHARS = 200_000;
const _CLOUD_ALLOWED_MODELS = new Set([
  'claude-sonnet-4-6',
  'claude-sonnet-4-5',
  'claude-haiku-4-5',
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-opus-4-5',
]);
const _cloudBrokers = new Map(); // tabId -> { isolated broker port, ready }
const _cloudClients = new Map(); // tabId -> Set<Port>
const _cloudActive = new Map(); // `${tabId}:${id}` -> client Port

function _cloudKey(tabId, id) {
  return `${tabId}:${id}`;
}

function _safePortPost(port, msg) {
  try {
    port.postMessage(msg);
    return true;
  } catch (_e) {
    return false;
  }
}

function _isFirefoxBuild() {
  return !!chrome.runtime.getManifest().browser_specific_settings?.gecko;
}

function _cloudDocumentKey(port) {
  const sender = port?.sender;
  if (typeof sender?.documentId === 'string' && sender.documentId) return sender.documentId;
  // Firefox's MessageSender support has varied across releases. Keep the beta
  // build usable with an origin-scoped fallback; the CWS/Chromium build fails
  // closed unless Chrome supplies the documentId guaranteed by its minimum
  // supported version. Origin, not full URL: skilljar navigates lessons with
  // history.pushState, and a URL-keyed broker stopped matching clients that
  // connected after such a navigation until a full reload.
  if (_isFirefoxBuild() && typeof sender?.url === 'string' && sender.url) {
    try {
      return `firefox:${new URL(sender.url).origin}`;
    } catch (_e) {
      return null;
    }
  }
  return null;
}

function _isActiveCloudDocument(port) {
  const lifecycle = port?.sender?.documentLifecycle;
  return lifecycle === 'active' || (_isFirefoxBuild() && lifecycle == null);
}

function _sameCloudDocument(first, second) {
  const firstKey = _cloudDocumentKey(first);
  return !!firstKey && firstKey === _cloudDocumentKey(second);
}

// ────────────────────────────────────────────────────────────────────
// Tutor transport trust boundary
//
// The hosts whose pages may speak to the Puter broker, and the ONE place the
// rule lives. It used to be written out twice — once for the broker port, once
// for the client port — with the host literal inline in both. Two copies of a
// security boundary is one copy that gets updated, and the failure mode is not
// a broken build: the tutor simply refuses to connect on the host somebody
// forgot, or worse, accepts one somebody added to only the permissive half.
//
// academy.claude.com is here because it is Anthropic's own course platform and
// the successor to the Skilljar tenant, and the manifest ships the broker
// content script for it. Both halves of the boundary read this set, so a host
// is either trusted for the whole transport or for none of it.
// ────────────────────────────────────────────────────────────────────
const _TUTOR_TRUSTED_HOSTS = new Set(['anthropic.skilljar.com', 'academy.claude.com']);

/**
 * True when `rawUrl` names a page allowed to carry the Tutor transport.
 *
 * The localhost branch cannot fire in a released build: it requires the PORTED
 * localhost patterns in `host_permissions`, and the shipped manifest declares
 * only the portless form, and only under `optional_host_permissions`, which
 * `getManifest()` does not report. The E2E harness adds the ported patterns to
 * a throwaway manifest copy so the real broker can run against a fixture.
 */
function _isTrustedTutorOrigin(rawUrl) {
  try {
    const url = new URL(rawUrl || '');
    if (url.protocol === 'https:' && _TUTOR_TRUSTED_HOSTS.has(url.hostname)) return true;
    const testHosts = chrome.runtime.getManifest().host_permissions || [];
    return (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      testHosts.some((pattern) => pattern === 'http://localhost:*/*' || pattern === 'http://127.0.0.1:*/*')
    );
  } catch (_e) {
    return false;
  }
}

/** Every structural requirement a Tutor port must meet, whichever end it is. */
function _isTutorPortShape(port) {
  return (
    port?.sender?.id === chrome.runtime.id &&
    port?.sender?.frameId === 0 &&
    Number.isInteger(port?.sender?.tab?.id) &&
    _isActiveCloudDocument(port) &&
    !!_cloudDocumentKey(port)
  );
}

function _isPuterBrokerPort(port) {
  if (!_isTutorPortShape(port)) return false;
  // The broker's own document URL only. A broker never speaks for a tab it is
  // not running in, so unlike the client below there is no tab-URL fallback.
  return _isTrustedTutorOrigin(port.sender.url || '');
}

function _isAllowedCloudClient(port) {
  if (!_isTutorPortShape(port)) return false;
  return _isTrustedTutorOrigin(port.sender.url || port.sender.tab.url || '');
}

function _failCloudTabActive(tabId, brokerPort, error) {
  for (const [key, client] of _cloudActive) {
    if (!key.startsWith(`${tabId}:`)) continue;
    const id = key.slice(String(tabId).length + 1);
    _safePortPost(brokerPort, { type: 'abort', id });
    _cloudActive.delete(key);
    _safePortPost(client, { type: 'error', id, error });
  }
}

function _registerCloudBroker(port) {
  if (!_isPuterBrokerPort(port)) {
    port.disconnect();
    return;
  }
  const tabId = port.sender.tab.id;
  const previous = _cloudBrokers.get(tabId)?.port;
  const entry = { port, ready: false };
  // Install the replacement first so a synchronous old-port disconnect event
  // cannot delete the new broker entry or send a spurious unavailable signal.
  _cloudBrokers.set(tabId, entry);
  if (previous && previous !== port) {
    _failCloudTabActive(tabId, previous, 'Puter broker replaced');
    try {
      previous.disconnect();
    } catch (_e) {
      /* already disconnected */
    }
  }
  port.onMessage.addListener((msg) => {
    if (!msg || _cloudBrokers.get(tabId)?.port !== port) return;
    if (msg.type === 'ready') {
      entry.ready = true;
      for (const client of _cloudClients.get(tabId) || []) {
        if (_sameCloudDocument(client, port)) _safePortPost(client, { type: 'ready' });
      }
      return;
    }
    if (typeof msg.id !== 'string') return;
    const key = _cloudKey(tabId, msg.id);
    const client = _cloudActive.get(key);
    if (!client) return;
    // A message on an actually active broker request resets MV3's service-
    // worker idle timer, and is relayed so the client can keep its own idle
    // watchdog alive through a long sign-in (account creation easily exceeds
    // the 90s stream timeout). Stale/forged ids never reach a client.
    if (msg.type === 'keepalive') {
      _safePortPost(client, { type: 'keepalive', id: msg.id });
      return;
    }
    if (msg.type === 'chunk' && typeof msg.text === 'string') {
      _safePortPost(client, { type: 'chunk', id: msg.id, text: msg.text });
    } else if (msg.type === 'done') {
      _cloudActive.delete(key);
      _safePortPost(client, { type: 'done', id: msg.id });
    } else if (msg.type === 'error') {
      _cloudActive.delete(key);
      _safePortPost(client, { type: 'error', id: msg.id, error: String(msg.error || 'Puter chat failed') });
    }
  });
  port.onDisconnect.addListener(() => {
    if (_cloudBrokers.get(tabId)?.port !== port) return;
    _cloudBrokers.delete(tabId);
    _failCloudTabActive(tabId, port, 'Puter broker closed');
    for (const client of _cloudClients.get(tabId) || []) {
      if (_sameCloudDocument(client, port)) _safePortPost(client, { type: 'unavailable' });
    }
  });
}

function _registerCloudClient(port) {
  if (!_isAllowedCloudClient(port)) {
    port.disconnect();
    return;
  }
  const tabId = port.sender.tab.id;
  const clients = _cloudClients.get(tabId) || new Set();
  clients.add(port);
  _cloudClients.set(tabId, clients);
  const connectedBroker = _cloudBrokers.get(tabId);
  if (connectedBroker?.ready && _sameCloudDocument(port, connectedBroker.port)) {
    _safePortPost(port, { type: 'ready' });
  }
  port.onMessage.addListener((msg) => {
    if (!msg || typeof msg.id !== 'string' || msg.id.length > 128) return;
    const key = _cloudKey(tabId, msg.id);
    const broker = _cloudBrokers.get(tabId);
    if (msg.type === 'abort') {
      if (_cloudActive.get(key) === port) {
        _cloudActive.delete(key);
        _safePortPost(broker?.port, { type: 'abort', id: msg.id });
      }
      return;
    }
    if (msg.type !== 'start') return;
    if (!broker?.ready || !_sameCloudDocument(port, broker.port)) {
      _safePortPost(port, { type: 'error', id: msg.id, error: 'Puter broker is not ready' });
      return;
    }
    if (
      _cloudActive.has(key) ||
      typeof msg.prompt !== 'string' ||
      msg.prompt.length === 0 ||
      msg.prompt.length > _CLOUD_MAX_PAYLOAD_CHARS ||
      !_CLOUD_ALLOWED_MODELS.has(msg.model)
    ) {
      _safePortPost(port, { type: 'error', id: msg.id, error: 'Invalid cloud Tutor request' });
      return;
    }
    _cloudActive.set(key, port);
    if (
      !_safePortPost(broker.port, {
        type: 'start',
        id: msg.id,
        prompt: msg.prompt,
        model: msg.model,
        labels: msg.labels,
      })
    ) {
      _cloudActive.delete(key);
      _safePortPost(port, { type: 'error', id: msg.id, error: 'Puter broker is unavailable' });
    }
  });
  port.onDisconnect.addListener(() => {
    clients.delete(port);
    if (clients.size === 0) _cloudClients.delete(tabId);
    const broker = _cloudBrokers.get(tabId)?.port;
    for (const [key, owner] of _cloudActive) {
      if (owner !== port) continue;
      _cloudActive.delete(key);
      if (_sameCloudDocument(port, broker)) {
        _safePortPost(broker, { type: 'abort', id: key.slice(String(tabId).length + 1) });
      }
    }
  });
}

// ==================== LOCAL AI ENGINE (OpenAI-compatible: Ollama, LM Studio, …) ====================
// Content scripts cannot reach http://localhost cross-origin, so the service
// worker proxies the streaming chat over a Port. Needs the optional host
// permission for http://localhost/* (requested when the user enables the
// local engine). Any OpenAI-compatible `/v1/chat/completions` server works.

// Pure: turn one SSE line into a token delta, the DONE sentinel, or null.
// Exported for unit tests via the standard src-extraction pattern.
function _parseSseDelta(line) {
  const s = String(line || '').trim();
  if (!s.startsWith('data:')) return null;
  const payload = s.slice(5).trim();
  if (payload === '[DONE]') return { done: true };
  try {
    const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
    return delta ? { delta } : null;
  } catch {
    return null; // keep-alive / partial frame
  }
}

async function _checkLocalEngine(baseUrl) {
  const base = _allowedLocalBase(baseUrl);
  if (base === null) return { ok: false, status: 'unreachable', error: 'invalid base URL' };
  try {
    const resp = await fetch(`${base}/models`, { method: 'GET' });
    if (resp.ok) {
      let models = [];
      try {
        const data = await resp.json();
        models = Array.isArray(data?.data) ? data.data.map((m) => m.id).filter(Boolean) : [];
      } catch {
        /* non-JSON body is fine — reachability is what matters */
      }
      // Reachable is not the same as usable, and the difference is invisible
      // to a bodyless GET. Chrome omits `Origin` on this GET but attaches
      // `Origin: chrome-extension://<id>` to the JSON POST the tutor actually
      // sends, so a default-configured Ollama answers 200 here and 403 there.
      // Probing with the GET alone therefore reported "connected" to every
      // install that had not set OLLAMA_ORIGINS and pushed the failure into
      // the user's first tutor question — where the 13-language guidance
      // behind `status: 'cors'` never ran, leaving only an untranslated
      // English error. So re-probe using the POST's shape. The body is
      // deliberately invalid: an allowed origin fails request validation with
      // 400 without loading a model, a blocked origin still answers 403.
      try {
        const chatResp = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        try {
          await chatResp.body?.cancel();
        } catch (_e) {
          /* best-effort — the validation error body is tiny */
        }
        if (chatResp.status === 403) return { ok: false, status: 'cors', httpStatus: 403 };
      } catch (_err) {
        // Keep the GET's verdict. Reachability is already proven, so a
        // probe-only transport hiccup must not downgrade a working server.
      }
      return { ok: true, status: 'ok', models };
    }
    if (resp.status === 403) return { ok: false, status: 'cors', httpStatus: 403 };
    return { ok: false, status: 'error', httpStatus: resp.status };
  } catch (err) {
    return { ok: false, status: 'unreachable', error: err.message };
  }
}

/**
 * Validate a user-supplied local-engine base URL before the service worker
 * fetches it.
 *
 * The SW is the one context that can issue cross-origin requests without the
 * page's CORS rules, so whatever lands here is fetched as the extension. The
 * value reaches us from `chrome.storage.local`, which every extension context
 * can write, and it was previously used after nothing but a trailing-slash
 * trim. `optional_host_permissions` already narrows the blast radius to
 * localhost, but relying on the manifest to be the only check leaves the
 * boundary implicit — and the prompt travels in the request body, so a request
 * that merely *leaves* is already a leak even if the response is unreadable.
 *
 * Mirrors the allowlist in `optional_host_permissions` deliberately: anything
 * this accepts must also be a host Chrome granted us.
 *
 * @param {unknown} baseUrl
 * @returns {string|null} normalized origin+path, or null if not allowed
 */
function _allowedLocalBase(baseUrl) {
  const raw = String(baseUrl || 'http://localhost:11434/v1').replace(/\/+$/, '');
  let url;
  try {
    url = new URL(raw);
  } catch (_e) {
    return null;
  }
  // Credentials in the URL would be sent to the local server verbatim, and are
  // never part of a legitimate Ollama/OpenAI-compatible base.
  if (url.username || url.password) return null;
  if (url.protocol !== 'http:') return null;
  if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return null;
  // Drop any query/fragment: the caller appends `/chat/completions`, and a
  // stray `?` would turn that suffix into part of a query string.
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
}

/**
 * Gate the local-chat port the same way the cloud broker port is gated.
 *
 * There is no `externally_connectable`, so a web page cannot open this port at
 * all — this is defence in depth, not the primary boundary. It costs nothing
 * and it makes the local path's trust assumptions explicit instead of leaving
 * them resting on one manifest key.
 *
 * @param {chrome.runtime.Port} port
 * @returns {boolean}
 */
function _isLocalChatPort(port) {
  if (port?.sender?.id !== chrome.runtime.id) return false;
  if (port?.sender?.frameId !== 0) return false;
  if (!Number.isInteger(port?.sender?.tab?.id)) return false;
  let url;
  try {
    url = new URL(port.sender.url || '');
  } catch (_e) {
    return false;
  }
  // Exactly the surfaces `content_scripts` injects into — narrower would break
  // a real install, wider would accept a frame we never run in.
  if (url.protocol === 'https:') {
    if (url.hostname === 'skilljar.com' || url.hostname.endsWith('.skilljar.com')) return true;
    if (url.hostname === 'claude.com' && url.pathname.startsWith('/resources/tutorials/')) return true;
    return false;
  }
  // The E2E harness patches localhost into a temporary manifest so the real
  // broker can run against the fixture server; production never grants these.
  const testHosts = chrome.runtime.getManifest().host_permissions || [];
  return (
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
    testHosts.some((pattern) => pattern === 'http://localhost:*/*' || pattern === 'http://127.0.0.1:*/*')
  );
}

async function _streamLocalChat(port, req) {
  const base = _allowedLocalBase(req.baseUrl);
  let aborted = false;
  // A disconnect must actually CANCEL the upstream request. Ollama stops
  // generating only when the connection closes, so without this a cancelled
  // chat (sidebar closed, user sent again) left the server generating the
  // whole completion — burning GPU and contending with the next request.
  const controller = new AbortController();
  // Once the port is gone every postMessage throws ("disconnected port
  // object"); a throw inside the catch below would surface as an unhandled
  // rejection in the service worker. Route every reply through this guard.
  const send = (msg) => {
    if (aborted) return;
    try {
      port.postMessage(msg);
    } catch (_e) {
      aborted = true;
    }
  };
  // Rejected here rather than at the top of the function so the reply goes
  // through the guarded `send` above — every message on this port must, or a
  // disconnected port turns the reply into an unhandled rejection.
  if (base === null) {
    send({ type: 'error', error: 'Local AI server URL must be http://localhost or http://127.0.0.1' });
    return;
  }

  port.onDisconnect.addListener(() => {
    aborted = true;
    try {
      controller.abort();
    } catch (_e) {
      /* already aborted */
    }
  });
  let reader = null;
  try {
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: req.model || 'gemma3:4b',
        stream: true,
        messages: Array.isArray(req.messages) ? req.messages : [{ role: 'user', content: String(req.prompt || '') }],
      }),
    });
    if (aborted) {
      // Disconnected while the request was in flight — drop the body so the
      // server stops generating instead of streaming into a closed port.
      try {
        await resp.body?.cancel();
      } catch (_e) {
        /* best-effort */
      }
      return;
    }
    if (!resp.ok) {
      const hint = resp.status === 403 ? ' — set OLLAMA_ORIGINS to allow the extension origin' : '';
      send({ type: 'error', error: `Local AI server returned HTTP ${resp.status}${hint}` });
      return;
    }
    reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    // Feed complete lines to the parser; whatever follows the last newline is
    // an incomplete frame and waits for the next chunk.
    const drain = (chunk) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (aborted) return false;
        const parsed = _parseSseDelta(line);
        if (!parsed) continue;
        if (parsed.done) return true;
        send({ type: 'chunk', delta: parsed.delta });
      }
      return false;
    };

    let sawDone = false;
    while (!aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      if (drain(decoder.decode(value, { stream: true }))) {
        sawDone = true;
        break;
      }
    }
    if (aborted) return;
    if (!sawDone) {
      // A server that closes right after its final `data:` line, without a
      // trailing newline, leaves that frame sitting in `buf` — the loop broke
      // on `done` and nothing parsed the remainder, so the last token was
      // dropped. Ollama terminates properly and never hit this, but the popup
      // advertises "any OpenAI-compatible server". Flush the decoder first: a
      // multi-byte character split across the final two chunks is only
      // completed by the non-streaming call.
      drain(decoder.decode());
      if (buf.trim()) drain('\n');
    }
    send({ type: 'done' });
  } catch (err) {
    // An abort is our own cancellation, not a server failure.
    if (aborted || err?.name === 'AbortError') return;
    send({ type: 'error', error: `Cannot reach local AI server: ${err.message}` });
  } finally {
    if (aborted && reader) {
      try {
        await reader.cancel();
      } catch (_e) {
        /* best-effort upstream cancellation */
      }
    }
  }
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onConnect) {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'sb-puter-content') {
      _registerCloudBroker(port);
      return;
    }
    if (port.name === 'sb-cloud-chat-client') {
      _registerCloudClient(port);
      return;
    }
    if (port.name !== 'sb-local-chat') return;
    if (!_isLocalChatPort(port)) {
      port.disconnect();
      return;
    }
    let started = false;
    port.onMessage.addListener((req) => {
      // One stream per port; a second 'start' would race two readers onto it.
      if (!req || req.type !== 'start' || started) return;
      started = true;
      // Defense in depth: nothing above should reject, but an unhandled
      // rejection here would be an opaque service-worker error.
      void _streamLocalChat(port, req).catch((err) => {
        console.warn('[SkillBridge] Local chat stream failed:', err?.message || err);
      });
    });
  });
}

// Badge to show active language
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.targetLanguage) {
    const lang = changes.targetLanguage.newValue;
    const badgeText = lang === 'en' ? '' : lang.substring(0, 2).toUpperCase();
    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: '#E07A5F' });
  }
});
