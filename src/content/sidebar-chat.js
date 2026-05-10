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

  // Sub-panel state shared with chat-history.js (and, eventually,
  // chat-flashcards.js when that gets extracted). Kept on `sb._chat.state`
  // so any module loaded after content.js can read/mutate the same object
  // without us re-introducing a tangle of ad-hoc globals.
  sb._chat = sb._chat || {};
  sb._chat.state = sb._chat.state || {
    savedChatHTML: null,
    historyPanelOpen: false,
    flashcardPanelOpen: false,
  };
  const _state = sb._chat.state;

  let scrollRAF = null;
  let isSending = false;
  let _rawSectionsCache = null; // Cached raw JSON for section-specific flashcards
  let _rawSectionsLang = null; // Language of the cached data
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
    return questions
      .map((q) => `<button class="si18n-example-q" data-question="${sb.escapeHtml(q)}">${sb.escapeHtml(q)}</button>`)
      .join('');
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
        <button class="si18n-history-btn" id="si18n-pdf-btn" title="${sb.t(PDF_EXPORT_LABELS.title)}" aria-label="${sb.t(PDF_EXPORT_LABELS.title)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/>
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
    document.getElementById('si18n-history-btn')?.addEventListener('click', () => sb._chat.toggleHistoryPanel?.());
    document.getElementById('si18n-fc-btn')?.addEventListener('click', toggleFlashcardPanel);
    document.getElementById('si18n-pdf-btn')?.addEventListener('click', exportLessonPDF);
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

    chatInput?.addEventListener('compositionstart', () => {
      isComposing = true;
    });
    chatInput?.addEventListener('compositionend', () => {
      isComposing = false;
    });

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
      messages.insertAdjacentHTML(
        'beforeend',
        `
        <div class="si18n-chat-msg si18n-chat-bot">
          <div class="si18n-chat-avatar">AI</div>
          <div class="si18n-chat-bubble" role="alert">${sb.escapeHtml(sb.t(TUTOR_OFFLINE_LABELS))}</div>
        </div>
      `,
      );
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

    messages.insertAdjacentHTML(
      'beforeend',
      `
      <div class="si18n-chat-msg si18n-chat-user">
        <div class="si18n-chat-bubble">${displayHtml}</div>
        <div class="si18n-chat-avatar">You</div>
      </div>
    `,
    );
    input.value = '';
    input.placeholder = sb.t(CHAT_PLACEHOLDERS);

    const loadingId = 'loading-' + Date.now();
    messages.insertAdjacentHTML(
      'beforeend',
      `
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
    `,
    );
    scrollToBottom(messages);

    const fullQuestion = quotedText ? `[Regarding this text: "${quotedText}"]\n\n${text}` : text;
    const context = sb.getPageContext();
    const bubble = document.querySelector(`#${loadingId} .si18n-chat-bubble`);
    const sendBtn = document.getElementById('si18n-chat-send');
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
            if (bubble) {
              bubble.innerHTML = '';
              bubble.classList.add('si18n-streaming-cursor');
            }
          }
          if (bubble) {
            bubble.innerHTML = sb._chat.formatResponse(fullText);
            scrollToBottom(messages);
          }
        },
        { isExamPage: sb.isExamPage, signal },
      );

      if (bubble && !signal.aborted) {
        bubble.classList.remove('si18n-streaming-cursor');
        const answerText = lastStreamedText?.trim() || bubble.textContent?.trim() || '';
        if (answerText) sb._chat.saveConversation?.(text, answerText, sb.currentLang);
      }
    } catch (err) {
      // AbortError is expected when the user navigates away mid-stream.
      // Don't render an error bubble or leave the spinner on.
      if (err?.name === 'AbortError') {
        if (bubble) bubble.classList.remove('si18n-streaming-cursor');
        return;
      }
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
          if (inp) {
            inp.value = text;
            sendChatMessage();
          }
        });
        bubble.appendChild(retryBtn);
      }
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
  // SUB-PANEL STATE MACHINERY (shared with chat-history.js / flashcards)
  // ============================================================

  function closeSubPanel() {
    const chatPanel = document.getElementById('si18n-panel-chat');
    if (!chatPanel || !_state.savedChatHTML) return;
    // The chat bubble that was streaming is about to be replaced — abort
    // the stream so its onChunk callback doesn't write into a detached node.
    cancelActiveStream();
    chatPanel.innerHTML = _state.savedChatHTML;
    _state.savedChatHTML = null;
    _state.historyPanelOpen = false;
    _state.flashcardPanelOpen = false;
    bindChatInputEvents();
  }

  // ============================================================
  // SIDEBAR TOGGLE
  // ============================================================

  function toggleSidebar() {
    const sidebar = document.getElementById('skillbridge-sidebar');
    const fab = document.getElementById('skillbridge-fab');
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
        const messages = document.getElementById('si18n-chat-messages');
        if (messages && !messages.querySelector('.si18n-exam-warning')) {
          messages.insertAdjacentHTML(
            'beforeend',
            `
            <div class="si18n-chat-msg si18n-chat-bot">
              <div class="si18n-chat-avatar">AI</div>
              <div class="si18n-chat-bubble si18n-exam-warning">${sb.escapeHtml(sb.t(TUTOR_EXAM_LABELS))}</div>
            </div>
          `,
          );
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
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
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

  let flashcardCards = [];
  let flashcardIndex = 0;
  let flashcardBoxes = {};
  let _matchedCourseSlug = null;

  function toggleFlashcardPanel() {
    const chatPanel = document.getElementById('si18n-panel-chat');
    if (!chatPanel) return;

    if (_state.flashcardPanelOpen) {
      closeFlashcardPanel();
      return;
    }
    // Close history if open — they share `savedChatHTML`, so closing first
    // restores the chat panel before we save it again.
    if (_state.historyPanelOpen) closeSubPanel();

    _state.flashcardPanelOpen = true;
    _state.savedChatHTML = chatPanel.innerHTML;

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
        ${
          flashcardCards.length === 0
            ? `<div class="si18n-history-empty">${sb.t(FLASHCARD_LABELS.empty)}</div>`
            : renderFlashcard()
        }
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
    _matchedCourseSlug = null;
    for (const [slug, sects] of FLASHCARD_COURSE_SLUGS_SORTED) {
      if (url.includes(slug)) {
        sections = sects;
        _matchedCourseSlug = slug;
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
            fetch(jsonUrl)
              .then((r) => r.json())
              .then((data) => {
                _rawSectionsCache = data;
                _rawSectionsLang = lang;
                // Re-run with warm cache and update panel
                if (_state.flashcardPanelOpen) {
                  flashcardCards = loadFlashcardsForCourse();
                  flashcardIndex = 0;
                  refreshFlashcard();
                }
              })
              .catch(() => {});
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
        } catch (_ignored) {
          /* fall through to all entries */
        }
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
    container.innerHTML =
      flashcardCards.length === 0
        ? `<div class="si18n-history-empty">${sb.t(FLASHCARD_LABELS.empty)}</div>`
        : renderFlashcard();
    bindFlashcardEvents();
  }

  function bindFlashcardEvents() {
    const card = document.getElementById('si18n-fc-card');
    card?.addEventListener('click', () => card.classList.toggle('si18n-card-flipped'));
    card?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.classList.toggle('si18n-card-flipped');
      }
    });
    document.getElementById('si18n-fc-prev')?.addEventListener('click', () => {
      if (flashcardIndex > 0) {
        flashcardIndex--;
        saveFlashcardProgress();
        refreshFlashcard();
      }
    });
    document.getElementById('si18n-fc-next')?.addEventListener('click', () => {
      if (flashcardIndex < flashcardCards.length - 1) {
        flashcardIndex++;
        saveFlashcardProgress();
        refreshFlashcard();
      }
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

  function _flashcardStorageKey() {
    const slug = _matchedCourseSlug || 'all';
    return `fc_${slug}_${sb.currentLang}`;
  }

  // Serialize flashcard writes through a single promise chain. chrome.storage
  // .set is async with no ordering guarantee across in-flight calls, so
  // rapid box-up/box-down clicks could interleave and resurrect cleared
  // boxes. The chain forces last-clicked-wins semantics.
  let _flashcardSaveQueue = Promise.resolve();

  function saveFlashcardProgress() {
    const key = _flashcardStorageKey();
    const stableBoxes = {};
    for (const [idx, box] of Object.entries(flashcardBoxes)) {
      const card = flashcardCards[idx];
      if (card) stableBoxes[card.en] = box;
    }
    const data = {};
    data[key] = { boxes: stableBoxes, index: flashcardIndex };
    _flashcardSaveQueue = _flashcardSaveQueue
      .catch(() => {}) // a prior failure shouldn't block the next write
      .then(() => new Promise((resolve) => chrome.storage.local.set(data, resolve)));
  }

  function loadFlashcardProgress() {
    const key = _flashcardStorageKey();
    chrome.storage.local.get([key], (result) => {
      const saved = result[key];
      flashcardBoxes = {};
      if (saved?.boxes) {
        // Restore by matching english text back to current card indices
        for (let i = 0; i < flashcardCards.length; i++) {
          const box = saved.boxes[flashcardCards[i].en];
          if (box !== undefined) flashcardBoxes[i] = box;
        }
      }
      if (saved?.index != null && saved.index < flashcardCards.length) {
        flashcardIndex = saved.index;
      }
      refreshFlashcard();
    });
  }

  function closeFlashcardPanel() {
    closeSubPanel();
  }

  // ============================================================
  // PDF EXPORT
  // ============================================================

  function exportLessonPDF() {
    const lessonContent = document.querySelector(SKILLJAR_SELECTORS.lessonContent) || document.querySelector('main');
    if (!lessonContent) return;

    const title = document.querySelector('h1')?.textContent?.trim() || 'SkillBridge Lesson';
    const langName = sb.translator?.supportedLanguages?.[sb.currentLang] || sb.currentLang;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      // Popup blocker rejected the open. Without a signal the user thinks
      // the button did nothing. alert() is intentionally used over a
      // banner here — the failure is rare and the recovery (allow popups)
      // requires user attention, not a passive notification.
      alert(sb.t(PDF_EXPORT_LABELS.blocked));
      return;
    }

    // Sanitize the lesson body BEFORE injecting it into the new window.
    // The previous version wrote `lessonContent.innerHTML` directly, then
    // tried to remove `<script>`/`<iframe>` after `document.close()` — by
    // which point inline scripts had already executed. Sanitize the
    // cloned DOM tree first; serialize the cleaned tree into the new doc.
    const lessonClone = lessonContent.cloneNode(true);
    const DANGEROUS_TAGS = 'script, iframe, object, embed, link[rel="import"], style';
    lessonClone.querySelectorAll(DANGEROUS_TAGS).forEach((el) => el.remove());
    // Strip the extension's own UI elements that may be inside the lesson.
    lessonClone
      .querySelectorAll('[class*="si18n"], [id*="si18n"], [class*="skillbridge"]')
      .forEach((el) => el.remove());
    // Strip inline event handlers (onclick, onload, …) that survived as
    // attributes; cloneNode preserves them.
    lessonClone.querySelectorAll('*').forEach((el) => {
      for (const attr of [...el.attributes]) {
        if (attr.name.toLowerCase().startsWith('on')) el.removeAttribute(attr.name);
        // Reject javascript: URLs.
        if ((attr.name === 'href' || attr.name === 'src') && /^\s*javascript:/i.test(attr.value)) {
          el.removeAttribute(attr.name);
        }
      }
    });

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${sb.escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 24px; color: #1c1917; line-height: 1.7; font-size: 14px; }
  h1 { font-size: 22px; font-weight: 600; margin-bottom: 4px; }
  h2 { font-size: 18px; margin-top: 28px; }
  h3 { font-size: 16px; margin-top: 20px; }
  p { margin: 10px 0; }
  code { background: #f5f5f4; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  pre { background: #f5f5f4; padding: 14px; border-radius: 8px; overflow-x: auto; font-size: 13px; }
  img { max-width: 100%; height: auto; }
  .si18n-pdf-meta { color: #78716c; font-size: 12px; margin-bottom: 24px; border-bottom: 1px solid #e7e5e4; padding-bottom: 12px; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
  <h1>${sb.escapeHtml(title)}</h1>
  <div class="si18n-pdf-meta">SkillBridge · ${sb.escapeHtml(langName)} · ${new Date().toLocaleDateString()}</div>
  ${lessonClone.innerHTML}
</body>
</html>`);
    printWindow.document.close();

    setTimeout(() => {
      // The user may have closed the popup before the timer fires.
      try {
        if (!printWindow.closed) printWindow.print();
      } catch (_e) {
        /* window already closed — nothing to do */
      }
    }, 500);
  }

  // Export to shared namespace.
  // `formatResponse` is now provided by chat-render.js (loaded earlier in
  // the manifest order); we deliberately do NOT re-assign it here.
  sb.injectSidebar = injectSidebar;
  sb.injectFloatingButton = injectFloatingButton;
  sb.toggleSidebar = toggleSidebar;
  sb.updateLocalizedLabels = updateLocalizedLabels;
  sb.toggleFlashcardPanel = toggleFlashcardPanel;
  sb.cancelActiveStream = cancelActiveStream;
  // Surface for chat-history.js / chat-flashcards.js / SPA route handlers.
  sb._chat.closeSubPanel = closeSubPanel;
  sb._chat.bindChatInputEvents = bindChatInputEvents;
  sb._chat.cancelActiveStream = cancelActiveStream;
})();
