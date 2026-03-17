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

  // ============================================================
  // FLOATING BUTTON
  // ============================================================

  function injectFloatingButton() {
    if (document.getElementById('skillbridge-fab')) return;
    const btn = document.createElement('button');
    btn.id = 'skillbridge-fab';
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    btn.setAttribute('aria-label', 'Open AI Tutor');
    btn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    `;
    btn.title = 'AI Tutor';
    btn.addEventListener('click', toggleSidebar);
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleSidebar();
      }
    });
    document.body.appendChild(btn);
  }

  // ============================================================
  // SIDEBAR UI
  // ============================================================

  function injectSidebar() {
    if (document.getElementById('skillbridge-sidebar')) return;
    const sidebar = document.createElement('div');
    sidebar.id = 'skillbridge-sidebar';
    sidebar.className = 'skillbridge-sidebar';
    sidebar.innerHTML = getSidebarHTML();
    document.body.appendChild(sidebar);
    setTimeout(bindSidebarEvents, SKILLBRIDGE_DELAYS.SIDEBAR_BIND);
    sb.initAskTutorButton?.();
  }

  function getTutorGreeting() {
    return sb.t(TUTOR_GREETINGS);
  }

  function getSidebarHTML() {
    return `
      <div class="si18n-header">
        <button class="si18n-history-btn" id="si18n-history-btn" title="Chat history" aria-label="Chat history">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </button>
        <span class="si18n-header-title">SkillBridge Tutor</span>
        <button class="si18n-close" id="si18n-close" aria-label="Close sidebar">&times;</button>
      </div>

      <div class="si18n-panel si18n-panel-chat" id="si18n-panel-chat">
        <div class="si18n-chat-messages" id="si18n-chat-messages" role="log" aria-live="polite">
          <div class="si18n-chat-msg si18n-chat-bot">
            <div class="si18n-chat-avatar">AI</div>
            <div class="si18n-chat-bubble">
              ${getTutorGreeting()}
            </div>
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
    bindChatInputEvents();
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
    if (firstBubble && messagesEl.children.length === 1) {
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
          <span class="si18n-thinking-dots" role="status" aria-label="Loading">
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
      });

      if (bubble) {
        bubble.classList.remove('si18n-streaming-cursor');
        const answerText = lastStreamedText?.trim() || bubble.textContent?.trim() || '';
        if (answerText) saveConversation(text, answerText, sb.currentLang);
      }
    } catch (err) {
      if (bubble) {
        bubble.innerHTML = sb.t(CHAT_ERROR_LABELS);
        bubble.classList.remove('si18n-streaming-cursor');
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
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>');
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
      closeHistoryPanel();
      return;
    }

    historyPanelOpen = true;
    savedChatHTML = chatPanel.innerHTML;
    chatPanel.innerHTML = `
      <div class="si18n-history-header">
        <button class="si18n-history-back" id="si18n-history-back" aria-label="Back to chat"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
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
    document.getElementById('si18n-history-clear')?.addEventListener('click', clearAllHistory);
    loadHistoryList();
  }

  function closeHistoryPanel() {
    const chatPanel = document.getElementById('si18n-panel-chat');
    if (!chatPanel || !savedChatHTML) return;
    chatPanel.innerHTML = savedChatHTML;
    savedChatHTML = null;
    historyPanelOpen = false;
    bindChatInputEvents();
  }

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
    listEl.innerHTML = html;

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
        listEl.innerHTML = `
          <div class="si18n-history-detail">
            ${metaHtml}
            <div class="si18n-chat-msg si18n-chat-user">
              <div class="si18n-chat-bubble">${sb.escapeHtml(conv.question)}</div>
            </div>
            <div class="si18n-chat-msg si18n-chat-bot">
              <div class="si18n-chat-bubble">${formatResponse(conv.answer)}</div>
            </div>
          </div>
        `;
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

  // Close sidebar on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sb.sidebarVisible) {
      toggleSidebar();
    }
  });

  // Export to shared namespace
  sb.injectSidebar = injectSidebar;
  sb.injectFloatingButton = injectFloatingButton;
  sb.toggleSidebar = toggleSidebar;
  sb.updateLocalizedLabels = updateLocalizedLabels;
  sb.formatResponse = formatResponse;
})();
