/**
 * SkillBridge — Sidebar, Chat, and Conversation History
 * Accesses shared state via window._sb namespace.
 */

(function () {
  'use strict';

  const sb = window._sb;
  if (!sb) {
    console.warn('[SkillBridge] sidebar-chat: _sb not ready');
    return;
  }

  sb._chat = sb._chat || {};

  let scrollRAF = null;
  let isSending = false;
  // Flashcard local state (cards, index, boxes, raw-sections cache, slug,
  // save-queue) extracted to chat-flashcards.js in v3.5.27.
  // Tracks the currently-streaming chat so we can cancel it on sidebar
  // close / sub-panel switch / SPA route change. Without this the message
  // handler stays live and writes chunks into a DOM node we've already
  // replaced.
  let _activeStreamController = null;

  function cancelActiveStream() {
    if (!_activeStreamController) return;
    _activeStreamController.abort();
    _activeStreamController = null;
  }

  // ============================================================
  // FLOATING BUTTON
  // ============================================================

  function injectFloatingButton() {
    if (sb.certDisabled) return;
    const root = sb.uiRoot?.();
    if (!root) return;
    if (root.getElementById('skillbridge-fab')) return;
    (sb._uiRoot?.ensureFabStyle?.(root) || Promise.resolve(false)).then((ready) => {
      if (!ready || !root.isConnected || root.getElementById('skillbridge-fab')) return;
      const btn = document.createElement('button');
      btn.id = 'skillbridge-fab';
      btn.setAttribute('role', 'button');
      btn.setAttribute('tabindex', '0');
      // On translation-only hosts (claude.com tutorials — no AI-tutor bridge)
      // the FAB opens a language picker, so label + icon say "language".
      const translateOnly = sb.hostCaps?.bridge === false;
      const fabLabel = sb.t(translateOnly ? CHOOSE_LANGUAGE_LABEL : A11Y_LABELS.openTutor);
      btn.setAttribute('aria-label', fabLabel);
      btn.innerHTML = translateOnly
        ? `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    `
        : `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    `;
      btn.title = fabLabel;
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
      root.appendChild(btn);

      // Pulse animation on first visit to draw attention
      chrome.storage.local.get(['fabSeen'], (result) => {
        if (!result.fabSeen) {
          btn.classList.add('si18n-fab-pulse');
          chrome.storage.local.set({ fabSeen: true });
        }
      });
    });
  }

  // ============================================================
  // SIDEBAR UI
  // ============================================================

  function injectSidebar() {
    if (sb.certDisabled) return;
    if (sb.$id('skillbridge-sidebar')) return;
    const sidebar = document.createElement('div');
    sidebar.id = 'skillbridge-sidebar';
    sidebar.className = 'skillbridge-sidebar';
    sidebar.setAttribute('role', 'dialog');
    sidebar.setAttribute('aria-modal', 'true');
    sidebar.setAttribute('aria-label', 'SkillBridge Tutor');
    sidebar.innerHTML = getSidebarHTML();
    // Mount inside the shadow UI root so the host page's CSS can't reach the
    // sidebar; it's styled by the adopted (transformed) content CSS.
    const root = sb.uiRoot?.();
    if (!root) return;
    root.appendChild(sidebar);
    setTimeout(bindSidebarEvents, SKILLBRIDGE_DELAYS.SIDEBAR_BIND);
    // Ask-Tutor feeds the chat — only wire it where the tutor bridge exists.
    if (sb.hostCaps?.bridge !== false) sb.initAskTutorButton?.();
  }

  function getTutorGreeting() {
    return sb.t(TUTOR_GREETINGS);
  }

  function getExampleQuestionsHTML() {
    const questions = sb.t(EXAMPLE_QUESTIONS) || EXAMPLE_QUESTIONS['en'];
    return questions
      .map((q) => `<button class="si18n-example-q" data-question="${sb.escapeHtml(q)}">${sb.escapeHtml(q)}</button>`)
      .join('');
  }

  function getSidebarHTML() {
    const translateOnly = sb.hostCaps?.bridge === false;
    return `
      <div class="si18n-header">
        <button class="si18n-tools-btn" id="si18n-tools-btn" title="${sb.t(MENU_LABELS.tools)}" aria-label="${sb.t(MENU_LABELS.tools)}" aria-haspopup="true" aria-expanded="false">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <span class="si18n-header-title">${translateOnly ? 'SkillBridge' : 'SkillBridge Tutor'}</span>
        <button class="si18n-close" id="si18n-close" aria-label="${sb.t(A11Y_LABELS.closeSidebar)}">&times;</button>
      </div>

      <div class="si18n-tools-menu" id="si18n-tools-menu" role="menu" hidden>
        <button class="si18n-tools-item" id="si18n-dash-btn" role="menuitem" type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          <span>${sb.t(MENU_LABELS.dashboard)}</span>
        </button>
        <button class="si18n-tools-item" id="si18n-recent-btn" role="menuitem" type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><polyline points="12 7 12 12 15 14"/></svg>
          <span>${sb.t(RESUME_LABELS.openRecent)}</span>
        </button>
        <button class="si18n-tools-item" id="si18n-bm-btn" role="menuitem" type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          <span>${sb.t(BOOKMARK_LABELS.openBookmarks)}</span>
        </button>
        <button class="si18n-tools-item" id="si18n-fc-btn" role="menuitem" type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          <span>${sb.t(FLASHCARD_LABELS.openFlashcards)}</span>
        </button>
        <button class="si18n-tools-item" id="si18n-history-btn" role="menuitem" type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span>${sb.t(A11Y_LABELS.chatHistory)}</span>
        </button>
        <button class="si18n-tools-item" id="si18n-pdf-btn" role="menuitem" type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg>
          <span>${sb.t(PDF_EXPORT_LABELS.title)}</span>
        </button>
      </div>

      ${translateOnly ? langPanelHTML() : chatPanelHTML()}
    `;
  }

  function chatPanelHTML() {
    return `
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

  // Translation-only hosts (claude.com tutorials): the sidebar body is a
  // language picker instead of the AI-tutor chat. sb.switchLanguage is
  // bridge-free, so this works without the Puter/Gemini bridge.
  function langPanelHTML() {
    const options = AVAILABLE_LANGUAGES.map(
      (l) =>
        `<option value="${l.code}"${l.code === sb.currentLang ? ' selected' : ''}>${sb.escapeHtml(l.label)}</option>`,
    ).join('');
    return `
      <div class="si18n-panel si18n-panel-lang" id="si18n-panel-lang">
        <label class="si18n-lang-panel-label" for="si18n-sidebar-lang-select">${sb.escapeHtml(sb.t(CHOOSE_LANGUAGE_LABEL))}</label>
        <select id="si18n-sidebar-lang-select" class="si18n-sidebar-lang-select">${options}</select>
      </div>
    `;
  }

  function bindSidebarEvents() {
    sb.$id('si18n-close')?.addEventListener('click', toggleSidebar);
    const toolsBtn = sb.$id('si18n-tools-btn');
    const toolsMenu = sb.$id('si18n-tools-menu');
    toolsBtn?.addEventListener('click', () => {
      const willOpen = !!toolsMenu?.hidden;
      if (toolsMenu) toolsMenu.hidden = !willOpen;
      toolsBtn.setAttribute('aria-expanded', String(willOpen));
    });
    // Selecting any tool closes the menu (the click still reaches the item's
    // own handler, which opens the corresponding panel).
    toolsMenu?.addEventListener('click', () => {
      toolsMenu.hidden = true;
      toolsBtn?.setAttribute('aria-expanded', 'false');
    });
    sb.$id('si18n-history-btn')?.addEventListener('click', () => sb._chat.toggleHistoryPanel?.());
    sb.$id('si18n-fc-btn')?.addEventListener('click', () => sb._chat.toggleFlashcardPanel?.());
    sb.$id('si18n-pdf-btn')?.addEventListener('click', () => sb.exportLessonPDF?.());
    sb.$id('si18n-bm-btn')?.addEventListener('click', () => sb._chat.toggleBookmarksPanel?.());
    sb.$id('si18n-recent-btn')?.addEventListener('click', () => sb._chat.toggleRecentPanel?.());
    sb.$id('si18n-dash-btn')?.addEventListener('click', () => sb._chat.toggleDashboardPanel?.());
    if (sb.hostCaps?.bridge === false) {
      // Translation-only host: wire the language picker instead of the chat.
      sb.$id('si18n-sidebar-lang-select')?.addEventListener('change', (e) => {
        sb.switchLanguage(e.target.value).catch((err) =>
          console.error('[SkillBridge] Sidebar language change error:', err),
        );
      });
    } else {
      bindChatInputEvents();
      bindExampleQuestions();
    }
  }

  function bindExampleQuestions() {
    const container = sb.$id('si18n-example-questions');
    if (!container) return;
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.si18n-example-q');
      if (!btn) return;
      const input = sb.$id('si18n-chat-input');
      if (input) {
        input.value = btn.dataset.question;
        container.remove();
        sendChatMessage();
      }
    });
  }

  function bindChatInputEvents() {
    const chatInput = sb.$id('si18n-chat-input');
    let isComposing = false;

    chatInput?.addEventListener('compositionstart', () => {
      isComposing = true;
    });
    chatInput?.addEventListener('compositionend', () => {
      isComposing = false;
    });

    sb.$id('si18n-chat-send')?.addEventListener('click', sendChatMessage);
    chatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !isComposing && !e.isComposing) {
        e.preventDefault();
        sendChatMessage();
      }
    });
  }

  function restoreChatPanelEvents() {
    bindChatInputEvents();
    bindExampleQuestions();
  }

  function updateLocalizedLabels() {
    const headerLangSelect = sb.$id('si18n-header-lang-select');
    if (headerLangSelect) headerLangSelect.value = sb.currentLang;

    const messagesEl = sb.$id('si18n-chat-messages');
    if (!messagesEl) return;
    const firstBubble = messagesEl.querySelector('.si18n-chat-bot .si18n-chat-bubble');
    if (firstBubble && messagesEl.children.length <= 2) {
      firstBubble.textContent = getTutorGreeting();
    }
    const chatInput = sb.$id('si18n-chat-input');
    if (chatInput) chatInput.placeholder = sb.t(CHAT_PLACEHOLDERS);
    const sendBtn = sb.$id('si18n-chat-send');
    if (sendBtn) sendBtn.textContent = sb.t(SEND_LABELS);
    const askLabel = sb.$('.si18n-ask-tutor-label');
    if (askLabel) askLabel.textContent = sb.t(ASK_TUTOR_LABELS);

    // The sidebar chrome is built once and was previously not re-localized, so
    // switching language after the sidebar existed left the tools button, the
    // tools-menu items and the example-question chips frozen at their
    // build-time language. Re-apply them here.
    const toolsBtn = sb.$id('si18n-tools-btn');
    if (toolsBtn) {
      const toolsLabel = sb.t(MENU_LABELS.tools);
      toolsBtn.title = toolsLabel;
      toolsBtn.setAttribute('aria-label', toolsLabel);
    }
    const closeBtn = sb.$id('si18n-close');
    if (closeBtn) closeBtn.setAttribute('aria-label', sb.t(A11Y_LABELS.closeSidebar));

    const menuItems = [
      ['si18n-recent-btn', sb.t(RESUME_LABELS.openRecent)],
      ['si18n-bm-btn', sb.t(BOOKMARK_LABELS.openBookmarks)],
      ['si18n-fc-btn', sb.t(FLASHCARD_LABELS.openFlashcards)],
      ['si18n-history-btn', sb.t(A11Y_LABELS.chatHistory)],
      ['si18n-pdf-btn', sb.t(PDF_EXPORT_LABELS.title)],
    ];
    for (const [id, label] of menuItems) {
      const span = sb.$id(id)?.querySelector('span');
      if (span) span.textContent = label;
    }

    // Example-question chips are removed after the first one is clicked, so
    // only rebuild while the container is still present. Build via DOM nodes
    // (not innerHTML); the click handler is delegated on the container, so
    // replacing the children keeps it bound.
    const exampleContainer = sb.$id('si18n-example-questions');
    if (exampleContainer) {
      const questions = sb.t(EXAMPLE_QUESTIONS) || EXAMPLE_QUESTIONS['en'];
      exampleContainer.replaceChildren(
        ...questions.map((q) => {
          const chip = document.createElement('button');
          chip.className = 'si18n-example-q';
          chip.dataset.question = q;
          chip.textContent = q;
          return chip;
        }),
      );
    }
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
    if (sb.certDisabled) return;
    if (isSending) return;
    const input = sb.$id('si18n-chat-input');
    const messages = sb.$id('si18n-chat-messages');
    const chatDom = sb._chat.dom;
    const text = input.value.trim();
    if (!text) return;

    isSending = true;

    // Offline guard — show localized message instead of hitting the network
    if (sb.isOffline) {
      chatDom.appendOfflineMessage(messages);
      scrollToBottom(messages);
      isSending = false;
      return;
    }

    const quoteEl = sb.$('.si18n-chat-quote');
    const quotedText = quoteEl?.textContent?.replace('\u00d7', '').trim() || '';
    if (quoteEl) quoteEl.remove();

    chatDom.appendUserMessage(messages, text, quotedText);
    input.value = '';
    input.placeholder = sb.t(CHAT_PLACEHOLDERS);

    const loadingId = 'loading-' + Date.now();
    chatDom.appendLoadingMessage(messages, loadingId);
    scrollToBottom(messages);

    const fullQuestion = quotedText ? `[Regarding this text: "${quotedText}"]\n\n${text}` : text;
    const context = sb.getPageContext();
    const bubble = sb.$(`#${loadingId} .si18n-chat-bubble`);
    const sendBtn = sb.$id('si18n-chat-send');
    if (sendBtn) sendBtn.disabled = true;

    // Cancel any in-flight stream first; user pressing send while one is
    // already running should replace it, not race with it.
    cancelActiveStream();
    _activeStreamController = new AbortController();
    const signal = _activeStreamController.signal;

    try {
      let started = false;
      let lastStreamedText = '';
      await sb.translator.chatStream(
        fullQuestion,
        sb.currentLang,
        context,
        (chunk, fullText) => {
          if (signal.aborted) return; // user cancelled mid-stream
          lastStreamedText = fullText;
          if (!started) {
            started = true;
            chatDom.startStreamingBubble(bubble);
          }
          if (bubble) {
            chatDom.renderStreamingText(bubble, fullText);
            scrollToBottom(messages);
          }
        },
        { isExamPage: sb.isExamPage, signal },
      );

      if (bubble && !signal.aborted) {
        chatDom.finishStreamingBubble(bubble);
        const answerText = lastStreamedText?.trim() || bubble.textContent?.trim() || '';
        if (answerText) sb._chat.saveConversation?.(text, answerText, sb.currentLang);
      }
    } catch (err) {
      // AbortError is expected when the user navigates away mid-stream.
      // Don't render an error bubble or leave the spinner on.
      if (err?.name === 'AbortError') {
        chatDom.finishStreamingBubble(bubble);
        return;
      }
      chatDom.renderRetryableError(bubble, sb.t(A11Y_LABELS.retry), () => {
        const failedBotMsg = bubble.closest('.si18n-chat-msg');
        const failedUserMsg = failedBotMsg?.previousElementSibling;
        if (failedUserMsg?.classList.contains('si18n-chat-user')) failedUserMsg.remove();
        failedBotMsg?.remove();
        const inp = sb.$id('si18n-chat-input');
        if (inp) {
          inp.value = text;
          sendChatMessage();
        }
      });
    } finally {
      isSending = false;
      if (sendBtn) sendBtn.disabled = false;
    }
    scrollToBottom(messages);
  }

  // Markdown rendering + sanitizer were extracted to chat-render.js.
  // IndexedDB history (saveConversation, toggleHistoryPanel, …) was extracted
  // to chat-history.js. Both attach their public surface onto `sb._chat`.

  // ============================================================
  // SIDEBAR TOGGLE
  // ============================================================

  function toggleSidebar() {
    if (sb.certDisabled) return;
    const sidebar = sb.$id('skillbridge-sidebar');
    const fab = sb.$id('skillbridge-fab');
    sb.sidebarVisible = !sb.sidebarVisible;
    // If we're closing, cancel any in-flight chat — the user clearly
    // doesn't want the answer anymore and we shouldn't keep saving
    // partial responses to history.
    if (!sb.sidebarVisible) cancelActiveStream();
    if (sidebar) sidebar.classList.toggle('open', sb.sidebarVisible);
    if (fab) fab.classList.toggle('hidden', sb.sidebarVisible);

    if (sb.sidebarVisible) {
      // Show exam warning immediately when sidebar opens on exam page
      if (sb.isExamPage) {
        const messages = sb.$id('si18n-chat-messages');
        if (messages && !messages.querySelector('.si18n-exam-warning')) {
          sb._chat.dom.appendExamWarning(messages);
        }
      }

      // Focus the chat input when sidebar opens
      setTimeout(() => {
        const chatInput = sb.$id('si18n-chat-input');
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
    const sidebar = sb.$id('skillbridge-sidebar');
    if (!sidebar) return;

    const focusable = sidebar.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    // The sidebar mounts in an OPEN shadow root, so document.activeElement returns
    // the shadow HOST (#skillbridge-root), never the inner element — the trap
    // comparison would be permanently false and focus would escape the modal.
    // Read the focused node from the sidebar's own root (the shadow root in
    // production; document if it is ever light-DOM mounted).
    const active = sidebar.getRootNode().activeElement;

    if (e.shiftKey) {
      if (active === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  // Export to shared namespace.
  // `formatResponse` is now provided by chat-render.js (loaded earlier in
  // the manifest order); we deliberately do NOT re-assign it here.
  sb.injectSidebar = injectSidebar;
  sb.injectFloatingButton = injectFloatingButton;
  sb.toggleSidebar = toggleSidebar;
  sb.updateLocalizedLabels = updateLocalizedLabels;
  // `sb.toggleFlashcardPanel` is set by chat-flashcards.js since v3.5.27;
  // keyboard-shortcuts.js's call-site reads through that namespace handle.
  sb.cancelActiveStream = cancelActiveStream;
  sb._chat.restoreChatPanelEvents = restoreChatPanelEvents;
  sb.registerModule?.('sidebar-chat');
})();
