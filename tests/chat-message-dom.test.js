/**
 * @jest-environment jsdom
 */

/* global describe, test, expect, beforeEach, jest */

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'chat-message-dom.js'), 'utf8');
const labels = {
  offline: { en: 'You are offline' },
  loading: { en: 'Loading response' },
  error: { en: 'Unable to answer' },
  exam: { en: 'Exam assistance is limited' },
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

beforeEach(() => {
  document.body.innerHTML = '<div id="messages"></div>';
  window._sb = {
    _chat: { formatResponse: jest.fn((text) => `<strong>${escapeHtml(text)}</strong>`) },
    escapeHtml,
    t: (map) => map.en,
    registerModule: jest.fn(),
  };

  new Function('window', 'TUTOR_OFFLINE_LABELS', 'A11Y_LABELS', 'CHAT_ERROR_LABELS', 'TUTOR_EXAM_LABELS', source)(
    window,
    labels.offline,
    { loading: labels.loading },
    labels.error,
    labels.exam,
  );
});

describe('chat message DOM helpers', () => {
  test('escapes user and quoted text before appending a message', () => {
    const messages = document.getElementById('messages');

    window._sb._chat.dom.appendUserMessage(messages, '<img src=x>', '<script>alert(1)</script>');

    expect(messages.querySelector('img')).toBeNull();
    expect(messages.querySelector('script')).toBeNull();
    expect(messages.querySelector('.si18n-chat-quote').textContent).toBe('<script>alert(1)</script>');
    expect(messages.querySelector('.si18n-chat-bubble').textContent).toContain('<img src=x>');
  });

  test('keeps the offline alert on the bubble without adding presentation semantics', () => {
    const messages = document.getElementById('messages');

    window._sb._chat.dom.appendOfflineMessage(messages);

    const botMessage = messages.querySelector('.si18n-chat-bot');
    expect(botMessage.hasAttribute('role')).toBe(false);
    expect(botMessage.querySelector('.si18n-chat-bubble').getAttribute('role')).toBe('alert');
    expect(botMessage.textContent).toContain('You are offline');
  });

  test('creates a labelled loading bubble with the requested id', () => {
    const messages = document.getElementById('messages');

    window._sb._chat.dom.appendLoadingMessage(messages, 'loading-123');

    const loading = document.getElementById('loading-123');
    expect(loading).not.toBeNull();
    expect(loading.querySelector('[role="status"]').getAttribute('aria-label')).toBe('Loading response');
  });

  test('owns the streaming cursor lifecycle and rendering', () => {
    const bubble = document.createElement('div');
    bubble.innerHTML = '<span>old</span>';

    window._sb._chat.dom.startStreamingBubble(bubble);
    expect(bubble.classList.contains('si18n-streaming-cursor')).toBe(true);
    expect(bubble.innerHTML).toBe('');

    window._sb._chat.dom.renderStreamingText(bubble, 'new answer');
    expect(window._sb._chat.formatResponse).toHaveBeenCalledWith('new answer');
    expect(bubble.innerHTML).toBe('<strong>new answer</strong>');

    window._sb._chat.dom.finishStreamingBubble(bubble);
    expect(bubble.classList.contains('si18n-streaming-cursor')).toBe(false);
  });

  test('renders a retryable alert and invokes its callback', () => {
    const bubble = document.createElement('div');
    bubble.className = 'si18n-streaming-cursor';
    const onRetry = jest.fn();

    window._sb._chat.dom.renderRetryableError(bubble, 'Retry response', onRetry);
    bubble.querySelector('button').click();

    expect(bubble.getAttribute('role')).toBe('alert');
    expect(bubble.classList.contains('si18n-streaming-cursor')).toBe(false);
    expect(bubble.querySelector('button').getAttribute('title')).toBe('Retry response');
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('marks an exam warning bubble', () => {
    const messages = document.getElementById('messages');

    window._sb._chat.dom.appendExamWarning(messages);

    expect(messages.querySelector('.si18n-chat-bubble').classList.contains('si18n-exam-warning')).toBe(true);
    expect(messages.textContent).toContain('Exam assistance is limited');
  });
});
