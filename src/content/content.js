/**
 * SkillBridge for Anthropic Academy - Content Script (Orchestrator)
 * Sets up shared namespace, handles init, message routing, DOM observation,
 * and delegates to extracted modules for translation logic.
 *
 * Respects copyright: only translates displayed text on-the-fly
 * Never stores, caches permanently, or redistributes original content
 */

(function () {
  'use strict';

  // Prevent duplicate initialization (content scripts can fire multiple times on SPA navigation)
  if (window.__skillbridge_initialized__) return;
  window.__skillbridge_initialized__ = true;

  let translator = null;
  let subtitleManager = null;
  let currentLang = 'en';
  let isReady = false;
  let sidebarVisible = false;
  let originalTexts = new Map();
  let translatedTexts = new Map();
  let pendingActions = [];
  let domObserver = null;

  // Lookup helper: returns map entry for given lang, falling back to 'en'
  function t(map, lang) { return map[lang || currentLang] || map['en']; }

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ============================================================
  // SHARED NAMESPACE — expose state for extracted modules
  // (page-type.js, protected-terms-engine.js, gemini-block.js,
  //  translation-engine.js, header-controls.js, text-selection.js,
  //  sidebar-chat.js)
  // ============================================================

  window._sb = {
    get currentLang() { return currentLang; },
    set currentLang(v) { currentLang = v; },
    get sidebarVisible() { return sidebarVisible; },
    set sidebarVisible(v) { sidebarVisible = v; },
    get translator() { return translator; },
    get originalTexts() { return originalTexts; },
    get translatedTexts() { return translatedTexts; },
    t,
    escapeHtml,
    switchLanguage,
    // Filled by page-type.js:
    getPageContext: null,
    getTranslatableElements: null,
    getTextNodes: null,
    safeReplaceText: null,
    isLikelyEnglish: null,
    isCodeContent: null,
    TRANSLATABLE_SELECTOR: null,
    EXCLUDE_SELECTOR: null,
    // Filled by protected-terms-engine.js:
    buildProtectedTermsMap: null,
    restoreProtectedTerms: null,
    resetProtectedTermsLang: null,
    getProtectedKeepEnglish: null,
    // Filled by gemini-block.js:
    hasInlineTags: null,
    buildXmlForGemini: null,
    xmlToHtml: null,
    queueGeminiBlockTranslation: null,
    SAFE_TAGS: null,
    // Filled by translation-engine.js:
    applyStaticTranslations: null,
    queueForGoogleTranslate: null,
    showTranslationProgress: null,
    updateTranslationProgress: null,
    hideTranslationProgress: null,
    addVerifySpinner: null,
    removeVerifySpinner: null,
    trackTranslatedElement: null,
    updateLangClass: null,
    clearGTQueue: null,
    // Filled by header-controls.js:
    injectDarkModeToggle: null,
    injectHeaderLanguageSelect: null,
    detectBrowserLanguage: null,
    showWelcomeBanner: null,
    updateLocalizedLabels: null,
    // Filled by text-selection.js:
    initAskTutorButton: null,
    // Filled by sidebar-chat.js:
    injectSidebar: null,
    injectFloatingButton: null,
    toggleSidebar: null,
    formatResponse: null,
  };

  // ============================================================
  // REGISTER MESSAGE LISTENER IMMEDIATELY (before async init)
  // ============================================================

  chrome.runtime.onMessage.addListener(handleMessage);

  function handleMessage(request, sender, sendResponse) {
    if (!isReady && request.action === 'translatePage') {
      pendingActions.push({ request, sendResponse });
      sendResponse({ success: true, queued: true });
      return false;
    }

    switch (request.action) {
      case 'translatePage':
        translatePage(request.language).then(() => {
          sendResponse({ success: true });
        }).catch((err) => {
          console.error('[SkillBridge] translatePage error:', err);
          sendResponse({ success: false, error: err.message });
        });
        return true;

      case 'restoreOriginal':
        restoreOriginal();
        sendResponse({ success: true });
        return false;

      case 'toggleSidebar':
        window._sb.toggleSidebar?.();
        sendResponse({ success: true });
        return false;

      case 'getPageContext':
        sendResponse({ context: window._sb.getPageContext() });
        return false;

      case 'setLanguage': {
        const newLang = request.language;
        if (newLang !== 'en' && !SUPPORTED_LANGUAGE_MAP[newLang]) {
          sendResponse({ success: false, error: 'Unsupported language' });
          return false;
        }
        switchLanguage(newLang, {
          onDone: () => sendResponse({ success: true }),
        }).catch(err => {
          console.error('[SkillBridge] setLanguage error:', err);
          sendResponse({ success: false, error: err.message });
        });
        return true;
      }

      case 'ping':
        sendResponse({ ready: isReady });
        return false;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
        return false;
    }
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================

  async function init() {
    try {
      const stored = await chrome.storage.local.get(['targetLanguage', 'autoTranslate', 'welcomeShown', 'darkMode']);
      if (stored.darkMode) document.documentElement.classList.add('si18n-dark');
      currentLang = stored.targetLanguage || 'en';

      translator = new SkilljarTranslator();

      if (currentLang !== 'en') {
        await translator.loadStaticTranslations(currentLang);
        if (stored.autoTranslate && Object.keys(translator.staticDict).length > 0) {
          window._sb.applyStaticTranslations(currentLang);
        }
      }

      window._sb.injectHeaderLanguageSelect?.();
      window._sb.injectDarkModeToggle?.();
      window._sb.injectSidebar?.();
      window._sb.injectFloatingButton?.();

      isReady = true;

      for (const { request } of pendingActions) {
        if (request.action === 'translatePage') {
          currentLang = request.language;
          if (Object.keys(translator.staticDict).length === 0) {
            await translator.loadStaticTranslations(request.language);
          }
          window._sb.applyStaticTranslations(request.language);
        }
      }
      pendingActions = [];

      observeDOM();

      if (stored.autoTranslate && currentLang !== 'en') {
        setTimeout(() => window._sb.applyStaticTranslations(currentLang), SKILLBRIDGE_DELAYS.LATE_CONTENT);
      }

      translator.onTranslationUpdate((originalText, finalTranslation, targetLang, wasImproved) => {
        if (targetLang !== currentLang) return;
        const entries = translatedTexts.get(originalText);
        if (!entries) return;

        // Prune detached elements to prevent memory leak
        const live = entries.filter(e => e.el?.parentNode);
        if (live.length === 0) { translatedTexts.delete(originalText); return; }
        if (live.length < entries.length) translatedTexts.set(originalText, live);

        for (const entry of live) {
          window._sb.removeVerifySpinner(entry.el);
          if (wasImproved) {
            window._sb.safeReplaceText(entry.el, window._sb.restoreProtectedTerms(finalTranslation));
            entry.el.classList.add('si18n-text-updated');
            setTimeout(() => entry.el.classList.remove('si18n-text-updated'), SKILLBRIDGE_DELAYS.TEXT_UPDATE_FADE);
          }
        }

      });

      translator.initialize().catch(err => {
        console.warn('[SkillBridge] Bridge init failed (AI features unavailable):', err);
      });

      if (typeof YouTubeSubtitleManager !== 'undefined') {
        subtitleManager = new YouTubeSubtitleManager(currentLang);
        subtitleManager.initialize().catch(err => {
          console.warn('[SkillBridge] YouTube subtitle init failed:', err);
        });
      }

      if (!stored.welcomeShown && currentLang === 'en') {
        const detected = window._sb.detectBrowserLanguage?.();
        if (detected && detected !== 'en') {
          setTimeout(() => window._sb.showWelcomeBanner?.(detected), SKILLBRIDGE_DELAYS.WELCOME_BANNER);
        }
      } else if (!stored.welcomeShown && currentLang !== 'en') {
        chrome.storage.local.set({ welcomeShown: true });
      }
    } catch (err) {
      console.error('[SkillBridge] Init error:', err);
      isReady = true;
      window._sb.injectSidebar?.();
      window._sb.injectFloatingButton?.();
    }
  }

  // ============================================================
  // PAGE TRANSLATION
  // ============================================================

  async function translatePage(targetLang) {
    if (!translator) return;
    currentLang = targetLang;
    if (targetLang === 'en') { restoreOriginal(); return; }
    if (Object.keys(translator.staticDict).length === 0) {
      await translator.loadStaticTranslations(targetLang);
    }
    window._sb.applyStaticTranslations(targetLang);
  }

  function restoreOriginal() {
    originalTexts.forEach((html, el) => {
      if (el && el.parentNode) el.innerHTML = html;
    });
    originalTexts.clear();
    translatedTexts.clear();
    window._sb.clearGTQueue();
    clearTimeout(translateTimeout);
    pendingNodes = [];
    currentLang = 'en';
    window._sb.resetProtectedTermsLang();
    window._sb.updateLangClass('en');
    window._sb.hideTranslationProgress();
  }

  async function switchLanguage(newLang, opts = {}) {
    const storageData = { targetLanguage: newLang, autoTranslate: newLang !== 'en', ...opts.extraStorage };
    chrome.storage.local.set(storageData);

    if (!opts.skipRestore) restoreOriginal();
    currentLang = newLang;

    try {
      if (newLang === 'en') {
        window._sb.updateLocalizedLabels?.();
        if (subtitleManager) subtitleManager.setLanguage('en');
        return;
      }

      await translator.loadStaticTranslations(newLang);
      window._sb.applyStaticTranslations(newLang);
      window._sb.updateLocalizedLabels?.();
      if (subtitleManager) subtitleManager.setLanguage(newLang);
    } finally {
      opts.onDone?.();
    }
  }

  // ============================================================
  // DOM OBSERVER (with cleanup)
  // ============================================================

  function observeDOM() {
    domObserver = new MutationObserver((mutations) => {
      if (currentLang === 'en') return;
      if (!translator || !isReady) return;

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE &&
              !node.closest('.skillbridge-sidebar') &&
              !node.closest('#skillbridge-bridge')) {
            debounceTranslateNew(node);
          }
        }
      }
    });

    domObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Cleanup on page hide (pagehide is preferred over unload — doesn't block bfcache)
  window.addEventListener('pagehide', () => {
    domObserver?.disconnect();
    clearTimeout(translateTimeout);
    pendingNodes = [];
  });

  let translateTimeout;
  let pendingNodes = [];
  function debounceTranslateNew(node) {
    if (pendingNodes.length >= SKILLBRIDGE_THRESHOLDS.PENDING_NODES_MAX) return;
    pendingNodes.push(node);
    clearTimeout(translateTimeout);
    translateTimeout = setTimeout(() => {
      const nodes = pendingNodes.splice(0);
      const sb = window._sb;
      if (currentLang !== 'en' && translator) {
        const elements = [];
        for (const n of nodes) {
          if (n.matches?.(sb.TRANSLATABLE_SELECTOR)) {
            elements.push(n);
          } else {
            elements.push(...Array.from(n.querySelectorAll?.(sb.TRANSLATABLE_SELECTOR) || []));
          }
        }

        const handledNodes = new Set();
        const gtCandidates = [];

        for (const el of elements) {
          if (el.closest(sb.EXCLUDE_SELECTOR)) continue;
          const fullText = el.textContent.trim();
          if (fullText.length < 2) continue;
          if (!sb.isLikelyEnglish(fullText)) continue;

          const match = translator.staticLookup(fullText);
          if (match) {
            if (!originalTexts.has(el)) originalTexts.set(el, el.innerHTML);
            sb.safeReplaceText(el, match);
            sb.getTextNodes(el).forEach(tn => handledNodes.add(tn));
          } else if (fullText.length >= 10) {
            gtCandidates.push(el);
          }
        }

        const allTextNodes = nodes.flatMap(n => sb.getTextNodes(n));
        for (const tn of allTextNodes) {
          if (handledNodes.has(tn)) continue;
          const original = tn.textContent.trim();
          if (original.length >= 2 && !sb.isCodeContent(tn)) {
            const staticResult = translator.staticLookup(original);
            if (staticResult) tn.textContent = staticResult;
          }
        }

        if (gtCandidates.length > 0) {
          for (const el of gtCandidates) {
            if (!originalTexts.has(el)) originalTexts.set(el, el.innerHTML);
          }
          sb.queueForGoogleTranslate(gtCandidates, currentLang);
        }
      }
    }, SKILLBRIDGE_DELAYS.DOM_DEBOUNCE);
  }

  // ============================================================
  // BOOT
  // ============================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
