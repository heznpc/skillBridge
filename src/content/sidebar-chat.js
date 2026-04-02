/**
 * SkillBridge — Sidebar, Chat, and Conversation History
 * Accesses shared state via window._sb namespace.
 */

(function () {
  'use strict';

  const sb = window._sb;

  let historyDb = null;
  let historyPanelOpen = false;
  let scrollRAF = null;
  let savedChatHTML = null;
  let isSending = false;
  let _rawSectionsCache = null; // Cached raw JSON for section-specific flashcards
  let _rawSectionsLang = null;  // Language of the cached data

  // ============================================================
  // FLOATING BUTTON
  // ============================================================

  function injectFloatingButton() {
    if (document.getElementById('skillbridge-fab')) return;
    const btn = document.createElement('button');
    btn.id = 'skillbridge-fab';
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    btn.setAttribute('aria-label', sb.t(A11Y_LABELS.openTutor));
    btn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    `;
    btn.title = sb.t(A11Y_LABELS.openTutor);
    btn.addEventListener('click', () => {
      btn.classList.remove('si18n-fab-pulse');
      toggleSidebar();
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btn.classList.remove('si18n-fab-pulse');
        toggleSidebar();
      }
    });
    document.body.appendChild(btn);

    // Pulse animation on first visit to draw attention
    chrome.storage.local.get(['fabSeen'], (result) => {
      if (!result.fabSeen) {
        btn.classList.add('si18n-fab-pulse');
        chrome.storage.local.set({ fabSeen: true });
      }
    });
  }

  // ============================================================
  // SIDEBAR UI
  // ============================================================

  function injectSidebar() {
    if (document.getElementById('skillbridge-sidebar')) return;
    const sidebar = document.createElement('div');
    sidebar.id = 'skillbridge-sidebar';
    sidebar.className = 'skillbridge-sidebar';
    sidebar.setAttribute('role', 'dialog');
    sidebar.setAttribute('aria-modal', 'true');
    sidebar.setAttribute('aria-label', 'SkillBridge Tutor');
    sidebar.innerHTML = getSidebarHTML();
    document.body.appendChild(sidebar);
    setTimeout(bindSidebarEvents, SKILLBRIDGE_DELAYS.SIDEBAR_BIND);
    sb.initAskTutorButton?.();
  }

  function getTutorGreeting() {
    return sb.t(TUTOR_GREETINGS);
  }

  function getExampleQuestionsHTML() {
    const questions = sb.t(EXAMPLE_QUESTIONS) || EXAMPLE_QUESTIONS['en'];
    return questions.map(q =>
      `<button class="si18n-example-q" data-question="${sb.escapeHtml(q)}">${sb.escapeHtml(q)}</button>`
    ).join('');
  }

  function getSidebarHTML() {
    return `
      <div class="si18n-header">
        <button class="si18n-history-btn" id="si18n-history-btn" title="${sb.t(A11Y_LABELS.chatHistory)}" aria-label="${sb.t(A11Y_LABELS.chatHistory)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </button>
        <button class="si18n-history-btn" id="si18n-fc-btn" title="${sb.t(FLASHCARD_LABELS.openFlashcards)}" aria-label="${sb.t(FLASHCARD_LABELS.openFlashcards)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
        </button>
        <span class="si18n-header-title">SkillBridge Tutor</span>
        <button class="si18n-close" id="si18n-close" aria-label="${sb.t(A11Y_LABELS.closeSidebar)}">&times;</button>
      </div>

      <div class="si18n-panel si18n-panel-chat" id="si18n-panel-chat">
        <div class="si18n-chat-messages" id="si18n-chat-messages" role="log" aria-live="polite">
          <div class="si18n-chat-msg si18n-chat-bot">
            <div class="si18n-chat-avatar">AI</div>
            <div class="si18n-chat-bubble">
              ${getTutorGreeting()}
            </div>
          </div>
          <div class="si18n-example-questions" id="si18n-example-questions">
            ${getExampleQuestionsHTML()}
          </div>
        </div>
        <div class="si18n-chat-input-wrap">
          <textarea id="si18n-chat-input" class="si18n-chat-input"
            placeholder="${sb.t(CHAT_PLACEHOLDERS)}"
            rows="1"></textarea>
          <button id="si18n-chat-send" class="si18n-chat-send-btn">${sb.t(SEND_LABELS)}</button>
        </div>
      </div>
    `;
  }

  function bindSidebarEvents() {
    document.getElementById('si18n-close')?.addEventListener('click', toggleSidebar);
    document.getElementById('si18n-history-btn')?.addEventListener('click', toggleHistoryPanel);
    document.getElementById('si18n-fc-btn')?.addEventListener('click', toggleFlashcardPanel);
    bindChatInputEvents();
    bindExampleQuestions();
  }

  function bindExampleQuestions() {
    const container = document.getElementById('si18n-example-questions');
    if (!container) return;
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.si18n-example-q');
      if (!btn) return;
      const input = document.getElementById('si18n-chat-input');
      if (input) {
        input.value = btn.dataset.question;
        container.remove();
        sendChatMessage();
      }
    });
  }

  function bindChatInputEvents() {
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

  function updateLocalizedLabels() {
    const headerLangSelect = document.getElementById('si18n-header-lang-select');
    if (headerLangSelect) headerLangSelect.value = sb.currentLang;

    const messagesEl = document.getElementById('si18n-chat-messages');
    if (!messagesEl) return;
    const firstBubble = messagesEl.querySelector('.si18n-chat-bot .si18n-chat-bubble');
    if (firstBubble && messagesEl.children.length <= 2) {
      firstBubble.textContent = getTutorGreeting();
    }
    const chatInput = document.getElementById('si18n-chat-input');
    if (chatInput) chatInput.placeholder = sb.t(CHAT_PLACEHOLDERS);
    const sendBtn = document.getElementById('si18n-chat-send');
    if (sendBtn) sendBtn.textContent = sb.t(SEND_LABELS);
    const askLabel = document.querySelector('.si18n-ask-tutor-label');
    if (askLabel) askLabel.textContent = sb.t(ASK_TUTOR_LABELS);
  }

  // ============================================================
  // CHAT
  // ============================================================

  function scrollToBottom(el) {
    if (scrollRAF) return;
    scrollRAF = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      scrollRAF = null;
    });
  }

  async function sendChatMessage() {
    if (isSending) return;
    const input = document.getElementById('si18n-chat-input');
    const messages = document.getElementById('si18n-chat-messages');
    const text = input.value.trim();
    if (!text) return;

    isSending = true;

    // Offline guard — show localized message instead of hitting the network
    if (sb.isOffline) {
      const messages = document.getElementById('si18n-chat-messages');
      messages.insertAdjacentHTML('beforeend', `
        <div class="si18n-chat-msg si18n-chat-bot">
          <div class="si18n-chat-avatar">AI</div>
          <div class="si18n-chat-bubble" role="alert">${sb.escapeHtml(sb.t(TUTOR_OFFLINE_LABELS))}</div>
        </div>
      `);
      scrollToBottom(messages);
      isSending = false;
      return;
    }

    const quoteEl = document.querySelector('.si18n-chat-quote');
    const quotedText = quoteEl?.textContent?.replace('\u00d7', '').trim() || '';
    if (quoteEl) quoteEl.remove();

    const displayHtml = quotedText
      ? `<div class="si18n-chat-quote" style="margin-bottom:4px">${sb.escapeHtml(quotedText)}</div>${sb.escapeHtml(text)}`
      : sb.escapeHtml(text);

    messages.insertAdjacentHTML('beforeend', `
      <div class="si18n-chat-msg si18n-chat-user">
        <div class="si18n-chat-bubble">${displayHtml}</div>
        <div class="si18n-chat-avatar">You</div>
      </div>
    `);
    input.value = '';
    input.placeholder = sb.t(CHAT_PLACEHOLDERS);

    const loadingId = 'loading-' + Date.now();
    messages.insertAdjacentHTML('beforeend', `
      <div class="si18n-chat-msg si18n-chat-bot" id="${loadingId}">
        <div class="si18n-chat-avatar">AI</div>
        <div class="si18n-chat-bubble">
          <span class="si18n-thinking-dots" role="status" aria-label="${sb.t(A11Y_LABELS.loading)}">
            <span class="si18n-dot"></span>
            <span class="si18n-dot"></span>
            <span class="si18n-dot"></span>
          </span>
        </div>
      </div>
    `);
    scrollToBottom(messages);

    const fullQuestion = quotedText
      ? `[Regarding this text: "${quotedText}"]\n\n${text}`
      : text;
    const context = sb.getPageContext();
    const bubble = document.querySelector(`#${loadingId} .si18n-chat-bubble`);
    const sendBtn = document.getElementById('si18n-chat-send');
    if (sendBtn) sendBtn.disabled = true;

    try {
      let started = false;
      let lastStreamedText = '';
      await sb.translator.chatStream(fullQuestion, sb.currentLang, context, (chunk, fullText) => {
        lastStreamedText = fullText;
        if (!started) {
          started = true;
          if (bubble) {
            bubble.innerHTML = '';
            bubble.classList.add('si18n-streaming-cursor');
          }
        }
        if (bubble) {
          bubble.innerHTML = formatResponse(fullText);
          scrollToBottom(messages);
        }
      }, { isExamPage: sb.isExamPage });

      if (bubble) {
        bubble.classList.remove('si18n-streaming-cursor');
        const answerText = lastStreamedText?.trim() || bubble.textContent?.trim() || '';
        if (answerText) saveConversation(text, answerText, sb.currentLang);
      }
    } catch (err) {
      if (bubble) {
        bubble.classList.remove('si18n-streaming-cursor');
        bubble.setAttribute('role', 'alert');
        bubble.textContent = sb.t(CHAT_ERROR_LABELS) + ' ';
        const retryBtn = document.createElement('button');
        retryBtn.className = 'si18n-retry-btn';
        retryBtn.textContent = '\u21bb';
        retryBtn.title = sb.t(A11Y_LABELS.retry);
        retryBtn.addEventListener('click', () => {
          bubble.closest('.si18n-chat-msg')?.remove();
          const inp = document.getElementById('si18n-chat-input');
          if (inp) { inp.value = text; sendChatMessage(); }
        });
        bubble.appendChild(retryBtn);
      }
    } finally {
      isSending = false;
      if (sendBtn) sendBtn.disabled = false;
    }
    scrollToBottom(messages);
  }

  // ============================================================
  // MARKDOWN RESPONSE FORMATTING
  // ============================================================

  function formatResponse(text) {
    const escaped = sb.escapeHtml(text);

    // Ensure markdown block elements start on new lines
    // (avoid lookbehind for wider browser compatibility)
    const normalized = escaped
      .replace(/([^\n#])(#{2,3}\s)/g, '$1\n$2')
      .replace(/([^\n])(-\s)/g, '$1\n$2')
      .replace(/([^\n])(\d+[.)]\s)/g, '$1\n$2');

    const lines = normalized.split('\n');
    const out = [];
    let listBuf = [];
    let listOrdered = false;
    let paraBuf = [];

    const flushList = () => {
      if (!listBuf.length) return;
      const tag = listOrdered ? 'ol' : 'ul';
      out.push(`<${tag}>${listBuf.map(t => `<li>${applyInline(t)}</li>`).join('')}</${tag}>`);
      listBuf = [];
    };
    const flushPara = () => {
      if (!paraBuf.length) return;
      out.push(`<p>${applyInline(paraBuf.join('<br>'))}</p>`);
      paraBuf = [];
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) { flushList(); flushPara(); continue; }
      const hMatch = trimmed.match(/^(#{2,3})\s+(.+)/);
      if (hMatch) { flushList(); flushPara(); out.push(`<h3>${applyInline(hMatch[2])}</h3>`); continue; }
      const ulMatch = trimmed.match(/^[-*]\s+(.*)/);
      if (ulMatch) {
        if (listBuf.length && listOrdered) flushList();
        listOrdered = false; flushPara(); listBuf.push(ulMatch[1]); continue;
      }
      const olMatch = trimmed.match(/^\d+[.)]\s+(.*)/);
      if (olMatch) {
        if (listBuf.length && !listOrdered) flushList();
        listOrdered = true; flushPara(); listBuf.push(olMatch[1]); continue;
      }
      flushList(); paraBuf.push(trimmed);
    }
    flushList(); flushPara();
    return out.join('');
  }

  function applyInline(text) {
    // Input is already HTML-escaped by formatResponse — do NOT re-escape captured groups
    return text
      .replace(/\*\*(.*?)\*\*/g, (_, g) => '<strong>' + g + '</strong>')
      .replace(/\*(.*?)\*/g, (_, g) => '<em>' + g + '</em>')
      .replace(/`(.*?)`/g, (_, g) => '<code>' + g + '</code>');
  }

  // ============================================================
  // SIMPLE HTML SANITIZER (no external dependency)
  // ============================================================

  /**
   * Strip dangerous tags and attributes from trusted-structure HTML.
   * Keeps only the tags used by our own formatResponse / history rendering.
   */
  function sanitizeHtml(html) {
    const ALLOWED_TAGS = new Set([
      'div', 'span', 'p', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'code',
      'br', 'button', 'svg', 'polyline', 'path', 'circle',
    ]);
    const ALLOWED_ATTRS = new Set([
      'class', 'id', 'data-id', 'data-question', 'style', 'title',
      'aria-label', 'role',
      // SVG presentational attributes
      'width', 'height', 'viewBox', 'fill', 'stroke', 'stroke-width',
      'stroke-linecap', 'stroke-linejoin', 'cx', 'cy', 'r', 'd', 'points',
    ]);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    function walk(node) {
      const children = Array.from(node.childNodes);
      for (const child of children) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const tag = child.tagName.toLowerCase();
          if (!ALLOWED_TAGS.has(tag)) {
            child.remove();
            continue;
          }
          // Strip disallowed attributes (including event handlers)
          for (const attr of Array.from(child.attributes)) {
            if (!ALLOWED_ATTRS.has(attr.name) || attr.name.startsWith('on')) {
              child.removeAttribute(attr.name);
            }
          }
          walk(child);
        }
      }
    }

    walk(doc.body);
    return doc.body.innerHTML;
  }

  // ============================================================
  // TUTOR CONVERSATION HISTORY (IndexedDB)
  // ============================================================

  function openHistoryDb() {
    return new Promise((resolve, reject) => {
      if (historyDb) return resolve(historyDb);
      const req = indexedDB.open(HISTORY_DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(HISTORY_STORE)) {
          const store = db.createObjectStore(HISTORY_STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp');
          store.createIndex('chapter', 'chapter');
        }
      };
      req.onsuccess = (e) => { historyDb = e.target.result; resolve(historyDb); };
      req.onerror = () => reject(req.error);
    });
  }

  async function saveConversation(question, answer, lang) {
    try {
      const db = await openHistoryDb();
      const chapter = document.querySelector('h1')?.textContent?.trim() || 'Unknown';
      const tx = db.transaction(HISTORY_STORE, 'readwrite');
      tx.objectStore(HISTORY_STORE).add({
        question, answer, lang, chapter,
        timestamp: Date.now(),
        url: location.href,
      });
    } catch (e) {
      console.warn('[SkillBridge] Failed to save conversation:', e);
    }
  }

  async function getConversations(limit = SKILLBRIDGE_LIMITS.HISTORY) {
    try {
      const db = await openHistoryDb();
      return new Promise((resolve) => {
        const tx = db.transaction(HISTORY_STORE, 'readonly');
        const idx = tx.objectStore(HISTORY_STORE).index('timestamp');
        const results = [];
        const req = idx.openCursor(null, 'prev');
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor && results.length < limit) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  async function clearAllHistory() {
    try {
      const db = await openHistoryDb();
      const tx = db.transaction(HISTORY_STORE, 'readwrite');
      tx.objectStore(HISTORY_STORE).clear();
      tx.oncomplete = () => {
        const listEl = document.getElementById('si18n-history-list');
        if (listEl) {
          listEl.innerHTML = `<div class="si18n-history-empty">${sb.t(HISTORY_LABELS.historyCleared)}</div>`;
        }
      };
    } catch (e) {
      console.warn('[SkillBridge] Failed to clear history:', e);
    }
  }

  function toggleHistoryPanel() {
    const chatPanel = document.getElementById('si18n-panel-chat');
    if (!chatPanel) return;

    if (historyPanelOpen) {
      closeSubPanel();
      return;
    }
    if (flashcardPanelOpen) closeSubPanel();

    historyPanelOpen = true;
    savedChatHTML = chatPanel.innerHTML;
    chatPanel.innerHTML = `
      <div class="si18n-history-header">
        <button class="si18n-history-back" id="si18n-history-back" aria-label="${sb.t(A11Y_LABELS.backToChat)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
        <span class="si18n-history-title">${sb.t(HISTORY_LABELS.title)}</span>
        <button class="si18n-history-clear" id="si18n-history-clear" title="${sb.t(HISTORY_LABELS.clearHistory)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          <span>${sb.t(HISTORY_LABELS.clearHistory)}</span>
        </button>
      </div>
      <div class="si18n-history-list" id="si18n-history-list">
        <div class="si18n-history-loading">${sb.t(HISTORY_LABELS.loading)}</div>
      </div>
    `;

    document.getElementById('si18n-history-back')?.addEventListener('click', closeHistoryPanel);
    document.getElementById('si18n-history-clear')?.addEventListener('click', () => {
      if (confirm(sb.t(HISTORY_LABELS.clearHistory) + '?')) clearAllHistory();
    });
    loadHistoryList();
  }

  function closeSubPanel() {
    const chatPanel = document.getElementById('si18n-panel-chat');
    if (!chatPanel || !savedChatHTML) return;
    chatPanel.innerHTML = savedChatHTML;
    savedChatHTML = null;
    historyPanelOpen = false;
    flashcardPanelOpen = false;
    bindChatInputEvents();
  }

  function closeHistoryPanel() { closeSubPanel(); }

  async function loadHistoryList() {
    const listEl = document.getElementById('si18n-history-list');
    if (!listEl) return;

    const conversations = await getConversations();
    if (conversations.length === 0) {
      listEl.innerHTML = `<div class="si18n-history-empty">${sb.t(HISTORY_LABELS.empty)}</div>`;
      return;
    }

    const grouped = {};
    for (const conv of conversations) {
      const ch = conv.chapter || 'Other';
      if (!grouped[ch]) grouped[ch] = [];
      grouped[ch].push(conv);
    }

    let html = '';
    for (const [chapter, convs] of Object.entries(grouped)) {
      html += `<div class="si18n-history-chapter">${sb.escapeHtml(chapter)}</div>`;
      for (const conv of convs) {
        const preview = conv.question.length > SKILLBRIDGE_LIMITS.HISTORY_PREVIEW
          ? conv.question.slice(0, SKILLBRIDGE_LIMITS.HISTORY_PREVIEW) + '\u2026'
          : conv.question;
        const time = new Date(conv.timestamp).toLocaleDateString(undefined, {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
        html += `
          <div class="si18n-history-item" data-id="${conv.id}">
            <div class="si18n-history-item-q">${sb.escapeHtml(preview)}</div>
            <div class="si18n-history-item-time">${time}</div>
          </div>
        `;
      }
    }
    listEl.innerHTML = sanitizeHtml(html);

    // Event delegation instead of per-item listeners
    listEl.addEventListener('click', (e) => {
      const item = e.target.closest('.si18n-history-item');
      if (item) showConversationDetail(item.dataset.id);
    });
  }

  async function showConversationDetail(id) {
    try {
      const db = await openHistoryDb();
      const tx = db.transaction(HISTORY_STORE, 'readonly');
      const req = tx.objectStore(HISTORY_STORE).get(Number(id));
      req.onsuccess = () => {
        const conv = req.result;
        if (!conv) return;
        const listEl = document.getElementById('si18n-history-list');
        if (!listEl) return;
        const time = conv.timestamp ? new Date(conv.timestamp).toLocaleString() : '';
        const chapter = conv.chapter ? sb.escapeHtml(conv.chapter) : '';
        let metaHtml = '';
        if (chapter || time) {
          metaHtml = `<div class="si18n-history-detail-meta">`;
          if (chapter) metaHtml += `<span class="si18n-detail-lesson">${chapter}</span>`;
          if (time) metaHtml += `<span class="si18n-detail-time">${time}</span>`;
          metaHtml += `</div>`;
        }
        listEl.innerHTML = sanitizeHtml(`
          <div class="si18n-history-detail">
            ${metaHtml}
            <div class="si18n-chat-msg si18n-chat-user">
              <div class="si18n-chat-bubble">${sb.escapeHtml(conv.question)}</div>
            </div>
            <div class="si18n-chat-msg si18n-chat-bot">
              <div class="si18n-chat-bubble">${formatResponse(conv.answer)}</div>
            </div>
          </div>
        `);
      };
    } catch (e) {
      console.warn('[SkillBridge] Failed to load conversation:', e);
    }
  }

  // ============================================================
  // SIDEBAR TOGGLE
  // ============================================================

  function toggleSidebar() {
    const sidebar = document.getElementById('skillbridge-sidebar');
    const fab = document.getElementById('skillbridge-fab');
    sb.sidebarVisible = !sb.sidebarVisible;
    if (sidebar) sidebar.classList.toggle('open', sb.sidebarVisible);
    if (fab) fab.classList.toggle('hidden', sb.sidebarVisible);

    if (sb.sidebarVisible) {
      // Show exam warning immediately when sidebar opens on exam page
      if (sb.isExamPage) {
        const messages = document.getElementById('si18n-chat-messages');
        if (messages && !messages.querySelector('.si18n-exam-warning')) {
          messages.insertAdjacentHTML('beforeend', `
            <div class="si18n-chat-msg si18n-chat-bot">
              <div class="si18n-chat-avatar">AI</div>
              <div class="si18n-chat-bubble si18n-exam-warning">${sb.escapeHtml(sb.t(TUTOR_EXAM_LABELS))}</div>
            </div>
          `);
        }
      }

      // Focus the chat input when sidebar opens
      setTimeout(() => {
        const chatInput = document.getElementById('si18n-chat-input');
        if (chatInput) chatInput.focus();
      }, SKILLBRIDGE_DELAYS.SIDEBAR_BIND);

      // Add focus trap
      if (sidebar) sidebar.addEventListener('keydown', trapFocus);
    } else {
      // Return focus to FAB when sidebar closes
      if (fab) fab.focus();

      // Remove focus trap
      if (sidebar) sidebar.removeEventListener('keydown', trapFocus);
    }
  }

  function trapFocus(e) {
    if (e.key !== 'Tab') return;
    const sidebar = document.getElementById('skillbridge-sidebar');
    if (!sidebar) return;

    const focusable = sidebar.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  // ============================================================
  // FLASHCARD MODE (Vocabulary Cards for Exam Prep)
  // ============================================================

  let flashcardPanelOpen = false;
  let flashcardCards = [];
  let flashcardIndex = 0;
  let flashcardBoxes = {};

  function toggleFlashcardPanel() {
    const chatPanel = document.getElementById('si18n-panel-chat');
    if (!chatPanel) return;

    if (flashcardPanelOpen) {
      closeFlashcardPanel();
      return;
    }
    // Close history if open
    if (historyPanelOpen) closeHistoryPanel();

    flashcardPanelOpen = true;
    savedChatHTML = chatPanel.innerHTML;

    flashcardCards = loadFlashcardsForCourse();
    flashcardIndex = 0;
    loadFlashcardProgress();

    chatPanel.innerHTML = `
      <div class="si18n-flashcard-header">
        <button class="si18n-history-back" id="si18n-fc-back" aria-label="${sb.t(A11Y_LABELS.backToChat)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="si18n-history-title">${sb.t(FLASHCARD_LABELS.title)}</span>
        <button class="si18n-history-clear" id="si18n-fc-reset" title="${sb.t(FLASHCARD_LABELS.reset)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        </button>
      </div>
      <div class="si18n-flashcard-container" id="si18n-fc-container">
        ${flashcardCards.length === 0
          ? `<div class="si18n-history-empty">${sb.t(FLASHCARD_LABELS.empty)}</div>`
          : renderFlashcard()}
      </div>
    `;

    document.getElementById('si18n-fc-back')?.addEventListener('click', closeFlashcardPanel);
    document.getElementById('si18n-fc-reset')?.addEventListener('click', () => {
      flashcardBoxes = {};
      flashcardIndex = 0;
      saveFlashcardProgress();
      refreshFlashcard();
    });
    bindFlashcardEvents();
  }

  function loadFlashcardsForCourse() {
    const dict = sb.translator?.staticDict;
    if (!dict || Object.keys(dict).length === 0) return [];

    // Try to match current URL to a course for section-specific flashcards
    // Sort slugs longest-first to prevent short slugs stealing matches
    // (e.g., 'ai-fluency' must not match 'ai-fluency-for-educators')
    const url = location.pathname.toLowerCase();
    let sections = null;
    const sortedSlugs = Object.entries(FLASHCARD_COURSE_MAP)
      .sort((a, b) => b[0].length - a[0].length);
    for (const [slug, sects] of sortedSlugs) {
      if (url.includes(slug)) {
        sections = sects;
        break;
      }
    }

    // If we matched a course, try loading section-specific vocabulary from the raw JSON
    if (sections) {
      const lang = sb.currentLang;
      if (lang && lang !== 'en' && sb.translator?.premiumLanguages?.includes(lang)) {
        try {
          // The static dict is flattened; load the raw JSON to get per-section data
          const jsonUrl = chrome.runtime.getURL(`src/data/${lang}.json`);
          // Invalidate cache if language changed
          if (_rawSectionsCache && _rawSectionsLang !== lang) {
            _rawSectionsCache = null;
            _rawSectionsLang = null;
          }
          if (!_rawSectionsCache) {
            // Trigger async load and fall back to all entries for now
            fetch(jsonUrl).then(r => r.json()).then(data => {
              _rawSectionsCache = data;
              _rawSectionsLang = lang;
              // Re-run with warm cache and update panel
              if (flashcardPanelOpen) {
                flashcardCards = loadFlashcardsForCourse();
                flashcardIndex = 0;
                refreshFlashcard();
              }
            }).catch(() => {});
          } else {
            const data = _rawSectionsCache;
            const sectionEntries = [];
            for (const sect of sections) {
              if (data[sect] && typeof data[sect] === 'object') {
                for (const [en, tr] of Object.entries(data[sect])) {
                  if (en !== tr && en.length >= 6 && tr.length >= 2) {
                    sectionEntries.push({ en, tr });
                  }
                }
              }
            }
            if (sectionEntries.length > 0) return sectionEntries;
          }
        } catch (_) { /* fall through to all entries */ }
      }
    }

    // Fallback: return all entries from staticDict
    return Object.entries(dict)
      .filter(([k, v]) => k !== v && k.length >= 6 && v.length >= 2)
      .map(([en, tr]) => ({ en, tr }));
  }

  function renderFlashcard() {
    if (flashcardCards.length === 0) return '';
    const card = flashcardCards[flashcardIndex];
    const box = flashcardBoxes[flashcardIndex] || 0;
    const boxLabelKeys = [FLASHCARD_LABELS.boxNew, FLASHCARD_LABELS.boxLearning, FLASHCARD_LABELS.mastered];
    const boxClasses = ['si18n-fc-new', 'si18n-fc-learning', 'si18n-fc-done'];
    const countByBox = [0, 0, 0];
    for (let i = 0; i < flashcardCards.length; i++) countByBox[flashcardBoxes[i] || 0]++;
    return `
      <div class="si18n-flashcard-card" id="si18n-fc-card" role="button" tabindex="0" aria-label="${sb.t(FLASHCARD_LABELS.flip)}">
        <div class="si18n-flashcard-inner">
          <div class="si18n-flashcard-front">${sb.escapeHtml(card.en)}</div>
          <div class="si18n-flashcard-back">${sb.escapeHtml(card.tr)}</div>
        </div>
      </div>
      <div class="si18n-flashcard-nav">
        <button class="si18n-fc-btn" id="si18n-fc-prev" ${flashcardIndex === 0 ? 'disabled' : ''}>${sb.t(FLASHCARD_LABELS.prev)}</button>
        <span class="si18n-flashcard-progress">${flashcardIndex + 1} / ${flashcardCards.length}</span>
        <button class="si18n-fc-btn" id="si18n-fc-next" ${flashcardIndex >= flashcardCards.length - 1 ? 'disabled' : ''}>${sb.t(FLASHCARD_LABELS.next)}</button>
      </div>
      <div class="si18n-fc-box-controls">
        <button class="si18n-fc-box-btn si18n-fc-new" id="si18n-fc-box-down">✗</button>
        <span class="si18n-fc-box-label ${boxClasses[box]}">${sb.t(boxLabelKeys[box])}</span>
        <button class="si18n-fc-box-btn si18n-fc-done" id="si18n-fc-box-up">✓</button>
      </div>
      <div class="si18n-fc-stats">
        <span class="si18n-fc-new">${sb.t(FLASHCARD_LABELS.boxNew)}: ${countByBox[0]}</span>
        <span class="si18n-fc-learning">${sb.t(FLASHCARD_LABELS.boxLearning)}: ${countByBox[1]}</span>
        <span class="si18n-fc-done">${sb.t(FLASHCARD_LABELS.mastered)}: ${countByBox[2]}</span>
      </div>
    `;
  }

  function refreshFlashcard() {
    const container = document.getElementById('si18n-fc-container');
    if (!container) return;
    container.innerHTML = flashcardCards.length === 0
      ? `<div class="si18n-history-empty">${sb.t(FLASHCARD_LABELS.empty)}</div>`
      : renderFlashcard();
    bindFlashcardEvents();
  }

  function bindFlashcardEvents() {
    const card = document.getElementById('si18n-fc-card');
    card?.addEventListener('click', () => card.classList.toggle('si18n-card-flipped'));
    card?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.classList.toggle('si18n-card-flipped'); }
    });
    document.getElementById('si18n-fc-prev')?.addEventListener('click', () => {
      if (flashcardIndex > 0) { flashcardIndex--; refreshFlashcard(); }
    });
    document.getElementById('si18n-fc-next')?.addEventListener('click', () => {
      if (flashcardIndex < flashcardCards.length - 1) { flashcardIndex++; refreshFlashcard(); }
    });
    document.getElementById('si18n-fc-box-up')?.addEventListener('click', () => {
      const cur = flashcardBoxes[flashcardIndex] || 0;
      flashcardBoxes[flashcardIndex] = Math.min(cur + 1, 2);
      saveFlashcardProgress();
      // Auto-advance to next card after marking
      if (flashcardIndex < flashcardCards.length - 1) flashcardIndex++;
      refreshFlashcard();
    });
    document.getElementById('si18n-fc-box-down')?.addEventListener('click', () => {
      flashcardBoxes[flashcardIndex] = 0;
      saveFlashcardProgress();
      if (flashcardIndex < flashcardCards.length - 1) flashcardIndex++;
      refreshFlashcard();
    });
  }

  function saveFlashcardProgress() {
    const key = `fc_${sb.currentLang}`;
    const data = {};
    data[key] = flashcardBoxes;
    chrome.storage.local.set(data);
  }

  function loadFlashcardProgress() {
    const key = `fc_${sb.currentLang}`;
    chrome.storage.local.get([key], (result) => {
      flashcardBoxes = result[key] || {};
      refreshFlashcard();
    });
  }

  function closeFlashcardPanel() { closeSubPanel(); }

  // Export to shared namespace
  sb.injectSidebar = injectSidebar;
  sb.injectFloatingButton = injectFloatingButton;
  sb.toggleSidebar = toggleSidebar;
  sb.updateLocalizedLabels = updateLocalizedLabels;
  sb.formatResponse = formatResponse;
  sb.toggleFlashcardPanel = toggleFlashcardPanel;
})();
