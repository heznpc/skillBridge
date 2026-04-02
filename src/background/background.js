/**
 * SkillBridge for Anthropic Academy - Background Service Worker
 *
 * Handles:
 * 1. Google Translate API proxy (fast initial translation)
 * 2. General CORS proxy for YouTube
 * 3. Badge management
 * 4. Periodic maintenance via Chrome Alarms (cache cleanup, version check)
 */

// Language code mapping for Google Translate API
// NOTE: Same map exists in constants.js (GT_LANG_MAP) for content scripts.
// Service workers can't share globals with content scripts, so we duplicate here.
const _BG_GT_LANG_MAP = { 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW', 'pt-BR': 'pt' };

// YouTube InnerTube client version
// NOTE: Same value exists in constants.js (YOUTUBE_CLIENT_VERSION) for content scripts.
const _BG_YT_CLIENT_VERSION = '2.20260401.00.00';

function gtLangCode(lang) {
  return _BG_GT_LANG_MAP[lang] || lang;
}

function parseGTResponse(data, fallback) {
  if (!data || !data[0]) return fallback;
  let translated = '';
  for (const seg of data[0]) {
    if (seg[0]) translated += seg[0];
  }
  return translated || fallback;
}

function isYouTubeUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname === 'www.youtube.com' || u.hostname.endsWith('.youtube.com');
  } catch { return false; }
}

// URL allowlist for FETCH_URL — only permit known trusted domains
const _ALLOWED_FETCH_DOMAINS = ['www.youtube.com', 'youtube.com', 'm.youtube.com', 'translate.googleapis.com'];

function isAllowedFetchUrl(url) {
  try {
    const u = new URL(url);
    return _ALLOWED_FETCH_DOMAINS.some(d => u.hostname === d || u.hostname.endsWith('.' + d));
  } catch { return false; }
}

// ==================== RATE LIMITER ====================

const _rateLimiter = {
  timestamps: [],
  maxPerMin: 120, // will be overridden by constant from content script messages
  check() {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < 60000);
    if (this.timestamps.length >= this.maxPerMin) return false;
    this.timestamps.push(now);
    return true;
  }
};

// ==================== EXPONENTIAL BACKOFF FETCH ====================

async function fetchWithRetry(url, opts = {}, maxRetries = 3, baseDelay = 500) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, opts);
      if (resp.ok) return resp;
      // Don't retry client errors (4xx) except 429 (rate limit)
      if (resp.status >= 400 && resp.status < 500 && resp.status !== 429) {
        throw new Error(`HTTP ${resp.status}`);
      }
      // Retryable server error or rate limit
      if (attempt === maxRetries) throw new Error(`HTTP ${resp.status}`);
    } catch (err) {
      if (attempt === maxRetries) throw err;
    }
    const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 200;
    await new Promise(r => setTimeout(r, delay));
  }
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
      chrome.tabs.sendMessage(tab.id, { type: 'CACHE_CLEANUP' }).catch(() => {
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

    const resp = await fetch(
      `https://api.github.com/repos/${_GITHUB_REPO}/releases/latest`,
      { headers: { 'Accept': 'application/vnd.github.v3+json' } }
    );
    if (!resp.ok) {
      console.warn(`[SkillBridge] Version check: GitHub API returned ${resp.status}`);
      return;
    }
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

// Message handlers
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Verify sender is this extension
  if (sender.id !== chrome.runtime.id) return;

  if (msg.type === 'FETCH_URL') {
    if (!isAllowedFetchUrl(msg.url)) {
      sendResponse({ ok: false, error: 'URL not in allowlist' });
      return true;
    }
    const fetchOpts = {};
    const headers = {};
    // Support POST requests (used for InnerTube API)
    if (msg.method === 'POST' && msg.body) {
      fetchOpts.method = 'POST';
      fetchOpts.body = msg.body;
      headers['Content-Type'] = 'application/json';
      // InnerTube API needs origin + client headers
      if (isYouTubeUrl(msg.url) && msg.url.includes('/youtubei/')) {
        headers['Origin'] = 'https://www.youtube.com';
        headers['Referer'] = 'https://www.youtube.com/';
        headers['X-Youtube-Client-Name'] = '1';
        headers['X-Youtube-Client-Version'] = _BG_YT_CLIENT_VERSION;
      }
    }
    fetchOpts.headers = headers;
    fetch(msg.url, fetchOpts)
      .then(resp => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.text();
      })
      .then(text => sendResponse({ ok: true, data: text }))
      .catch(err => {
        console.error(`[SkillBridge BG] Error: ${err.message}`);
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }

  // Google Translate: single text (with rate limiting + exponential backoff)
  if (msg.type === 'GOOGLE_TRANSLATE') {
    const { text, targetLang, sourceLang } = msg;
    if (!_rateLimiter.check()) {
      sendResponse({ ok: false, error: 'Rate limit exceeded' });
      return true;
    }
    const sl = sourceLang || 'en';
    const tl = gtLangCode(targetLang);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;

    fetchWithRetry(url)
      .then(resp => resp.json())
      .then(data => {
        sendResponse({ ok: true, translated: parseGTResponse(data, text) });
      })
      .catch(err => {
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

    Promise.all(texts.map(text => {
      if (!_rateLimiter.check()) return text; // skip if rate limited
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
      return fetchWithRetry(url)
        .then(resp => resp.json())
        .then(data => parseGTResponse(data, text))
        .catch(err => {
          console.warn('[SkillBridge] GT batch item failed:', err.message);
          return text;
        });
    }))
    .then(results => sendResponse({ ok: true, translations: results }))
    .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

// Badge to show active language
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.targetLanguage) {
    const lang = changes.targetLanguage.newValue;
    const badgeText = lang === 'en' ? '' : lang.substring(0, 2).toUpperCase();
    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: '#E07A5F' });
  }
});
