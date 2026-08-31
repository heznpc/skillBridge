/**
 * SkillBridge — AI Course Translator - Translation Engine v3.0
 *
 * Translation priority:
 * 1. Static JSON dictionary (instant, no network)
 * 2. IndexedDB translation cache (instant)
 * 3. Google Translate via background proxy (fast, ~200ms), then cache locally
 *
 * Copyright respecting: translates on-the-fly only
 */

class SkilljarTranslator {
  constructor({ aiEnabled = true } = {}) {
    /** @type {Record<string, string>} Merged flat dictionary from JSON */
    this.staticDict = {};
    /** @type {Record<string, string>} Lowercase lookup mirror of staticDict */
    this._lowerDict = {};
    /** @type {Record<string, string[]>} Protected terms loaded from JSON */
    this._protectedTerms = {};
    /** @type {boolean} True once the optional AI Tutor bridge is ready */
    this.isReady = false;
    /** @type {IDBDatabase|null} IndexedDB handle for the translation cache */
    this._db = null;
    /** @type {string[]} ISO codes with static dictionaries */
    this.premiumLanguages = PREMIUM_LANGUAGE_CODES;
    /** @type {Record<string, string>} ISO code to language name */
    this.supportedLanguages = SUPPORTED_LANGUAGE_MAP;
    /** Whether the user-invoked AI Tutor bridge is available on this host. */
    this.aiEnabled = aiEnabled;
    /** @type {chrome.runtime.Port|null} Extension-only cloud Tutor channel. */
    this._cloudPort = null;
    /** @type {Map<string, object>} In-flight cloud Tutor streams. */
    this._cloudPending = new Map();
    /** @type {Promise<void>|null} Serializes broker startup/recovery. */
    this._cloudConnectPromise = null;
  }

