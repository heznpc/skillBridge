/**
 * Skilljar i18n Assistant - Content Script
 * Injects translation UI and handles page content translation
 *
 * Respects copyright: only translates displayed text on-the-fly
 * Never stores, caches permanently, or redistributes original content
 */

(function () {
  'use strict';

  // Target ALL visible text elements directly — Skilljar pages
  // don't use <main>/<article> wrappers around course content.
  // Course cards are <a> > <h2> + <p> structure.
  const TRANSLATABLE_SELECTOR = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',       // all headings
    'p',                                          // all paragraphs
    'li',                                         // all list items
    'td', 'th',                                   // table cells
    'label',                                      // form labels
    'figcaption',                                  // figure captions
    'span',                                        // spans with text
    '.btn-text', '.nav-text',                     // button/nav text
    'blockquote',                                  // quotes
    'dt', 'dd',                                    // definition lists
  ].join(', ');

  const EXCLUDE_SELECTOR = [
    'code', 'pre', 'script', 'style', 'noscript',
    '.code-block', '.syntax-highlight',
    '.skilljar-i18n-sidebar',
    '#skilljar-i18n-bridge',
    '#skilljar-i18n-fab',
    'nav',                                         // skip navigation
    'footer',                                      // skip footer
    '[role="navigation"]',
  ].join(', ');

  // Greetings per language for AI Tutor
  const TUTOR_GREETINGS = {
    'en': "Hi! I'm your AI learning assistant. Ask me anything about this course. Powered by GPT-4o-mini via Puter.js (free, no API key).",
    'ko': "안녕하세요! AI 학습 도우미입니다. 이 과정에 대해 무엇이든 물어보세요. Puter.js + GPT-4o-mini 기반 (무료, API 키 불필요).",
    'ja': "こんにちは！AI学習アシスタントです。このコースについて何でも聞いてください。Puter.js + GPT-4o-mini（無料、APIキー不要）。",
    'zh-CN': "你好！我是你的AI学习助手。关于这门课程，有什么都可以问我。基于 Puter.js + GPT-4o-mini（免费，无需API密钥）。",
    'zh-TW': "你好！我是你的AI學習助手。關於這門課程，有什麼都可以問我。基於 Puter.js + GPT-4o-mini（免費，無需API金鑰）。",
    'es': "¡Hola! Soy tu asistente de aprendizaje con IA. Pregúntame lo que quieras sobre este curso. Powered by Puter.js + GPT-4o-mini (gratis, sin API key).",
    'fr': "Bonjour ! Je suis votre assistant d'apprentissage IA. Posez-moi n'importe quelle question sur ce cours. Propulsé par Puter.js + GPT-4o-mini (gratuit, sans clé API).",
    'de': "Hallo! Ich bin dein KI-Lernassistent. Frag mich alles über diesen Kurs. Powered by Puter.js + GPT-4o-mini (kostenlos, kein API-Schlüssel nötig).",
  };

  let translator = null;
  let currentLang = 'en';
  let isTranslating = false;
  let isReady = false;
  let sidebarVisible = false;
  let originalTexts = new Map();
  let pendingActions = [];

  // ============================================================
  // REGISTER MESSAGE LISTENER IMMEDIATELY (before async init)
  // ============================================================

  chrome.runtime.onMessage.addListener(handleMessage);
  console.log('[Skilljar i18n] Message listener registered');

  function handleMessage(request, sender, sendResponse) {
    if (!isReady && request.action === 'translatePage') {
      pendingActions.push({ request, sendResponse });
      sendResponse({ success: true, queued: true });
      return false;
    }

    switch (request.action) {
      case 'translatePage':
        translatePage(request.language).then(() => {
          sendResponse({ success: true });
        }).catch((err) => {
          console.error('[Skilljar i18n] translatePage error:', err);
          sendResponse({ success: false, error: err.message });
        });
        return true;

      case 'restoreOriginal':
        restoreOriginal();
        sendResponse({ success: true });
        return false;

      case 'toggleSidebar':
        toggleSidebar();
        sendResponse({ success: true });
        return false;

      case 'getPageContext':
        sendResponse({ context: getPageContext() });
        return false;

      case 'setLanguage':
        currentLang = request.language;
        chrome.storage.local.set({ targetLanguage: request.language });
        sendResponse({ success: true });
        return false;

      case 'ping':
        sendResponse({ ready: isReady });
        return false;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
        return false;
    }
  }

  // ============================================================
  // INDEXEDDB PERSISTENT CACHE
  // ============================================================

  const DB_NAME = 'skilljar_i18n_cache';
  const DB_VERSION = 1;
  const STORE_NAME = 'translations';
  let db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE_NAME)) {
          const store = d.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp');
        }
      };
      request.onsuccess = (e) => {
        db = e.target.result;
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function getCachedTranslation(text, lang) {
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const key = `${lang}::${text.substring(0, 200)}`;
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result?.translated || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async function setCachedTranslation(text, lang, translated) {
    if (!db) return;
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({
        key: `${lang}::${text.substring(0, 200)}`,
        original: text,
        translated,
        lang,
        timestamp: Date.now(),
      });
    } catch { /* ignore */ }
  }

  async function getBatchCached(texts, lang) {
    if (!db) return { cached: {}, uncached: texts.map((t, i) => ({ idx: i, text: t })) };
    const cached = {};
    const uncached = [];
    for (let i = 0; i < texts.length; i++) {
      const hit = await getCachedTranslation(texts[i], lang);
      if (hit) {
        cached[i] = hit;
      } else {
        uncached.push({ idx: i, text: texts[i] });
      }
    }
    return { cached, uncached };
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================

  async function init() {
    try {
      // Open IndexedDB cache
      await openDB().catch(e => console.warn('[Skilljar i18n] IndexedDB unavailable:', e));

      const stored = await chrome.storage.local.get(['targetLanguage', 'autoTranslate']);
      currentLang = stored.targetLanguage || 'en';

      translator = new SkilljarTranslator();
      const bridgeOk = await translator.initialize();

      if (!bridgeOk) {
        console.warn('[Skilljar i18n] Bridge failed to initialize, features limited');
      }

      injectSidebar();
      injectFloatingButton();
      isReady = true;

      console.log('[Skilljar i18n] Content script ready');

      for (const { request } of pendingActions) {
        if (request.action === 'translatePage') {
          await translatePage(request.language);
        }
      }
      pendingActions = [];

      if (stored.autoTranslate && currentLang !== 'en' && bridgeOk) {
        await translatePage(currentLang);
      }

      observeDOM();
    } catch (err) {
      console.error('[Skilljar i18n] Init error:', err);
      isReady = true;
      injectSidebar();
      injectFloatingButton();
    }
  }

  // ============================================================
  // PAGE TRANSLATION
  // ============================================================

  async function translatePage(targetLang) {
    if (isTranslating) return;
    if (!translator || !translator.isReady) {
      console.warn('[Skilljar i18n] Translator not ready');
      updateProgressText('AI engine loading... please wait and retry');
      showProgress(true);
      setTimeout(() => showProgress(false), 3000);
      return;
    }

    isTranslating = true;
    currentLang = targetLang;

    showProgress(true);
    updateProgressText('Preparing translation...');

    try {
      const elements = getTranslatableElements();

      if (elements.length === 0) {
        updateProgressText('No translatable content found on this page.');
        setTimeout(() => showProgress(false), 3000);
        isTranslating = false;
        return;
      }

      // Collect all text nodes and their texts
      const nodeMap = []; // { node, text, elementIdx }
      const textsToTranslate = [];

      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        if (!el.textContent.trim()) continue;

        if (!originalTexts.has(el)) {
          originalTexts.set(el, el.innerHTML);
        }

        const textNodes = getTextNodes(el);
        for (const node of textNodes) {
          const text = node.textContent.trim();
          if (text.length < 2) continue;
          if (isCodeContent(node)) continue;
          nodeMap.push({ node, text, elementIdx: i });
          textsToTranslate.push(text);
        }
      }

      if (textsToTranslate.length === 0) {
        updateProgressText('No translatable text found.');
        setTimeout(() => showProgress(false), 3000);
        isTranslating = false;
        return;
      }

      updateProgressText(`Translating ${textsToTranslate.length} items...`);

      // Step 1: Check IndexedDB cache first
      const { cached, uncached } = await getBatchCached(textsToTranslate, targetLang);
      const cachedCount = Object.keys(cached).length;

      if (cachedCount > 0) {
        console.log(`[Skilljar i18n] ${cachedCount} items from cache, ${uncached.length} need translation`);
        // Apply cached translations immediately
        for (const [idx, translated] of Object.entries(cached)) {
          const { node, text } = nodeMap[idx];
          if (translated && translated !== text) {
            node.textContent = translated;
          }
        }
        updateProgressText(`Applied ${cachedCount} cached, translating ${uncached.length} remaining...`);
        updateProgressBar(cachedCount / textsToTranslate.length);
      }

      // Step 2: Batch translate uncached items
      if (uncached.length > 0) {
        const results = await translator.translateBatch(
          uncached.map(u => u.text),
          targetLang,
          '',
          (completed, total) => {
            const totalDone = cachedCount + completed;
            const pct = Math.round((totalDone / textsToTranslate.length) * 100);
            updateProgressText(`Translating... ${pct}%`);
            updateProgressBar(totalDone / textsToTranslate.length);
          }
        );

        // Apply and cache results
        let appliedCount = 0;
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const originalIdx = uncached[i].idx;
          const { node, text } = nodeMap[originalIdx];

          if (result && result.success && result.result && result.result !== text) {
            node.textContent = result.result;
            appliedCount++;
            // Save to IndexedDB for future visits
            setCachedTranslation(text, targetLang, result.result);
          }
        }
        console.log(`[Skilljar i18n] Applied ${appliedCount + cachedCount} translations (${cachedCount} cached, ${appliedCount} new)`);
      }

      updateProgressText('Translation complete!');
      updateProgressBar(1);
      setTimeout(() => showProgress(false), 2000);
    } catch (err) {
      console.error('[Skilljar i18n] Translation error:', err);
      updateProgressText('Translation error: ' + err.message);
      setTimeout(() => showProgress(false), 4000);
    } finally {
      isTranslating = false;
    }
  }

  function restoreOriginal() {
    originalTexts.forEach((html, el) => {
      if (el && el.parentNode) {
        el.innerHTML = html;
      }
    });
    originalTexts.clear();
    currentLang = 'en';
  }

  function getTranslatableElements() {
    const elements = Array.from(document.querySelectorAll(TRANSLATABLE_SELECTOR));

    return elements.filter(el => {
      // Skip our own extension UI
      if (el.closest(EXCLUDE_SELECTOR)) return false;
      // Skip if inside another matched element (avoid duplicate translation)
      const parent = el.parentElement;
      if (parent && parent.matches && parent.matches(TRANSLATABLE_SELECTOR) &&
          !parent.closest(EXCLUDE_SELECTOR)) {
        const parentTag = parent.tagName;
        if (['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH', 'BLOCKQUOTE'].includes(parentTag)) {
          return false;
        }
      }
      // Skip tiny spans (icons, badges) — only for <span>
      if (el.tagName === 'SPAN') {
        const text = el.textContent.trim();
        // Skip spans with very short text or that contain child elements (likely UI components)
        if (text.length < 4) return false;
        // Skip if span has many child elements (likely a container, not text)
        if (el.children.length > 3) return false;
      }
      // Must have actual text content
      const text = el.textContent.trim();
      return text.length > 1;
    });
  }

  function getTextNodes(element) {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (node.textContent.trim().length < 2) return NodeFilter.FILTER_REJECT;
          if (node.parentElement?.closest('code, pre, script, style')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function isCodeContent(node) {
    let parent = node.parentElement;
    while (parent) {
      if (['CODE', 'PRE', 'SCRIPT', 'STYLE'].includes(parent.tagName)) return true;
      parent = parent.parentElement;
    }
    return false;
  }

  function getPageContext() {
    const title = document.querySelector('h1, h2, .course-title')?.textContent || document.title || '';
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4'))
      .map(h => h.textContent.trim())
      .slice(0, 5)
      .join(', ');
    return `Course: ${title}. Sections: ${headings}`;
  }

  // ============================================================
  // DOM OBSERVER
  // ============================================================

  function observeDOM() {
    const observer = new MutationObserver((mutations) => {
      if (currentLang === 'en' || isTranslating) return;
      if (!translator || !translator.isReady) return;

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE &&
              !node.closest('.skilljar-i18n-sidebar') &&
              !node.closest('#skilljar-i18n-bridge')) {
            debounceTranslateNew(node);
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  let translateTimeout;
  function debounceTranslateNew(node) {
    clearTimeout(translateTimeout);
    translateTimeout = setTimeout(async () => {
      if (currentLang !== 'en' && translator?.isReady) {
        const textNodes = getTextNodes(node);
        for (const tn of textNodes) {
          const original = tn.textContent.trim();
          if (original.length >= 2 && !isCodeContent(tn)) {
            // Check IndexedDB first
            const cached = await getCachedTranslation(original, currentLang);
            if (cached) {
              tn.textContent = cached;
              continue;
            }
            try {
              const translated = await translator.translate(original, currentLang);
              if (translated && translated !== original) {
                tn.textContent = translated;
                setCachedTranslation(original, currentLang, translated);
              }
            } catch (e) { /* skip */ }
          }
        }
      }
    }, 1000);
  }

  // ============================================================
  // FLOATING BUTTON
  // ============================================================

  function injectFloatingButton() {
    if (document.getElementById('skilljar-i18n-fab')) return;
    const btn = document.createElement('div');
    btn.id = 'skilljar-i18n-fab';
    btn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    `;
    btn.title = 'Skilljar i18n Assistant';
    btn.addEventListener('click', toggleSidebar);
    document.body.appendChild(btn);
  }

  // ============================================================
  // SIDEBAR UI
  // ============================================================

  function injectSidebar() {
    if (document.getElementById('skilljar-i18n-sidebar')) return;
    const sidebar = document.createElement('div');
    sidebar.id = 'skilljar-i18n-sidebar';
    sidebar.className = 'skilljar-i18n-sidebar';
    sidebar.innerHTML = getSidebarHTML();
    document.body.appendChild(sidebar);
    setTimeout(bindSidebarEvents, 100);
  }

  function getTutorGreeting() {
    return TUTOR_GREETINGS[currentLang] || TUTOR_GREETINGS['en'];
  }

  function getSidebarHTML() {
    return `
      <div class="si18n-header">
        <div class="si18n-logo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          <span>Skilljar i18n</span>
        </div>
        <button class="si18n-close" id="si18n-close">&times;</button>
      </div>

      <div class="si18n-tabs">
        <button class="si18n-tab active" data-tab="translate">Translate</button>
        <button class="si18n-tab" data-tab="chat">AI Tutor</button>
      </div>

      <div class="si18n-panel" id="si18n-panel-translate">
        <div class="si18n-section">
          <label class="si18n-label">Target Language</label>
          <select id="si18n-lang-select" class="si18n-select">
            <option value="en">English (Original)</option>
            <option value="ko">한국어</option>
            <option value="ja">日本語</option>
            <option value="zh-CN">中文(简体)</option>
            <option value="zh-TW">中文(繁體)</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
            <option value="pt-BR">Português (BR)</option>
            <option value="vi">Tiếng Việt</option>
            <option value="th">ภาษาไทย</option>
            <option value="id">Bahasa Indonesia</option>
            <option value="ar">العربية</option>
            <option value="hi">हिन्दी</option>
            <option value="ru">Русский</option>
            <option value="tr">Türkçe</option>
          </select>
        </div>

        <div class="si18n-actions">
          <button id="si18n-translate-btn" class="si18n-btn si18n-btn-primary">
            Translate Page
          </button>
          <button id="si18n-restore-btn" class="si18n-btn si18n-btn-secondary">
            Restore Original
          </button>
        </div>

        <div class="si18n-toggle-row">
          <label class="si18n-toggle-label">
            <input type="checkbox" id="si18n-auto-translate" />
            <span>Auto-translate on page load</span>
          </label>
        </div>

        <div id="si18n-progress" class="si18n-progress" style="display:none">
          <div class="si18n-progress-bar">
            <div class="si18n-progress-fill" id="si18n-progress-fill"></div>
          </div>
          <div class="si18n-progress-text" id="si18n-progress-text">Preparing...</div>
        </div>
      </div>

      <div class="si18n-panel" id="si18n-panel-chat" style="display:none">
        <div class="si18n-chat-messages" id="si18n-chat-messages">
          <div class="si18n-chat-msg si18n-chat-bot">
            <div class="si18n-chat-avatar">AI</div>
            <div class="si18n-chat-bubble">
              ${getTutorGreeting()}
            </div>
          </div>
        </div>
        <div class="si18n-chat-input-wrap">
          <textarea id="si18n-chat-input" class="si18n-chat-input"
            placeholder="Ask about the course content..."
            rows="2"></textarea>
          <button id="si18n-chat-send" class="si18n-btn si18n-btn-primary si18n-chat-send">
            Send
          </button>
        </div>
      </div>

      <div class="si18n-footer">
        <span>Powered by <a href="https://puter.com" target="_blank">Puter.js</a> + GPT-4o-mini</span>
        <span class="si18n-footer-sep">|</span>
        <a href="https://github.com" target="_blank">Open Source</a>
      </div>
    `;
  }

  function bindSidebarEvents() {
    document.getElementById('si18n-close')?.addEventListener('click', toggleSidebar);

    document.querySelectorAll('.si18n-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.si18n-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.si18n-panel').forEach(p => p.style.display = 'none');
        document.getElementById(`si18n-panel-${tab.dataset.tab}`).style.display = 'flex';
      });
    });

    const langSelect = document.getElementById('si18n-lang-select');
    if (langSelect) {
      langSelect.value = currentLang;
      langSelect.addEventListener('change', (e) => {
        currentLang = e.target.value;
        chrome.storage.local.set({ targetLanguage: currentLang });
        // Update tutor greeting when language changes
        updateTutorGreeting();
      });
    }

    document.getElementById('si18n-translate-btn')?.addEventListener('click', async () => {
      const lang = document.getElementById('si18n-lang-select').value;
      if (lang === 'en') {
        restoreOriginal();
      } else {
        await translatePage(lang);
      }
    });

    document.getElementById('si18n-restore-btn')?.addEventListener('click', restoreOriginal);

    const autoToggle = document.getElementById('si18n-auto-translate');
    chrome.storage.local.get(['autoTranslate'], (result) => {
      if (autoToggle) autoToggle.checked = result.autoTranslate || false;
    });
    autoToggle?.addEventListener('change', (e) => {
      chrome.storage.local.set({ autoTranslate: e.target.checked });
    });

    // Chat input — prevent IME double-send (Korean, Japanese, Chinese)
    const chatInput = document.getElementById('si18n-chat-input');
    let isComposing = false;

    chatInput?.addEventListener('compositionstart', () => { isComposing = true; });
    chatInput?.addEventListener('compositionend', () => { isComposing = false; });

    document.getElementById('si18n-chat-send')?.addEventListener('click', sendChatMessage);
    chatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !isComposing && !e.isComposing) {
        e.preventDefault();
        sendChatMessage();
      }
    });
  }

  function updateTutorGreeting() {
    const messagesEl = document.getElementById('si18n-chat-messages');
    if (!messagesEl) return;
    const firstBubble = messagesEl.querySelector('.si18n-chat-bot .si18n-chat-bubble');
    if (firstBubble && messagesEl.children.length === 1) {
      firstBubble.textContent = getTutorGreeting();
    }
  }

  // ============================================================
  // CHAT
  // ============================================================

  async function sendChatMessage() {
    const input = document.getElementById('si18n-chat-input');
    const messages = document.getElementById('si18n-chat-messages');
    const text = input.value.trim();
    if (!text) return;

    messages.innerHTML += `
      <div class="si18n-chat-msg si18n-chat-user">
        <div class="si18n-chat-bubble">${escapeHtml(text)}</div>
        <div class="si18n-chat-avatar">You</div>
      </div>
    `;
    input.value = '';

    const loadingId = 'loading-' + Date.now();
    messages.innerHTML += `
      <div class="si18n-chat-msg si18n-chat-bot" id="${loadingId}">
        <div class="si18n-chat-avatar">AI</div>
        <div class="si18n-chat-bubble si18n-typing">Thinking...</div>
      </div>
    `;
    messages.scrollTop = messages.scrollHeight;

    const context = getPageContext();
    const response = await translator.chat(text, currentLang, context);

    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) {
      loadingEl.querySelector('.si18n-chat-bubble').innerHTML = formatResponse(response);
      loadingEl.querySelector('.si18n-chat-bubble').classList.remove('si18n-typing');
    }
    messages.scrollTop = messages.scrollHeight;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatResponse(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  // ============================================================
  // PROGRESS UI
  // ============================================================

  function showProgress(show) {
    const el = document.getElementById('si18n-progress');
    if (el) el.style.display = show ? 'block' : 'none';
  }

  function updateProgressText(text) {
    const el = document.getElementById('si18n-progress-text');
    if (el) el.textContent = text;
  }

  function updateProgressBar(ratio) {
    const el = document.getElementById('si18n-progress-fill');
    if (el) el.style.width = `${Math.round(ratio * 100)}%`;
  }

  // ============================================================
  // SIDEBAR TOGGLE
  // ============================================================

  function toggleSidebar() {
    const sidebar = document.getElementById('skilljar-i18n-sidebar');
    const fab = document.getElementById('skilljar-i18n-fab');
    sidebarVisible = !sidebarVisible;
    if (sidebar) sidebar.classList.toggle('open', sidebarVisible);
    if (fab) fab.classList.toggle('hidden', sidebarVisible);
  }

  // ============================================================
  // BOOT
  // ============================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
