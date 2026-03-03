/**
 * Skilljar i18n Assistant - AI Translation Engine
 *
 * Injects page-bridge.js into the HOST PAGE's main world context.
 * The host page (skilljar.com) can load external scripts freely.
 * Communication between content script and page script via window.postMessage.
 *
 * Copyright respecting: translates on-the-fly only, never stores or redistributes original content
 */

class SkilljarTranslator {
  constructor() {
    this.cache = new Map();
    this.maxCacheSize = 500;
    this.isReady = false;
    this.pendingCallbacks = new Map();
    this.requestId = 0;
    this.rateLimitDelay = 400;
    this.lastRequestTime = 0;
    this.supportedLanguages = {
      'ko': '한국어',
      'ja': '日本語',
      'zh-CN': '中文(简体)',
      'zh-TW': '中文(繁體)',
      'es': 'Español',
      'fr': 'Français',
      'de': 'Deutsch',
      'pt-BR': 'Português (BR)',
      'vi': 'Tiếng Việt',
      'th': 'ภาษาไทย',
      'id': 'Bahasa Indonesia',
      'ar': 'العربية',
      'hi': 'हिन्दी',
      'ru': 'Русский',
      'tr': 'Türkçe',
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
   * Listen for responses from the page bridge
   */
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

  /**
   * Inject page-bridge.js into the host page's main world.
   * This allows loading Puter.js from CDN (host page has no CSP blocking it).
   */
  _injectPageBridge() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.warn('[Skilljar i18n] Bridge ready timeout - resolving anyway');
        resolve(); // Don't block init, bridge might still load
      }, 20000);

      // Listen for BRIDGE_READY
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

      // Inject the page-bridge.js script into the page's main world
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('src/lib/page-bridge.js');
      script.onload = () => {
        console.log('[Skilljar i18n] page-bridge.js injected into page');
        script.remove(); // Clean up the script tag
      };
      script.onerror = () => {
        clearTimeout(timeout);
        window.removeEventListener('message', onReady);
        reject(new Error('Failed to inject page-bridge.js'));
      };
      (document.head || document.documentElement).appendChild(script);
    });
  }

  /**
   * Send request to page bridge via postMessage
   */
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
        console.warn('[Skilljar i18n] Request', id, 'timed out');
        resolve(message.text || message.userMessage || 'Timed out');
      }, 30000);

      this.pendingCallbacks.set(id, (response) => {
        clearTimeout(timeout);
        resolve(response.result);
      });

      window.postMessage(message, '*');
    });
  }

  getCacheKey(text, targetLang) {
    return `${targetLang}::${text.substring(0, 100)}`;
  }

  async translate(text, targetLang, context = '') {
    if (!text || !text.trim()) return text;
    if (targetLang === 'en') return text;

    const cacheKey = this.getCacheKey(text, targetLang);
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    // Rate limiting
    const now = Date.now();
    const wait = this.rateLimitDelay - (now - this.lastRequestTime);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    this.lastRequestTime = Date.now();

    try {
      const langName = this.supportedLanguages[targetLang] || targetLang;
      const systemPrompt = `You are a professional translator for technical education content. Translate the following text to ${langName}.
Rules:
- Keep technical terms (API, SDK, Claude, Anthropic, etc.) in English
- Maintain markdown formatting if present
- Keep code snippets unchanged
- Be natural and fluent, not literal
${context ? `Context: ${context}` : ''}
Return ONLY the translated text, nothing else.`;

      const translated = await this._sendRequest({
        type: 'TRANSLATE_REQUEST',
        systemPrompt,
        text,
        targetLang,
        model: 'gpt-4o-mini',
      });

      // Cache
      if (this.cache.size >= this.maxCacheSize) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      this.cache.set(cacheKey, translated);
      return translated;
    } catch (err) {
      console.error('[Skilljar i18n] Translation error:', err);
      return text;
    }
  }

  async chat(userMessage, targetLang, courseContext = '') {
    try {
      const langName = this.supportedLanguages[targetLang] || 'English';
      const systemPrompt = `You are a helpful AI learning assistant for Anthropic's training courses on Skilljar.
Respond in ${langName}.
You help students understand course material, answer questions, and provide explanations.
Keep technical terms in English when appropriate.
Be encouraging and supportive.
${courseContext ? `Current course context: ${courseContext}` : ''}`;

      return await this._sendRequest({
        type: 'CHAT_REQUEST',
        systemPrompt,
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

  clearCache() {
    this.cache.clear();
  }
}

if (typeof window !== 'undefined') {
  window.SkilljarTranslator = SkilljarTranslator;
}
