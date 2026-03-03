/**
 * Skilljar i18n Assistant - Translation Engine v2.1
 *
 * Translation priority:
 * 1. Static JSON dictionary (instant, no network)
 * 2. IndexedDB cache (instant, from previous LLM calls)
 * 3. LLM via Puter.js page-bridge (slow, for unknown text only)
 *
 * Copyright respecting: translates on-the-fly only
 */

class SkilljarTranslator {
  constructor() {
    this.staticDict = {};       // Merged flat dictionary from JSON
    this.isReady = false;
    this.pendingCallbacks = new Map();
    this.requestId = 0;
    this.supportedLanguages = {
      'ko': '한국어', 'ja': '日本語', 'zh-CN': '中文(简体)',
      'zh-TW': '中文(繁體)', 'es': 'Español', 'fr': 'Français',
      'de': 'Deutsch', 'pt-BR': 'Português (BR)', 'vi': 'Tiếng Việt',
      'th': 'ภาษาไทย', 'id': 'Bahasa Indonesia', 'ar': 'العربية',
      'hi': 'हिन्दी', 'ru': 'Русский', 'tr': 'Türkçe',
    };
  }

  async initialize() {
    try {
      this._setupMessageListener();
      await this._injectPageBridge();
      console.log('[Skilljar i18n] Translator initialized');
      return true;
    } catch (err) {
      console.error('[Skilljar i18n] Init failed:', err);
      return false;
    }
  }

  /**
   * Load static translation JSON for a given language.
   * Returns flat key-value map merging all sections.
   */
  async loadStaticTranslations(lang) {
    try {
      const url = chrome.runtime.getURL(`src/data/${lang}.json`);
      const resp = await fetch(url);
      if (!resp.ok) {
        console.log(`[Skilljar i18n] No static translations for ${lang}`);
        this.staticDict = {};
        return;
      }
      const data = await resp.json();

      // Flatten all sections into one lookup map
      const flat = {};
      for (const [section, entries] of Object.entries(data)) {
        if (section === '_meta') continue;
        if (typeof entries === 'object') {
          for (const [key, value] of Object.entries(entries)) {
            flat[key] = value;
          }
        }
      }
      this.staticDict = flat;
      console.log(`[Skilljar i18n] Loaded ${Object.keys(flat).length} static translations for ${lang}`);
    } catch (err) {
      console.warn('[Skilljar i18n] Failed to load static translations:', err);
      this.staticDict = {};
    }
  }

  /**
   * Look up text in static dictionary.
   * Tries exact match first, then trimmed match.
   */
  staticLookup(text) {
    if (!text) return null;
    const trimmed = text.trim();
    // Exact match
    if (this.staticDict[trimmed]) return this.staticDict[trimmed];
    // Try without trailing punctuation
    const noPunct = trimmed.replace(/[.!?:;,]+$/, '').trim();
    if (noPunct !== trimmed && this.staticDict[noPunct]) return this.staticDict[noPunct];
    return null;
  }

  /**
   * Translate text. Priority: static dict → LLM.
   */
  async translate(text, targetLang) {
    if (!text || !text.trim()) return text;
    if (targetLang === 'en') return text;

    // 1. Static dictionary (instant)
    const staticResult = this.staticLookup(text);
    if (staticResult) return staticResult;

    // 2. LLM fallback
    if (!this.isReady) return text;

    try {
      const langName = this.supportedLanguages[targetLang] || targetLang;
      const prompt = `You are a translator for technical education content. Translate to ${langName}. Keep technical terms (API, SDK, Claude, Anthropic) in English. Return ONLY the translated text.\n\nText to translate:\n${text.trim()}`;

      const result = await this._sendRequest({
        type: 'TRANSLATE_REQUEST',
        systemPrompt: prompt,
        text: text.trim(),
        targetLang,
        model: 'gpt-4o-mini',
      });
      return result || text;
    } catch (err) {
      console.warn('[Skilljar i18n] LLM translate failed:', err.message);
      return text;
    }
  }

  async chat(userMessage, targetLang, courseContext = '') {
    try {
      const langName = this.supportedLanguages[targetLang] || 'English';
      const prompt = `You are a helpful AI learning assistant for Anthropic's training courses on Skilljar. Respond in ${langName}. Help students understand course material. Keep technical terms in English. Be encouraging.\n${courseContext ? `Current course context: ${courseContext}` : ''}\n\nUser: ${userMessage}`;

      return await this._sendRequest({
        type: 'CHAT_REQUEST',
        systemPrompt: prompt,
        userMessage,
        model: 'gpt-4o-mini',
      });
    } catch (err) {
      console.error('[Skilljar i18n] Chat error:', err);
      return targetLang === 'ko'
        ? '죄송합니다. 응답을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.'
        : 'Sorry, I could not generate a response. Please try again.';
    }
  }

  // ==================== INTERNAL ====================

  _setupMessageListener() {
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || !data.__skilljar_i18n__) return;

      if (data.type === 'BRIDGE_READY') {
        console.log('[Skilljar i18n] Page bridge ready');
        this.isReady = true;
      }

      if (data.type === 'BRIDGE_ERROR') {
        console.error('[Skilljar i18n] Bridge error:', data.error);
      }

      if (data.type === 'TRANSLATE_RESPONSE' || data.type === 'CHAT_RESPONSE') {
        const cb = this.pendingCallbacks.get(data.id);
        if (cb) {
          this.pendingCallbacks.delete(data.id);
          cb(data);
        }
      }
    });
  }

  _injectPageBridge() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.warn('[Skilljar i18n] Bridge ready timeout - resolving anyway');
        resolve();
      }, 20000);

      const onReady = (event) => {
        if (event.source !== window) return;
        if (event.data?.__skilljar_i18n__ && event.data.type === 'BRIDGE_READY') {
          clearTimeout(timeout);
          window.removeEventListener('message', onReady);
          this.isReady = true;
          resolve();
        }
        if (event.data?.__skilljar_i18n__ && event.data.type === 'BRIDGE_ERROR') {
          clearTimeout(timeout);
          window.removeEventListener('message', onReady);
          reject(new Error(event.data.error));
        }
      };
      window.addEventListener('message', onReady);

      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('src/lib/page-bridge.js');
      script.onload = () => {
        console.log('[Skilljar i18n] page-bridge.js injected into page');
        script.remove();
      };
      script.onerror = () => {
        clearTimeout(timeout);
        window.removeEventListener('message', onReady);
        reject(new Error('Failed to inject page-bridge.js'));
      };
      (document.head || document.documentElement).appendChild(script);
    });
  }

  _sendRequest(message) {
    return new Promise((resolve, reject) => {
      if (!this.isReady) {
        reject(new Error('Bridge not ready'));
        return;
      }

      const id = ++this.requestId;
      message.id = id;
      message.__skilljar_i18n__ = true;

      const timeout = setTimeout(() => {
        this.pendingCallbacks.delete(id);
        reject(new Error('Request timed out'));
      }, 30000);

      this.pendingCallbacks.set(id, (response) => {
        clearTimeout(timeout);
        if (response.success === false && response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response.result);
        }
      });

      window.postMessage(message, '*');
    });
  }
}

if (typeof window !== 'undefined') {
  window.SkilljarTranslator = SkilljarTranslator;
}
