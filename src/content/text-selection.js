/**
 * SkillBridge — Text Selection → Ask Tutor
 * Accesses shared state via window._sb namespace.
 */

(function () {
  'use strict';

  const sb = window._sb;

  let askTutorBtn = null;
  let pendingQuote = null;

  function initAskTutorButton() {
    askTutorBtn = document.createElement('button');
    askTutorBtn.className = 'si18n-ask-tutor-btn';
    askTutorBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <span class="si18n-ask-tutor-label">${sb.t(ASK_TUTOR_LABELS)}</span>
    `;
    document.body.appendChild(askTutorBtn);

    askTutorBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleAskTutor();
    });

    document.addEventListener('mouseup', onTextSelection);
    document.addEventListener('mousedown', onDismissAskButton);
  }

  function onTextSelection(e) {
    if (e.target.closest?.('.skillbridge-sidebar')) return;
    if (e.target.closest?.('.si18n-ask-tutor-btn')) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      hideAskButton();
      return;
    }

    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (!text || text.length < 3) {
        hideAskButton();
        return;
      }

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;

      askTutorBtn.style.left = `${rect.right + scrollX - 30}px`;
      askTutorBtn.style.top = `${rect.bottom + scrollY + 6}px`;
      askTutorBtn.classList.add('visible');

      pendingQuote = text.length > SKILLBRIDGE_LIMITS.QUOTE_MAX ? text.slice(0, SKILLBRIDGE_LIMITS.QUOTE_MAX) + '\u2026' : text;
    }, SKILLBRIDGE_DELAYS.TEXT_SELECTION);
  }

  function onDismissAskButton(e) {
    if (e.target.closest?.('.si18n-ask-tutor-btn')) return;
    hideAskButton();
  }

  function hideAskButton() {
    if (askTutorBtn) askTutorBtn.classList.remove('visible');
    pendingQuote = null;
  }

  function handleAskTutor() {
    if (!pendingQuote) return;
    const quote = pendingQuote;
    hideAskButton();
    window.getSelection()?.removeAllRanges();

    if (!sb.sidebarVisible) sb.toggleSidebar?.();
    insertQuoteInChat(quote);
  }

  function insertQuoteInChat(quoteText) {
    const inputWrap = document.querySelector('.si18n-chat-input-wrap');
    if (!inputWrap) return;

    inputWrap.parentNode.querySelector('.si18n-chat-quote')?.remove();

    const quoteEl = document.createElement('div');
    quoteEl.className = 'si18n-chat-quote';
    quoteEl.innerHTML = `
      <button class="si18n-chat-quote-dismiss" title="Remove quote">&times;</button>
      ${sb.escapeHtml(quoteText)}
    `;
    inputWrap.parentNode.insertBefore(quoteEl, inputWrap);

    quoteEl.querySelector('.si18n-chat-quote-dismiss')?.addEventListener('click', () => {
      quoteEl.remove();
    });

    const input = document.getElementById('si18n-chat-input');
    if (input) {
      input.focus();
      input.placeholder = sb.t(QUOTE_PLACEHOLDERS);
    }
  }

  // Export to shared namespace
  sb.initAskTutorButton = initAskTutorButton;
})();
