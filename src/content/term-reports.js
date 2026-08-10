/**
 * SkillBridge — Term reports panel ("Report wrong term").
 *
 * Local-only queue for flagging a mistranslated term/phrase, plus an
 * optional note on what it should say instead. GitHub auto-filing is
 * explicitly deferred (the learner audience is not GitHub users) — this is
 * just a queue the user can review and export themselves.
 *
 * Unlike bookmarks/notes (one entry per lesson, de-duped by URL), reports
 * are an append-only queue: the same lesson can have several distinct wrong
 * terms flagged, so every save adds a new entry.
 *
 * Local-only: state lives in `chrome.storage.local` under `sb_term_reports`.
 * No server, no auto-submission anywhere.
 *
 * Loaded after chat-subpanels.js (provides `_sb._chat.state` + `closeSubPanel`)
 * and parallels bookmarks.js / notes.js. The sidebar "reports" button
 * (sidebar-chat.js) calls `_sb._chat.toggleReportsPanel`.
 */

(function () {
  'use strict';

  const sb = window._sb;
  if (!sb) {
    console.warn('[SkillBridge] term-reports: _sb not ready');
    return;
  }
  if (!sb._chat || !sb._chat.state || !sb._chat.openSubPanel) {
    console.warn('[SkillBridge] term-reports: _sb._chat not ready (chat-subpanels.js missing?)');
    return;
  }
  const STORAGE_KEY = 'sb_term_reports';
  const MAX_REPORTS = 200;
  const PREVIEW_MAX = 140;

  let reports = [];

  // ============================================================
  // PERSISTENCE (chrome.storage.local)
  // ============================================================

  function loadReports(cb) {
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      reports = Array.isArray(res[STORAGE_KEY]) ? res[STORAGE_KEY] : [];
      if (cb) cb();
    });
  }

  // Serialize writes so rapid add/remove can't interleave (last-write-wins).
  let _saveQueue = Promise.resolve();
  function saveReports() {
    const data = {};
    data[STORAGE_KEY] = reports;
    _saveQueue = _saveQueue
      .catch(() => {})
      .then(() => new Promise((resolve) => chrome.storage.local.set(data, resolve)));
  }

  // ============================================================
  // ACTIONS
  // ============================================================

  // Append-only: no de-dupe, since one lesson can have several distinct
  // wrong terms. A blank wrongText is not a reportable entry.
  function addReport(wrongText, correction) {
    const trimmedWrong = (wrongText || '').trim();
    if (!trimmedWrong) return false;
    const title = (document.title || '').trim() || sb.$('h1')?.textContent?.trim() || location.href;
    reports.unshift({
      wrongText: trimmedWrong,
      correction: (correction || '').trim(),
      url: location.href,
      title,
      lang: sb.currentLang || '',
      ts: Date.now(),
    });
    if (reports.length > MAX_REPORTS) reports.length = MAX_REPORTS;
    saveReports();
    renderList();
    return true;
  }

  function removeAt(i) {
    if (i < 0 || i >= reports.length) return;
    reports.splice(i, 1);
    saveReports();
    renderList();
  }

  // ============================================================
  // EXPORT
  // ============================================================

  // Plain client-side download (Blob + <a download>) — no chrome.downloads
  // permission needed, consistent with this extension's minimal-permission
  // stance (pdf-export.js similarly avoids it via a print window instead).
  function exportReports() {
    const payload = JSON.stringify(reports, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `skillbridge-term-reports-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ============================================================
  // PANEL
  // ============================================================

  function toggleReportsPanel() {
    const opened = sb._chat.openSubPanel(
      'reports',
      `
      <div class="si18n-history-header">
        <button class="si18n-history-back" id="si18n-report-back" aria-label="${sb.t(A11Y_LABELS.backToSidebar)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg></button>
        <span class="si18n-history-title">${sb.t(REPORT_LABELS.title)}</span>
        <button class="si18n-history-clear" id="si18n-report-export" title="${sb.t(REPORT_LABELS.export)}" aria-label="${sb.t(REPORT_LABELS.export)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
        <button class="si18n-history-clear" id="si18n-report-add" title="${sb.t(REPORT_LABELS.addThis)}" aria-label="${sb.t(REPORT_LABELS.addThis)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
      </div>
      <div id="si18n-report-compose"></div>
      <div class="si18n-history-list" id="si18n-report-list"></div>
    `,
      () => {
        sb.$id('si18n-report-back')?.addEventListener('click', () => sb._chat.closeSubPanel());
        sb.$id('si18n-report-add')?.addEventListener('click', showCompose);
        sb.$id('si18n-report-export')?.addEventListener('click', exportReports);
      },
    );
    if (!opened) return;
    loadReports(renderList);
  }

  function showCompose() {
    const host = sb.$id('si18n-report-compose');
    if (!host) return;
    host.replaceChildren();
    host.insertAdjacentHTML(
      'afterbegin',
      `
      <div class="si18n-note-compose">
        <input id="si18n-report-wrong" class="si18n-chat-input si18n-note-textarea" type="text" placeholder="${sb.t(REPORT_LABELS.wrongPlaceholder)}">
        <textarea id="si18n-report-correction" class="si18n-chat-input si18n-note-textarea" placeholder="${sb.t(REPORT_LABELS.correctionPlaceholder)}" rows="2"></textarea>
        <div class="si18n-note-compose-actions">
          <button class="si18n-note-cancel" id="si18n-report-cancel" type="button">${sb.t(REPORT_LABELS.cancel)}</button>
          <button class="si18n-chat-send-btn" id="si18n-report-save" type="button">${sb.t(REPORT_LABELS.save)}</button>
        </div>
      </div>
    `,
    );
    sb.$id('si18n-report-wrong')?.focus();
    sb.$id('si18n-report-cancel')?.addEventListener('click', () => host.replaceChildren());
    sb.$id('si18n-report-save')?.addEventListener('click', () => {
      const wrong = sb.$id('si18n-report-wrong')?.value || '';
      const correction = sb.$id('si18n-report-correction')?.value || '';
      if (addReport(wrong, correction)) host.replaceChildren();
    });
  }

  function previewOf(text) {
    return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX)}…` : text;
  }

  function rowsHTML() {
    if (reports.length === 0) {
      return `<div class="si18n-history-empty">${sb.t(REPORT_LABELS.empty)}</div>`;
    }
    return reports
      .map(
        (r, i) => `
      <div class="si18n-bm-item">
        <span class="si18n-bm-open" title="${sb.escapeHtml(r.url)}">
          <span class="si18n-bm-title">${sb.escapeHtml(r.wrongText)}</span>
          <span class="si18n-note-preview">${sb.escapeHtml(r.correction ? previewOf(r.correction) : '')}</span>
        </span>
        <button class="si18n-bm-remove" data-i="${i}" aria-label="${sb.t(REPORT_LABELS.remove)}">&times;</button>
      </div>`,
      )
      .join('');
  }

  function renderList() {
    const list = sb.$id('si18n-report-list');
    if (!list) return;
    list.replaceChildren();
    list.insertAdjacentHTML('afterbegin', rowsHTML());
    list
      .querySelectorAll('.si18n-bm-remove')
      .forEach((el) => el.addEventListener('click', () => removeAt(Number(el.dataset.i))));
  }

  // ============================================================
  // EXPORT (module namespace)
  // ============================================================

  sb.toggleReportsPanel = toggleReportsPanel;
  sb._chat.toggleReportsPanel = toggleReportsPanel;
  sb.registerModule?.('term-reports');
})();
