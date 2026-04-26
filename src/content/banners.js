/**
 * SkillBridge — Banner UI
 *
 * Pure DOM banner registry split out of content.js. Loaded after content.js
 * so it can read live language and helper state via `window._sb.t` /
 * `window._sb.escapeHtml`. Functions attach back onto `window._sb` so
 * content.js call sites only change the prefix.
 *
 * Covers: offline, bridge-unavailable, storage-quota, exam, translation
 * progress. The term-preview card stays in content.js because it touches
 * translator state and FLASHCARD_COURSE_SLUGS_SORTED resolution.
 */

(function () {
  const sb = window._sb;
  if (!sb) {
    console.warn('[SkillBridge] banners.js loaded before content.js — _sb namespace missing');
    return;
  }

  // ============================================================
  // OFFLINE BANNER
  // ============================================================

  function showOfflineBanner() {
    if (document.getElementById('si18n-offline-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'si18n-offline-banner';
    banner.className = 'si18n-offline-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.textContent = sb.t(OFFLINE_LABELS);
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('visible'));
  }

  function hideOfflineBanner() {
    const banner = document.getElementById('si18n-offline-banner');
    if (banner) {
      banner.classList.remove('visible');
      setTimeout(() => banner.remove(), 300);
    }
  }

  // ============================================================
  // BRIDGE UNAVAILABLE BANNER (persistent — refresh required)
  // ============================================================

  // Puter.js script never confirmed BRIDGE_READY; alert the user that AI
  // features are off until they reload. No auto-dismiss because reloading
  // is the only recovery path.
  window.addEventListener('skillbridge:bridgeunavailable', () => {
    if (document.getElementById('si18n-bridge-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'si18n-bridge-banner';
    banner.className = 'si18n-offline-banner si18n-storage-warn';
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'assertive');
    banner.textContent = sb.t(BRIDGE_UNAVAILABLE_LABELS);
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('visible'));
  });

  // ============================================================
  // STORAGE QUOTA BANNER (auto-dismiss after 8s)
  // ============================================================

  document.addEventListener('skillbridge:storagequota', () => {
    if (document.getElementById('si18n-storage-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'si18n-storage-banner';
    banner.className = 'si18n-offline-banner si18n-storage-warn';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.textContent = sb.t(STORAGE_WARNING_LABELS);
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('visible'));
    setTimeout(() => {
      banner.classList.remove('visible');
      setTimeout(() => banner.remove(), 300);
    }, 8000);
  });

  // ============================================================
  // EXAM BANNER
  // ============================================================

  function showExamBanner() {
    if (document.getElementById('si18n-exam-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'si18n-exam-banner';
    banner.className = 'si18n-exam-banner';
    banner.setAttribute('role', 'alert');
    banner.textContent = sb.t(EXAM_BANNER_LABELS);
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('visible'));
  }

  // ============================================================
  // TRANSLATION PROGRESS
  // ============================================================

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

  // Expose on the shared namespace so content.js call sites stay the same
  // shape as other extracted modules (header-controls.js, text-selection.js).
  sb.showOfflineBanner = showOfflineBanner;
  sb.hideOfflineBanner = hideOfflineBanner;
  sb.showExamBanner = showExamBanner;
  sb.showTranslationProgress = showTranslationProgress;
  sb.updateTranslationProgress = updateTranslationProgress;
  sb.hideTranslationProgress = hideTranslationProgress;
})();
