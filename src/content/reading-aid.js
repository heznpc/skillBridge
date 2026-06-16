/**
 * SkillBridge — In-lesson reading aid: a top reading-progress bar + a table of
 * contents built from the lesson's headings.
 *
 * Native Academy long lessons have no within-page navigation or sense of how
 * far you've read. This adds both, DOM-only (no storage, no network). Built
 * with DOM APIs (no innerHTML) since the content is dynamic heading text.
 *
 * Loaded after content.js: uses SKILLJAR_SELECTORS, TOC_LABELS, and the
 * optional window._sb.t i18n resolver (falls back to English).
 */

(function () {
  'use strict';

  // Content scripts can re-fire on SPA navigation (see content.js); bail so we
  // don't append a second progress bar / TOC toggle or start a second timer.
  if (window.__sbReadingAid) return;
  window.__sbReadingAid = true;

  // Reading aid is host-gated (see getHostCapabilities): Skilljar lessons and
  // claude.com tutorials get it; unknown hosts don't (avoids an unconditional
  // 1s timer on a third-party page).
  const _caps = (window._sb && window._sb.hostCaps) || null;
  if (_caps && _caps.readingAid === false) return;

  // A Skilljar lesson page is a course slug + numeric lesson id (e.g.
  // /claude-101/383389). On scoped hosts (claude.com tutorials) the lesson is
  // identified by the presence of its content root instead.
  const LESSON_PATH = /\/[^/]+\/\d+/;
  const _scope = _caps && _caps.contentScope;

  function label(map, fallback) {
    const sb = window._sb;
    return (sb && sb.t && sb.t(map)) || fallback;
  }

  // The lesson container(s): the scoped root(s) on claude.com, else Skilljar's
  // lesson body (falling back to <main>). An array so the TOC builds from the
  // lesson headings only, never the surrounding page chrome.
  function lessonRoots() {
    if (_scope) return Array.from(document.querySelectorAll(_scope));
    const r =
      document.querySelector(SKILLJAR_SELECTORS.lessonMain) ||
      document.querySelector(SKILLJAR_SELECTORS.lessonContent) ||
      document.querySelector(SKILLJAR_SELECTORS.courseContent) ||
      document.querySelector('main');
    return r ? [r] : [];
  }

  function isLessonPage() {
    // Scoped hosts: a lesson is present iff its content root is in the DOM.
    if (_scope) return !!document.querySelector(_scope);
    return LESSON_PATH.test(location.pathname);
  }

  // ============================================================
  // READING-PROGRESS BAR
  // ============================================================

  const bar = document.createElement('div');
  // Own id — NOT #si18n-progress-bar (the translation-progress bar in
  // banners.js). Sharing that id made banners' getElementById grab whichever
  // bar mounted first, and the two same-specificity CSS blocks overrode each
  // other (the reading bar's `width: 0` killed the translation bar globally).
  bar.id = 'si18n-reading-bar';
  bar.setAttribute('aria-hidden', 'true');

  let rafPending = false;
  function updateProgress() {
    rafPending = false;
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    const pct = max > 0 ? Math.min(100, Math.max(0, (doc.scrollTop / max) * 100)) : 0;
    bar.style.width = pct + '%';
  }
  function onScroll() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(updateProgress);
  }

  // ============================================================
  // TABLE OF CONTENTS
  // ============================================================

  const toggle = document.createElement('button');
  toggle.id = 'si18n-toc-toggle';
  toggle.type = 'button';
  toggle.textContent = '☰'; // ☰
  toggle.setAttribute('aria-label', label(TOC_LABELS.contents, 'Contents'));

  const panel = document.createElement('div');
  panel.id = 'si18n-toc-panel';
  panel.hidden = true;

  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
  });

  function buildTOC() {
    const heads = lessonRoots()
      .flatMap((root) => Array.from(root.querySelectorAll('h2, h3')))
      .filter((h) => h.textContent.trim());
    panel.replaceChildren();
    // A TOC only earns its place once there are a couple of sections.
    if (heads.length < 2) {
      toggle.style.display = 'none';
      panel.hidden = true;
      return;
    }
    toggle.style.display = '';
    heads.forEach((h) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'si18n-toc-item' + (h.tagName === 'H3' ? ' si18n-toc-sub' : '');
      item.textContent = h.textContent.trim();
      item.addEventListener('click', () => {
        h.scrollIntoView({ behavior: 'smooth', block: 'start' });
        panel.hidden = true;
      });
      panel.appendChild(item);
    });
  }

  // ============================================================
  // MOUNT + LIFECYCLE
  // ============================================================

  let mounted = false;
  function mount() {
    if (mounted || !document.body) return;
    // The TOC toggle + panel are interactive controls that inherit the host
    // page's button/list styles, so mount them in the shadow UI root (style
    // isolation; also auto-excludes them from the translation walk). The 3px
    // reading bar stays in the light DOM: it's a plain non-interactive div
    // with no host-leak surface, so isolation buys nothing.
    document.body.appendChild(bar);
    const root = (window._sb && window._sb.uiRoot && window._sb.uiRoot()) || document.body;
    root.appendChild(toggle);
    root.appendChild(panel);
    window.addEventListener('scroll', onScroll, { passive: true });
    mounted = true;
  }

  function refresh() {
    if (!isLessonPage()) {
      // Off a lesson page (catalog / course page): hide the aids.
      if (mounted) {
        bar.style.width = '0%';
        toggle.style.display = 'none';
        panel.hidden = true;
      }
      return;
    }
    mount();
    buildTOC();
    updateProgress();
  }

  // Skilljar swaps lessons client-side, so headings change without a full
  // reload. Poll the URL (cheap string compare) and rebuild after the new
  // content settles.
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(refresh, 400);
    }
  }, 1000);

  refresh();
})();
