/**
 * SkillBridge for Anthropic Academy - Background Service Worker
 *
 * Handles:
 * 1. Google Translate API proxy (fast initial translation)
 * 2. General CORS proxy for YouTube
 * 3. Badge management
 */

// Language code mapping for Google Translate API
// NOTE: Same map exists in constants.js (GT_LANG_MAP) for content scripts.
// Service workers can't share globals with content scripts, so we duplicate here.
const _BG_GT_LANG_MAP = { 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW', 'pt-BR': 'pt' };

// YouTube InnerTube client version
// NOTE: Same value exists in constants.js (YOUTUBE_CLIENT_VERSION) for content scripts.
const _BG_YT_CLIENT_VERSION = '2.20240101.00.00';

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

// Install handler
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      targetLanguage: 'en',
      autoTranslate: false,
    });
  }
});

// Message handlers
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'FETCH_URL') {
    const fetchOpts = {};
    const headers = {};
    if (isYouTubeUrl(msg.url)) {
      headers['Cookie'] = 'CONSENT=YES+cb; SOCS=CAESEwgDEgk2OTgxMTk0NTQaAmVuIAEaBgiA_LyaBg';
    }
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
