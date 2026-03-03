/**
 * Skilljar i18n Assistant - AI Translation Engine
 * Uses a bridge iframe to load Puter.js (bypasses Chrome extension CSP)
 * Communicates via postMessage with the sandboxed bridge page
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
    this.bridgeIframe = null;
    this.rateLimitDelay = 300;
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
      await this._createBridge();
      return true;
    } catch (err) {
      console.error('[Skilljar i18n] Failed to initialize translator:', err);
      return false;
    }
  }

  /**
   * Creates a hidden iframe that loads bridge.html (sandboxed page).
   * bridge.html loads Puter.js externally, which is allowed in sandbox context.
   * Communication happens via postMessage.
   */
  _createBridge() {
    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.src = chrome.runtime.getURL('src/bridge/bridge.html');
      iframe.style.cssText = 'display:none !important;width:0;height:0;border:none;position:fixed;top:-9999px;left:-9999px;pointer-events:none;';
      iframe.id = 'skilljar-i18n-bridge';
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');

      const timeout = setTimeout(() => {
        console.warn('[Skilljar i18n] Bridge timeout - removing listener');
        window.removeEventListener('message', onMessage);
        reject(new Error('Bridge initialization timed out (15s). Puter.js may be blocked.'));
      }, 15000);

      const onMessage = (event) => {
        if (event.data?.type === 'PUTER_BRIDGE_READY') {
          clearTimeout(timeout);
          this.isReady = true;
          this.bridgeIframe = iframe;
          console.log('[Skilljar i18n] Bridge connected, Puter.js ready');
          resolve();
          // Keep listening for responses (don't remove)
        }
        if (event.data?.type === 'PUTER_BRIDGE_ERROR') {
          clearTimeout(timeout);
          window.removeEventListener('message', onMessage);
          reject(new Error(event.data.error));
        }
        // Handle translation/chat responses
        if (event.data?.type === 'TRANSLATE_RESPONSE' || event.data?.type === 'CHAT_RESPONSE') {
          const cb = this.pendingCallbacks.get(event.data.id);
          if (cb) {
            this.pendingCallbacks.delete(event.data.id);
            cb(event.data);
          }
        }
      };

      window.addEventListener('message', onMessage);
      document.body.appendChild(iframe);
    });
  }

  /**
   * Send a request to the bridge iframe and wait for response
   */
  _sendToBridge(message) {
    return new Promise((resolve, reject) => {
      if (!this.bridgeIframe || !this.isReady) {
        reject(new Error('Bridge not initialized'));
        return;
      }

      const id = ++this.requestId;
      message.id = id;

      const timeout = setTimeout(() => {
        this.pendingCallbacks.delete(id);
        reject(new Error('Request timed out (30s)'));
      }, 30000);

      this.pendingCallbacks.set(id, (response) => {
        clearTimeout(timeout);
        if (response.success) {
          resolve(response.result);
        } else {
          console.warn('[Skilljar i18n] Bridge error:', response.error);
          resolve(response.result); // fallback text
        }
      });

      this.bridgeIframe.contentWindow.postMessage(message, '*');
    });
  }

  getCacheKey(text, targetLang) {
    return `${targetLang}::${text.substring(0, 100)}`;
  }

  async translate(text, targetLang, context = '') {
    if (!text || !text.trim()) return text;
    if (targetLang === 'en') return text;

    // Check cache first
    const cacheKey = this.getCacheKey(text, targetLang);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Rate limiting
    const now = Date.now();
    const timeSinceLast = now - this.lastRequestTime;
    if (timeSinceLast < this.rateLimitDelay) {
      await new Promise(r => setTimeout(r, this.rateLimitDelay - timeSinceLast));
    }
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

      const translated = await this._sendToBridge({
        type: 'TRANSLATE_REQUEST',
        systemPrompt,
        text,
        targetLang,
        model: 'glm-4-flash',
      });

      // Cache result
      if (this.cache.size >= this.maxCacheSize) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      this.cache.set(cacheKey, translated);

      return translated;
    } catch (err) {
      console.error('[Skilljar i18n] Translation error:', err);
      return text; // fallback: original
    }
  }

  async translateBatch(texts, targetLang) {
    const results = [];
    for (const text of texts) {
      results.push(await this.translate(text, targetLang));
    }
    return results;
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

      return await this._sendToBridge({
        type: 'CHAT_REQUEST',
        systemPrompt,
        userMessage,
        model: 'glm-4-flash',
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

// Export for use in content script
if (typeof window !== 'undefined') {
  window.SkilljarTranslator = SkilljarTranslator;
}
