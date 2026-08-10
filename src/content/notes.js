/**
 * SkillBridge — Notes panel (per-lesson local notes).
 *
 * Native Academy has no note-taking of any kind. This adds one free-text
 * note per lesson: write it from the sidebar, see every note across the
 * course in a list, jump back to the lesson it belongs to.
 *
 * Local-only: state lives in `chrome.storage.local` under `sb_notes`.
 * No server, no sync (device-local by design) — same constraint as
 * bookmarks.js, which this otherwise mirrors.
 *
 * Loaded after chat-subpanels.js (provides `_sb._chat.state` + `closeSubPanel`)
 * and parallels bookmarks.js. The sidebar "notes" button (sidebar-chat.js)
 * calls `_sb._chat.toggleNotesPanel`.
 */

(function () {
  'use strict';

  const sb = window._sb;
  if (!sb) {
    console.warn('[SkillBridge] notes: _sb not ready');
    return;
  }
  if (!sb._chat || !sb._chat.state || !sb._chat.openSubPanel) {
    console.warn('[SkillBridge] notes: _sb._chat not ready (chat-subpanels.js missing?)');
    return;
  }
  const STORAGE_KEY = 'sb_notes';
  const MAX_NOTES = 200;
  const PREVIEW_MAX = 140;

  let notes = [];

  // ============================================================
  // PERSISTENCE (chrome.storage.local)
  // ============================================================

  function loadNotes(cb) {
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      notes = Array.isArray(res[STORAGE_KEY]) ? res[STORAGE_KEY] : [];
      if (cb) cb();
    });
  }

  // Serialize writes so rapid save/remove can't interleave (last-write-wins).
  let _saveQueue = Promise.resolve();
  function saveNotes() {
    const data = {};
    data[STORAGE_KEY] = notes;
    _saveQueue = _saveQueue
      .catch(() => {})
      .then(() => new Promise((resolve) => chrome.storage.local.set(data, resolve)));
  }

  // ============================================================
  // ACTIONS
  // ============================================================

  function currentNoteText() {
    const existing = notes.find((n) => n.url === location.href);
    return existing?.text || '';
  }

  // De-dupe by URL (one note per lesson; saving again overwrites and bumps
  // it to the top). An empty/whitespace-only save deletes the note instead
  // of storing a blank entry.
  function upsertCurrent(text) {
    const trimmed = (text || '').trim();
    const url = location.href;
    notes = notes.filter((n) => n.url !== url);
    if (trimmed) {
      const title = (document.title || '').trim() || sb.$('h1')?.textContent?.trim() || url;
      notes.unshift({ url, title, text: trimmed, ts: Date.now() });
      if (notes.length > MAX_NOTES) notes.length = MAX_NOTES;
    }
    saveNotes();
    renderList();
  }

  function removeAt(i) {
    if (i < 0 || i >= notes.length) return;
    notes.splice(i, 1);
    saveNotes();
    renderList();
  }

  function openNote(i) {
    const n = notes[i];
    if (!n || n.url === location.href) return;
    // Same https-only gate as bookmarks.js's openBookmark — a dangerous-scheme
    // URL can never reach location.href even if a future write path (import)
    // ever populates sb_notes from elsewhere.
    if (/^https?:/i.test(n.url)) location.href = n.url;
  }

  // ============================================================
  // PANEL
  // ============================================================

  function toggleNotesPanel() {
    const opened = sb._chat.openSubPanel(
      'notes',
      `
      <div class="si18n-history-header">
        <button class="si18n-history-back" id="si18n-note-back" aria-label="${sb.t(A11Y_LABELS.backToSidebar)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg></button>
        <span class="si18n-history-title">${sb.t(NOTE_LABELS.title)}</span>
        <button class="si18n-history-clear" id="si18n-note-add" title="${sb.t(NOTE_LABELS.addThis)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
      </div>
      <div id="si18n-note-compose"></div>
      <div class="si18n-history-list" id="si18n-note-list"></div>
    `,
      () => {
        sb.$id('si18n-note-back')?.addEventListener('click', () => sb._chat.closeSubPanel());
        sb.$id('si18n-note-add')?.addEventListener('click', showCompose);
      },
    );
    if (!opened) return;
    loadNotes(renderList);
  }

  function showCompose() {
    const host = sb.$id('si18n-note-compose');
    if (!host) return;
    const existing = currentNoteText();
    host.replaceChildren();
    host.insertAdjacentHTML(
      'afterbegin',
      `
      <div class="si18n-note-compose">
        <textarea id="si18n-note-input" class="si18n-chat-input si18n-note-textarea" placeholder="${sb.t(NOTE_LABELS.placeholder)}" rows="3">${sb.escapeHtml(existing)}</textarea>
        <div class="si18n-note-compose-actions">
          <button class="si18n-note-cancel" id="si18n-note-cancel" type="button">${sb.t(NOTE_LABELS.cancel)}</button>
          <button class="si18n-chat-send-btn" id="si18n-note-save" type="button">${sb.t(NOTE_LABELS.save)}</button>
        </div>
      </div>
    `,
    );
    const textarea = sb.$id('si18n-note-input');
    textarea?.focus();
    if (textarea) textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    sb.$id('si18n-note-cancel')?.addEventListener('click', () => host.replaceChildren());
    sb.$id('si18n-note-save')?.addEventListener('click', () => {
      upsertCurrent(sb.$id('si18n-note-input')?.value || '');
      host.replaceChildren();
    });
  }

  function previewOf(text) {
    return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX)}…` : text;
  }

  function rowsHTML() {
    if (notes.length === 0) {
      return `<div class="si18n-history-empty">${sb.t(NOTE_LABELS.empty)}</div>`;
    }
    return notes
      .map(
        (n, i) => `
      <div class="si18n-bm-item">
        <button class="si18n-bm-open" data-i="${i}" title="${sb.escapeHtml(n.url)}">
          <span class="si18n-bm-title">${sb.escapeHtml(n.title)}</span>
          <span class="si18n-note-preview">${sb.escapeHtml(previewOf(n.text))}</span>
        </button>
        <button class="si18n-bm-remove" data-i="${i}" aria-label="${sb.t(NOTE_LABELS.remove)}">&times;</button>
      </div>`,
      )
      .join('');
  }

  function renderList() {
    const list = sb.$id('si18n-note-list');
    if (!list) return;
    list.replaceChildren();
    list.insertAdjacentHTML('afterbegin', rowsHTML());
    list
      .querySelectorAll('.si18n-bm-open')
      .forEach((el) => el.addEventListener('click', () => openNote(Number(el.dataset.i))));
    list
      .querySelectorAll('.si18n-bm-remove')
      .forEach((el) => el.addEventListener('click', () => removeAt(Number(el.dataset.i))));
  }

  // ============================================================
  // EXPORT
  // ============================================================

  sb.toggleNotesPanel = toggleNotesPanel;
  sb._chat.toggleNotesPanel = toggleNotesPanel;
  sb.registerModule?.('notes');
})();
