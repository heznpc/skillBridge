/**
 * SkillBridge for Anthropic Academy - Translation Engine v3.0
 *
 * Translation priority (3-tier with background verification):
 * 1. Static JSON dictionary (instant, no network)
 * 2. IndexedDB cache of Gemini-verified translations (instant)
 * 3. Google Translate via background proxy (fast, ~200ms)
 *    → Then Gemini 2.0 Flash verifies in background
 *    → If improved, updates DOM + caches result
 *
 * Copyright respecting: translates on-the-fly only
 */

class SkilljarTranslator {
  constructor() {
    /** @type {Record<string, string>} Merged flat dictionary from JSON */
    this.staticDict = {};
    /** @type {boolean} True once the page bridge is ready (Gemini + AI Tutor) */
    this.isReady = false;
    /** @type {Map<string, function>} Pending request callbacks keyed by ID */
    this.pendingCallbacks = new Map();
    /** @type {IDBDatabase|null} IndexedDB handle for verified translation cache */
    this._db = null;
    /** @type {Array<{original: string, googleTranslation: string, targetLang: string}>} */
    this._verifyQueue = [];
    /** @type {Promise|null} Lock for verify queue processing */
    this._verifyLock = null;
    /** @type {Array<function>} Callbacks when Gemini improves a translation */
    this._onUpdateCallbacks = [];
    /** @type {string[]} ISO codes with static dictionaries */
    this.premiumLanguages = PREMIUM_LANGUAGE_CODES;
    /** @type {Record<string, string>} ISO code to language name */
    this.supportedLanguages = SUPPORTED_LANGUAGE_MAP;
  }

  /** @returns {Promise<boolean>} true if initialization succeeded */
  async initialize() {
    try {
      await this._openDB();
      this._cleanupExpiredCache();
      this._checkStorageQuota();
      this._setupMessageListener();
      await this._injectPageBridge();
      return true;
    } catch (err) {
      console.error('[SkillBridge] Init failed:', err);
      return false;
    }
  }

  /**
   * Delete cache entries older than CACHE_TTL_MS (30 days).
   * Called once during initialization — not on every lookup.
   */
  _cleanupExpiredCache() {
    if (!this._db) return;
    try {
      const tx = this._db.transaction('translations', 'readwrite');
      const store = tx.objectStore('translations');
      const req = store.openCursor();
      const now = Date.now();

      return new Promise((resolve, reject) => {
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor) return;
          const entry = cursor.value;
          if (entry.timestamp && now - entry.timestamp > SKILLBRIDGE_THRESHOLDS.CACHE_TTL_MS) {
            cursor.delete();
          }
          cursor.continue();
        };
        req.onerror = () => {
          console.warn('[SkillBridge] Cache cleanup cursor failed');
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('[SkillBridge] Cache cleanup failed:', err);
    }
  }

  /**
   * Check IndexedDB storage quota and evict old entries if usage is high.
   * Fires a 'skillbridge:storagequota' event on document when warning threshold is crossed.
   */
  async _checkStorageQuota() {
    if (!navigator.storage?.estimate) return;
    try {
      const { usage, quota } = await navigator.storage.estimate();
      const ratio = usage / quota;
      if (ratio >= SKILLBRIDGE_THRESHOLDS.STORAGE_QUOTA_WARN) {
        document.dispatchEvent(new CustomEvent('skillbridge:storagequota', { detail: { usage, quota, ratio } }));
        await this._evictOldestEntries();
      }
    } catch (_) {
      /* storage.estimate not supported or failed — non-fatal */
    }
  }

  async _evictOldestEntries() {
    if (!this._db) return;
    try {
      const tx = this._db.transaction('translations', 'readwrite');
      const store = tx.objectStore('translations');
      const all = await new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      all.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      const deleteCount = Math.ceil(all.length * (1 - SKILLBRIDGE_THRESHOLDS.STORAGE_EVICT_TARGET));
      for (let i = 0; i < deleteCount && i < all.length; i++) {
        store.delete(all[i].id);
      }
      console.info(`[SkillBridge] Evicted ${deleteCount} old cache entries (storage quota high)`);
    } catch (err) {
      console.warn('[SkillBridge] Cache eviction failed:', err);
    }
  }

  /**
   * Register a callback for when Gemini finishes verifying a translation.
   * @param {(originalText: string, finalTranslation: string, targetLang: string, wasImproved: boolean) => void} callback
   */
  onTranslationUpdate(callback) {
    this._onUpdateCallbacks.push(callback);
  }

  // ==================== STATIC DICTIONARY ====================

  /**
   * Load static translation JSON for a given language.
   * Populates {@link staticDict} and internal protected-terms map.
   * @param {string} lang — ISO 639-1 language code (e.g. 'ko', 'ja')
   * @returns {Promise<void>}
   */
  async loadStaticTranslations(lang) {
    try {
      const url = chrome.runtime.getURL(`src/data/${lang}.json`);
      const resp = await fetch(url);
      if (!resp.ok) {
        this.staticDict = {};
        return;
      }
      const data = await resp.json();

      const flat = {};
      this._protectedTerms = {};
      for (const [section, entries] of Object.entries(data)) {
        if (section === '_meta') continue;
        if (section === '_protected') {
          // Protected terms: { "correct English": ["wrong Korean form 1", ...] }
          Object.assign(this._protectedTerms, entries);
          continue;
        }
        if (typeof entries === 'object') {
          for (const [key, value] of Object.entries(entries)) {
            flat[key] = value;
          }
        }
      }
      this.staticDict = flat;
      this._lowerDict = {};
      for (const [key, value] of Object.entries(flat)) {
        this._lowerDict[key.toLowerCase()] = value;
      }
    } catch (err) {
      console.warn('[SkillBridge] Failed to load static translations:', err);
      this.staticDict = {};
    }
  }

  /**
   * Normalize typography: curly quotes → straight, em/en dash → hyphen, etc.
   */
  _normalizeTypography(text) {
    return text
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u2026/g, '...')
      .replace(/\u00A0/g, ' ');
  }