  /** @returns {Promise<boolean>} true if initialization succeeded */
  async initialize() {
    try {
      await this._openDB();
      await this._cleanupExpiredCache();
      await this._checkStorageQuota();
      if (this.aiEnabled) {
        await this._ensureCloudBroker();
      }
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

  // ==================== STATIC DICTIONARY ====================

  _clearStaticTranslations() {
    this.staticDict = {};
    this._lowerDict = {};
    this._protectedTerms = {};
  }

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
        this._clearStaticTranslations();
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
      this._clearStaticTranslations();
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

  _restoreProtectedTerms(text) {
    const restore = typeof window !== 'undefined' && window._protectedTerms?.restoreProtectedTerms;
    if (typeof restore !== 'function') return text;
    try {
      return restore(text);
    } catch (err) {
      console.warn('[SkillBridge] Protected-term restoration failed:', err);
      return text;
    }
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
    return new Promise((resolve, _reject) => {
      const req = indexedDB.open('skillbridge-cache', CACHE_DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        // Drop-on-upgrade for every schema below the current one, rather than
        // migrating rows. Both bumps so far exist because the stored rows are
        // unfilterable after the fact: v1 (published 1.0.1) predates protected-
        // term restoration, and v2 predates brand-term masking, so a v2 row can
        // hold a mistranslated brand name whose wrong form is an ordinary word
        // in the target language. See CACHE_DB_VERSION in constants.js. A fresh
        // install arrives with oldVersion 0 and skips straight to the create.
        if (
          e.oldVersion > 0 &&
          e.oldVersion < CACHE_DROP_BELOW_VERSION &&
          db.objectStoreNames.contains('translations')
        ) {
          db.deleteObjectStore('translations');
        }
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
   * Look up a cached translation.
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
          // Markup entries were stored without prose restoration, and the HTML
          // path restores their text nodes after reconciliation instead.
          resolve(entry.html ? entry.translation : this._restoreProtectedTerms(entry.translation));
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
   * Save a translation to cache. Resolves on `tx.oncomplete` so callers
   * that `await` actually wait for the write to commit (the previous
   * version returned right after queuing the put, making the await a no-op).
   *
   * Rejects nothing — cache failures are non-fatal; the caller has already
   * shown the translation to the user. We just silently skip the cache.
   */
  /**
   * @param {string} text — cache key (source text, or a namespaced HTML key)
   * @param {string} translation
   * @param {string} targetLang
   * @param {{html?: boolean}} [opts] — `html: true` for structure-preserving
   *   blocks, whose value is markup rather than prose. See _isValidTranslation.
   */
  _cacheTranslation(text, translation, targetLang, opts = {}) {
    if (!this._db) return Promise.resolve();
    // Blunt string restoration is for prose. On markup it would also rewrite
    // attribute values, and the HTML path already restores protected terms in
    // TEXT NODES only, after reconciliation.
    const safeTranslation = opts.html ? translation : this._restoreProtectedTerms(translation);
    if (!this._isValidTranslation(safeTranslation, text, targetLang, opts)) {
      console.warn('[SkillBridge] Skipping cache: translation failed shape check');
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      try {
        const tx = this._db.transaction('translations', 'readwrite');
        const store = tx.objectStore('translations');
        store.put({
          id: `${targetLang}\t${text.trim()}`,
          lang: targetLang,
          original: text.trim(),
          translation: safeTranslation,
          html: !!opts.html,
          timestamp: Date.now(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => {
          if (e.target.error?.name === 'QuotaExceededError') {
            console.warn('[SkillBridge] Storage quota exceeded — evicting old entries');
            this._evictOldestEntries();
            document.dispatchEvent(new CustomEvent('skillbridge:storagequota', { detail: { exceeded: true } }));
          }
          resolve();
        };
        tx.onabort = () => resolve();
      } catch (err) {
        console.warn('[SkillBridge] Cache write failed:', err);
        resolve();
      }
    });
  }

  /**
   * Reject obvious garbage before persisting it for 30 days. Covers the
   * cases we've observed: translation services returning a partial HTML error page,
   * untranslated ASCII when a non-Latin target was requested, or a wildly
   * inflated string that's likely the model echoing the prompt.
   */
  _isValidTranslation(translation, original, targetLang, opts = {}) {
    if (!translation || typeof translation !== 'string') return false;
    if (translation.length > original.length * 10) return false;
    // Both checks below assume the value is PROSE, and both are wrong for a
    // structure-preserving block: its value is markup, so it always contains
    // tags and is mostly ASCII no matter how well it translated. That is why
    // structured blocks could never be cached — every write was rejected here.
    // They are not being trusted blindly: callers only cache markup that has
    // already passed the sanitizer, checkTagIntegrity and reconcileHtml, which
    // is a stronger guarantee than either heuristic below.
    if (opts.html) return true;
    // HTML tag at start = error page, not a translation
    if (/<\s*[a-z!][^>]*>/i.test(translation)) return false;
    // For non-Latin targets, mostly-ASCII output usually means the service
    // refused or returned an error string in English.
    const NON_LATIN = new Set(['ko', 'ja', 'zh-CN', 'zh-TW', 'ru', 'ar', 'hi', 'th', 'he', 'el', 'uk', 'bn']);
    if (NON_LATIN.has(targetLang) && translation.length > 20) {
      let nonAscii = 0;
      for (const ch of translation) {
        if (ch.codePointAt(0) > 127) nonAscii++;
      }
      if (nonAscii / translation.length < 0.05) return false;
    }
    return true;
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
      // Mask brand/technical terms so GT never sees them (protected-terms.js
      // maskProtectedTerms). Unmasking fails closed, in which case we return
      // null and the caller keeps the English source — strictly better than
      // rendering a placeholder or a mangled brand name.
      const pt = typeof window !== 'undefined' ? window._protectedTerms : null;
      const masked = pt?.maskProtectedTerms ? pt.maskProtectedTerms(text.trim()) : null;
      const response = await chrome.runtime.sendMessage({
        type: 'GOOGLE_TRANSLATE',
        text: masked?.tokens.length ? masked.text : text.trim(),
        targetLang,
        sourceLang: 'en',
      });
      if (response?.ok && response.translated) {
        if (!masked?.tokens.length) return response.translated;
        return pt.unmaskProtectedTerms(response.translated, masked);
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
      // Per-text masking (see googleTranslate). Token indices restart per
      // string and the batch response is positional, so entry i unmasks with
      // masks[i].
      const pt = typeof window !== 'undefined' ? window._protectedTerms : null;
      const trimmed = texts.map((t) => t.trim());
      const masks = pt?.maskProtectedTerms ? trimmed.map((t) => pt.maskProtectedTerms(t)) : null;
      const response = await chrome.runtime.sendMessage({
        type: 'GOOGLE_TRANSLATE_BATCH',
        texts: masks ? masks.map((m, i) => (m.tokens.length ? m.text : trimmed[i])) : trimmed,
        targetLang,
        sourceLang: 'en',
      });
      if (response?.ok && response.translations) {
        if (!masks) return response.translations;
        return response.translations.map((translated, i) => {
          if (!masks[i].tokens.length) return translated;
          // Unmask failure → hand back the source. applyGoogleTranslations
          // skips entries equal to their source, so the block stays English
          // instead of rendering a placeholder or a mistranslated brand.
          return pt.unmaskProtectedTerms(translated, masks[i]) ?? texts[i];
        });
      }
      return texts; // return originals on failure
    } catch (err) {
      console.warn('[SkillBridge] Google Translate batch failed:', err.message);
      return texts;
    }
  }

  // ==================== MAIN TRANSLATE API ====================

  /**
   * Translate text. Priority: static dict -> cache -> Google Translate.
   * @param {string} text — English source text
   * @param {string} targetLang — ISO 639-1
   * @returns {Promise<{text: string, source: 'static'|'cache'|'google'|'original'}>}
   */
  async translate(text, targetLang) {
    if (!text || !text.trim()) return { text, source: 'original' };
    if (targetLang === 'en') return { text, source: 'original' };

    // 1. Static dictionary (instant)
    const staticResult = this.staticLookup(text);
    if (staticResult) return { text: this._restoreProtectedTerms(staticResult), source: 'static' };

    // 2. IndexedDB translation cache (instant)
    const cached = await this.cachedLookup(text, targetLang);
    if (cached) return { text: cached, source: 'cache' };

    // 3. Google Translate (fast)
    const gtResult = await this.googleTranslate(text, targetLang);
    if (gtResult) {
      const safeGtResult = this._restoreProtectedTerms(gtResult);
      await this._cacheTranslation(text, safeGtResult, targetLang);
      return { text: safeGtResult, source: 'google' };
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
  // Selected tutor engine: 'cloud' (default) | 'local' | 'off'.
  async _getAiEngine() {
    // The engine preference is a privacy gate: 'local' and 'off' promise the
    // user that no prompt leaves this machine. If the chrome.storage read
    // stalls or fails, fail CLOSED — reject so the sidebar shows a retryable
    // error — rather than defaulting into the cloud path, which would ship
    // the prompt plus lesson context to Puter against the stored preference.
    //
    // sidebar-chat.js `_currentEngine()` is a near-identical twin whose timeout
    // RESOLVES instead. That is intentional: it only chooses an offline
    // explanation and transmits nothing, so it fails toward the default engine.
    // This function is the authoritative gate; keep the reject here even if the
    // two are ever refactored together. `tests/local-engine.test.js` locks the
    // asymmetry.
    const read = chrome.storage.local.get('sb_ai_engine');
    // The timer is cleared in `finally`, which matters twice: an uncleared
    // 1.5s timeout is left armed by every single chat message, and when it
    // fires after the read already won, its rejection has no handler — one
    // unhandled promise rejection per tutor question. Clearing it means the
    // losing promise never settles at all.
    let timer;
    const timeout = new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Tutor engine preference read timed out')), 1500);
    });
    try {
      const result = await Promise.race([read, timeout]);
      return result?.sb_ai_engine || 'cloud';
    } finally {
      clearTimeout(timer);
    }
  }

  // Stream a tutor reply from a local OpenAI-compatible server (Ollama, …).
  // The service worker does the localhost fetch and relays tokens over a Port;
  // this mirrors the cloud chatStream contract: onChunk(delta, fullText),
  // resolves with the full text, honors opts.signal.
  async _localChatStream(prompt, onChunk, opts = {}) {
    const { sb_local_base, sb_local_model } = await chrome.storage.local.get(['sb_local_base', 'sb_local_model']);
    return new Promise((resolve, reject) => {
      let port;
      try {
        const portName = opts.purpose === 'refinement' ? 'sb-local-refinement' : 'sb-local-chat';
        port = chrome.runtime.connect({ name: portName });
      } catch (err) {
        reject(new Error(`Local AI engine unavailable: ${err.message}`));
        return;
      }
      let fullText = '';
      let settled = false;
      // Without a watchdog a local server that accepts the connection but
      // never answers (cold-load stall, OOM) left the sidebar spinner running
      // forever with the send button disabled. Two windows: a generous one
      // for the first token (cold model load) and the shared cloud idle
      // timeout between tokens once generation is flowing.
      let watchdog = null;
      const armWatchdog = (ms) => {
        if (watchdog) clearTimeout(watchdog);
        watchdog = setTimeout(() => finish(reject, new Error('Local AI stream timed out')), ms);
      };
      const finish = (fn, arg) => {
        if (settled) return;
        settled = true;
        if (watchdog) clearTimeout(watchdog);
        opts.signal?.removeEventListener('abort', onAbort);
        try {
          port.disconnect();
        } catch {
          /* already gone */
        }
        fn(arg);
      };
      const onAbort = () => finish(reject, new DOMException('Aborted', 'AbortError'));
      port.onMessage.addListener((msg) => {
        if (settled || !msg) return;
        if (msg.type === 'chunk') {
          armWatchdog(SKILLBRIDGE_THRESHOLDS.CHAT_STREAM_TIMEOUT);
          fullText += msg.delta;
          onChunk?.(msg.delta, fullText);
        } else if (msg.type === 'done') {
          finish(resolve, fullText || 'No response');
        } else if (msg.type === 'error') {
          finish(reject, new Error(msg.error || 'Local AI error'));
        }
      });
      port.onDisconnect.addListener(() => finish(reject, new Error('Local AI connection closed')));
      if (opts.signal) {
        if (opts.signal.aborted) return onAbort();
        opts.signal.addEventListener('abort', onAbort, { once: true });
      }
      armWatchdog(SKILLBRIDGE_THRESHOLDS.LOCAL_FIRST_TOKEN_TIMEOUT);
      port.postMessage({
        type: 'start',
        messages: [{ role: 'user', content: prompt }],
        baseUrl: sb_local_base || 'http://localhost:11434/v1',
        model: sb_local_model || 'gemma3:4b',
      });
    });
  }

  /**
   * Build the Tutor prompt.
   *
   * Extracted so every engine provably gets the SAME text. The exam guard used
   * to be assembled inline in the one function that also chose the transport,
   * which made "cloud and local carry the same protection" a property of where
   * the lines happened to sit rather than something a test could hold. It is
   * the single prompt builder now, and `chatStream` calls it before it knows
   * which engine will run.
   *
   * The guard is the second layer, not the first. Answer-choice text never
   * reaches here at all: `getPageContext()` drops the lesson body on an
   * assessment page, the translation chokepoint keeps choices out of the queue
   * and the cache, and the selection quote refuses a highlight that touches
   * one. This is what remains if the learner types a question about an answer
   * themselves.
   */
  _buildTutorPrompt({ userMessage, targetLang, courseContext = '', isExamPage = false } = {}) {
    const langName = this.supportedLanguages[targetLang] || 'English';
    const examGuard = isExamPage
      ? '\nCRITICAL: The user is on a certification exam page. You MUST NOT provide answers, solutions, or hints to exam questions under any circumstances. Only explain general concepts. If the user asks for specific exam answers, politely decline.'
      : '';
    return `You are SkillBridge Tutor, a bilingual AI learning assistant for Anthropic's free AI courses. Respond in ${langName}.

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
  }

  /**
   * Stream from the cloud transport.
   *
   * Extracted from `chatStream` so a second caller can use the SAME transport
   * without inheriting the Tutor's prompt. The post-editor
   * (src/content/refine-queue.js) is not a tutor: handing it the tutor persona,
   * the exam guard and the course context would send text nobody asked to send
   * and bias an edit task with an unrelated instruction.
   *
   * `targetLang` is used only for the sign-in card's labels, which the isolated
   * broker cannot resolve for itself.
   */
  async _cloudChatStream(prompt, targetLang, onChunk, opts = {}) {
    const model = opts.model || SKILLBRIDGE_MODELS.CLAUDE;
    if (!this.isReady || !this._cloudPort) await this._ensureCloudBroker();
    if (!this.isReady || !this._cloudPort) throw new Error('Bridge not ready');

    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      let fullText = '';
      let settled = false;

      // Honor an AbortSignal so callers can cancel the stream when the
      // user navigates away / closes the sidebar / switches sub-panels.
      // Without this the message handler stayed live for up to 60s and
      // wrote chunks into orphaned DOM nodes (and saved abandoned chats).
      if (opts.signal?.aborted) {
        return reject(new DOMException('Aborted', 'AbortError'));
      }

      const _postAbort = () => {
        try {
          this._cloudPort?.postMessage({ type: 'abort', id });
        } catch (_e) {
          /* broker already disconnected */
        }
      };

      let watchdog = null;
      const cloudIdleTimeout = Math.max(SKILLBRIDGE_THRESHOLDS.CHAT_STREAM_TIMEOUT, 90_000);
      const armWatchdog = () => {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => {
          _postAbort();
          finish(reject, new Error('Stream timed out'));
        }, cloudIdleTimeout);
      };

      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        this._cloudPending.delete(id);
        opts.signal?.removeEventListener('abort', onAbort);
        fn(value);
      };

      const onAbort = () => {
        _postAbort();
        finish(reject, new DOMException('Aborted', 'AbortError'));
      };

      if (opts.signal) opts.signal.addEventListener('abort', onAbort, { once: true });
      this._cloudPending.set(id, {
        chunk(text) {
          armWatchdog();
          fullText += text;
          onChunk?.(text, fullText);
        },
        // The broker keepalives every 20s while a request is genuinely in
        // flight (including while its sign-in overlay is open); without this
        // the 90s idle watchdog kills a first-run sign-in mid-popup.
        keepalive: () => armWatchdog(),
        done: () => finish(resolve, fullText || 'No response'),
        error: (message) => finish(reject, new Error(message || 'Cloud AI error')),
      });
      armWatchdog();
      // The isolated broker owns the sign-in card and cannot read the
      // extension UI's language state, so ship only the resolved labels.
      const t = (map) => map[this.currentLang] || map[targetLang] || map.en;
      const request = {
        type: 'start',
        id,
        prompt,
        model,
        labels: {
          title: t(ENGINE_LABELS.signInTitle),
          body: t(ENGINE_LABELS.signInBody),
          button: t(ENGINE_LABELS.signInButton),
          cancel: t(ENGINE_LABELS.signInCancel),
          error: t(ENGINE_LABELS.tutorSignInRequired),
          disable: t(ENGINE_LABELS.signInDisable),
          localHint: t(ENGINE_LABELS.signInLocalHint),
          // Shown as the outcome of the "turn off" action, so the reply the
          // user gets is about the choice they just made rather than the
          // generic "sign-in required". Reuses the label the sidebar already
          // shows for a disabled tutor, so the two agree.
          off: t(ENGINE_LABELS.tutorOff),
        },
      };
      const sendStart = (allowReconnect) => {
        if (settled || opts.signal?.aborted) return;
        try {
          this._cloudPort.postMessage(request);
        } catch (err) {
          if (!allowReconnect) {
            finish(reject, new Error(`Cloud AI connection failed: ${err.message}`));
            return;
          }
          const deadPort = this._cloudPort;
          this._cloudPort = null;
          this.isReady = false;
          try {
            deadPort?.disconnect();
          } catch (_e) {
            /* already disconnected */
          }
          void this._ensureCloudBroker().then(
            () => {
              if (!settled && !opts.signal?.aborted) sendStart(false);
            },
            (connectErr) => finish(reject, new Error(`Cloud AI connection failed: ${connectErr.message}`)),
          );
        }
      };
      sendStart(true);
    });
  }

  /**
   * Post-edit one already-translated block.
   *
   * Deliberately NOT routed through `_getAiEngine()`. Refinement has its own
   * setting and its own consent, and the decision about whether it may run at
   * all — including the case where it follows a Tutor that is off — belongs to
   * src/lib/refinement-policy.js, which the caller has already consulted.
   * Re-deriving it here would give the feature two answers to one question.
   *
   * The engine is asserted rather than defaulted: an unrecognised value is a
   * caller bug, and defaulting it into the cloud path would send course text
   * to Puter on the strength of a typo.
   */
  async refineText(prompt, { engine, signal, targetLang = 'en' } = {}) {
    if (engine !== 'cloud' && engine !== 'local') {
      throw new Error(`refineText: refusing an unrecognised engine "${engine}"`);
    }
    if (engine === 'local') return this._localChatStream(prompt, null, { signal, purpose: 'refinement' });
    // Refinement is a copy-edit, not a conversation — see SKILLBRIDGE_MODELS.
    return this._cloudChatStream(prompt, targetLang, null, { signal, model: SKILLBRIDGE_MODELS.REFINEMENT });
  }

  async chatStream(userMessage, targetLang, courseContext = '', onChunk, opts = {}) {
    try {
      const prompt = this._buildTutorPrompt({
        userMessage,
        targetLang,
        courseContext,
        isExamPage: opts.isExamPage,
      });

      // Route to the selected AI engine (settings, chrome.storage.local):
      // 'cloud' (default) = Claude via the Puter bridge; 'local' = an
      // OpenAI-compatible server (Ollama) proxied by the service worker;
      // 'off' = no tutor.
      const engine = await this._getAiEngine();
      if (engine === 'off') throw new Error('AI tutor is turned off in settings.');
      if (engine === 'local') return this._localChatStream(prompt, onChunk, opts);

      return this._cloudChatStream(prompt, targetLang, onChunk, opts);
    } catch (err) {
      // Synchronous setup failures (most importantly `!this.isReady` — the Puter
      // bridge hasn't finished its handshake) must PROPAGATE, not resolve to a
      // string. The sole caller (sidebar-chat) discards chatStream's return value
      // and relies on a thrown error to render the error bubble + retry button;
      // returning a string here left the "thinking…" spinner stranded forever
      // with no error and no retry. (Promise-path failures — timeout, abort,
      // success:false — already reject and are unaffected.)
      console.error('[SkillBridge] Chat stream error:', err);
      throw err;
    }
  }

  // ==================== INTERNAL ====================

  _ensureCloudBroker() {
    if (this.isReady && this._cloudPort) return Promise.resolve();
    if (this._cloudConnectPromise) return this._cloudConnectPromise;
    const connecting = this._connectCloudBrokerWithRetry().finally(() => {
      if (this._cloudConnectPromise === connecting) this._cloudConnectPromise = null;
    });
    this._cloudConnectPromise = connecting;
    return connecting;
  }

  async _connectCloudBrokerWithRetry(maxRetries = 2) {
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this._connectCloudBroker();
        this.bridgeFailed = false;
        return;
      } catch (err) {
        lastErr = err;
        console.warn(`[SkillBridge] Cloud broker attempt ${attempt + 1}/${maxRetries + 1} failed:`, err.message);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
        }
      }
    }
    this.bridgeFailed = true;
    window.dispatchEvent(new CustomEvent('skillbridge:bridgeunavailable'));
    throw lastErr;
  }

  _connectCloudBroker() {
    return new Promise((resolve, reject) => {
      const previousPort = this._cloudPort;
      this._cloudPort = null;
      this.isReady = false;
      if (previousPort) {
        try {
          previousPort.disconnect();
        } catch (_e) {
          /* already disconnected */
        }
      }
      const timeout = setTimeout(() => {
        cleanupReady();
        try {
          port?.disconnect();
        } catch (_e) {
          /* already disconnected */
        }
        reject(new Error('Cloud broker ready timeout'));
      }, SKILLBRIDGE_THRESHOLDS.BRIDGE_READY_TIMEOUT);
      let port;
      try {
        // The isolated Puter content script deliberately reconnects only on a
        // user-driven Tutor attempt. This revives its broker endpoint after an
        // MV3 service-worker idle shutdown without creating a passive wake loop.
        globalThis.__SKILLBRIDGE_ENSURE_PUTER_BROKER__?.();
        port = chrome.runtime.connect({ name: 'sb-cloud-chat-client' });
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
        return;
      }
      this._cloudPort = port;
      let waiting = true;
      const cleanupReady = () => {
        if (!waiting) return;
        waiting = false;
        clearTimeout(timeout);
      };
      port.onMessage.addListener((msg) => {
        if (!msg || this._cloudPort !== port) return;
        if (msg.type === 'ready') {
          cleanupReady();
          this.isReady = true;
          resolve();
          return;
        }
        if (msg.type === 'unavailable') {
          this.isReady = false;
          for (const pending of this._cloudPending.values()) pending.error('Puter broker unavailable');
          this._cloudPending.clear();
          return;
        }
        if (typeof msg.id !== 'string') return;
        const pending = this._cloudPending.get(msg.id);
        if (!pending) return;
        if (msg.type === 'chunk' && typeof msg.text === 'string') pending.chunk(msg.text);
        else if (msg.type === 'keepalive') pending.keepalive?.();
        else if (msg.type === 'done') {
          pending.done();
        } else if (msg.type === 'error') {
          pending.error(msg.error);
        }
      });
      port.onDisconnect.addListener(() => {
        if (this._cloudPort !== port) return;
        const wasWaiting = waiting;
        cleanupReady();
        this._cloudPort = null;
        this.isReady = false;
        for (const pending of this._cloudPending.values()) pending.error('Cloud AI connection closed');
        this._cloudPending.clear();
        if (wasWaiting) reject(new Error('Cloud broker connection closed'));
      });
    });
  }
}

if (typeof window !== 'undefined') {
  window.SkilljarTranslator = SkilljarTranslator;
}
