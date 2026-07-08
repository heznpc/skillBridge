/**
 * SkillBridge — Continue / Recent lessons panel.
 *
 * Native Academy has no global "continue where you left off": the logged-in
 * home is a flat catalog and Resume is per-course only. This auto-tracks
 * visited lessons + scroll position across courses (local-only) and surfaces
 * a "Continue" sidebar sub-panel to jump straight back.
 *
 * Local-only: `chrome.storage.local` under `sb_recent`; scroll restore via
 * sessionStorage (`sb_resume_restore`) across the navigation. No server/sync.
 *
 * Loaded after chat-subpanels.js (provides `_sb._chat.state` + `closeSubPanel`),
 * parallels chat-history / chat-flashcards / bookmarks. The sidebar "recent"
 * button calls `_sb._chat.toggleRecentPanel`.
 */

(function () {
  'use strict';

  // Content scripts can re-fire on SPA navigation (see content.js); bail so we
  // don't double-bind listeners or double-record visits.
  if (window.__sbResume) return;
  window.__sbResume = true;

  const sb = window._sb;
  if (!sb) {
    console.warn('[SkillBridge] resume: _sb not ready');
    return;
  }
  if (!sb._chat || !sb._chat.state || !sb._chat.openSubPanel) {
    console.warn('[SkillBridge] resume: _sb._chat not ready (chat-subpanels.js missing?)');
    return;
  }
  const STORAGE_KEY = 'sb_recent';
  const RESTORE_KEY = 'sb_resume_restore';
  const MAX_RECENT = 20;
  // A lesson page is a course slug followed by a numeric lesson id, e.g.
  // /claude-101/383389. Course pages (/claude-101) and the catalog (/) are
  // intentionally skipped so the recent list stays lesson-only. On scoped
  // hosts (claude.com tutorials) a lesson is identified by its content root —
  // kept in lock-step with reading-aid.js's isLessonPage().
  const LESSON_PATH = /\/[^/]+\/\d+/;
  const _scope = sb.hostCaps && sb.hostCaps.contentScope;

  let recent = [];

  // ============================================================
  // SCROLL RESTORE (runs once on load if we arrived from a "continue" click)
  // ============================================================

  try {
    const raw = window.sessionStorage.getItem(RESTORE_KEY);
    if (raw) {
      window.sessionStorage.removeItem(RESTORE_KEY);
      const r = JSON.parse(raw);
      if (r && r.url === location.href && typeof r.scrollY === 'number') {
        setTimeout(() => window.scrollTo({ top: r.scrollY, behavior: 'smooth' }), 700);
      }
    }
  } catch (_e) {
    /* sessionStorage unavailable or malformed — ignore */
  }

  // ============================================================
  // PERSISTENCE (chrome.storage.local)
  // ============================================================

  // `chrome.runtime.id` goes undefined the moment the extension context is
  // invalidated (dev reload, or an auto-update while this tab stays open).
  // After that, touching `chrome.storage.*` throws "Extension context
  // invalidated" synchronously. The old code called it unguarded, so a visit
  // recorded right after an update surfaced an uncaught exception. Bail
  // quietly instead — there is no live extension to persist to anyway.
  function extensionAlive() {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  }

  function loadRecent(cb) {
    if (!extensionAlive()) {
      if (cb) cb();
      return;
    }
    try {
      chrome.storage.local.get([STORAGE_KEY], (res) => {
        if (chrome.runtime.lastError) {
          if (cb) cb();
          return;
        }
        recent = Array.isArray(res[STORAGE_KEY]) ? res[STORAGE_KEY] : [];
        if (cb) cb();
      });
    } catch {
      if (cb) cb();
    }
  }

  let _saveQueue = Promise.resolve();
  function saveRecent() {
    const data = {};
    data[STORAGE_KEY] = recent;
    _saveQueue = _saveQueue
      .catch(() => {})
      .then(
        () =>
          new Promise((resolve) => {
            if (!extensionAlive()) {
              resolve();
              return;
            }
            try {
              chrome.storage.local.set(data, () => {
                void chrome.runtime.lastError; // read to clear, ignore
                resolve();
              });
            } catch {
              resolve();
            }
          }),
      );
  }

  // ============================================================
  // TRACKING
  // ============================================================

  function isLessonPage() {
    // Scoped hosts: a lesson is present iff its content root is in the DOM.
    if (_scope) return !!document.querySelector(_scope);
    return LESSON_PATH.test(location.pathname);
  }

  function recordVisit() {
    if (!isLessonPage()) return;
    const url = location.href;
    const title = (document.title || '').trim() || document.querySelector('h1')?.textContent?.trim() || url;
    // Preserve last-left scroll position when revisiting a lesson.
    const prev = recent.find((r) => r.url === url);
    const scrollY = prev ? prev.scrollY : 0;
    recent = recent.filter((r) => r.url !== url);
    recent.unshift({ url, title, scrollY, ts: Date.now() });
    if (recent.length > MAX_RECENT) recent.length = MAX_RECENT;
    saveRecent();
  }

  // Keep the current lesson's scroll position up to date (debounced persist).
  // Keyed to location.href *at scroll time*, so SPA navigation never writes one
  // lesson's scroll onto another.
  let rafPending = false;
  let saveTimer = null;
  function onScroll() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      if (!isLessonPage()) return;
      const entry = recent.find((r) => r.url === location.href);
      if (!entry) return;
      entry.scrollY = Math.round(window.scrollY);
      entry.ts = Date.now();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveRecent, 800);
    });
  }
  // Flush any pending scroll write when the user leaves / backgrounds the page.
  function flushScroll() {
    clearTimeout(saveTimer);
    saveRecent();
  }

  // Skilljar swaps lessons client-side (pushState, no reload) and content
  // scripts may not re-run — poll the URL and record lessons reached via in-app
  // navigation. (reading-aid.js polls the same way.)
  let lastSeenUrl = location.href;
  let started = false;
  function startTracking() {
    if (started) return;
    started = true;
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushScroll();
    });
    window.addEventListener('pagehide', flushScroll);
    setInterval(() => {
      if (location.href === lastSeenUrl) return;
      lastSeenUrl = location.href;
      recordVisit();
    }, 1000);
    // Load existing recents, then record this visit (no-op off lesson pages).
    loadRecent(recordVisit);
  }

  // ============================================================
  // ACTIONS
  // ============================================================

  function openRecent(i) {
    const r = recent[i];
    if (!r) return;
    try {
      window.sessionStorage.setItem(RESTORE_KEY, JSON.stringify({ url: r.url, scrollY: r.scrollY }));
    } catch (_e) {
      /* ignore — navigation still works, just without scroll restore */
    }
    if (r.url === location.href) {
      window.scrollTo({ top: r.scrollY, behavior: 'smooth' });
    } else if (/^https?:/i.test(r.url)) {
      // Match the https-only gate the dashboard open handler already applies, so
      // a dangerous-scheme URL can never reach location.href even if a future
      // write path (import/sync) ever populates sb_recent from elsewhere.
      location.href = r.url;
    }
  }

  function removeAt(i) {
    if (i < 0 || i >= recent.length) return;
    recent.splice(i, 1);
    saveRecent();
    renderList();
  }

  // ============================================================
  // PANEL
  // ============================================================

  function toggleRecentPanel() {
    const opened = sb._chat.openSubPanel(
      'recent',
      `
      <div class="si18n-history-header">
        <button class="si18n-history-back" id="si18n-recent-back" aria-label="${sb.t(A11Y_LABELS.backToChat)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg></button>
        <span class="si18n-history-title">${sb.t(RESUME_LABELS.title)}</span>
      </div>
      <div class="si18n-history-list" id="si18n-recent-list"></div>
    `,
      () => {
        sb.$id('si18n-recent-back')?.addEventListener('click', () => sb._chat.closeSubPanel());
      },
    );
    if (!opened) return;
    loadRecent(renderList);
  }

  function rowsHTML() {
    if (recent.length === 0) {
      return `<div class="si18n-history-empty">${sb.t(RESUME_LABELS.empty)}</div>`;
    }
    return recent
      .map(
        (r, i) => `
      <div class="si18n-bm-item">
        <button class="si18n-bm-open" data-i="${i}" title="${sb.escapeHtml(r.url)}">
          <span class="si18n-bm-title">${sb.escapeHtml(r.title)}</span>
        </button>
        <button class="si18n-bm-remove" data-i="${i}" aria-label="${sb.t(BOOKMARK_LABELS.remove)}">&times;</button>
      </div>`,
      )
      .join('');
  }

  function renderList() {
    const list = sb.$id('si18n-recent-list');
    if (!list) return;
    list.replaceChildren();
    list.insertAdjacentHTML('afterbegin', rowsHTML());
    list
      .querySelectorAll('.si18n-bm-open')
      .forEach((el) => el.addEventListener('click', () => openRecent(Number(el.dataset.i))));
    list
      .querySelectorAll('.si18n-bm-remove')
      .forEach((el) => el.addEventListener('click', () => removeAt(Number(el.dataset.i))));
  }

  // ============================================================
  // INIT + EXPORT
  // ============================================================

  if (sb.whenActive) sb.whenActive(startTracking);
  else startTracking();

  sb.toggleRecentPanel = toggleRecentPanel;
  sb._chat.toggleRecentPanel = toggleRecentPanel;
  sb.registerModule?.('resume');
})();
