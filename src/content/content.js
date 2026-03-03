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

  let translator = null;
  let currentLang = 'en';
  let isTranslating = false;
  let isReady = false;
  let sidebarVisible = false;
  let originalTexts = new Map();
  let pendingActions = [];

  // ============================================================
  // REGISTER MESSAGE LISTENER IMMEDIATELY (before async init)
  // This prevents "Receiving end does not exist" error
  // ============================================================

  chrome.runtime.onMessage.addListener(handleMessage);
  console.log('[Skilljar i18n] Message listener registered');

  function handleMessage(request, sender, sendResponse) {
    // If translator isn't ready yet, queue the action
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
        return true; // keep channel open for async response

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
  // INITIALIZATION (async, but message listener is already active)
  // ============================================================

  async function init() {
    try {
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

      // Process any queued actions from popup
      for (const { request } of pendingActions) {
        if (request.action === 'translatePage') {
          await translatePage(request.language);
        }
      }
      pendingActions = [];

      // Auto-translate if enabled
      if (stored.autoTranslate && currentLang !== 'en' && bridgeOk) {
        await translatePage(currentLang);
      }

      // Observe DOM changes
      observeDOM();
    } catch (err) {
      console.error('[Skilljar i18n] Init error:', err);
      // Still mark as ready so sidebar/button work
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
      const total = elements.length;

      if (total === 0) {
        updateProgressText('No translatable content found on this page.');
        setTimeout(() => showProgress(false), 3000);
        isTranslating = false;
        return;
      }

      let completed = 0;

      for (const el of elements) {
        if (!el.textContent.trim()) continue;

        // Store original
        if (!originalTexts.has(el)) {
          originalTexts.set(el, el.innerHTML);
        }

        // Translate text nodes, preserve HTML structure
        const textNodes = getTextNodes(el);
        for (const node of textNodes) {
          const original = node.textContent.trim();
          if (original.length < 2) continue;
          if (isCodeContent(node)) continue;

          try {
            const translated = await translator.translate(original, targetLang);
            if (translated && translated !== original) {
              node.textContent = translated;
            }
          } catch (e) {
            // Skip individual failures, continue with rest
            console.warn('[Skilljar i18n] Skipping node:', e.message);
          }
        }

        completed++;
        const pct = Math.round((completed / total) * 100);
        updateProgressText(`Translating... ${pct}%`);
        updateProgressBar(completed / total);
      }

      updateProgressText('Translation complete!');
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
        // Allow if parent is an <a> or <div> (wrapper), skip if parent is another text element
        const parentTag = parent.tagName;
        if (['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH', 'BLOCKQUOTE'].includes(parentTag)) {
          return false;
        }
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
            try {
              const translated = await translator.translate(original, currentLang);
              if (translated && translated !== original) tn.textContent = translated;
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
              Hi! I'm your AI learning assistant. Ask me anything about this course. Powered by GPT-4o-mini via Puter.js (free, no API key).
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

    const chatInput = document.getElementById('si18n-chat-input');
    document.getElementById('si18n-chat-send')?.addEventListener('click', sendChatMessage);
    chatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
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
