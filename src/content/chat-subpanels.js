/**
 * SkillBridge - Shared chat sub-panel state machine.
 *
 * Owns the panel switcher used by history, flashcards, bookmarks, recent
 * lessons, and dashboard modules. The base surface is either the Tutor chat
 * or the translation-only language panel, depending on host capabilities.
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
    savedChatDraft: null,
    historyPanelOpen: false,
    flashcardPanelOpen: false,
    bookmarksPanelOpen: false,
    notesPanelOpen: false,
    reportsPanelOpen: false,
    recentPanelOpen: false,
    dashboardPanelOpen: false,
    byoaPanelOpen: false,
  };
  const _state = sb._chat.state;
  if (!Object.hasOwn(_state, 'savedChatDraft')) _state.savedChatDraft = null;
  const SUB_PANEL_FLAGS = {
    history: 'historyPanelOpen',
    flashcard: 'flashcardPanelOpen',
    bookmarks: 'bookmarksPanelOpen',
    notes: 'notesPanelOpen',
    reports: 'reportsPanelOpen',
    recent: 'recentPanelOpen',
    dashboard: 'dashboardPanelOpen',
    byoa: 'byoaPanelOpen',
  };

  function resetSubPanelFlags() {
    for (const flag of Object.values(SUB_PANEL_FLAGS)) _state[flag] = false;
  }

  function anyOtherSubPanelOpen(name) {
    const currentFlag = SUB_PANEL_FLAGS[name];
    return Object.values(SUB_PANEL_FLAGS).some((flag) => flag !== currentFlag && _state[flag]);
  }

  function getBasePanel() {
    return sb.$('.si18n-panel-chat, .si18n-panel-lang');
  }

  function openSubPanel(name, html, onMount) {
    const flag = SUB_PANEL_FLAGS[name];
    if (!flag) {
      console.warn('[SkillBridge] Unknown sub-panel:', name);
      return null;
    }

    const basePanel = getBasePanel();
    if (!basePanel) return null;

    if (_state[flag]) {
      closeSubPanel();
      return null;
    }
    if (anyOtherSubPanelOpen(name)) closeSubPanel();

    sb.cancelActiveStream?.();
    _state.savedChatHTML = basePanel.innerHTML;
    _state.savedChatDraft = basePanel.querySelector('#si18n-chat-input')?.value ?? null;
    resetSubPanelFlags();
    _state[flag] = true;
    basePanel.replaceChildren();
    basePanel.insertAdjacentHTML('afterbegin', typeof html === 'function' ? html() : html);
    onMount?.(basePanel);
    return basePanel;
  }

  function closeSubPanel() {
    const basePanel = getBasePanel();
    if (!basePanel || _state.savedChatHTML === null) return;
    sb.cancelActiveStream?.();
    basePanel.innerHTML = _state.savedChatHTML;
    _state.savedChatHTML = null;
    const restoredInput = basePanel.querySelector('#si18n-chat-input');
    if (restoredInput && _state.savedChatDraft !== null) restoredInput.value = _state.savedChatDraft;
    _state.savedChatDraft = null;
    resetSubPanelFlags();
    sb._chat.restoreChatPanelEvents?.();
    sb.updateLocalizedLabels?.();
  }

  sb._chat.openSubPanel = openSubPanel;
  sb._chat.closeSubPanel = closeSubPanel;
  sb.registerModule?.('chat-subpanels');
})();
