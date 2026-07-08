/**
 * SkillBridge - Shared chat sub-panel state machine.
 *
 * Owns the panel switcher used by history, flashcards, bookmarks, recent
 * lessons, and dashboard modules.
 */

(function () {
  'use strict';

  const sb = window._sb;
  if (!sb) {
    console.warn('[SkillBridge] chat-subpanels: _sb not ready');
    return;
  }

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
  const SUB_PANEL_FLAGS = {
    history: 'historyPanelOpen',
    flashcard: 'flashcardPanelOpen',
    bookmarks: 'bookmarksPanelOpen',
    recent: 'recentPanelOpen',
    dashboard: 'dashboardPanelOpen',
  };

  function resetSubPanelFlags() {
    for (const flag of Object.values(SUB_PANEL_FLAGS)) _state[flag] = false;
  }

  function anyOtherSubPanelOpen(name) {
    const currentFlag = SUB_PANEL_FLAGS[name];
    return Object.values(SUB_PANEL_FLAGS).some((flag) => flag !== currentFlag && _state[flag]);
  }

  function openSubPanel(name, html, onMount) {
    const flag = SUB_PANEL_FLAGS[name];
    if (!flag) {
      console.warn('[SkillBridge] Unknown sub-panel:', name);
      return null;
    }

    const chatPanel = sb.$id('si18n-panel-chat');
    if (!chatPanel) return null;

    if (_state[flag]) {
      closeSubPanel();
      return null;
    }
    if (anyOtherSubPanelOpen(name)) closeSubPanel();

    sb.cancelActiveStream?.();
    _state.savedChatHTML = chatPanel.innerHTML;
    resetSubPanelFlags();
    _state[flag] = true;
    chatPanel.replaceChildren();
    chatPanel.insertAdjacentHTML('afterbegin', typeof html === 'function' ? html() : html);
    onMount?.(chatPanel);
    return chatPanel;
  }

  function closeSubPanel() {
    const chatPanel = sb.$id('si18n-panel-chat');
    if (!chatPanel || _state.savedChatHTML === null) return;
    sb.cancelActiveStream?.();
    chatPanel.innerHTML = _state.savedChatHTML;
    _state.savedChatHTML = null;
    resetSubPanelFlags();
    sb._chat.restoreChatPanelEvents?.();
  }

  sb._chat.openSubPanel = openSubPanel;
  sb._chat.closeSubPanel = closeSubPanel;
  sb.registerModule?.('chat-subpanels');
})();
