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

      // Handle all response types
      if (data.type === 'TRANSLATE_RESPONSE' || data.type === 'CHAT_RESPONSE' || data.type === 'BATCH_TRANSLATE_RESPONSE') {
        const cb = this.pendingCallbacks.get(data.id);
        if (cb) {
          this.pendingCallbacks.delete(data.id);
          cb(data);
        }
      }

      // Handle batch progress
      if (data.type === 'BATCH_PROGRESS') {
        const progressCb = this._progressCallback;
        if (progressCb) {
          progressCb(data.completed, data.total);
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
        console.warn('[Skilljar i18n] Request', id, 'timed out');
        reject(new Error('Request timed out'));
      }, 60000);

      this.pendingCallbacks.set(id, (response) => {
        clearTimeout(timeout);
        if (response.success === false && response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      });

      window.postMessage(message, '*');
    });
  }

  _getSystemPrompt(targetLang, context) {
    const langName = this.supportedLanguages[targetLang] || targetLang;
    return `You are a professional translator for technical education content. Translate the following text to ${langName}.
Rules:
- Keep technical terms (API, SDK, Claude, Anthropic, etc.) in English
- Keep code snippets unchanged
- Be natural and fluent, not literal
${context ? `Context: ${context}` : ''}
Return ONLY the translated text, nothing else.`;
  }

  /**
   * Batch translate multiple texts at once (fast, parallel).
   * Returns array of { idx, result, success }.
   */
  async translateBatch(texts, targetLang, context = '', onProgress = null) {
    if (!texts || texts.length === 0) return [];
    if (targetLang === 'en') return texts.map((t, i) => ({ idx: i, result: t, success: true }));

    // Check cache first, build list of uncached items
    const systemPrompt = this._getSystemPrompt(targetLang, context);
    const results = new Array(texts.length);
    const uncached = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const cacheKey = `${targetLang}::${text.substring(0, 100)}`;
      if (this.cache.has(cacheKey)) {
        results[i] = { idx: i, result: this.cache.get(cacheKey), success: true, cached: true };
      } else {
        uncached.push({ idx: i, text });
      }
    }

    if (uncached.length === 0) {
      return results;
    }

    // Set progress callback
    this._progressCallback = onProgress;

    try {
      const response = await this._sendRequest({
        type: 'BATCH_TRANSLATE_REQUEST',
        systemPrompt,
        texts: uncached,
        targetLang,
        model: 'gpt-4o-mini',
      });

      // Process results
      if (response.results) {
        for (const r of response.results) {
          results[r.idx] = r;
          // Cache successful translations
          if (r.success && r.result !== texts[r.idx]) {
            const cacheKey = `${targetLang}::${texts[r.idx].substring(0, 100)}`;
            if (this.cache.size >= this.maxCacheSize) {
              const firstKey = this.cache.keys().next().value;
              this.cache.delete(firstKey);
            }
            this.cache.set(cacheKey, r.result);
          }
        }
      }
    } catch (err) {
      console.error('[Skilljar i18n] Batch translation error:', err);
      // Fill in failures with original text
      for (const item of uncached) {
        if (!results[item.idx]) {
          results[item.idx] = { idx: item.idx, result: item.text, success: false };
        }
      }
    } finally {
      this._progressCallback = null;
    }

    return results;
  }

  /**
   * Translate a single text (uses single request).
   */
  async translate(text, targetLang, context = '') {
    if (!text || !text.trim()) return text;
    if (targetLang === 'en') return text;

    const cacheKey = `${targetLang}::${text.substring(0, 100)}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    try {
      const systemPrompt = this._getSystemPrompt(targetLang, context);
      const response = await this._sendRequest({
        type: 'TRANSLATE_REQUEST',
        systemPrompt,
        text,
        targetLang,
        model: 'gpt-4o-mini',
      });

      const translated = response.result;
      if (translated && translated !== text) {
        if (this.cache.size >= this.maxCacheSize) {
          const firstKey = this.cache.keys().next().value;
          this.cache.delete(firstKey);
        }
        this.cache.set(cacheKey, translated);
      }
      return translated || text;
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

      const response = await this._sendRequest({
        type: 'CHAT_REQUEST',
        systemPrompt,
        userMessage,
        model: 'gpt-4o-mini',
      });

      return response.result || 'No response';
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
