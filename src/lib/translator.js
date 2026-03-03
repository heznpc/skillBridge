/**
 * Skilljar i18n Assistant - AI Translation Engine
 * Uses Puter.js + GLM-4-Flash for free, API-key-free translation
 *
 * Copyright respecting: translates on-the-fly only, never stores or redistributes original content
 */

class SkilljarTranslator {
  constructor() {
    this.cache = new Map();
    this.maxCacheSize = 500;
    this.isReady = false;
    this.pendingQueue = [];
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
      // Load Puter.js dynamically if not already loaded
      if (typeof puter === 'undefined') {
        await this._loadPuterSDK();
      }
      this.isReady = true;
      this._processQueue();
      return true;
    } catch (err) {
      console.error('[Skilljar i18n] Failed to initialize translator:', err);
      return false;
    }
  }

  _loadPuterSDK() {
    return new Promise((resolve, reject) => {
      if (typeof puter !== 'undefined') {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://js.puter.com/v2/';
      script.onload = () => {
        console.log('[Skilljar i18n] Puter.js loaded successfully');
        resolve();
      };
      script.onerror = () => reject(new Error('Failed to load Puter.js'));
      document.head.appendChild(script);
    });
  }

  getCacheKey(text, targetLang) {
    return `${targetLang}::${text.substring(0, 100)}`;
  }

  async translate(text, targetLang, context = '') {
    if (!text || !text.trim()) return text;
    if (targetLang === 'en') return text;

    // Check cache
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
- If context is provided, use it for accurate translation
${context ? `Context: ${context}` : ''}
Return ONLY the translated text, nothing else.`;

      const response = await puter.ai.chat(systemPrompt, text, {
        model: 'glm-4-flash',
        stream: false,
      });

      const translated = typeof response === 'string'
        ? response
        : response?.message?.content || response?.text || text;

      // Cache result
      if (this.cache.size >= this.maxCacheSize) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      this.cache.set(cacheKey, translated);

      return translated;
    } catch (err) {
      console.error('[Skilljar i18n] Translation error:', err);
      // Fallback: return original text
      return text;
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

      const response = await puter.ai.chat(systemPrompt, userMessage, {
        model: 'glm-4-flash',
        stream: false,
      });

      return typeof response === 'string'
        ? response
        : response?.message?.content || response?.text || 'Sorry, I could not generate a response.';
    } catch (err) {
      console.error('[Skilljar i18n] Chat error:', err);
      return targetLang === 'ko'
        ? '죄송합니다. 응답을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.'
        : 'Sorry, I could not generate a response. Please try again.';
    }
  }

  _processQueue() {
    while (this.pendingQueue.length > 0) {
      const task = this.pendingQueue.shift();
      task();
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
