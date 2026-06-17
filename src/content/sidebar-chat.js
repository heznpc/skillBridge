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
    bookmarksPanelOpen: false,
    recentPanelOpen: false,
    dashboardPanelOpen: false,
  };
  const _state = sb._chat.state;

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
  // SHADOW UI ROOT — style isolation from the host page
  // ============================================================
  // Skilljar styles bare element selectors (button {}, svg {}, input {}, …)
  // that leak into our injected controls whenever they don't set those
  // properties themselves — the FAB icon collapsed (#182) and the reset button
  // turned host-blue (#185) exactly this way. Instead of chasing each leak, we
  // host our injected UI inside an OPEN shadow root: the page stylesheet cannot
  // reach in (shadow encapsulation), so that leak class becomes impossible.
  //
  // Two boundary facts shape the design:
  //   - Ancestor state selectors (html.si18n-dark, body.si18n-lang-*) do NOT
  //     cross into the shadow, so we mirror those classes onto the shadow HOST
  //     and the shadow CSS targets them via :host(...).
  //   - CSS custom properties (--si18n-*) DO inherit through the boundary, so
  //     var() references keep resolving from :root.
  //
  // The FAB, sidebar, and TOC live here; blend-in components (header
  // controls) stay in the light DOM by design. Shadow UI is styled by the
  // adopted, :host()-transformed content.css (see shadow-css.js) — except the
  // FAB, whose inline critical style below is its single source of truth.
  function getUiRoot() {
    if (sb._uiHost && sb._uiHost.isConnected) return sb._uiHost.shadowRoot;
    const host = document.createElement('div');
    host.id = 'skillbridge-root';
    host.attachShadow({ mode: 'open' });
    // Adopt the transformed content.css so UI that moves into this root is
    // styled from the single source. The FAB keeps a small inline <style> as
    // immediate/critical CSS (the adopted sheet loads async via fetch).
    window._sbShadowCss?.ensureShadowStylesheet(host.shadowRoot);
    syncHostThemeClasses(host);
    document.body.appendChild(host);
    sb._uiHost = host;
    return host.shadowRoot;
  }

  // Mirror host-page theme/locale state onto the shadow host so shadow CSS can
  // react via :host(.si18n-dark) / :host(.si18n-lang-xx). Kept in sync because
  // the dark toggle and language switch flip these classes after first paint.
  function syncHostThemeClasses(host) {
    const apply = () => {
      host.classList.toggle('si18n-dark', document.documentElement.classList.contains('si18n-dark'));
      for (const c of [...host.classList]) {
        if (c.startsWith('si18n-lang-') || c === 'si18n-rtl') host.classList.remove(c);
      }
      for (const c of document.body.classList) {
        if (c.startsWith('si18n-lang-') || c === 'si18n-rtl') host.classList.add(c);
      }
    };
    apply();
    // Self-disconnect when the host leaves the DOM (host-page swap): a fresh
    // host from getUiRoot() brings its own observer, so the old one must not
    // linger and keep mutating a detached node.
    const obs = new MutationObserver(() => {
      if (!host.isConnected) {
        obs.disconnect();
        return;
      }
      apply();
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  // Shadow-aware element lookups. Query the shadow UI root first (the sidebar
  // and FAB live there), then fall back to the light DOM for host-page UI and
  // for components not yet migrated into the shadow root. Every module calls
  // sb.$id / sb.$ instead of document.getElementById / querySelector so a
  // single call resolves correctly regardless of which side an element is on
  // during the staged migration.
  // isConnected guard: if the host was ever detached (host-page DOM swap), a
  // lookup must not return elements from the dead root — fall through to the
  // light DOM (null there reads as "not present", which handlers treat as a
  // no-op) until getUiRoot() builds a fresh host.
  sb.$id = (id) =>
    (sb._uiHost && sb._uiHost.isConnected && sb._uiHost.shadowRoot.getElementById(id)) || document.getElementById(id);
  sb.$ = (sel) =>
    (sb._uiHost && sb._uiHost.isConnected && sb._uiHost.shadowRoot.querySelector(sel)) || document.querySelector(sel);

  // The SINGLE source of truth for FAB styling (content.css carries no
  // #skillbridge-fab rules — see the note there). Inline rather than relying
  // on the adopted content.css sheet because adoption is async (fetch) and the
  // FAB must never flash unstyled. Ancestor theme selectors are written in
  // :host(...) form; the shadow host mirrors the html/body state classes.
  const FAB_SHADOW_CSS = `
    #skillbridge-fab { position: fixed; bottom: 24px; right: 24px; width: 48px; height: 48px; padding: 0; border-radius: 50%; background: var(--si18n-accent, #3d405b); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 16px rgba(61, 64, 91, 0.35); z-index: 99999; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); border: none; }
    #skillbridge-fab svg { flex-shrink: 0; width: 24px; height: 24px; }
    #skillbridge-fab:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(61, 64, 91, 0.45); }
    #skillbridge-fab.hidden { transform: scale(0); opacity: 0; pointer-events: none; }
    #skillbridge-fab:focus-visible { outline: 2px solid var(--si18n-primary, #e07a5f); outline-offset: 2px; }
    #skillbridge-fab.si18n-fab-pulse { animation: si18n-fab-pulse 2s ease-in-out 3; }
    @keyframes si18n-fab-pulse {
      0%, 100% { box-shadow: 0 4px 16px rgba(61, 64, 91, 0.35); }
      50% { box-shadow: 0 4px 24px rgba(61, 64, 91, 0.55), 0 0 0 8px rgba(61, 64, 91, 0.1); }
    }
    :host(.si18n-dark) #skillbridge-fab { background: #6b6f9e; border: 1px solid rgba(255, 255, 255, 0.22); color: #fff; box-shadow: 0 4px 18px rgba(0, 0, 0, 0.55); }
    :host(.si18n-dark) #skillbridge-fab:hover { background: #7c80b3; color: #fff; }
    :host(:is(.si18n-lang-ar, .si18n-lang-he)) #skillbridge-fab { right: auto; left: 24px; }
    @media (prefers-reduced-motion: reduce) {
      #skillbridge-fab { transition-duration: 0.01ms; }
      #skillbridge-fab.si18n-fab-pulse { animation-duration: 0.01ms; animation-iteration-count: 1; }
    }
    @media (max-width: 600px) {
      #skillbridge-fab { bottom: 16px; right: 16px; }
      :host(:is(.si18n-lang-ar, .si18n-lang-he)) #skillbridge-fab { left: 16px; right: auto; }
    }
  `;

  // ============================================================
  // FLOATING BUTTON
  // ============================================================

  function injectFloatingButton() {
    const root = getUiRoot();
    if (root.getElementById('skillbridge-fab')) return;
    if (!root.querySelector('style[data-sb-fab]')) {
      const style = document.createElement('style');
      style.setAttribute('data-sb-fab', '');
      style.textContent = FAB_SHADOW_CSS;
      root.appendChild(style);
    }
    const btn = document.createElement('button');
    btn.id = 'skillbridge-fab';
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    // On translation-only hosts (claude.com tutorials — no AI-tutor bridge) the
    // FAB opens a language picker, so label + icon say "language", not "tutor".
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
  }

  // ============================================================
  // SIDEBAR UI
  // ============================================================

  function injectSidebar() {
    if (sb.$id('skillbridge-sidebar')) return;
    const sidebar = document.createElement('div');
    sidebar.id = 'skillbridge-sidebar';
    sidebar.className = 'skillbridge-sidebar';
    sidebar.setAttribute('role', 'dialog');
    sidebar.setAttribute('aria-modal', 'true');
    sidebar.setAttribute('aria-label', 'SkillBridge Tutor');
    sidebar.innerHTML = getSidebarHTML();
    // Mount inside the shadow UI root so the host page's CSS can't reach the
    // sidebar; it's styled by the adopted (transformed) content.css.
    getUiRoot().appendChild(sidebar);
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
    sb.$id('si18n-pdf-btn')?.addEventListener('click', exportLessonPDF);
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
    if (isSending) return;
    const input = sb.$id('si18n-chat-input');
    const messages = sb.$id('si18n-chat-messages');
    const text = input.value.trim();
    if (!text) return;

    isSending = true;

    // Offline guard — show localized message instead of hitting the network
    if (sb.isOffline) {
      const messages = sb.$id('si18n-chat-messages');
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

    const quoteEl = sb.$('.si18n-chat-quote');
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
          const inp = sb.$id('si18n-chat-input');
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
    const chatPanel = sb.$id('si18n-panel-chat');
    if (!chatPanel || !_state.savedChatHTML) return;
    // The chat bubble that was streaming is about to be replaced — abort
    // the stream so its onChunk callback doesn't write into a detached node.
    cancelActiveStream();
    chatPanel.innerHTML = _state.savedChatHTML;
    _state.savedChatHTML = null;
    _state.historyPanelOpen = false;
    _state.flashcardPanelOpen = false;
    _state.bookmarksPanelOpen = false;
    _state.recentPanelOpen = false;
    _state.dashboardPanelOpen = false;
    bindChatInputEvents();
    // Example-question chips may still be in the restored chat HTML; their
    // click handlers must be re-bound too (closeSubPanel previously only
    // re-bound the input).
    bindExampleQuestions();
  }

  // ============================================================
  // SIDEBAR TOGGLE
  // ============================================================

  function toggleSidebar() {
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

  // ============================================================
  // PDF EXPORT
  // ============================================================

  function exportLessonPDF() {
    const lessonContent = sb.$(SKILLJAR_SELECTORS.lessonContent) || sb.$('main');
    if (!lessonContent) return;

    const title = sb.$('h1')?.textContent?.trim() || 'SkillBridge Lesson';
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
    const DANGEROUS_TAGS = 'script, iframe, object, embed, link[rel="import"], style, base, meta';
    lessonClone.querySelectorAll(DANGEROUS_TAGS).forEach((el) => el.remove());
    // Strip the extension's own UI elements that may be inside the lesson.
    lessonClone
      .querySelectorAll('[class*="si18n"], [id*="si18n"], [class*="skillbridge"]')
      .forEach((el) => el.remove());
    // Strip inline event handlers + dangerous URL schemes from every attribute
    // (cloneNode preserves both). The scheme check normalizes the value first:
    // browsers ignore ASCII whitespace + C0 control chars INSIDE a URL scheme, so
    // "java&#x09;script:" — which the DOM parser has already decoded to a real tab —
    // resolves to "javascript:" and would slip through a naive /^javascript:/ test.
    // data: is blocked on NAVIGABLE attributes (href/xlink:href/formaction/action/
    // ping) but allowed on `src` so legitimate inline data:image content survives.
    const NAV_URL_ATTRS = new Set(['href', 'xlink:href', 'formaction', 'action', 'ping']);
    const dangerousScheme = (value, blockData) => {
      const v = String(value)
        // Strip the full C0-control + space range: browsers ignore these inside a
        // URL scheme, so a tab-obfuscated "java\tscript:" collapses to "javascript:"
        // before the scheme test. Stripping control chars is the point of this rule.
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0020]+/g, '')
        .toLowerCase();
      return /^(?:javascript|vbscript):/.test(v) || (blockData && v.startsWith('data:'));
    };
    lessonClone.querySelectorAll('*').forEach((el) => {
      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on')) {
          el.removeAttribute(attr.name);
        } else if (
          NAV_URL_ATTRS.has(name)
            ? dangerousScheme(attr.value, true)
            : name === 'src' && dangerousScheme(attr.value, false)
        ) {
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
  // Shared shadow UI root accessor — later migration stages move more
  // body-injected UI into this same root and query it via sb.uiRoot().
  sb.uiRoot = getUiRoot;
  sb.updateLocalizedLabels = updateLocalizedLabels;
  // `sb.toggleFlashcardPanel` is set by chat-flashcards.js since v3.5.27;
  // keyboard-shortcuts.js's call-site reads through that namespace handle.
  sb.cancelActiveStream = cancelActiveStream;
  // Surface for chat-history.js / chat-flashcards.js / SPA route handlers.
  // bindChatInputEvents + cancelActiveStream were exposed on `_chat` in
  // v3.5.13 but grep showed zero external callers — removed in v3.5.14.
  // `sb.cancelActiveStream` (above) remains the single public handle.
  sb._chat.closeSubPanel = closeSubPanel;
})();
