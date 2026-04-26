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

  function showOfflineBanner() {
    showSimpleBanner({
      id: 'si18n-offline-banner',
      className: 'si18n-offline-banner',
      role: 'status',
      ariaLive: 'polite',
      labels: OFFLINE_LABELS,
    });
  }

  function hideOfflineBanner() {
    const banner = document.getElementById('si18n-offline-banner');
    if (!banner) return;
    banner.classList.remove('visible');
    setTimeout(() => banner.remove(), 300);
  }

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
  sb.showExamBanner = showExamBanner;
  sb.showTranslationProgress = showTranslationProgress;
  sb.updateTranslationProgress = updateTranslationProgress;
  sb.hideTranslationProgress = hideTranslationProgress;
})();
