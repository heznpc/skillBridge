/**
 * SkillBridge for Anthropic Academy - Content Script
 * Injects translation UI and handles page content translation
 *
 * Translates displayed text on-the-fly in the user's browser.
 * Translations are cached locally (IndexedDB, 30-day TTL). Original content is not redistributed.
 */

(function () {
  'use strict';

  // Prevent duplicate initialization (content scripts can fire multiple times on SPA navigation)
  if (window.__skillbridge_initialized__) return;
  window.__skillbridge_initialized__ = true;

  // ── Certification exam kill-switch ──────────────────────────
  // Proctored exams (CCA-F etc.): disable extension entirely so it
  // cannot be mistaken for a cheating tool.
  if (CERT_DISABLE_PATTERNS.some(p => p.test(location.href))) {
    console.info('[SkillBridge] Certification exam page detected — extension disabled.');
    return;
  }

  // Target ALL visible text elements — including Skilljar-specific
  // Skilljar selectors are centralized in src/lib/selectors.js
  const TRANSLATABLE_SELECTOR = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'li', 'td', 'th', 'label', 'figcaption',
    'span', '.btn-text', '.nav-text', 'blockquote', 'dt', 'dd',
    SKILLJAR_SELECTORS.courseBox, SKILLJAR_SELECTORS.courseBoxDesc,
    SKILLJAR_SELECTORS.ribbonText, SKILLJAR_SELECTORS.courseTime,
    SKILLJAR_SELECTORS.faqTitle, `${SKILLJAR_SELECTORS.faqPost} p`,
    'div.title', `${SKILLJAR_SELECTORS.lessonRow} div.title`,
    SKILLJAR_SELECTORS.focusLink, SKILLJAR_SELECTORS.sectionTitle,
    SKILLJAR_SELECTORS.leftNavReturn, SKILLJAR_SELECTORS.courseOverview,
    `${SKILLJAR_SELECTORS.lessonTop} h2`, SKILLJAR_SELECTORS.detailsPane,
  ].join(', ');

  const EXCLUDE_SELECTOR = [
    'code', 'pre', 'script', 'style', 'noscript',
    '.code-block', '.syntax-highlight',
    '.skillbridge-sidebar', '#skillbridge-bridge', '#skillbridge-fab',
    'header nav', '.site-header nav', 'nav.navbar', 'footer',
  ].join(', ');

  // Inline tags that indicate mixed content needing Gemini block translation
  const INLINE_TAGS = new Set([
    'STRONG', 'B', 'EM', 'I', 'A', 'SPAN', 'CODE',
    'MARK', 'SUB', 'SUP', 'ABBR', 'SMALL', 'U', 'S',
  ]);
  const NO_TRANSLATE_TAGS = new Set(['CODE', 'PRE', 'KBD', 'SAMP', 'VAR']);

  let translator = null;
  let subtitleManager = null;
  let currentLang = 'en';
  let isExamPage = false;
  let isReady = false;
  let sidebarVisible = false;
  let originalTexts = new Map();
  let translatedTexts = new Map();
  let pendingActions = [];
  let gtTranslateQueue = [];
  let gtProcessing = false;
  let gtGeneration = 0;
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
  // (header-controls.js, text-selection.js, sidebar-chat.js)
  // ============================================================

  // ============================================================
  // EXAM PAGE DETECTION
  // ============================================================

  function detectExamPage() {
    const url = location.href;
    if (EXAM_URL_PATTERNS.some(p => p.test(url))) return true;
    // DOM-based detection: check for quiz forms or answer option containers
    if (document.querySelector(SKILLJAR_SELECTORS.quizForm)) return true;
    if (document.querySelector(SKILLJAR_SELECTORS.answerOption)) return true;
    return false;
  }

  function showExamBanner() {
    if (document.getElementById('si18n-exam-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'si18n-exam-banner';
    banner.className = 'si18n-exam-banner';
    banner.setAttribute('role', 'alert');
    banner.textContent = t(EXAM_BANNER_LABELS);
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('visible'));
  }

  window._sb = {
    get currentLang() { return currentLang; },
    set currentLang(v) { currentLang = v; },
    get sidebarVisible() { return sidebarVisible; },
    set sidebarVisible(v) { sidebarVisible = v; },
    get translator() { return translator; },
    get isExamPage() { return isExamPage; },
    t,
    escapeHtml,
    switchLanguage,
    getPageContext,
    // Filled by modules:
    injectDarkModeToggle: null,
    injectHeaderLanguageSelect: null,
    detectBrowserLanguage: null,
    showWelcomeBanner: null,
    initAskTutorButton: null,
    injectSidebar: null,
    injectFloatingButton: null,
    toggleSidebar: null,
    updateLocalizedLabels: null,
    formatResponse: null,
  };

  // ============================================================
  // TRANSLATION PROGRESS INDICATOR
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
    const label = t(PROGRESS_LABELS);
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
      setTimeout(() => { bar?.remove(); toast?.remove(); }, SKILLBRIDGE_DELAYS.PROGRESS_REMOVE);
    }, SKILLBRIDGE_DELAYS.PROGRESS_HIDE);
  }

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
        sendResponse({ context: getPageContext() });
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
      isExamPage = detectExamPage();

      translator = new SkilljarTranslator();

      if (currentLang !== 'en') {
        await translator.loadStaticTranslations(currentLang);
        if (stored.autoTranslate && Object.keys(translator.staticDict).length > 0) {
          applyStaticTranslations(currentLang);
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
          applyStaticTranslations(request.language);
        }
      }
      pendingActions = [];

      observeDOM();

      if (stored.autoTranslate && currentLang !== 'en') {
        setTimeout(() => applyStaticTranslations(currentLang), SKILLBRIDGE_DELAYS.LATE_CONTENT);
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
          removeVerifySpinner(entry.el);
          if (wasImproved) {
            safeReplaceText(entry.el, restoreProtectedTerms(finalTranslation));
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

      if (!stored.welcomeShown) {
        if (currentLang !== 'en') {
          // Already has a language set — skip banner
          chrome.storage.local.set({ welcomeShown: true });
        } else {
          // Show onboarding: detected language for non-English, null for English
          const detected = window._sb.detectBrowserLanguage?.();
          setTimeout(() => window._sb.showWelcomeBanner?.(detected), SKILLBRIDGE_DELAYS.WELCOME_BANNER);
        }
      }
    } catch (err) {
      console.error('[SkillBridge] Init error:', err);
      isReady = true;
      window._sb.injectSidebar?.();
      window._sb.injectFloatingButton?.();
    }
  }

  // ============================================================
  // STATIC TRANSLATIONS + GT QUEUE (viewport-first, chunked)
  // ============================================================

  function isInViewport(el) {
    const rect = el.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  }

  /**
   * Process a single element: try static dict, then return category.
   * Returns 'static' | 'gt' | null.
   */
  function processOneElement(el, targetLang) {
    const fullText = el.textContent.trim();
    if (!fullText || fullText.length < 2) return null;
    if (!isLikelyEnglish(fullText)) return null;

    if (!originalTexts.has(el)) {
      originalTexts.set(el, el.innerHTML);
    }

    const elementMatch = translator.staticLookup(fullText);
    if (elementMatch) {
      safeReplaceText(el, elementMatch);
      return 'static';
    }

    let allNodesMatched = true;
    let matchCount = 0;
    const textNodes = getTextNodes(el);
    for (const node of textNodes) {
      const text = node.textContent.trim();
      if (text.length < 2) continue;
      const nodeMatch = translator.staticLookup(text);
      if (nodeMatch) {
        node.textContent = nodeMatch;
        matchCount++;
      } else if (text.length >= 4 && isLikelyEnglish(text)) {
        allNodesMatched = false;
      }
    }

    if (!allNodesMatched && fullText.length >= 10) return 'gt';
    return matchCount > 0 ? 'static' : null;
  }

  function applyStaticTranslations(targetLang) {
    buildProtectedTermsMap(targetLang);
    updateLangClass(targetLang);
    // Re-detect exam page (DOM may have loaded since init)
    if (!isExamPage) isExamPage = detectExamPage();
    if (isExamPage && targetLang !== 'en') showExamBanner();

    const elements = getTranslatableElements();
    if (elements.length === 0) return;

    // Split into viewport (visible) and offscreen for prioritized processing
    const visible = [];
    const offscreen = [];
    for (const el of elements) {
      (isInViewport(el) ? visible : offscreen).push(el);
    }

    // Phase 1 — Process visible elements immediately (no jank for above-fold)
    let staticCount = 0;
    const gtCandidates = [];

    for (const el of visible) {
      const result = processOneElement(el, targetLang);
      if (result === 'static') staticCount++;
      else if (result === 'gt') gtCandidates.push(el);
    }

    // Start GT for visible elements right away (skip redundant viewport check)
    if (gtCandidates.length > 0 && targetLang !== 'en') {
      showTranslationProgress();
      updateTranslationProgress(Math.round((staticCount / (staticCount + gtCandidates.length + offscreen.length)) * 80));
      queueForGoogleTranslate(gtCandidates, targetLang, true);
    }

    // Phase 2 — Process offscreen elements in idle-time chunks
    if (offscreen.length > 0) {
      processOffscreenChunked(offscreen, targetLang, staticCount, gtCandidates.length);
    }
  }

  /**
   * Process offscreen elements in small chunks during idle time,
   * preventing main-thread blocking on pages with 500+ elements.
   */
  function processOffscreenChunked(elements, targetLang, prevStatic, prevGt) {
    let idx = 0;
    let staticCount = prevStatic;
    const gtCandidates = [];
    // Capture generation to detect language switches during processing
    const myGeneration = gtGeneration;

    function processChunk(deadline) {
      // Abort if language was switched (restoreOriginal increments gtGeneration)
      if (gtGeneration !== myGeneration) return;

      const hasDeadline = typeof deadline !== 'undefined' && typeof deadline.timeRemaining === 'function';
      const chunkEnd = Math.min(idx + SKILLBRIDGE_THRESHOLDS.VIEWPORT_CHUNK_SIZE, elements.length);
      let processed = 0;

      // Always process at least 1 element per callback to guarantee forward progress
      while (idx < chunkEnd && (processed === 0 || !hasDeadline || deadline.timeRemaining() > 1)) {
        const el = elements[idx++];
        const result = processOneElement(el, targetLang);
        if (result === 'static') staticCount++;
        else if (result === 'gt') gtCandidates.push(el);
        processed++;
      }

      if (idx < elements.length) {
        // Yield and continue in next idle period
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(processChunk, { timeout: SKILLBRIDGE_DELAYS.IDLE_TIMEOUT });
        } else {
          setTimeout(processChunk, 0);
        }
      } else if (gtGeneration === myGeneration) {
        // All offscreen elements processed — queue GT candidates
        if (gtCandidates.length > 0 && targetLang !== 'en') {
          if (prevGt === 0) showTranslationProgress();
          queueForGoogleTranslate(gtCandidates, targetLang);
        }
      }
    }

    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(processChunk, { timeout: SKILLBRIDGE_DELAYS.IDLE_TIMEOUT });
    } else {
      setTimeout(processChunk, 0);
    }
  }

  function isLikelyEnglish(text) {
    let latin = 0, total = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13) continue; // whitespace
      total++;
      if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) latin++;
    }
    return total > 0 && (latin / total) > 0.5;
  }

  /**
   * @param {boolean} [alreadyVisible] — if true, skip viewport re-check (caller already classified)
   */
  function queueForGoogleTranslate(elements, targetLang, alreadyVisible) {
    if (alreadyVisible) {
      for (const el of elements) {
        if (gtTranslateQueue.length >= SKILLBRIDGE_THRESHOLDS.GT_QUEUE_MAX) break;
        const text = el.textContent.trim();
        if (!text || text.length < 4) continue;
        gtTranslateQueue.push({ el, text, targetLang, needsGemini: hasInlineTags(el) });
      }
    } else {
      const visibleItems = [];
      const offscreenItems = [];
      for (const el of elements) {
        if (gtTranslateQueue.length + visibleItems.length + offscreenItems.length >= SKILLBRIDGE_THRESHOLDS.GT_QUEUE_MAX) break;
        const text = el.textContent.trim();
        if (!text || text.length < 4) continue;
        const item = { el, text, targetLang, needsGemini: hasInlineTags(el) };
        (isInViewport(el) ? visibleItems : offscreenItems).push(item);
      }
      gtTranslateQueue.push(...visibleItems, ...offscreenItems);
    }
    processGTQueue();
  }

  async function processGTQueue() {
    if (gtProcessing || gtTranslateQueue.length === 0) return;
    gtProcessing = true;
    const myGeneration = gtGeneration;
    const totalItems = gtTranslateQueue.length;
    let processedItems = 0;
    const geminiQueue = [];

    while (gtTranslateQueue.length > 0) {
      if (gtGeneration !== myGeneration) { gtProcessing = false; return; }

      const batch = gtTranslateQueue.splice(0, SKILLBRIDGE_THRESHOLDS.GT_BATCH_SIZE);
      const targetLang = batch[0].targetLang;

      const cacheResults = await Promise.all(
        batch.map(item => translator.cachedLookup(item.text, targetLang))
      );

      if (gtGeneration !== myGeneration) { gtProcessing = false; return; }

      const uncached = [];
      for (let i = 0; i < batch.length; i++) {
        if (cacheResults[i]) {
          const item = batch[i];
          if (item.el && item.el.parentNode) {
            if (item.needsGemini) {
              uncached.push(item);
            } else {
              safeReplaceText(item.el, cacheResults[i]);
              trackTranslatedElement(item.text, item.el);
            }
          }
        } else {
          uncached.push(batch[i]);
        }
      }

      const gtItems = uncached.filter(item => !item.needsGemini);
      const geminiItems = uncached.filter(item => item.needsGemini);

      for (const item of geminiItems) {
        if (item.el && item.el.parentNode) {
          if (!originalTexts.has(item.el)) originalTexts.set(item.el, item.el.innerHTML);
          geminiQueue.push({ el: item.el, targetLang: item.targetLang });
        }
      }

      if (gtItems.length > 0) {
        // Deduplicate texts — group elements by text to avoid redundant API calls
        const textToItems = new Map();
        for (const item of gtItems) {
          if (!textToItems.has(item.text)) textToItems.set(item.text, []);
          textToItems.get(item.text).push(item);
        }
        const uniqueTexts = [...textToItems.keys()];
        const translations = await translator.googleTranslateBatch(uniqueTexts, targetLang);

        if (gtGeneration !== myGeneration) { gtProcessing = false; return; }

        for (let i = 0; i < uniqueTexts.length; i++) {
          let translated = translations[i];
          if (!translated || translated === uniqueTexts[i]) continue;
          translated = restoreProtectedTerms(translated);
          const items = textToItems.get(uniqueTexts[i]);
          let verifyQueued = false;
          for (const item of items) {
            if (!item.el?.parentNode) continue;
            safeReplaceText(item.el, translated);
            trackTranslatedElement(item.text, item.el);
            if (!verifyQueued) {
              verifyQueued = !!translator.queueGeminiVerify(item.text, translated, targetLang);
            }
            if (verifyQueued) addVerifySpinner(item.el);
          }
        }
      }

      processedItems += batch.length;
      updateTranslationProgress(80 + Math.round((processedItems / totalItems) * 15));

      if (gtTranslateQueue.length > 0) {
        await new Promise(r => setTimeout(r, SKILLBRIDGE_DELAYS.GT_BATCH));
      }
    }

    gtProcessing = false;
    hideTranslationProgress();
    pruneOriginalTexts();

    for (const { el, targetLang } of geminiQueue) {
      if (el && el.parentNode) queueGeminiBlockTranslation(el, targetLang);
    }
  }

  function trackTranslatedElement(originalText, el) {
    if (!translatedTexts.has(originalText)) translatedTexts.set(originalText, []);
    translatedTexts.get(originalText).push({ el });
  }

  /**
   * Prune originalTexts Map by removing entries where the element
   * is no longer attached to the DOM (el.parentNode is null).
   * Called after each GT batch processing completes.
   */
  function pruneOriginalTexts() {
    for (const [el] of originalTexts) {
      if (!el.parentNode) originalTexts.delete(el);
    }
  }

  function addVerifySpinner(el) {
    if (el.querySelector('.si18n-verify-spinner')) return;
    const spinner = document.createElement('span');
    spinner.className = 'si18n-verify-spinner';
    spinner.innerHTML = '<span class="si18n-dot"></span><span class="si18n-dot"></span><span class="si18n-dot"></span>';
    el.appendChild(spinner);
  }

  function removeVerifySpinner(el) {
    el.querySelector('.si18n-verify-spinner')?.remove();
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
    applyStaticTranslations(targetLang);
  }

  function restoreOriginal() {
    originalTexts.forEach((html, el) => {
      if (el && el.parentNode) el.innerHTML = html;
    });
    originalTexts.clear();
    translatedTexts.clear();
    gtTranslateQueue = [];
    gtProcessing = false;
    gtGeneration++;
    clearTimeout(translateTimeout);
    pendingNodes = [];
    currentLang = 'en';
    _protectedTermsLang = null;
    updateLangClass('en');
    hideTranslationProgress();
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
      applyStaticTranslations(newLang);
      window._sb.updateLocalizedLabels?.();
      if (subtitleManager) subtitleManager.setLanguage(newLang);
    } finally {
      opts.onDone?.();
    }
  }

  function injectGoogleFonts() {
    if (document.getElementById('sb-google-fonts')) return;
    const link = document.createElement('link');
    link.id = 'sb-google-fonts';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=Noto+Sans+JP:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&family=Noto+Sans+TC:wght@400;500;700&family=Noto+Sans+Arabic:wght@400;500;700&family=Noto+Sans+Devanagari:wght@400;500;700&family=Noto+Sans+Thai:wght@400;500;700&display=swap';
    document.head.appendChild(link);
  }

  function updateLangClass(lang) {
    const body = document.body;
    if (!body) return;
    // Collect first, then remove (safe iteration)
    const toRemove = [...body.classList].filter(cls => cls.startsWith('si18n-lang-'));
    for (const cls of toRemove) body.classList.remove(cls);
    // Set html lang for screen readers and font selection
    document.documentElement.lang = lang || 'en';
    if (lang && lang !== 'en') {
      body.classList.add(`si18n-lang-${lang}`);
      injectGoogleFonts();
    }
  }

  function getTranslatableElements() {
    const examSkip = isExamPage ? EXAM_SKIP_SELECTORS.join(', ') : null;
    return Array.from(document.querySelectorAll(TRANSLATABLE_SELECTOR)).filter(el => {
      if (el.closest(EXCLUDE_SELECTOR)) return false;
      // On exam pages, skip answer choice elements
      if (examSkip && el.matches(examSkip)) return false;
      if (examSkip && el.closest(examSkip)) return false;
      const parent = el.parentElement;
      if (parent && parent.matches && parent.matches(TRANSLATABLE_SELECTOR) &&
          !parent.closest(EXCLUDE_SELECTOR)) {
        if (['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH', 'BLOCKQUOTE'].includes(parent.tagName)) {
          return false;
        }
      }
      if (el.tagName === 'SPAN') {
        const text = el.textContent.trim();
        if (text.length < 4) return false;
        if (el.children.length > 3) return false;
      }
      return el.textContent.trim().length > 1;
    });
  }

  function getTextNodes(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (node.textContent.trim().length < 2) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest('code, pre, script, style')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function safeReplaceText(el, newText) {
    if (el.children.length === 0) { el.textContent = newText; return; }

    const textNodes = [];
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) {
        textNodes.push(node);
      }
    }

    if (textNodes.length === 1) {
      textNodes[0].textContent = newText;
    } else if (textNodes.length > 1) {
      textNodes[0].textContent = newText;
      for (let i = 1; i < textNodes.length; i++) textNodes[i].textContent = '';
    } else {
      const deepTextNodes = getTextNodes(el);
      if (deepTextNodes.length > 0) {
        deepTextNodes[0].textContent = newText;
        for (let i = 1; i < deepTextNodes.length; i++) deepTextNodes[i].textContent = '';
      } else {
        el.textContent = newText;
      }
    }
  }

  // ============================================================
  // PROTECTED TERMS
  // ============================================================

  let _protectedTermsSorted = [];
  let _protectedTermsLang = null;
  let _protectedKeepEnglish = '';

  function buildProtectedTermsMap(targetLang) {
    if (_protectedTermsLang === targetLang) return;
    _protectedTermsLang = targetLang;

    const map = {};
    const protectedEntries = translator.getProtectedTerms?.() || {};
    for (const [correct, wrongForms] of Object.entries(protectedEntries)) {
      if (Array.isArray(wrongForms)) {
        for (const wrong of wrongForms) map[wrong] = correct;
      }
    }
    _protectedTermsSorted = Object.entries(map).sort((a, b) => b[0].length - a[0].length);
    const terms = Object.keys(protectedEntries);
    _protectedKeepEnglish = terms.length > 0
      ? terms.join(', ')
      : DEFAULT_PROTECTED_TERMS;
  }

  function restoreProtectedTerms(text) {
    if (_protectedTermsSorted.length === 0) return text;
    let result = text;
    for (const [wrong, correct] of _protectedTermsSorted) {
      if (result.includes(wrong)) result = result.replaceAll(wrong, correct);
    }
    return result;
  }

  // ============================================================
  // INLINE TAG PRESERVATION (Gemini block translation)
  // ============================================================

  function hasInlineTags(el) {
    if (el.children.length === 0) return false;
    let hasText = false;
    let hasInline = false;
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) hasText = true;
      if (node.nodeType === Node.ELEMENT_NODE && INLINE_TAGS.has(node.tagName)) hasInline = true;
    }
    return hasText && hasInline;
  }

  function buildXmlForGemini(el) {
    const tagInfo = {};
    let xCounter = 0;
    let cCounter = 0;
    let xml = '';

    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        xml += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE && INLINE_TAGS.has(node.tagName)) {
        if (NO_TRANSLATE_TAGS.has(node.tagName)) {
          const id = `c${++cCounter}`;
          tagInfo[id] = { tag: node.tagName.toLowerCase(), original: node.outerHTML };
          xml += `<${id}/>`;
        } else {
          const id = `x${++xCounter}`;
          tagInfo[id] = { tag: node.tagName.toLowerCase(), attrs: getAttrsString(node) };
          xml += `<${id}>${node.textContent}</${id}>`;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        xml += node.outerHTML;
      }
    }
    return { xml: xml.trim(), tagInfo };
  }

  function getAttrsString(el) {
    const attrs = [];
    for (const attr of el.attributes) {
      attrs.push(`${attr.name}="${escapeHtml(attr.value)}"`);
    }
    return attrs.length ? ' ' + attrs.join(' ') : '';
  }

  // Tags allowed in Gemini block translation output — derived from existing sets + <br>
  const SAFE_TAGS = new Set(
    [...INLINE_TAGS, ...NO_TRANSLATE_TAGS, 'BR'].map(tag => tag.toLowerCase())
  );

  function xmlToHtml(translatedXml, tagInfo) {
    // Step 1: Restore placeholder tags to real HTML using tagInfo
    let rawHtml = translatedXml;
    for (const [id, info] of Object.entries(tagInfo)) {
      if (id.startsWith('c')) {
        rawHtml = rawHtml.replace(new RegExp(`<${id}\\s*/>`, 'g'), info.original);
      } else {
        rawHtml = rawHtml.replace(new RegExp(`<${id}>([\\s\\S]*?)</${id}>`, 'g'), (_, content) => {
          return `<${info.tag}${info.attrs}>${content}</${info.tag}>`;
        });
      }
    }
    // Clean up unmatched placeholder tags
    rawHtml = rawHtml.replace(/<[xc]\d+\s*\/?>/g, '');
    rawHtml = rawHtml.replace(/<\/[xc]\d+>/g, '');

    // Step 2: DOM-based sanitization — parse and walk the tree,
    // keeping only SAFE_TAGS and stripping dangerous attributes
    const doc = new DOMParser().parseFromString(rawHtml, 'text/html');

    function sanitizeNode(node) {
      const fragment = document.createDocumentFragment();
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          fragment.appendChild(document.createTextNode(child.textContent));
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          if (SAFE_TAGS.has(child.tagName.toLowerCase())) {
            const clean = document.createElement(child.tagName.toLowerCase());
            // Copy only safe attributes — allowlist approach
            for (const attr of Array.from(child.attributes)) {
              const name = attr.name.toLowerCase();
              if (name.startsWith('on')) continue;  // event handlers
              if (name === 'style') continue;       // CSS injection
              if (name === 'href') {
                // Only allow http(s) and anchor links
                const raw = attr.value.replace(/[\x00-\x1f\s]/g, '');
                if (!/^https?:\/\//i.test(raw) && !raw.startsWith('#')) continue;
              }
              clean.setAttribute(attr.name, attr.value);
            }
            clean.appendChild(sanitizeNode(child));
            fragment.appendChild(clean);
          } else {
            // Unsafe tag — keep its text children but drop the element
            fragment.appendChild(sanitizeNode(child));
          }
        }
      }
      return fragment;
    }

    const sanitized = sanitizeNode(doc.body);
    const wrapper = document.createElement('div');
    wrapper.appendChild(sanitized);
    return wrapper.innerHTML;
  }

  function queueGeminiBlockTranslation(el, targetLang) {
    const { xml, tagInfo } = buildXmlForGemini(el);
    const pureText = el.textContent.trim();

    if (!pureText || pureText.length < 10) return;
    if (!isLikelyEnglish(pureText)) return;

    if (!originalTexts.has(el)) originalTexts.set(el, el.innerHTML);

    const langName = translator.supportedLanguages[targetLang] || targetLang;

    const prompt = `You are translating technical education content (Anthropic AI courses) to ${langName}.

SOURCE (XML-tagged English):
${xml}

RULES:
- Translate to natural, fluent ${langName}
- PRESERVE all XML tags exactly: <x1>...</x1>, <x2>...</x2>, <c1/>, <c2/> etc.
- You may REORDER tags to match ${langName} grammar (e.g., SOV word order for Korean/Japanese)
- Translate the TEXT INSIDE <xN>...</xN> tags
- NEVER modify <cN/> tags (they are code identifiers — keep exactly as-is)
- Keep these terms in English (DO NOT translate): ${_protectedKeepEnglish}
- Output ONLY the translated text with tags. No explanations.`;

    translator._sendRequest({
      type: 'VERIFY_REQUEST',
      systemPrompt: prompt,
      model: SKILLBRIDGE_MODELS.GEMINI,
    }).then(result => {
      if (!result) return;
      const trimmed = result.trim();
      if (trimmed.length > xml.length * 3 || trimmed.includes('SOURCE') || trimmed.includes('RULES:')) return;

      el.innerHTML = xmlToHtml(trimmed, tagInfo);
      el.classList.remove('si18n-verifying');
      translator._cacheTranslation(pureText, el.textContent.trim(), targetLang);
    }).catch(err => {
      console.warn('[SkillBridge] Gemini block translation failed:', err.message);
      el.classList.remove('si18n-verifying');
    });

    el.classList.add('si18n-verifying');
  }

  function isCodeContent(node) {
    return !!node.parentElement?.closest('code, pre, script, style');
  }

  function getPageContext() {
    const title = document.querySelector(`h1, h2, ${SKILLJAR_SELECTORS.courseTitle}`)?.textContent || document.title || '';
    if (isExamPage) {
      return `Certification Exam: ${title}. Page type: exam/assessment. DO NOT help with answers.`;
    }
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4'))
      .map(h => h.textContent.trim())
      .slice(0, 5)
      .join(', ');
    const lessonBody = document.querySelector('#lesson-main, .lesson-content, .course-content, main');
    const bodyText = lessonBody
      ? lessonBody.innerText.replace(/\s+/g, ' ').trim().slice(0, 2000)
      : '';
    return `Course: ${title}. Sections: ${headings}${bodyText ? `\n\nLesson content:\n${bodyText}` : ''}`;
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
      if (currentLang !== 'en' && translator) {
        const elements = [];
        for (const n of nodes) {
          if (n.matches?.(TRANSLATABLE_SELECTOR)) {
            elements.push(n);
          } else {
            elements.push(...Array.from(n.querySelectorAll?.(TRANSLATABLE_SELECTOR) || []));
          }
        }

        const gtCandidates = [];

        for (const el of elements) {
          if (el.closest(EXCLUDE_SELECTOR)) continue;
          const result = processOneElement(el, currentLang);
          if (result === 'gt') gtCandidates.push(el);
        }

        if (gtCandidates.length > 0) {
          queueForGoogleTranslate(gtCandidates, currentLang);
        }
      }
    }, SKILLBRIDGE_DELAYS.DOM_DEBOUNCE);
  }

  // ============================================================
  // SPA NAVIGATION — re-evaluate on route change
  // ============================================================

  let _lastHref = location.href;

  function onRouteChange() {
    const href = location.href;
    if (href === _lastHref) return;
    _lastHref = href;

    // If user navigated to a certification exam page, tear down
    if (CERT_DISABLE_PATTERNS.some(p => p.test(href))) {
      domObserver?.disconnect();
      restoreOriginal();
      document.getElementById('si18n-exam-banner')?.remove();
      console.info('[SkillBridge] Navigated to certification page — extension disabled.');
      return;
    }

    // Re-detect exam mode for the new page
    isExamPage = detectExamPage();

    // Re-apply translations for new content
    if (currentLang !== 'en' && translator && isReady) {
      setTimeout(() => applyStaticTranslations(currentLang), SKILLBRIDGE_DELAYS.LATE_CONTENT);
    }
  }

  window.addEventListener('popstate', onRouteChange);
  window.addEventListener('hashchange', onRouteChange);

  // Catch pushState/replaceState (Skilljar SPA uses these)
  const _origPushState = history.pushState;
  const _origReplaceState = history.replaceState;
  history.pushState = function (...args) {
    _origPushState.apply(this, args);
    onRouteChange();
  };
  history.replaceState = function (...args) {
    _origReplaceState.apply(this, args);
    onRouteChange();
  };

  // ============================================================
  // BOOT
  // ============================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