  /**
   * Look up text in static dictionary.
   * Tries: exact → typography-normalized → trimmed punctuation → normalized whitespace → case-insensitive
   */
  getProtectedTerms() {
    return this._protectedTerms || {};
  }

  /** @param {string} text @returns {string|null} */
  staticLookup(text) {
    if (!text) return null;
    const trimmed = text.trim();
    if (!trimmed) return null;

    if (this.staticDict[trimmed]) return this.staticDict[trimmed];

    const typoNorm = this._normalizeTypography(trimmed);
    if (typoNorm !== trimmed && this.staticDict[typoNorm]) return this.staticDict[typoNorm];

    const noPunct = typoNorm.replace(/[.!?:;,]+$/, '').trim();
    if (noPunct !== typoNorm && this.staticDict[noPunct]) return this.staticDict[noPunct];

    const normalized = typoNorm.replace(/\s+/g, ' ');
    if (normalized !== typoNorm && this.staticDict[normalized]) return this.staticDict[normalized];

    if (this._lowerDict) {
      const lower = normalized.toLowerCase();
      if (this._lowerDict[lower]) return this._lowerDict[lower];
    }

    return null;
  }

  // ==================== IndexedDB CACHE ====================

  _openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('skillbridge-cache', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('translations')) {
          const store = db.createObjectStore('translations', { keyPath: 'id' });
          store.createIndex('lang', 'lang', { unique: false });
        }
      };
      req.onsuccess = (e) => {
        this._db = e.target.result;
        resolve();
      };
      req.onerror = () => {
        console.warn('[SkillBridge] IndexedDB open failed');
        resolve(); // non-fatal
      };
    });
  }

  /**
   * Look up a cached Gemini-verified translation.
   * @param {string} text — original English text
   * @param {string} targetLang — ISO 639-1
   * @returns {Promise<string|null>}
   */
  async cachedLookup(text, targetLang) {
    if (!this._db) return null;
    return new Promise((resolve) => {
      try {
        const tx = this._db.transaction('translations', 'readonly');
        const store = tx.objectStore('translations');
        const id = `${targetLang}\t${text.trim()}`;
        const req = store.get(id);
        req.onsuccess = () => {
          const entry = req.result;
          if (!entry?.translation) {
            resolve(null);
            return;
          }
          // TTL — delete stale cache entries from IndexedDB
          if (entry.timestamp && Date.now() - entry.timestamp > SKILLBRIDGE_THRESHOLDS.CACHE_TTL_MS) {
            try {
              const delTx = this._db.transaction('translations', 'readwrite');
              delTx.objectStore('translations').delete(id);
            } catch (_) {
              /* best-effort cleanup */
            }
            resolve(null);
            return;
          }
          resolve(entry.translation);
        };
        req.onerror = () => resolve(null);
      } catch (e) {
        console.warn('[SkillBridge] Cache read failed:', e);
        this._db = null;
        resolve(null);
      }
    });
  }

  /**
   * Save a Gemini-verified translation to cache.
   */
  async _cacheTranslation(text, translation, targetLang) {
    if (!this._db) return;
    try {
      const tx = this._db.transaction('translations', 'readwrite');
      const store = tx.objectStore('translations');
      const req = store.put({
        id: `${targetLang}\t${text.trim()}`,
        lang: targetLang,
        original: text.trim(),
        translation,
        timestamp: Date.now(),
      });
      req.onerror = (e) => {
        if (e.target.error?.name === 'QuotaExceededError') {
          console.warn('[SkillBridge] Storage quota exceeded — evicting old entries');
          this._evictOldestEntries();
          document.dispatchEvent(new CustomEvent('skillbridge:storagequota', { detail: { exceeded: true } }));
        }
      };
    } catch (err) {
      console.warn('[SkillBridge] Cache write failed:', err);
    }
  }

  // ==================== GOOGLE TRANSLATE ====================

  /**
   * Fast Google Translate via background service worker.
   * @param {string} text — English source text
   * @param {string} targetLang — ISO 639-1
   * @returns {Promise<string|null>} translated text, or null on failure
   */
  async googleTranslate(text, targetLang) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GOOGLE_TRANSLATE',
        text: text.trim(),
        targetLang,
        sourceLang: 'en',
      });
      if (response?.ok && response.translated) {
        return response.translated;
      }
      return null;
    } catch (err) {
      console.warn('[SkillBridge] Google Translate failed:', err.message);
      return null;
    }
  }

  /**
   * Batch Google Translate for multiple texts at once.
   * @param {string[]} texts — English source texts
   * @param {string} targetLang — ISO 639-1
   * @returns {Promise<string[]>} translated texts (originals on failure)
   */
  async googleTranslateBatch(texts, targetLang) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GOOGLE_TRANSLATE_BATCH',
        texts: texts.map((t) => t.trim()),
        targetLang,
        sourceLang: 'en',
      });
      if (response?.ok && response.translations) {
        return response.translations;
      }
      return texts; // return originals on failure
    } catch (err) {
      console.warn('[SkillBridge] Google Translate batch failed:', err.message);
      return texts;
    }
  }

  // ==================== GEMINI VERIFICATION ====================

  /**
   * Queue a text for background Gemini verification.
   * Skips short/simple strings where Google Translate is sufficient.
   * @param {string} originalText — English source
   * @param {string} googleTranslation — Google Translate output
   * @param {string} targetLang — ISO 639-1
   * @returns {boolean} true if queued, false if filtered out
   */
  queueGeminiVerify(originalText, googleTranslation, targetLang) {
    if (!originalText || !googleTranslation) return false;
    const text = originalText.trim();

    // Skip if too short — Google Translate handles these fine
    if (text.length < SKILLBRIDGE_THRESHOLDS.GEMINI_MIN_TEXT) return false;

    // Skip if mostly numbers/symbols (e.g. "6 minutes", "10-15 min")
    const alphaRatio = text.replace(/[^a-zA-Z]/g, '').length / text.length;
    if (alphaRatio < SKILLBRIDGE_THRESHOLDS.GEMINI_ALPHA_RATIO) return false;

    // Skip simple patterns: time, dates, labels
    if (/^\d+[\s-]+\w+$/.test(text)) return false; // "6 minutes"
    if (/^(estimated|about|approx)/i.test(text) && text.length < 60) return false;
    if (/^(module|lesson|chapter|section|part)\s+\d/i.test(text)) return false;

    // Only verify sentences with real prose (has periods, commas, or is long)
    const hasComplexity =
      text.includes('.') ||
      text.includes(',') ||
      text.includes(':') ||
      text.length > SKILLBRIDGE_THRESHOLDS.MIN_COMPLEX_TEXT;
    if (!hasComplexity) return false;

    // Cap queue size to prevent memory growth on large pages
    if (this._verifyQueue.length >= SKILLBRIDGE_THRESHOLDS.VERIFY_QUEUE_MAX) {
      const dropped = this._verifyQueue.shift();
      // Cache the Google Translate result as-is so it's at least persisted
      this._cacheTranslation(dropped.original, dropped.googleTranslation, dropped.targetLang);
    }
    this._verifyQueue.push({
      original: text,
      googleTranslation,
      targetLang,
    });

    if (!this._verifyLock) {
      this._verifyLock = new Promise((resolve) => {
        setTimeout(() => {
          this._runVerifyQueue().finally(() => {
            this._verifyLock = null;
            resolve();
          });
        }, SKILLBRIDGE_DELAYS.VERIFY_QUEUE);
      });
    }
    return true;
  }

  async _runVerifyQueue() {
    if (!this.isReady) {
      await new Promise((r) => setTimeout(r, SKILLBRIDGE_DELAYS.VERIFY_QUEUE_RETRY));
      if (!this.isReady) return;
    }

    while (this._verifyQueue.length > 0) {
      const batch = this._verifyQueue.splice(0, SKILLBRIDGE_THRESHOLDS.GEMINI_BATCH_SIZE);
      await Promise.all(batch.map((item) => this._verifySingle(item)));
      if (this._verifyQueue.length > 0) {
        await new Promise((r) => setTimeout(r, SKILLBRIDGE_DELAYS.GEMINI_BATCH));
      }
    }
  }

  async _verifySingle({ original, googleTranslation, targetLang }) {
    try {
      const langName = this.supportedLanguages[targetLang] || targetLang;
      const prompt = `You are a translation quality reviewer for technical education content (Anthropic AI courses).

ORIGINAL (English):
${original}

GOOGLE TRANSLATE (${langName}):
${googleTranslation}

TASK: Review the Google Translate output. If it is accurate and natural-sounding, reply with EXACTLY "OK". If it needs improvement, provide ONLY the corrected translation (no explanations, no "OK", just the improved text).

RULES:
- Keep technical terms (API, SDK, Claude, Anthropic, AI Fluency, 4Ds) in English
- Ensure natural ${langName} grammar and phrasing
- Fix any awkward literal translations
- Preserve the original meaning precisely`;

      const result = await this._sendRequest({
        type: 'VERIFY_REQUEST',
        systemPrompt: prompt,
        model: SKILLBRIDGE_MODELS.GEMINI,
      });

      if (!result) return;

      const trimResult = result.trim();

      // If Gemini says "OK", the Google translation is good — cache it
      if (trimResult === 'OK' || trimResult === 'ok' || trimResult === '"OK"') {
        await this._cacheTranslation(original, googleTranslation, targetLang);
        this._notifyUpdate(original, googleTranslation, targetLang, false);
        return;
      }

      // Gemini provided an improved translation
      // Sanity check: result should be similar length (not an explanation)
      if (
        trimResult.length > original.length * 5 ||
        trimResult.includes('ORIGINAL') ||
        trimResult.includes('GOOGLE TRANSLATE')
      ) {
        // Likely returned the prompt format, ignore
        await this._cacheTranslation(original, googleTranslation, targetLang);
        this._notifyUpdate(original, googleTranslation, targetLang, false);
        return;
      }

      // Cache the improved translation
      await this._cacheTranslation(original, trimResult, targetLang);

      this._notifyUpdate(original, trimResult, targetLang, true);
    } catch (err) {
      console.warn(`[SkillBridge] Gemini verify failed for "${original.substring(0, 30)}...":`, err.message);
      await this._cacheTranslation(original, googleTranslation, targetLang);
      this._notifyUpdate(original, googleTranslation, targetLang, false);
    }
  }

  /**
   * Notify all registered update callbacks.
   */
  _notifyUpdate(original, translation, targetLang, wasImproved) {
    for (const cb of this._onUpdateCallbacks) {
      try {
        cb(original, translation, targetLang, wasImproved);
      } catch (e) {
        console.warn('[SkillBridge] Update callback error:', e);
      }
    }
  }

  // ==================== MAIN TRANSLATE API ====================

  /**
   * Translate text. Priority: static dict -> cache -> Google Translate + Gemini verify.
   * @param {string} text — English source text
   * @param {string} targetLang — ISO 639-1
   * @returns {Promise<{text: string, source: 'static'|'cache'|'google'|'original'}>}
   */
  async translate(text, targetLang) {
    if (!text || !text.trim()) return { text, source: 'original' };
    if (targetLang === 'en') return { text, source: 'original' };

    // 1. Static dictionary (instant)
    const staticResult = this.staticLookup(text);
    if (staticResult) return { text: staticResult, source: 'static' };

    // 2. IndexedDB cache of Gemini-verified translations (instant)
    const cached = await this.cachedLookup(text, targetLang);
    if (cached) return { text: cached, source: 'cache' };

    // 3. Google Translate (fast)
    const gtResult = await this.googleTranslate(text, targetLang);
    if (gtResult) {
      // Queue background Gemini verification
      this.queueGeminiVerify(text, gtResult, targetLang);
      return { text: gtResult, source: 'google' };
    }

    return { text, source: 'original' };
  }

  // ==================== AI TUTOR CHAT ====================

  /**
   * Streaming AI tutor chat. Calls onChunk for each token, returns full response.
   * @param {string} userMessage
   * @param {string} targetLang — ISO 639-1
   * @param {string} [courseContext=''] — current course/page context
   * @param {(chunk: string, fullText: string) => void} onChunk — streaming callback
   * @param {{isExamPage?: boolean}} [opts={}]
   * @returns {Promise<string>} complete response text
   */
  async chatStream(userMessage, targetLang, courseContext = '', onChunk, opts = {}) {
    try {
      const langName = this.supportedLanguages[targetLang] || 'English';
      const examGuard = opts.isExamPage
        ? '\nCRITICAL: The user is on a certification exam page. You MUST NOT provide answers, solutions, or hints to exam questions under any circumstances. Only explain general concepts. If the user asks for specific exam answers, politely decline.'
        : '';
      const prompt = `You are SkillBridge Tutor, a bilingual AI learning assistant for Anthropic Academy. Respond in ${langName}.

Your strengths:
- You understand both the original English content and the learner's language.
- When a technical concept is unclear due to translation, explain the original English meaning and its equivalent in the target language.
- If the user quotes translated text, refer back to the original English to ensure accuracy.
- Proactively clarify AI/ML terms that are commonly mistranslated (e.g., "prompt", "token", "fine-tuning", "hallucination").

Guidelines:
- Keep technical terms (API, SDK, Claude, prompt, token, etc.) in English.
- Bridge the gap between English technical terminology and the learner's understanding.
- Be encouraging and supportive.${examGuard}
${courseContext ? `Current course context: ${courseContext}` : ''}

User: ${userMessage}`;

      if (!this.isReady) {
        throw new Error('Bridge not ready');
      }

      return new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        let fullText = '';

        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Stream timed out'));
        }, SKILLBRIDGE_THRESHOLDS.CHAT_STREAM_TIMEOUT);

        const handler = (event) => {
          if (event.source !== window) return;
          const data = event.data;
          if (!data || !data.__skillbridge__) return;
          if (this._bridgeNonce && data.__nonce__ !== this._bridgeNonce) return;
          if (data.id !== id) return;

          if (data.type === 'CHAT_STREAM_CHUNK') {
            fullText += data.text;
            if (onChunk) onChunk(data.text, fullText);
          } else if (data.type === 'CHAT_STREAM_END') {
            cleanup();
            resolve(fullText || 'No response');
          } else if (data.type === 'CHAT_RESPONSE') {
            cleanup();
            if (data.success === false) {
              reject(new Error(data.error));
            } else {
              resolve(data.result || 'No response');
            }
          }
        };

        const cleanup = () => {
          clearTimeout(timeout);
          window.removeEventListener('message', handler);
        };

        window.addEventListener('message', handler);

        window.postMessage(
          {
            __skillbridge__: true,
            __nonce__: this._bridgeNonce,
            type: 'CHAT_REQUEST',
            id,
            systemPrompt: prompt,
            userMessage,
            model: SKILLBRIDGE_MODELS.CLAUDE,
            stream: true,
          },
          window.location.origin,
        );
      });
    } catch (err) {
      console.error('[SkillBridge] Chat stream error:', err);
      return (
        (typeof CHAT_ERROR_LABELS !== 'undefined' && CHAT_ERROR_LABELS[targetLang]) ||
        'Sorry, I could not generate a response. Please try again.'
      );
    }
  }

  // ==================== INTERNAL ====================

  _setupMessageListener() {
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || !data.__skillbridge__) return;

      // Validate nonce on all bridge messages to prevent spoofing
      if (this._bridgeNonce && data.__nonce__ !== this._bridgeNonce) return;

      if (data.type === 'BRIDGE_READY') {
        this.isReady = true;
        // Process any pending verify queue now that bridge is ready
        if (this._verifyQueue.length > 0) {
          if (!this._verifyLock) {
            this._verifyLock = new Promise((resolve) => {
              setTimeout(() => {
                this._runVerifyQueue().finally(() => {
                  this._verifyLock = null;
                  resolve();
                });
              }, SKILLBRIDGE_DELAYS.BRIDGE_READY_VERIFY);
            });
          }
        }
      }

      if (data.type === 'BRIDGE_ERROR') {
        console.error('[SkillBridge] Bridge error:', data.error);
      }

      if (data.type === 'TRANSLATE_RESPONSE' || data.type === 'CHAT_RESPONSE' || data.type === 'VERIFY_RESPONSE') {
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
        console.warn('[SkillBridge] Bridge ready timeout - resolving anyway');
        resolve();
      }, SKILLBRIDGE_THRESHOLDS.BRIDGE_READY_TIMEOUT);

      const onReady = (event) => {
        if (event.source !== window) return;
        if (event.data?.__skillbridge__ && event.data.type === 'BRIDGE_READY') {
          clearTimeout(timeout);
          window.removeEventListener('message', onReady);
          this.isReady = true;
          resolve();
        }
        if (event.data?.__skillbridge__ && event.data.type === 'BRIDGE_ERROR') {
          clearTimeout(timeout);
          window.removeEventListener('message', onReady);
          reject(new Error(event.data.error));
        }
      };
      window.addEventListener('message', onReady);

      // Generate nonce for postMessage origin validation
      this._bridgeNonce = crypto.randomUUID();
      const script = document.createElement('script');
      script.id = '__skillbridge_loader__';
      script.src = chrome.runtime.getURL('src/lib/page-bridge.js');
      script.dataset.nonce = this._bridgeNonce;
      script.dataset.puterUrl = chrome.runtime.getURL('src/bridge/puter.js');
      script.onload = () => {
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

      const id = crypto.randomUUID();
      message.id = id;
      message.__skillbridge__ = true;
      message.__nonce__ = this._bridgeNonce;

      const timeout = setTimeout(() => {
        this.pendingCallbacks.delete(id);
        reject(new Error('Request timed out'));
      }, SKILLBRIDGE_THRESHOLDS.REQUEST_TIMEOUT);

      this.pendingCallbacks.set(id, (response) => {
        clearTimeout(timeout);
        if (response.success === false && response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response.result);
        }
      });

      window.postMessage(message, window.location.origin);
    });
  }
}

if (typeof window !== 'undefined') {
  window.SkilljarTranslator = SkilljarTranslator;
}
