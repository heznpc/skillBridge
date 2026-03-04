/**
 * SkillBridge for Anthropic Academy - Background Service Worker
 *
 * Handles:
 * 1. Google Translate API proxy (fast initial translation)
 * 2. General CORS proxy for YouTube
 * 3. Badge management
 */

// Language code mapping for Google Translate API
const GT_LANG_MAP = {
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW',
  'pt-BR': 'pt',
};

function gtLangCode(lang) {
  return GT_LANG_MAP[lang] || lang;
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
    const headers = {};
    if (msg.url.includes('youtube.com')) {
      headers['Cookie'] = 'CONSENT=YES+cb; SOCS=CAESEwgDEgk2OTgxMTk0NTQaAmVuIAEaBgiA_LyaBg';
    }
    fetch(msg.url, { headers })
      .then(resp => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.text();
      })
      .then(text => sendResponse({ ok: true, data: text }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
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
        // Google Translate returns [[["translated","original",...],...],...]
        let translated = '';
        if (data && data[0]) {
          for (const seg of data[0]) {
            if (seg[0]) translated += seg[0];
          }
        }
        sendResponse({ ok: true, translated: translated || text });
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
        .then(data => {
          if (!data || !data[0]) return text;
          let translated = '';
          for (const seg of data[0]) {
            if (seg[0]) translated += seg[0];
          }
          return translated || text;
        })
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
