/**
 * SkillBridge — Text Selection Actions
 *
 * A single floating toolbar owns both selection-based Tutor hand-off and
 * local translation-quality feedback. Feedback is only offered when the
 * selected range resolves to one translated element with a known original.
 * Accesses shared state via window._sb namespace.
 */

(function () {
  'use strict';

  const sb = window._sb;
  if (!sb) {
    console.warn('[SkillBridge] text-selection: _sb not ready');
    return;
  }

  let selectionToolbar = null;
  let askTutorBtn = null;
  let helpfulBtn = null;
  let needsWorkBtn = null;
  let statusEl = null;
  let pendingQuote = null;
  let pendingFeedback = null;
  let pendingContext = null;
  let listenersBound = false;
  let statusTimer = null;
  let selectionGeneration = 0;

  /**
   * True when a selection touches answer-choice text on an assessment page.
   * The same shared verdict guards Ask Tutor, feedback, and BYOA clipboard
   * hand-off, so a choice excluded from translation cannot leak through an
   * adjacent selection action.
   */
  function selectionHitsExamChoice(range) {
    return !!window._sbExamSelection?.selectionHitsExamChoice(range, {
      isExamPage: sb.isExamPage,
      selectors: EXAM_SKIP_SELECTORS,
    });
  }

  function initAskTutorButton() {
    if (selectionToolbar?.isConnected) return;

    selectionToolbar = document.createElement('div');
    selectionToolbar.className = 'si18n-selection-toolbar';
    selectionToolbar.hidden = true;
    selectionToolbar.setAttribute('role', 'toolbar');
    selectionToolbar.setAttribute('aria-label', sb.t(REPORT_LABELS.feedbackToolbar));
    selectionToolbar.innerHTML = `
      <button class="si18n-selection-action si18n-ask-tutor-btn" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span class="si18n-ask-tutor-label">${sb.t(ASK_TUTOR_LABELS)}</span>
      </button>
      <button class="si18n-selection-action si18n-feedback-positive" type="button" aria-label="${sb.t(REPORT_LABELS.helpful)}" title="${sb.t(REPORT_LABELS.helpful)}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10v12"/><path d="M15 5.9 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.9Z"/></svg>
      </button>
      <button class="si18n-selection-action si18n-feedback-negative" type="button" aria-label="${sb.t(REPORT_LABELS.needsWork)}" title="${sb.t(REPORT_LABELS.needsWork)}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 14V2"/><path d="M9 18.1 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.9Z"/></svg>
      </button>
      <span class="si18n-selection-status" role="status" aria-live="polite"></span>
    `;
    document.body.appendChild(selectionToolbar);

    askTutorBtn = selectionToolbar.querySelector('.si18n-ask-tutor-btn');
    helpfulBtn = selectionToolbar.querySelector('.si18n-feedback-positive');
    needsWorkBtn = selectionToolbar.querySelector('.si18n-feedback-negative');
    statusEl = selectionToolbar.querySelector('.si18n-selection-status');

    bindToolbarAction(askTutorBtn, handleAskTutor);
    bindToolbarAction(helpfulBtn, handleHelpful);
    bindToolbarAction(needsWorkBtn, handleNeedsWork);

    if (!listenersBound) {
      document.addEventListener('mouseup', onTextSelection);
      document.addEventListener('mousedown', onDismissToolbar);
      listenersBound = true;
    }
  }

  function bindToolbarAction(button, action) {
    button?.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      action();
    });
  }

  function onTextSelection(event) {
    if (!selectionToolbar?.isConnected) return;
    if (event.target.closest?.('.skillbridge-sidebar, .si18n-selection-toolbar')) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      hideToolbar();
      return;
    }

    const requestedGeneration = ++selectionGeneration;

    setTimeout(() => {
      if (requestedGeneration !== selectionGeneration) return;
      const liveSelection = window.getSelection();
      const text = liveSelection?.toString().trim();
      if (!text || text.length < 3 || liveSelection.rangeCount !== 1) {
        hideToolbar();
        return;
      }

      const range = liveSelection.getRangeAt(0);
      if (selectionHitsExamChoice(range)) {
        hideToolbar();
        return;
      }

      pendingQuote =
        text.length > SKILLBRIDGE_LIMITS.QUOTE_MAX ? `${text.slice(0, SKILLBRIDGE_LIMITS.QUOTE_MAX)}\u2026` : text;
      pendingFeedback =
        sb.currentLang === 'en'
          ? null
          : window._sbTranslationFeedback?.resolveSelection(range, sb.originalTexts, sb.translatedTexts) || null;
      pendingContext = { url: location.href, lang: sb.currentLang };

      const canAskTutor = sb.hostCaps?.bridge !== false;
      const canRateTranslation = !!pendingFeedback;
      if (!canAskTutor && !canRateTranslation) {
        hideToolbar();
        return;
      }

      clearTimeout(statusTimer);
      statusEl.textContent = '';
      statusEl.hidden = true;
      askTutorBtn.hidden = !canAskTutor;
      helpfulBtn.hidden = !canRateTranslation;
      needsWorkBtn.hidden = !canRateTranslation;
      selectionToolbar.hidden = false;
      selectionToolbar.classList.add('visible');
      positionToolbar(range.getBoundingClientRect());
    }, SKILLBRIDGE_DELAYS.TEXT_SELECTION);
  }

  function positionToolbar(rangeRect) {
    if (!selectionToolbar) return;
    const gap = 8;
    const edge = 8;
    const toolbarRect = selectionToolbar.getBoundingClientRect();
    const width = toolbarRect.width || 190;
    const height = toolbarRect.height || 34;
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const idealLeft = rangeRect.left + rangeRect.width / 2 - width / 2;
    const left = Math.max(edge, Math.min(idealLeft, viewportWidth - width - edge));
    const below = rangeRect.bottom + gap;
    const top = below + height <= viewportHeight - edge ? below : Math.max(edge, rangeRect.top - height - gap);
    selectionToolbar.style.left = `${Math.round(left)}px`;
    selectionToolbar.style.top = `${Math.round(top)}px`;
  }

  function onDismissToolbar(event) {
    if (event.target.closest?.('.si18n-selection-toolbar')) return;
    hideToolbar();
  }

  function hideToolbar() {
    clearTimeout(statusTimer);
    if (selectionToolbar) {
      selectionToolbar.classList.remove('visible');
      selectionToolbar.hidden = true;
    }
    pendingQuote = null;
    pendingFeedback = null;
    pendingContext = null;
  }

  function liveSelectionIsProtected() {
    const selection = window.getSelection();
    return !!(selection?.rangeCount && selectionHitsExamChoice(selection.getRangeAt(0)));
  }

  function clearLiveSelection() {
    window.getSelection()?.removeAllRanges();
  }

  function selectionContextIsCurrent() {
    return !!pendingContext && pendingContext.url === location.href && pendingContext.lang === sb.currentLang;
  }

  function resolveLiveFeedback() {
    if (!pendingFeedback || !selectionContextIsCurrent()) return null;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null;
    return (
      window._sbTranslationFeedback?.resolveSelection(selection.getRangeAt(0), sb.originalTexts, sb.translatedTexts) ||
      null
    );
  }

  function handleAskTutor() {
    if (!pendingQuote || !selectionContextIsCurrent()) {
      hideToolbar();
      return;
    }
    if (liveSelectionIsProtected()) {
      hideToolbar();
      return;
    }
    const quote = pendingQuote;
    hideToolbar();
    clearLiveSelection();

    if (!sb.sidebarVisible) sb.toggleSidebar?.();
    insertQuoteInChat(quote);
  }

  async function handleHelpful() {
    const pair = resolveLiveFeedback();
    if (!pair) {
      hideToolbar();
      return;
    }
    if (liveSelectionIsProtected()) {
      hideToolbar();
      return;
    }
    const actionGeneration = selectionGeneration;
    hideToolbar();
    clearLiveSelection();
    try {
      const saved = await sb._chat?.recordTranslationFeedback?.(pair, 'positive');
      if (saved && actionGeneration === selectionGeneration && selectionToolbar?.hidden) showSavedStatus();
    } catch (error) {
      console.warn('[SkillBridge] Translation feedback could not be saved:', error?.message || error);
    }
  }

  async function handleNeedsWork() {
    const pair = resolveLiveFeedback();
    if (!pair) {
      hideToolbar();
      return;
    }
    if (liveSelectionIsProtected()) {
      hideToolbar();
      return;
    }
    hideToolbar();
    clearLiveSelection();
    if (!sb.sidebarVisible) sb.toggleSidebar?.();
    try {
      await sb._chat?.composeTranslationFeedback?.(pair);
    } catch (error) {
      console.warn('[SkillBridge] Translation feedback composer could not open:', error?.message || error);
    }
  }

  function showSavedStatus() {
    if (!selectionToolbar?.isConnected) return;
    askTutorBtn.hidden = true;
    helpfulBtn.hidden = true;
    needsWorkBtn.hidden = true;
    statusEl.textContent = sb.t(REPORT_LABELS.saved);
    statusEl.hidden = false;
    selectionToolbar.hidden = false;
    selectionToolbar.classList.add('visible');
    statusTimer = setTimeout(hideToolbar, 1400);
  }

  function insertQuoteInChat(quoteText) {
    const inputWrap = sb.$('.si18n-chat-input-wrap');
    if (!inputWrap) return;

    inputWrap.parentNode.querySelector('.si18n-chat-quote')?.remove();

    const quoteEl = document.createElement('div');
    quoteEl.className = 'si18n-chat-quote';
    quoteEl.innerHTML = `
      <button class="si18n-chat-quote-dismiss" title="${sb.t(A11Y_LABELS.removeQuote)}">&times;</button>
      ${sb.escapeHtml(quoteText)}
    `;
    inputWrap.parentNode.insertBefore(quoteEl, inputWrap);

    quoteEl.querySelector('.si18n-chat-quote-dismiss')?.addEventListener('click', () => {
      quoteEl.remove();
    });

    const input = sb.$id('si18n-chat-input');
    if (input) {
      input.focus();
      input.placeholder = sb.t(QUOTE_PLACEHOLDERS);
    }
  }

  // Keep the established public name so lifecycle and integrations do not need
  // a migration; it now initializes the complete selection toolbar.
  sb.initAskTutorButton = initAskTutorButton;
  sb.registerModule?.('text-selection');
})();
