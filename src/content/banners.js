/**
 * SkillBridge — Banner UI
 *
 * Pure DOM banner registry split out of content.js. Loaded after content.js
 * so it can read live language and helper state via `window._sb.t`.
 * Functions attach back onto `window._sb` so call sites only change shape,
 * not semantics.
 *
 * Term-preview stays in content.js because it needs translator state and
 * FLASHCARD_COURSE_SLUGS_SORTED resolution.
 */

/* global TRANSLATION_UNAVAILABLE_LABELS */

(function () {
  const sb = window._sb;
  if (!sb) {
    console.warn('[SkillBridge] banners.js loaded before content.js — _sb namespace missing');
    return;
  }

  // Guard: extension auto-update / dev reload re-runs content scripts.
  // Without this marker we'd attach a second listener for each event each
  // time, causing N banners per fire after N reloads (mirrors the
  // history.pushState __sb_wrapped__ guard in content.js).
  if (sb.__bannersLoaded) return;
  sb.__bannersLoaded = true;

  let offlineHideTimer = null;
  let offlineCoverage = {
    generation: -1,
    hasCached: false,
    hasMissing: false,
  };
  let translationUnavailable = false;

  // Build a transient banner element and animate it in. Used for the
  // five "small toast" cases below; translation progress is its own
  // shape (two coordinated elements, dynamic content) and doesn't fit.
  function showSimpleBanner({ id, className, role, ariaLive, labels, autoDismissMs }) {
    if (document.getElementById(id)) return;
    const banner = document.createElement('div');
    banner.id = id;
    banner.className = className;
    banner.setAttribute('role', role);
    if (ariaLive) banner.setAttribute('aria-live', ariaLive);
    banner.textContent = sb.t(labels);
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('visible'));
    if (autoDismissMs) {
      setTimeout(() => {
        banner.classList.remove('visible');
        setTimeout(() => banner.remove(), 300);
      }, autoDismissMs);
    }
  }

  function getOfflineCoverageState() {
    if (offlineCoverage.hasCached && offlineCoverage.hasMissing) return 'partial';
    if (offlineCoverage.hasCached) return 'cacheOnly';
    if (offlineCoverage.hasMissing) return 'missOnly';
    return 'unknown';
  }

  function showPersistentStatusBanner(state, labels) {
    if (offlineHideTimer) {
      clearTimeout(offlineHideTimer);
      offlineHideTimer = null;
    }

    let banner = document.getElementById('si18n-offline-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'si18n-offline-banner';
      banner.className = 'si18n-offline-banner';
      banner.setAttribute('role', 'status');
      banner.setAttribute('aria-live', 'polite');
      document.body.appendChild(banner);
    }

    banner.dataset.status = state;
    banner.textContent = sb.t(labels);
    requestAnimationFrame(() => {
      if (banner.isConnected && !offlineHideTimer) banner.classList.add('visible');
    });
  }

  function showOfflineBanner() {
    const coverageState = getOfflineCoverageState();
    showPersistentStatusBanner(coverageState, OFFLINE_LABELS[coverageState]);
  }

  function hideOfflineBanner() {
    const banner = document.getElementById('si18n-offline-banner');
    if (!banner) return;
    banner.classList.remove('visible');
    if (offlineHideTimer) clearTimeout(offlineHideTimer);
    offlineHideTimer = setTimeout(() => {
      banner.remove();
      offlineHideTimer = null;
    }, 300);
  }

  function refreshOfflineBanner() {
    const offline = typeof sb.isOffline === 'boolean' ? sb.isOffline : navigator.onLine === false;
    if (offline) showOfflineBanner();
    else if (translationUnavailable) {
      showPersistentStatusBanner('translationUnavailable', TRANSLATION_UNAVAILABLE_LABELS);
    } else hideOfflineBanner();
  }

  document.addEventListener('skillbridge:offlinecoverage', (event) => {
    const detail = event?.detail;
    if (!detail || typeof detail !== 'object') return;

    const generation = Number.isSafeInteger(detail.generation) ? detail.generation : offlineCoverage.generation;
    if (generation < offlineCoverage.generation) return;

    if (generation > offlineCoverage.generation) {
      offlineCoverage = {
        generation,
        hasCached: detail.hasCached === true,
        hasMissing: detail.hasMissing === true,
      };
    } else {
      offlineCoverage.hasCached ||= detail.hasCached === true;
      offlineCoverage.hasMissing ||= detail.hasMissing === true;
    }

    refreshOfflineBanner();
  });

  document.addEventListener('skillbridge:translationunavailable', () => {
    translationUnavailable = true;
    refreshOfflineBanner();
  });

  document.addEventListener('skillbridge:translationavailable', () => {
    translationUnavailable = false;
    refreshOfflineBanner();
  });

  // content.js owns the live `isOffline` state; these listeners make the
  // banner independently reliable at startup and keep online teardown
  // idempotent if content.js also calls the public helpers.
  window.addEventListener('offline', refreshOfflineBanner);
  // Browser connectivity returning does not prove the translation backend is
  // healthy. Keep a service-failure message until a successful GT response
  // emits `skillbridge:translationavailable`.
  window.addEventListener('online', refreshOfflineBanner);

  // No auto-dismiss: refresh is the only recovery, so keep the alert visible.
  window.addEventListener('skillbridge:bridgeunavailable', () => {
    showSimpleBanner({
      id: 'si18n-bridge-banner',
      className: 'si18n-offline-banner si18n-storage-warn',
      role: 'alert',
      ariaLive: 'assertive',
      labels: BRIDGE_UNAVAILABLE_LABELS,
    });
  });

  document.addEventListener('skillbridge:storagequota', () => {
    showSimpleBanner({
      id: 'si18n-storage-banner',
      className: 'si18n-offline-banner si18n-storage-warn',
      role: 'status',
      ariaLive: 'polite',
      labels: STORAGE_WARNING_LABELS,
      autoDismissMs: 8000,
    });
  });

  // The policy flipped to a blocking state — see academy-localization.js. This
  // is the only user-visible signal that the extension chose not to act, so it
  // must not be silent; auto-dismissed because it explains a steady state
  // rather than reporting a failure the learner has to recover from.
  document.addEventListener('skillbridge:localizationblocked', (event) => {
    // Two different situations, and telling them apart is the whole point of
    // the message. "Already in your language" is a steady state that needs no
    // action. A page in a THIRD language is a dead end the learner can only
    // leave through the site's own language control — saying "left it
    // untouched" there would explain nothing and read as a silent failure.
    const mismatch = event?.detail?.reason === 'no-english-baseline';
    showSimpleBanner({
      id: 'si18n-localized-banner',
      className: 'si18n-offline-banner si18n-storage-warn',
      role: 'status',
      ariaLive: 'polite',
      labels: mismatch ? LOCALIZED_MISMATCH_LABELS : LOCALIZED_PAGE_LABELS,
      autoDismissMs: 8000,
    });
  });

  function showExamBanner() {
    showSimpleBanner({
      id: 'si18n-exam-banner',
      className: 'si18n-exam-banner',
      role: 'alert',
      labels: EXAM_BANNER_LABELS,
    });
  }

  function showTranslationProgress() {
    let bar = document.getElementById('si18n-progress-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'si18n-progress-bar';
      bar.innerHTML = '<div class="si18n-progress-fill" style="width: 15%"></div>';
      document.body.appendChild(bar);
    } else {
      const fill = bar.querySelector('.si18n-progress-fill');
      if (fill) fill.style.width = '15%';
    }
    let toast = document.getElementById('si18n-progress-toast');
    const label = sb.t(PROGRESS_LABELS);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'si18n-progress-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.innerHTML = `<div class="si18n-progress-spinner"></div><span>${label}</span>`;
      document.body.appendChild(toast);
    } else {
      const span = toast.querySelector('span');
      if (span) span.textContent = label;
    }
    requestAnimationFrame(() => {
      bar.classList.add('active');
      toast.classList.add('active');
    });
  }

  function updateTranslationProgress(pct) {
    const fill = document.querySelector('#si18n-progress-bar .si18n-progress-fill');
    if (fill) fill.style.width = `${Math.min(pct, 95)}%`;
  }

  function hideTranslationProgress() {
    const fill = document.querySelector('#si18n-progress-bar .si18n-progress-fill');
    if (fill) fill.style.width = '100%';
    setTimeout(() => {
      const bar = document.getElementById('si18n-progress-bar');
      const toast = document.getElementById('si18n-progress-toast');
      bar?.classList.remove('active');
      toast?.classList.remove('active');
      setTimeout(() => {
        bar?.remove();
        toast?.remove();
      }, SKILLBRIDGE_DELAYS.PROGRESS_REMOVE);
    }, SKILLBRIDGE_DELAYS.PROGRESS_HIDE);
  }

  sb.showOfflineBanner = showOfflineBanner;
  sb.hideOfflineBanner = hideOfflineBanner;
  sb.refreshOfflineBanner = refreshOfflineBanner;
  sb.showExamBanner = showExamBanner;
  sb.showTranslationProgress = showTranslationProgress;
  sb.updateTranslationProgress = updateTranslationProgress;
  sb.hideTranslationProgress = hideTranslationProgress;
  sb.registerModule?.('banners');

  // The browser can already be offline before content scripts are injected.
  // Do not wait for a later `offline` event, and do not hide the status just
  // because the selected language is English.
  refreshOfflineBanner();
})();
