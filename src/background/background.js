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

// Max age for an in-flight entry. If `fetchWithRetry` stalls beyond this
// (network hang, upstream stuck through retries), we force-expire the
// entry so the next identical request can't keep bypassing the rate
// limiter (audit V14). 30s is long enough to absorb the normal retry
// chain (3 attempts × exponential backoff ≈ 3.5s + per-attempt timeout)
// without surfacing as 429 to the user.
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
  const expireTimer = setTimeout(() => _inflightGT.delete(key), _GT_INFLIGHT_TTL_MS);
  const promise = fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ q: text }).toString(),
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

async function fetchWithRetry(url, opts = {}, maxRetries = 3, baseDelay = 500) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let resp;
    try {
      resp = await fetch(url, opts);
      if (resp.ok) return resp;
    } catch (err) {
      // Network error — eligible for retry.
      lastErr = err;
      if (attempt === maxRetries) throw err;
      await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt) + Math.random() * 200));
      continue;
    }
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
const _ALARM_VERSION_CHECK = 'version-check';
const _GITHUB_REPO = 'heznpc/skillbridge';

/**
 * Register maintenance alarms on install/update.
 * - cache-cleanup: fires every 24 hours (1440 min)
 * - version-check: fires every 7 days (10080 min)
 */
function registerAlarms() {
  chrome.alarms.create(_ALARM_CACHE_CLEANUP, { periodInMinutes: 1440 });
  chrome.alarms.create(_ALARM_VERSION_CHECK, { periodInMinutes: 10080 });
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

/**
 * Version check — compare local version with latest GitHub release.
 * If a newer version exists, set badge text to "!" as a notification.
 */
async function handleVersionCheck() {
  try {
    const manifest = chrome.runtime.getManifest();
    const localVersion = manifest.version;

    // Anonymous GitHub API quota is 60/h per IP — with hundreds of users on
    // the same residential ranges, 403s are common. fetchWithRetry's 4xx
    // fail-fast bails immediately on 403/404 (no point retrying without auth)
    // and backs off transient 5xx.
    const resp = await fetchWithRetry(`https://api.github.com/repos/${_GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    const release = await resp.json();
    const remoteVersion = (release.tag_name || '').replace(/^v/, '');

    if (remoteVersion && remoteVersion !== localVersion && isNewerVersion(remoteVersion, localVersion)) {
      console.debug(`[SkillBridge] New version available: ${remoteVersion} (current: ${localVersion})`);
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#E07A5F' });
    } else {
      console.debug(`[SkillBridge] Version check: up to date (${localVersion})`);
    }
  } catch (err) {
    console.warn('[SkillBridge] Version check error:', err.message);
  }
}

/**
 * Simple semver comparison: returns true if a > b.
 * Handles x.y.z format; falls back to string comparison for non-numeric.
 */
function isNewerVersion(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return true;
    if (na < nb) return false;
  }
  return false;
}

// Alarm listener
chrome.alarms.onAlarm.addListener((alarm) => {
  switch (alarm.name) {
    case _ALARM_CACHE_CLEANUP:
      handleCacheCleanup();
      break;
    case _ALARM_VERSION_CHECK:
      handleVersionCheck();
      break;
    default:
      console.warn(`[SkillBridge] Unknown alarm: ${alarm.name}`);
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

function _isPuterBrokerPort(port) {
  if (
    port?.sender?.id !== chrome.runtime.id ||
    port?.sender?.frameId !== 0 ||
    !Number.isInteger(port?.sender?.tab?.id) ||
    !_isActiveCloudDocument(port) ||
    !_cloudDocumentKey(port)
  ) {
    return false;
  }
  try {
    const url = new URL(port.sender.url || '');
    if (url.protocol === 'https:' && url.hostname === 'anthropic.skilljar.com') return true;
    // Production never grants these patterns. The E2E harness adds them only
    // to a temporary manifest so the actual broker can run against localhost.
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

function _isAllowedCloudClient(port) {
  if (
    port?.sender?.id !== chrome.runtime.id ||
    port?.sender?.frameId !== 0 ||
    !Number.isInteger(port?.sender?.tab?.id) ||
    !_isActiveCloudDocument(port) ||
    !_cloudDocumentKey(port)
  ) {
    return false;
  }
  try {
    const url = new URL(port.sender.url || port.sender.tab.url || '');
    if (url.protocol === 'https:' && url.hostname === 'anthropic.skilljar.com') return true;
    // Production never grants this pattern. The E2E helper adds it only to
    // its temporary manifest so the real broker can run against localhost.
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
  const base = String(baseUrl || 'http://localhost:11434/v1').replace(/\/+$/, '');
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
      return { ok: true, status: 'ok', models };
    }
    if (resp.status === 403) return { ok: false, status: 'cors', httpStatus: 403 };
    return { ok: false, status: 'error', httpStatus: resp.status };
  } catch (err) {
    return { ok: false, status: 'unreachable', error: err.message };
  }
}

async function _streamLocalChat(port, req) {
  const base = String(req.baseUrl || 'http://localhost:11434/v1').replace(/\/+$/, '');
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
    while (!aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (aborted) break;
        const parsed = _parseSseDelta(line);
        if (!parsed) continue;
        if (parsed.done) {
          send({ type: 'done' });
          return;
        }
        send({ type: 'chunk', delta: parsed.delta });
      }
    }
    if (!aborted) send({ type: 'done' });
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
