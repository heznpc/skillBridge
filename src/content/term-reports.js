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
  const feedback = window._sbTranslationFeedback;
  if (!feedback || !feedback.normalizeReports || !feedback.makeFeedbackReport) {
    console.warn('[SkillBridge] term-reports: _sbTranslationFeedback not ready');
    return;
  }
  const STORAGE_KEY = 'sb_term_reports';
  const MAX_REPORTS = 200;
  const PREVIEW_MAX = 140;

  let reports = [];

  function storageError(operation) {
    const lastError = chrome.runtime?.lastError;
    return lastError ? new Error(`Term reports ${operation} failed: ${lastError.message || 'storage error'}`) : null;
  }

  function warnStorageError(error) {
    console.warn('[SkillBridge] Term reports storage unavailable:', error?.message || error);
  }

  function stringOr(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
  }

  /** Add page metadata at the content boundary; the core factory stays pure. */
  function makePageReport(input) {
    const url = location.href;
    const title = (document.title || '').trim() || sb.$('h1')?.textContent?.trim() || url;
    return feedback.makeFeedbackReport({
      ...input,
      url,
      title,
      lang: sb.currentLang || '',
      ts: Date.now(),
    });
  }

  // ============================================================
  // PERSISTENCE (chrome.storage.local)
  // ============================================================

  // Serialize writes so rapid add/remove can't interleave (last-write-wins).
  let _saveQueue = Promise.resolve();
  function writeReports(snapshot) {
    const data = {};
    // Never hand storage the live mutable queue. A second add/remove may run
    // while an earlier callback is pending, but that earlier write must keep
    // representing the state at which it was queued.
    data[STORAGE_KEY] = snapshot;
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        const error = storageError('write');
        if (error) reject(error);
        else resolve();
      });
    });
  }

  function enqueueWrite(operation) {
    const queued = _saveQueue.catch(() => {}).then(operation);
    // The caller receives `queued` (and therefore the real failure), while the
    // internal tail must always settle successfully so one rejected write
    // neither becomes an unhandled child promise nor poisons later retries.
    _saveQueue = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }

  function saveReports(snapshot = reports.slice()) {
    return enqueueWrite(() => writeReports(snapshot));
  }

  /** Persist first, then publish the new queue to memory and UI. */
  function mutateReports(buildMutation) {
    return enqueueWrite(async () => {
      const mutation = buildMutation(reports);
      if (!mutation) return false;
      await writeReports(mutation.records);
      reports = mutation.records;
      renderList();
      return mutation.result;
    });
  }

  function readStoredReports() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([STORAGE_KEY], (res) => {
        const error = storageError('read');
        if (error) reject(error);
        else resolve(res?.[STORAGE_KEY]);
      });
    });
  }

  // One readiness boundary owns the entire load. Every panel/action shares it:
  // storage -> feedback schema -> lesson identity table -> identity migration.
  // If either migration changes the records, their combined result is written
  // once, through the same serialized queue used by later actions.
  const ready = readStoredReports().then(async (stored) => {
    const normalized = feedback.normalizeReports(stored);
    reports = normalized.records.slice(0, MAX_REPORTS);
    let changed = normalized.changed;
    if (normalized.records.length > MAX_REPORTS) changed = true;

    if (sb.identity) {
      try {
        await sb.identity.ready();
      } catch (_e) {
        // Identity readiness is best-effort; migrate() safely retains URL
        // identity when its lookup table could not load.
      }
      // Future feedback-schema rows are opaque. Passing them through today's
      // lesson-identity migration could add fields whose meaning collides with
      // a future reader, so migrate only records this version understands and
      // splice them back into their original positions.
      const currentReports = reports.filter((report) => report.reportSchemaVersion === feedback.REPORT_SCHEMA_VERSION);
      if (currentReports.length > 0) {
        const migrated = sb.identity.migrate(currentReports);
        if (migrated && Array.isArray(migrated.records) && migrated.changed) {
          let currentIndex = 0;
          reports = reports.map((report) =>
            report.reportSchemaVersion === feedback.REPORT_SCHEMA_VERSION ? migrated.records[currentIndex++] : report,
          );
          changed = true;
        }
      }
    }

    if (changed) await saveReports(reports.slice());
    return reports;
  });

  function persistReport(record) {
    return ready.then(() => {
      // `ready` may wait for the identity table. Stamp against the URL captured
      // in the record, not the live Location, which can already point at the
      // next SPA lesson by the time the promise resumes.
      const stamped = sb.identity ? sb.identity.stamp(record, record.url || location.href) : record;
      return mutateReports((current) => ({
        records: [stamped, ...current].slice(0, MAX_REPORTS),
        result: stamped,
      }));
    });
  }

  // ============================================================
  // ACTIONS
  // ============================================================

  function recordTranslationFeedback(pair, signal, correction = '') {
    const record = makePageReport({
      ...(pair && typeof pair === 'object' ? pair : {}),
      capture: 'selection',
      signal,
      correction,
    });
    return record ? persistReport(record) : Promise.resolve(false);
  }

  function addManualReport(wrongText, correction) {
    const record = makePageReport({
      capture: 'manual',
      signal: 'negative',
      originalText: null,
      translatedText: wrongText,
      selectedText: wrongText,
      wrongText,
      correction,
    });
    return record ? persistReport(record) : Promise.resolve(false);
  }

  function removeAt(i) {
    return ready.then(() => {
      if (i < 0 || i >= reports.length) return false;
      // Capture what the learner clicked before entering the write queue. A
      // pending add may prepend a row before this mutation executes; deleting
      // by the old numeric index would then remove that new feedback instead.
      const target = reports[i];
      return mutateReports((current) => {
        const targetIndex = current.indexOf(target);
        if (targetIndex < 0) return null;
        const next = current.slice();
        next.splice(targetIndex, 1);
        return { records: next, result: true };
      });
    });
  }

  // ============================================================
  // EXPORT
  // ============================================================

  // Plain client-side download (Blob + <a download>) — no chrome.downloads
  // permission needed, consistent with this extension's minimal-permission
  // stance (pdf-export.js similarly avoids it via a print window instead).
  function exportReports() {
    // Snapshot only after every operation that was pending when export was
    // requested has settled. Failed mutations leave `reports` unchanged, so
    // this exports the last committed queue in either outcome.
    return ready
      .then(() => _saveQueue)
      .then(() => {
        const payload = JSON.stringify(reports.slice(), null, 2);
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `skillbridge-term-reports-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
  }

  // ============================================================
  // PANEL
  // ============================================================

  function mountReportsPanel() {
    return sb._chat.openSubPanel(
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
        sb.$id('si18n-report-add')?.addEventListener('click', () => showCompose());
        sb.$id('si18n-report-export')?.addEventListener('click', () => exportReports().catch(warnStorageError));
      },
    );
  }

  function toggleReportsPanel() {
    const opened = mountReportsPanel();
    if (!opened) return false;
    ready.then(renderList).catch(warnStorageError);
    return true;
  }

  function showCompose(pair = null) {
    const host = sb.$id('si18n-report-compose');
    if (!host) return;
    const selection = Boolean(pair && typeof pair === 'object');
    host.replaceChildren();
    host.insertAdjacentHTML(
      'afterbegin',
      `
      <div class="si18n-note-compose">
        ${
          selection
            ? `<label class="si18n-report-compose-label" for="si18n-report-original">${sb.t(REPORT_LABELS.original)}</label>
        <textarea id="si18n-report-original" class="si18n-chat-input si18n-note-textarea" rows="2" readonly></textarea>
        <label class="si18n-report-compose-label" for="si18n-report-translation">${sb.t(REPORT_LABELS.translation)}</label>
        <textarea id="si18n-report-translation" class="si18n-chat-input si18n-note-textarea" rows="2" readonly></textarea>
        <label class="si18n-report-compose-label" for="si18n-report-wrong">${sb.t(REPORT_LABELS.selected)}</label>`
            : ''
        }
        <input id="si18n-report-wrong" class="si18n-chat-input si18n-note-textarea" type="text" placeholder="${sb.t(selection ? REPORT_LABELS.selected : REPORT_LABELS.wrongPlaceholder)}">
        <textarea id="si18n-report-correction" class="si18n-chat-input si18n-note-textarea" placeholder="${sb.t(REPORT_LABELS.correctionPlaceholder)}" rows="2"></textarea>
        <div class="si18n-note-compose-actions">
          <button class="si18n-note-cancel" id="si18n-report-cancel" type="button">${sb.t(REPORT_LABELS.cancel)}</button>
          <button class="si18n-chat-send-btn" id="si18n-report-save" type="button">${sb.t(REPORT_LABELS.save)}</button>
        </div>
      </div>
    `,
    );
    if (selection) {
      const original = sb.$id('si18n-report-original');
      const translation = sb.$id('si18n-report-translation');
      const selected = sb.$id('si18n-report-wrong');
      if (original) original.value = stringOr(pair.originalText);
      if (translation) translation.value = stringOr(pair.translatedText);
      if (selected) selected.value = stringOr(pair.selectedText, stringOr(pair.translatedText));
    }
    sb.$id('si18n-report-wrong')?.focus();
    sb.$id('si18n-report-cancel')?.addEventListener('click', () => host.replaceChildren());
    const saveButton = sb.$id('si18n-report-save');
    let saving = false;
    saveButton?.addEventListener('click', () => {
      if (saving) return;
      saving = true;
      saveButton.disabled = true;
      const wrong = sb.$id('si18n-report-wrong')?.value || '';
      const correction = sb.$id('si18n-report-correction')?.value || '';
      const write = selection
        ? recordTranslationFeedback(
            {
              originalText: sb.$id('si18n-report-original')?.value || '',
              translatedText: sb.$id('si18n-report-translation')?.value || '',
              selectedText: wrong,
            },
            'negative',
            correction,
          )
        : addManualReport(wrong, correction);
      const allowRetry = () => {
        saving = false;
        if (saveButton.isConnected) saveButton.disabled = false;
      };
      write.then(
        (saved) => {
          if (saved && host.isConnected) host.replaceChildren();
          else allowRetry();
        },
        (error) => {
          warnStorageError(error);
          allowRetry();
        },
      );
    });
  }

  function composeTranslationFeedback(pair) {
    const valid = makePageReport({
      ...(pair && typeof pair === 'object' ? pair : {}),
      capture: 'selection',
      signal: 'negative',
      correction: '',
    });
    if (!valid) return Promise.resolve(false);

    if (!sb._chat.state.reportsPanelOpen && !mountReportsPanel()) return Promise.resolve(false);
    showCompose(pair);
    return ready.then(() => {
      renderList();
      return true;
    });
  }

  function previewOf(text) {
    const value = stringOr(text);
    return value.length > PREVIEW_MAX ? `${value.slice(0, PREVIEW_MAX)}…` : value;
  }

  function rowsHTML() {
    if (reports.length === 0) {
      return `<div class="si18n-history-empty">${sb.t(REPORT_LABELS.empty)}</div>`;
    }
    return reports
      .map((r, i) => {
        const selected = r.selectedText || r.translatedText || r.wrongText || '';
        const source = r.originalText || '';
        const translation = r.translatedText || r.wrongText || '';
        const isSelection = r.capture === 'selection';
        const signal = sb.t(r.signal === 'positive' ? REPORT_LABELS.helpful : REPORT_LABELS.needsWork);
        return `
      <div class="si18n-bm-item si18n-report-item" data-report-capture="${sb.escapeHtml(r.capture)}" data-report-signal="${sb.escapeHtml(r.signal)}">
        <span class="si18n-bm-open" title="${sb.escapeHtml(r.url)}">
          <span class="si18n-bm-title">${sb.escapeHtml(selected)}</span>
          <span class="si18n-note-preview" data-report-field="correction">${sb.escapeHtml(r.correction ? previewOf(r.correction) : '')}</span>
          ${
            isSelection
              ? `<span class="si18n-report-signal" data-report-field="signal" data-signal="${sb.escapeHtml(r.signal)}">${sb.escapeHtml(signal)}</span>
          <span class="si18n-note-preview si18n-report-evidence" data-report-field="source">${sb.escapeHtml(sb.t(REPORT_LABELS.original))}: ${sb.escapeHtml(previewOf(source))}</span>
          <span class="si18n-note-preview si18n-report-evidence" data-report-field="translation">${sb.escapeHtml(sb.t(REPORT_LABELS.translation))}: ${sb.escapeHtml(previewOf(translation))}</span>`
              : ''
          }
        </span>
        <button class="si18n-bm-remove" data-i="${i}" aria-label="${sb.t(REPORT_LABELS.remove)}">&times;</button>
      </div>`;
      })
      .join('');
  }

  function renderList() {
    const list = sb.$id('si18n-report-list');
    if (!list) return;
    list.replaceChildren();
    list.insertAdjacentHTML('afterbegin', rowsHTML());
    list
      .querySelectorAll('.si18n-bm-remove')
      .forEach((el) => el.addEventListener('click', () => removeAt(Number(el.dataset.i)).catch(warnStorageError)));
  }

  // ============================================================
  // EXPORT (module namespace)
  // ============================================================

  sb.toggleReportsPanel = toggleReportsPanel;
  sb._chat.toggleReportsPanel = toggleReportsPanel;
  sb._chat.recordTranslationFeedback = recordTranslationFeedback;
  sb._chat.composeTranslationFeedback = composeTranslationFeedback;
  sb.registerModule?.('term-reports');
})();
