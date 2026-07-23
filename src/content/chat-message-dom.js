/**
 * SkillBridge — chat message DOM helpers.
 *
 * Keeps sidebar-chat.js focused on chat flow control while this module owns
 * the repeated bubble markup and retry/error DOM mutations.
 */

(function () {
  'use strict';

  const sb = window._sb;
  if (!sb) {
    console.warn('[SkillBridge] chat-message-dom: _sb not ready');
    return;
  }

  sb._chat = sb._chat || {};

  function appendBotMessage(messages, html, attrs = '') {
    messages.insertAdjacentHTML(
      'beforeend',
      `
      <div class="si18n-chat-msg si18n-chat-bot"${attrs}>
        <div class="si18n-chat-avatar">AI</div>
        <div class="si18n-chat-bubble">${html}</div>
      </div>
    `,
    );
  }

  function appendOfflineMessage(messages) {
    appendBotMessage(messages, sb.escapeHtml(sb.t(TUTOR_OFFLINE_LABELS)));
    messages.lastElementChild?.querySelector('.si18n-chat-bubble')?.setAttribute('role', 'alert');
  }

  function appendUserMessage(messages, text, quotedText) {
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
  }

  function appendLoadingMessage(messages, loadingId) {
    appendBotMessage(
      messages,
      `
        <span class="si18n-thinking-dots" role="status" aria-label="${sb.t(A11Y_LABELS.loading)}">
          <span class="si18n-dot"></span>
          <span class="si18n-dot"></span>
          <span class="si18n-dot"></span>
        </span>
      `,
      ` id="${loadingId}"`,
    );
  }

  function startStreamingBubble(bubble) {
    if (!bubble) return;
    bubble.innerHTML = '';
    bubble.classList.add('si18n-streaming-cursor');
  }

  function renderStreamingText(bubble, fullText) {
    if (!bubble) return;
    bubble.innerHTML = sb._chat.formatResponse(fullText);
  }

  function finishStreamingBubble(bubble) {
    bubble?.classList.remove('si18n-streaming-cursor');
  }

  function renderRetryableError(bubble, retryLabel, onRetry) {
    if (!bubble) return;
    bubble.classList.remove('si18n-streaming-cursor');
    bubble.setAttribute('role', 'alert');
    bubble.textContent = sb.t(CHAT_ERROR_LABELS) + ' ';
    const retryBtn = document.createElement('button');
    retryBtn.className = 'si18n-retry-btn';
    retryBtn.textContent = '\u21bb';
    retryBtn.title = retryLabel;
    retryBtn.addEventListener('click', onRetry);
    bubble.appendChild(retryBtn);
  }

  function appendExamWarning(messages) {
    appendBotMessage(messages, sb.escapeHtml(sb.t(TUTOR_EXAM_LABELS)));
    messages.lastElementChild?.querySelector('.si18n-chat-bubble')?.classList.add('si18n-exam-warning');
  }

  sb._chat.dom = {
    appendOfflineMessage,
    appendUserMessage,
    appendLoadingMessage,
    startStreamingBubble,
    renderStreamingText,
    finishStreamingBubble,
    renderRetryableError,
    appendExamWarning,
  };
  sb.registerModule?.('chat-message-dom');
})();
