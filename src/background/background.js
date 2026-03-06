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

// Install handler
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      targetLanguage: 'en',
      autoTranslate: false,
    });
    console.log('[SkillBridge] Extension installed');
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
        headers['X-Youtube-Client-Version'] = '2.20240101.00.00';
      }
    }
    fetchOpts.headers = headers;
    console.log(`[SkillBridge BG] FETCH: ${msg.method || 'GET'} ${msg.url.substring(0, 80)}`);
    fetch(msg.url, fetchOpts)
      .then(resp => {
        console.log(`[SkillBridge BG] ${resp.status} ${msg.url.substring(0, 60)}`);
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

  // Google Translate: single text
  if (msg.type === 'GOOGLE_TRANSLATE') {
    const { text, targetLang, sourceLang } = msg;
    const sl = sourceLang || 'en';
    const tl = gtLangCode(targetLang);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;

    fetch(url)
      .then(resp => {
        if (!resp.ok) throw new Error(`GT HTTP ${resp.status}`);
        return resp.json();
      })
      .then(data => {
        sendResponse({ ok: true, translated: parseGTResponse(data, text) });
      })
      .catch(err => {
        console.warn('[SkillBridge] Google Translate error:', err.message);
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }

  // Google Translate: batch (multiple texts at once)
  if (msg.type === 'GOOGLE_TRANSLATE_BATCH') {
    const { texts, targetLang, sourceLang } = msg;
    const sl = sourceLang || 'en';
    const tl = gtLangCode(targetLang);

    Promise.all(texts.map(text => {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
      return fetch(url)
        .then(resp => resp.ok ? resp.json() : null)
        .then(data => parseGTResponse(data, text))
        .catch(() => text);
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
