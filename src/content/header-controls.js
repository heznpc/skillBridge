/**
 * SkillBridge — Header Controls (Dark Mode, Language Selector, Welcome Banner)
 * Accesses shared state via window._sb namespace.
 */

(function () {
  'use strict';

  const sb = window._sb;

  // ============================================================
  // DARK MODE TOGGLE
  // ============================================================

  const DARK_TOGGLE_ICONS = `
    <svg class="si18n-icon-sun" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="8" cy="8" r="3"/>
      <path d="M8 1.5v1M8 13.5v1M3.4 3.4l.7.7M11.9 11.9l.7.7M1.5 8h1M13.5 8h1M3.4 12.6l.7-.7M11.9 4.1l.7-.7"/>
    </svg>
    <svg class="si18n-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>`;

  function createDarkToggleButton() {
    const btn = document.createElement('button');
    btn.id = 'si18n-dark-toggle';
    btn.className = 'si18n-dark-toggle-btn';
    btn.setAttribute('aria-label', sb.t(A11Y_LABELS.toggleDark));
    btn.setAttribute('title', sb.t(A11Y_LABELS.toggleDark));
    btn.setAttribute('aria-pressed', document.documentElement.classList.contains('si18n-dark') ? 'true' : 'false');
    btn.innerHTML = DARK_TOGGLE_ICONS;
    btn.addEventListener('click', toggleDarkMode);
    return btn;
  }

  function injectDarkModeToggle() {
    if (document.getElementById('si18n-dark-toggle')) return;

    const headerLang = document.getElementById('si18n-header-lang');
    if (headerLang) {
      headerLang.insertBefore(createDarkToggleButton(), headerLang.firstChild);
      return;
    }

    const headerRight = document.querySelector(SKILLJAR_SELECTORS.headerRight);
    const linksContainer = headerRight?.querySelector(SKILLJAR_SELECTORS.headerLinks);
    if (!headerRight || !linksContainer) return;
    headerRight.insertBefore(createDarkToggleButton(), linksContainer);
  }

  function toggleDarkMode() {
    const isDark = document.documentElement.classList.toggle('si18n-dark');
    const toggleBtn = document.getElementById('si18n-dark-toggle');
    if (toggleBtn) toggleBtn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    chrome.storage.local.set({ darkMode: isDark });
  }

  // ============================================================
  // HEADER LANGUAGE SELECTOR
  // ============================================================

  function injectHeaderLanguageSelect() {
    if (document.getElementById('si18n-header-lang')) return;

    const headerRight = document.querySelector(SKILLJAR_SELECTORS.headerRight);
    if (!headerRight) return;
    const linksContainer = headerRight.querySelector(SKILLJAR_SELECTORS.headerLinks);
    if (!linksContainer) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'si18n-header-lang';
    wrapper.className = 'headerheight align-vertical';

    const options = AVAILABLE_LANGUAGES
      .map(l => `<option value="${l.code}" ${l.code === sb.currentLang ? 'selected' : ''}>${l.label}</option>`)
      .join('');

    wrapper.innerHTML = `<select id="si18n-header-lang-select">${options}</select>`;
    headerRight.insertBefore(wrapper, linksContainer);

    document.getElementById('si18n-header-lang-select')?.addEventListener('change', (e) => {
      sb.switchLanguage(e.target.value).catch(err =>
        console.error('[SkillBridge] Header lang change error:', err));
    });
  }

  // ============================================================
  // LANGUAGE AUTO-DETECT + WELCOME BANNER
  // ============================================================

  function detectBrowserLanguage() {
    const browserLang = navigator.language || 'en';

    if (AVAILABLE_LANGUAGE_CODES.includes(browserLang)) return browserLang;

    const base = browserLang.split('-')[0];
    if (AVAILABLE_LANGUAGE_CODES.includes(base)) return base;
    if (base === 'zh') return 'zh-CN';

    return null;
  }

  function showWelcomeBanner(detectedLang) {
    // Show onboarding for ALL first-time visitors — including English speakers
    const isNonEnglish = detectedLang && detectedLang !== 'en';

    const langOptions = AVAILABLE_LANGUAGES
      .filter(l => l.code !== 'en')
      .map(l => `<option value="${l.code}" ${l.code === (detectedLang || '') ? 'selected' : ''}>${l.label}</option>`)
      .join('');

    const banner = document.createElement('div');
    banner.id = 'si18n-welcome-banner';

    if (isNonEnglish) {
      // Non-English: existing translate prompt
      const langLabel = AVAILABLE_LANGUAGES.find(l => l.code === detectedLang)?.label || detectedLang;
      const ui = sb.t(BANNER_UI, detectedLang);
      banner.innerHTML = `
        <span class="si18n-banner-icon">\u{1F310}</span>
        <div class="si18n-banner-text">
          ${ui.prompt} <strong>${langLabel}</strong>
          <select id="si18n-banner-lang">${langOptions}</select>
        </div>
        <div class="si18n-banner-actions">
          <button class="si18n-banner-btn si18n-banner-confirm" id="si18n-banner-yes">${ui.confirm}</button>
          <button class="si18n-banner-btn si18n-banner-change" id="si18n-banner-no">${ui.dismiss}</button>
        </div>
      `;
    } else {
      // English speakers: intro banner explaining what SkillBridge does
      const ui = sb.t(ONBOARDING_LABELS, 'en');
      banner.innerHTML = `
        <span class="si18n-banner-icon">\u{1F310}</span>
        <div class="si18n-banner-text">
          <strong>${ui.title}</strong><br/>
          ${ui.body}
          <select id="si18n-banner-lang" style="margin-left:8px">${langOptions}</select>
        </div>
        <div class="si18n-banner-actions">
          <button class="si18n-banner-btn si18n-banner-confirm" id="si18n-banner-yes">${ui.cta}</button>
          <button class="si18n-banner-btn si18n-banner-change" id="si18n-banner-no">${ui.dismiss}</button>
        </div>
      `;
    }

    document.body.appendChild(banner);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => banner.classList.add('visible'));
    });

    document.getElementById('si18n-banner-yes')?.addEventListener('click', async () => {
      const selectedLang = document.getElementById('si18n-banner-lang')?.value || detectedLang;
      banner.classList.remove('visible');
      setTimeout(() => banner.remove(), SKILLBRIDGE_DELAYS.BANNER_ANIMATION);

      if (selectedLang && selectedLang !== 'en') {
        await sb.switchLanguage(selectedLang, {
          skipRestore: true,
          extraStorage: { autoTranslate: true, welcomeShown: true },
        }).catch(err => console.error('[SkillBridge] Banner translate error:', err));
      } else {
        chrome.storage.local.set({ welcomeShown: true });
      }
    });

    document.getElementById('si18n-banner-no')?.addEventListener('click', () => {
      banner.classList.remove('visible');
      setTimeout(() => banner.remove(), SKILLBRIDGE_DELAYS.BANNER_ANIMATION);
      chrome.storage.local.set({ welcomeShown: true });
    });

    document.getElementById('si18n-banner-lang')?.addEventListener('change', (e) => {
      const newLabel = AVAILABLE_LANGUAGES.find(l => l.code === e.target.value)?.label || e.target.value;
      const textEl = banner.querySelector('.si18n-banner-text strong');
      if (textEl) textEl.textContent = newLabel;
    });
  }

  // Export to shared namespace
  sb.injectDarkModeToggle = injectDarkModeToggle;
  sb.toggleDarkMode = toggleDarkMode;
  sb.injectHeaderLanguageSelect = injectHeaderLanguageSelect;
  sb.detectBrowserLanguage = detectBrowserLanguage;
  sb.showWelcomeBanner = showWelcomeBanner;
})();
