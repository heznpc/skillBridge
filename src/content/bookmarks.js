/**
 * SkillBridge — Bookmarks panel (lesson + scroll-position bookmarks).
 *
 * Native Academy only bookmarks whole courses and offers no list view.
 * This adds per-lesson, per-position bookmarks: mark the current lesson at
 * the current scroll position, see them all in a sidebar sub-panel, and jump
 * back (best-effort scroll restore via sessionStorage across the navigation).
 *
 * Local-only: state lives in `chrome.storage.local` under `sb_bookmarks`.
 * No server, no sync (device-local by design).
 *
 * Loaded after sidebar-chat.js (provides `_sb._chat.state` + `closeSubPanel`)
 * and parallels chat-history.js / chat-flashcards.js. The sidebar "bookmark"
 * button (sidebar-chat.js) calls `_sb._chat.toggleBookmarksPanel`.
 */

(function () {
  'use strict';

  const sb = window._sb;
  if (!sb) {
    console.warn('[SkillBridge] bookmarks: _sb not ready');
    return;
  }
  if (!sb._chat || !sb._chat.state || !sb._chat.closeSubPanel) {
    console.warn('[SkillBridge] bookmarks: _sb._chat not ready (sidebar-chat.js missing?)');
    return;
  }
  const _state = sb._chat.state;

  const STORAGE_KEY = 'sb_bookmarks';
  const RESTORE_KEY = 'sb_bookmark_restore';
  const MAX_BOOKMARKS = 200;

  let bookmarks = [];

  // ============================================================
  // SCROLL RESTORE (runs once on load if we navigated here from a bookmark)
  // ============================================================

  try {
    const raw = window.sessionStorage.getItem(RESTORE_KEY);
    if (raw) {
      window.sessionStorage.removeItem(RESTORE_KEY);
      const r = JSON.parse(raw);
      if (r && r.url === location.href && typeof r.scrollY === 'number') {
        // Wait for content (and translation) to settle before scrolling.
        setTimeout(() => window.scrollTo({ top: r.scrollY, behavior: 'smooth' }), 700);
      }
    }
  } catch (_e) {
    /* sessionStorage unavailable or malformed — ignore */
  }

  // ============================================================
  // PERSISTENCE (chrome.storage.local)
  // ============================================================

  function loadBookmarks(cb) {
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      bookmarks = Array.isArray(res[STORAGE_KEY]) ? res[STORAGE_KEY] : [];
      if (cb) cb();
    });
  }

  // Serialize writes so rapid add/remove can't interleave (last-write-wins).
  let _saveQueue = Promise.resolve();
  function saveBookmarks() {
    const data = {};
    data[STORAGE_KEY] = bookmarks;
    _saveQueue = _saveQueue
      .catch(() => {})
      .then(() => new Promise((resolve) => chrome.storage.local.set(data, resolve)));
  }

  // ============================================================
  // ACTIONS
  // ============================================================

  function addCurrent() {
    const url = location.href;
    const title = (document.title || '').trim() || sb.$('h1')?.textContent?.trim() || url;
    // De-dupe by URL (re-bookmarking a lesson updates its position + bumps it
    // to the top).
    bookmarks = bookmarks.filter((b) => b.url !== url);
    bookmarks.unshift({ url, title, scrollY: Math.round(window.scrollY), ts: Date.now() });
    if (bookmarks.length > MAX_BOOKMARKS) bookmarks.length = MAX_BOOKMARKS;
    saveBookmarks();
    renderList();
  }

  function removeAt(i) {
    if (i < 0 || i >= bookmarks.length) return;
    bookmarks.splice(i, 1);
    saveBookmarks();
    renderList();
  }

  function openBookmark(i) {
    const b = bookmarks[i];
    if (!b) return;
    try {
      window.sessionStorage.setItem(RESTORE_KEY, JSON.stringify({ url: b.url, scrollY: b.scrollY }));
    } catch (_e) {
      /* ignore — navigation still works, just without scroll restore */
    }
    if (b.url === location.href) {
      window.scrollTo({ top: b.scrollY, behavior: 'smooth' });
    } else {
      location.href = b.url;
    }
  }

  // ============================================================
  // PANEL
  // ============================================================

  function toggleBookmarksPanel() {
    const chatPanel = sb.$id('si18n-panel-chat');
    if (!chatPanel) return;

    if (_state.bookmarksPanelOpen) {
      sb._chat.closeSubPanel();
      return;
    }
    // Another sub-panel may be open; restore the chat first so savedChatHTML
    // captures the chat, not the other panel.
    if (_state.historyPanelOpen || _state.flashcardPanelOpen || _state.recentPanelOpen || _state.dashboardPanelOpen) {
      sb._chat.closeSubPanel();
    }

    _state.bookmarksPanelOpen = true;
    _state.savedChatHTML = chatPanel.innerHTML;

    chatPanel.replaceChildren();
    chatPanel.insertAdjacentHTML(
      'afterbegin',
      `
      <div class="si18n-history-header">
        <button class="si18n-history-back" id="si18n-bm-back" aria-label="${sb.t(A11Y_LABELS.backToChat)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg></button>
        <span class="si18n-history-title">${sb.t(BOOKMARK_LABELS.title)}</span>
        <button class="si18n-history-clear" id="si18n-bm-add" title="${sb.t(BOOKMARK_LABELS.addThis)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
      </div>
      <div class="si18n-history-list" id="si18n-bm-list"></div>
    `,
    );

    sb.$id('si18n-bm-back')?.addEventListener('click', () => sb._chat.closeSubPanel());
    sb.$id('si18n-bm-add')?.addEventListener('click', addCurrent);
    loadBookmarks(renderList);
  }

  function rowsHTML() {
    if (bookmarks.length === 0) {
      return `<div class="si18n-history-empty">${sb.t(BOOKMARK_LABELS.empty)}</div>`;
    }
    return bookmarks
      .map(
        (b, i) => `
      <div class="si18n-bm-item">
        <button class="si18n-bm-open" data-i="${i}" title="${sb.escapeHtml(b.url)}">
          <span class="si18n-bm-title">${sb.escapeHtml(b.title)}</span>
        </button>
        <button class="si18n-bm-remove" data-i="${i}" aria-label="${sb.t(BOOKMARK_LABELS.remove)}">&times;</button>
      </div>`,
      )
      .join('');
  }

  function renderList() {
    const list = sb.$id('si18n-bm-list');
    if (!list) return;
    list.replaceChildren();
    list.insertAdjacentHTML('afterbegin', rowsHTML());
    list
      .querySelectorAll('.si18n-bm-open')
      .forEach((el) => el.addEventListener('click', () => openBookmark(Number(el.dataset.i))));
    list
      .querySelectorAll('.si18n-bm-remove')
      .forEach((el) => el.addEventListener('click', () => removeAt(Number(el.dataset.i))));
  }

  // ============================================================
  // EXPORT
  // ============================================================

  sb.toggleBookmarksPanel = toggleBookmarksPanel;
  sb._chat.toggleBookmarksPanel = toggleBookmarksPanel;
})();
