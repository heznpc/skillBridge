/**
 * SkillBridge — Local Progress Dashboard
 *
 * A Tools-menu sub-panel aggregating the learner's LOCAL data only:
 * recent lessons (sb_recent), bookmarks (sb_bookmarks), and flashcard
 * progress (fc_<slug>_<lang> Leitner boxes). Everything is read from
 * chrome.storage.local — nothing leaves the device, consistent with the
 * privacy policy ("local storage only").
 *
 * Loaded after sidebar-chat.js (uses sb._chat.state / closeSubPanel) and
 * after resume/bookmarks/chat-flashcards (whose stores it reads).
 */

(function () {
  'use strict';

  const sb = window._sb;
  if (!sb) {
    console.warn('[SkillBridge] dashboard: _sb not ready');
    return;
  }
  function collectStats(cb) {
    chrome.storage.local.get(null, (all) => {
      all = all || {};
      const recent = Array.isArray(all.sb_recent) ? all.sb_recent : [];
      const bookmarks = Array.isArray(all.sb_bookmarks) ? all.sb_bookmarks : [];
      let decks = 0;
      let tracked = 0;
      let mastered = 0;
      for (const [key, val] of Object.entries(all)) {
        if (!key.startsWith('fc_') || !val || typeof val !== 'object') continue;
        const boxes = val.boxes && typeof val.boxes === 'object' ? val.boxes : {};
        const terms = Object.keys(boxes);
        if (terms.length === 0) continue;
        decks++;
        tracked += terms.length;
        for (const t of terms) if (Number(boxes[t]) >= FLASHCARD_BOX.MASTERED) mastered++;
      }
      cb({ recent, bookmarks, decks, tracked, mastered });
    });
  }

  function statRow(value, label) {
    return `
      <div class="si18n-dash-stat">
        <span class="si18n-dash-num">${value}</span>
        <span class="si18n-dash-label">${sb.escapeHtml(label)}</span>
      </div>`;
  }

  function render(stats) {
    const list = sb.$id('si18n-dash-body');
    if (!list) return;
    const L = (m) => sb.t(m) || '';
    const recentRows = stats.recent
      .slice(0, 3)
      .map(
        (r) => `
        <div class="si18n-bm-item">
          <button class="si18n-bm-open si18n-dash-open" data-url="${sb.escapeHtml(r.url || '')}" title="${sb.escapeHtml(r.url || '')}">
            <span class="si18n-bm-title">${sb.escapeHtml(r.title || r.url || '')}</span>
          </button>
        </div>`,
      )
      .join('');
    list.innerHTML = `
      <div class="si18n-dash-grid">
        ${statRow(stats.recent.length, L(DASHBOARD_LABELS.lessons))}
        ${statRow(stats.bookmarks.length, L(DASHBOARD_LABELS.bookmarks))}
        ${statRow(stats.decks, L(DASHBOARD_LABELS.decks))}
        ${statRow(`${stats.mastered}/${stats.tracked}`, L(DASHBOARD_LABELS.mastered))}
      </div>
      ${stats.recent.length ? `<div class="si18n-dash-recent-title">${sb.escapeHtml(L(RESUME_LABELS.title))}</div>${recentRows}` : `<div class="si18n-history-empty">${sb.escapeHtml(L(DASHBOARD_LABELS.empty))}</div>`}
    `;
    list.querySelectorAll('.si18n-dash-open').forEach((btn) => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.url;
        if (url && /^https?:/i.test(url)) window.location.href = url;
      });
    });
  }

  function toggleDashboardPanel() {
    const opened = sb._chat.openSubPanel(
      'dashboard',
      `
      <div class="si18n-history-header">
        <button class="si18n-history-back" id="si18n-dash-back" aria-label="${sb.t(A11Y_LABELS.backToChat)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg></button>
        <span class="si18n-history-title">${sb.t(DASHBOARD_LABELS.title)}</span>
      </div>
      <div class="si18n-history-list" id="si18n-dash-body"></div>
    `,
      () => {
        sb.$id('si18n-dash-back')?.addEventListener('click', () => sb._chat.closeSubPanel());
      },
    );
    if (!opened) return;
    collectStats(render);
  }

  sb._chat.toggleDashboardPanel = toggleDashboardPanel;
  sb._chat.collectDashboardStats = collectStats;
  sb.registerModule?.('dashboard');
})();
