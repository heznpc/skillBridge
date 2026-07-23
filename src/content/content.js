/**
 * SkillBridge — AI Course Translator - Content Script
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
  if (CERT_DISABLE_PATTERNS.some((p) => p.test(location.href))) {
    console.info('[SkillBridge] Certification exam page detected — extension disabled.');
    return;
  }

  // Keep the broad Skilljar host permission safe: non-AI Skilljar tenants pause
  // here, while Anthropic Academy and detector failures fail open.
  const aiGate = window._sbContentLifecycle.createAIGateController({
    detectAITrainingContent: () => window._sbPlatform?.detectAITrainingContent?.(),
  });
  const activationQueue = window._sbContentLifecycle.createActivationQueue({
    isActive: () => !aiGate.paused,
  });

  aiGate.evaluate({ logPause: true });

  // Target ALL visible text elements — including Skilljar-specific
  // Skilljar selectors are centralized in src/lib/selectors.js
  const TRANSLATABLE_SELECTOR = [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'li',
    'td',
    'th',
    'label',
    'figcaption',
    'span',
    '.btn-text',
    '.nav-text',
    'blockquote',
    'dt',
    'dd',
    SKILLJAR_SELECTORS.courseBox,
    SKILLJAR_SELECTORS.courseBoxDesc,
    SKILLJAR_SELECTORS.ribbonText,
    SKILLJAR_SELECTORS.courseTime,
    SKILLJAR_SELECTORS.faqTitle,
    `${SKILLJAR_SELECTORS.faqPost} p`,
    'div.title',
    // Course-author "course roadmap" widget (embedded HTML block). Plain divs
    // with text that `div.title` doesn't match — without these the roadmap
    // heading and step cards stayed English while the rest of the lesson
    // translated.
    '.crm-title',
    '.crm-card-h',
    `${SKILLJAR_SELECTORS.lessonRow} div.title, ${SKILLJAR_SELECTORS.lessonRow} .lesson-wrapper div`,
    SKILLJAR_SELECTORS.focusLink,
    SKILLJAR_SELECTORS.sectionTitle,
    SKILLJAR_SELECTORS.leftNavReturn,
    SKILLJAR_SELECTORS.courseOverview,
    `${SKILLJAR_SELECTORS.lessonTop} h2`,
    SKILLJAR_SELECTORS.detailsPane,
    SKILLJAR_SELECTORS.courseFamilyTitle,
    SKILLJAR_SELECTORS.courseRatingText,
  ].join(', ');

  const EXCLUDE_SELECTOR = [
    'code',
    'pre',
    'script',
    'style',
    'noscript',
    '.code-block',
    '.syntax-highlight',
    '.skillbridge-sidebar',
    '#skillbridge-bridge',
    '#skillbridge-fab',
    'header nav',
    '.site-header nav',
    'nav.navbar',
    'footer',
    SKILLJAR_SELECTORS.aiTutor, // [class*="ai-tutor"] already covers button & panel variants
  ].join(', ');

  let translator = null;
  let subtitleManager = null;
  let currentLang = 'en';
  let isExamPage = false;
  let isReady = false;
  let sidebarVisible = false;
  const originalTexts = new Map();
  const translatedTexts = new Map();
  const MAP_SIZE_CAP = 5000;
  // gtTranslateQueue / gtProcessing / gtGeneration / _offlinePendingItems
  // moved to gt-queue.js in v3.5.15. Read via sb._gt.gtGeneration; mutate
  // via sb._gt.reset() / bumpGeneration() / flushOfflinePending().
  let commentTranslateEnabled = false;
  const originalComments = new Map(); // el → original innerHTML for code elements
  let isOffline = !navigator.onLine;
  let isCertDisabled = false;

  window.addEventListener('online', () => {
    isOffline = false;
    window._sb.hideOfflineBanner?.();
    // Retry deferred offline items first, then re-apply if needed.
    if (currentLang !== 'en' && translator && isReady) {
      const flushed = window._sb._gt?.flushOfflinePending?.(currentLang);
      if (!flushed) window._sb._gt?.applyStaticTranslations?.(currentLang);
    }
  });

  window.addEventListener('offline', () => {
    isOffline = true;
    if (currentLang !== 'en') window._sb.showOfflineBanner?.();
  });

  // Lookup helper: returns map entry for given lang, falling back to 'en'
  function t(map, lang) {
    return map[lang || currentLang] || map['en'];
  }

  // escapeHtml is centralized in dom-safe.js (backed by gemini-block.js).
  const escapeHtml = window._sbDomSafe.escapeHtml;

  // ============================================================
  // SHARED NAMESPACE — expose state for extracted modules
  // (header-controls.js, text-selection.js, sidebar-chat.js)
  // ============================================================

  // ============================================================
  // EXAM PAGE DETECTION
  // ============================================================

  function detectExamPage() {
    const url = location.href;
    if (EXAM_URL_PATTERNS.some((p) => p.test(url))) return true;
    // DOM-based detection: check for quiz forms or answer option containers
    if (document.querySelector(SKILLJAR_SELECTORS.quizForm)) return true;
    if (document.querySelector(SKILLJAR_SELECTORS.answerOption)) return true;
    return false;
  }

  const moduleRegistry = new Map();
  const REQUIRED_CONTENT_MODULES = [
    'gt-queue',
    'banners',
    'code-comments',
    'header-controls',
    'text-selection',
    'chat-render',
    'shadow-css',
    'ui-root',
    'pdf-export',
    'chat-message-dom',
    'sidebar-chat',
    'chat-subpanels',
    'chat-history',
    'chat-flashcards',
    'bookmarks',
    'resume',
    'dashboard',
    'reading-aid',
    'keyboard-shortcuts',
  ];

  function registerModule(name, details = {}) {
    moduleRegistry.set(name, { ...details, registeredAt: Date.now() });
  }

  function assertModuleContract() {
    const missing = REQUIRED_CONTENT_MODULES.filter((name) => !moduleRegistry.has(name));
    if (missing.length > 0) {
      console.warn('[SkillBridge] Content module contract incomplete. Missing:', missing.join(', '));
    }
    return {
      ok: missing.length === 0,
      missing,
      loaded: Array.from(moduleRegistry.keys()),
    };
  }

  function whenActive(callback) {
    activationQueue.whenActive(callback);
  }

  function runActivationCallbacks() {
    activationQueue.run();
  }

  window._sb = {
    get currentLang() {
      return currentLang;
    },
    set currentLang(v) {
      currentLang = v;
    },
    get sidebarVisible() {
      return sidebarVisible;
    },
    set sidebarVisible(v) {
      sidebarVisible = v;
    },
    get translator() {
      return translator;
    },
    get isExamPage() {
      return isExamPage;
    },
    set isExamPage(v) {
      isExamPage = v;
    },
    get certDisabled() {
      return isCertDisabled;
    },
    // Read-only observability seam for the YouTube subtitle-manager lifecycle
    // (created at init, torn down on cert-page nav, rebuilt on return). No
    // production consumer — it lets the e2e suite assert the manager is released
    // and rebuilt across SPA route changes without exposing the manager itself.
    get hasSubtitleManager() {
      return subtitleManager !== null;
    },
    get originalTexts() {
      return originalTexts;
    },
    get translatedTexts() {
      return translatedTexts;
    },
    get originalComments() {
      return originalComments;
    },
    // gtGeneration now lives in gt-queue.js; expose the read-only view here
    // so existing consumers (typedef, DOM observer) keep working unchanged.
    get gtGeneration() {
      return window._sb._gt?.gtGeneration ?? 0;
    },
    get isOffline() {
      return isOffline;
    },
    get commentTranslateEnabled() {
      return commentTranslateEnabled;
    },
    get aiGatePaused() {
      return aiGate.paused;
    },
    get aiGateVerdict() {
      return aiGate.verdict;
    },
    get mapSizeCap() {
      return MAP_SIZE_CAP;
    },
    t,
    escapeHtml,
    registerModule,
    assertModuleContract,
    whenActive,
    // isLikelyEnglish is re-attached by gt-queue.js (declared there since
    // v3.5.15 — every call-site lived inside the GT pipeline).
    switchLanguage,
    getPageContext,
    // Helpers consumed by gt-queue.js / banners / route-change handler:
    safeReplaceText: null, // filled below after function definition
    updateLangClass: null,
    detectExamPage,
    showTermPreview: null, // filled below
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
    translateCodeComments: null,
  };

  // Local alias for the namespace, captured AFTER assignment so the
  // `sb._gt.X` / `sb._chat.X` call-sites below resolve correctly. The
  // previous version of this file declared `const sb = window._sb` at the
  // very top of the IIFE — before `window._sb = {...}` ran — which left
  // `sb` permanently undefined and every later `sb._gt.X` call would
  // throw "Cannot read properties of undefined". The v3.5.16 E2E suite
  // (tests/e2e/golden-translation.spec.js) caught this on the first run.
  const sb = window._sb;
  sb.registerModule('content');

  // Create the YouTube subtitle manager if this host supports it and one isn't
  // already live. Idempotent: used at init AND when re-entering a video-capable
  // lesson after a certification page tore the previous manager down (its
  // MutationObserver + global 'message' listener are released by destroy(), so
  // a fresh manager must be built rather than reusing the dead one).
  function ensureSubtitleManager() {
    if (subtitleManager || !sb.hostCaps?.youtubeSubtitles) return;
    if (typeof YouTubeSubtitleManager === 'undefined') return;
    subtitleManager = new YouTubeSubtitleManager(currentLang);
    subtitleManager.initialize().catch((err) => {
      console.warn('[SkillBridge] YouTube subtitle init failed:', err);
    });
  }

  const termPreview = window._sbContentTermPreview.createTermPreview({
    getCurrentLang: () => currentLang,
    getIsExamPage: () => isExamPage,
    getTranslator: () => translator,
    courseSlugs: FLASHCARD_COURSE_SLUGS_SORTED,
    labels: TERM_PREVIEW_LABELS,
    translateLabel: (labelMap) => t(labelMap),
    escapeHtml,
    storage: chrome.storage.local,
    getDataUrl: (lang) => chrome.runtime.getURL(`src/data/${lang}.json`),
    openFlashcards: () => {
      window._sb.toggleSidebar?.();
      setTimeout(() => window._sb.toggleFlashcardPanel?.(), 400);
    },
  });

  function showTermPreview() {
    termPreview.show();
  }

  // Register message listener immediately (before async init).
  const messageRouter = window._sbContentMessages.createContentMessageRouter({
    isCertificationDisabled: () => isCertDisabled,
    isReady: () => isReady,
    translatePage,
    restoreOriginal,
    toggleSidebar: () => window._sb.toggleSidebar?.(),
    getPageContext,
    isSupportedLanguage: (lang) => lang === 'en' || !!SUPPORTED_LANGUAGE_MAP[lang],
    switchLanguage,
    cleanupCache: () => {
      // Triggered by the 24h alarm in background.js. Page-load fallback also
      // runs this on translator init, so the alarm path is for long-pinned tabs.
      translator
        ?._cleanupExpiredCache()
        .then(() => translator?._checkStorageQuota())
        .catch((err) => console.warn('[SkillBridge] alarm cleanup error:', err.message));
    },
    setCommentTranslation: (enabled) => {
      commentTranslateEnabled = enabled;
      chrome.storage.local.set({ commentTranslate: enabled });
      if (enabled && currentLang !== 'en') {
        window._sb.translateCodeComments?.(currentLang);
      } else {
        originalComments.forEach((html, el) => {
          if (el && el.parentNode) el.innerHTML = html;
        });
        originalComments.clear();
      }
    },
  });
  chrome.runtime.onMessage.addListener(messageRouter.handleMessage);

  const domTranslationObserver = window._sbContentDomObserver.createContentDomObserver({
    getCurrentLang: () => currentLang,
    getTranslator: () => translator,
    getIsReady: () => isReady,
    getOriginalTextCount: () => originalTexts.size,
    getTranslatedTextCount: () => translatedTexts.size,
    pruneDetachedEntries: () => sb._gt.pruneDetachedEntries(),
    getTranslatableSelector: () => TRANSLATABLE_SELECTOR,
    getExcludeSelector: () => EXCLUDE_SELECTOR,
    getTranslationScope: () => sb.translationScope,
    getHostCaps: () => sb.hostCaps,
    getIsExamPage: () => sb.isExamPage,
    setIsExamPage: (value) => {
      sb.isExamPage = value;
    },
    detectExamPage: () => sb.detectExamPage(),
    processOneElement: (el, lang) => sb._gt.processOneElement(el, lang),
    queueForGoogleTranslate: (elements, lang) => sb._gt.queueForGoogleTranslate(elements, lang),
    delays: SKILLBRIDGE_DELAYS,
    thresholds: SKILLBRIDGE_THRESHOLDS,
  });

  // ============================================================
  // INITIALIZATION
  // ============================================================

  let initStarted = false;

  async function init() {
    if (aiGate.paused) return;
    if (initStarted) return;
    initStarted = true;
    try {
      const stored = await chrome.storage.local.get([
        'targetLanguage',
        'autoTranslate',
        'welcomeShown',
        'darkMode',
        'commentTranslate',
      ]);
      if (stored.darkMode) document.documentElement.classList.add('si18n-dark');
      commentTranslateEnabled = !!stored.commentTranslate;
      currentLang = stored.targetLanguage || 'en';
      isExamPage = sb.hostCaps.examDetection ? detectExamPage() : false;

      translator = new SkilljarTranslator({ aiEnabled: sb.hostCaps.bridge !== false });
      if (!translator.aiEnabled) {
        await translator.initialize();
      }

      if (currentLang !== 'en') {
        await translator.loadStaticTranslations(currentLang);
        if (stored.autoTranslate && Object.keys(translator.staticDict).length > 0) {
          sb._gt.applyStaticTranslations(currentLang);
        }
      }

      // Header language <select> + dark-mode toggle anchor on Skilljar's nav
      // (#header-right). Gated so they never fire on claude.com tutorials,
      // whose Webflow nav has no such anchor.
      if (sb.hostCaps.headerControls) {
        window._sb.injectHeaderLanguageSelect?.();
        window._sb.injectDarkModeToggle?.();
      }
      // Sidebar/FAB availability is host-scoped. Its body is either the AI
      // tutor (developer build on a trusted host) or the bridge-free language
      // and local-tools surface (CWS build / translation-only host).
      if (sb.hostCaps.sidebar) {
        window._sb.injectSidebar?.();
      }
      if (sb.hostCaps.fab) {
        window._sb.injectFloatingButton?.();
      }
      runActivationCallbacks();

      isReady = true;

      for (const request of messageRouter.drainPendingTranslateRequests()) {
        if (request.action === 'translatePage') {
          currentLang = request.language;
          if (Object.keys(translator.staticDict).length === 0) {
            await translator.loadStaticTranslations(request.language);
          }
          sb._gt.applyStaticTranslations(request.language);
        }
      }

      domTranslationObserver.observe();

      if (stored.autoTranslate && currentLang !== 'en') {
        setTimeout(() => sb._gt.applyStaticTranslations(currentLang), SKILLBRIDGE_DELAYS.LATE_CONTENT);
      }

      translator.onTranslationUpdate((originalText, finalTranslation, targetLang, wasImproved) => {
        if (targetLang !== currentLang) return;
        const entries = translatedTexts.get(originalText);
        if (!entries) return;

        // Prune detached elements to prevent memory leak
        const live = entries.filter((e) => e.el?.parentNode);
        if (live.length === 0) {
          translatedTexts.delete(originalText);
          return;
        }
        if (live.length < entries.length) translatedTexts.set(originalText, live);

        for (const entry of live) {
          sb._gt.removeVerifySpinner(entry.el);
          if (wasImproved) {
            safeReplaceText(entry.el, window._protectedTerms.restoreProtectedTerms(finalTranslation));
            entry.el.classList.add('si18n-text-updated');
            setTimeout(() => entry.el.classList.remove('si18n-text-updated'), SKILLBRIDGE_DELAYS.TEXT_UPDATE_FADE);
          }
        }
      });

      if (translator.aiEnabled) {
        translator.initialize().catch((err) => {
          console.warn('[SkillBridge] Bridge init failed (AI features unavailable):', err);
        });
      }

      ensureSubtitleManager();

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
      // Mirror the trusted-host gate above: never inject the tutor UI on a
      // translation-only host (claude.com) just because init threw.
      if (sb.hostCaps.sidebar) {
        window._sb.injectSidebar?.();
      }
      if (sb.hostCaps.fab) {
        window._sb.injectFloatingButton?.();
      }
      runActivationCallbacks();
    }
  }

  // ============================================================
  // PAGE TRANSLATION
  // ============================================================

  async function translatePage(targetLang) {
    if (!translator) return;
    currentLang = targetLang;
    if (targetLang === 'en') {
      restoreOriginal();
      return;
    }
    // Always load the TARGET language's dictionary. The old `length === 0` guard
    // skipped the load whenever ANY dictionary was already populated, so a popup
    // re-translate to a different language applied the previously-loaded dict.
    await translator.loadStaticTranslations(targetLang);
    // Same out-of-order-load guard as switchLanguage(): a newer request may have
    // run while we awaited; currentLang is the synchronous source of truth for the
    // latest target, so bail rather than paint a now-stale language.
    if (currentLang !== targetLang) return;
    sb._gt.applyStaticTranslations(targetLang);
  }

  function restoreOriginal() {
    originalTexts.forEach((html, el) => {
      if (el && el.parentNode) el.innerHTML = html;
    });
    originalTexts.clear();
    translatedTexts.clear();
    // gt-queue.js owns gtTranslateQueue / gtProcessing / gtGeneration /
    // _offlinePendingItems since v3.5.15 — reset() clears all four and bumps
    // gtGeneration so any in-flight Promise.all bails before writing.
    sb._gt?.reset?.();
    domTranslationObserver.resetPending();
    currentLang = 'en';
    window._protectedTerms.resetProtectedTerms();
    updateLangClass('en');
    window._sb.hideTranslationProgress?.();
    originalComments.forEach((html, el) => {
      if (el && el.parentNode) el.innerHTML = html;
    });
    originalComments.clear();
  }

  function injectHostSurfaces() {
    if (sb.hostCaps.headerControls) {
      window._sb.injectHeaderLanguageSelect?.();
      window._sb.injectDarkModeToggle?.();
    }
    if (sb.hostCaps.sidebar) window._sb.injectSidebar?.();
    if (sb.hostCaps.fab) window._sb.injectFloatingButton?.();
  }

  function teardownCertificationSurface() {
    isCertDisabled = true;
    window._sb.cancelActiveStream?.();
    domTranslationObserver.disconnect();
    subtitleManager?.destroy();
    subtitleManager = null;
    restoreOriginal();
    sidebarVisible = false;
    // Remove every UI surface that could translate, open the tutor, or trigger
    // page actions while the SPA tab is sitting on a proctored cert page.
    window._sbContentSurface.removeContentSurfaces(
      document,
      sb,
      window._sbContentSurface.CERTIFICATION_SURFACE_SELECTORS,
    );
  }

  function reenableAfterCertificationSurface() {
    if (!isCertDisabled) return;
    isCertDisabled = false;
    injectHostSurfaces();
  }

  function teardownNonAIContentSurface() {
    window._sb.cancelActiveStream?.();
    domTranslationObserver.disconnect();
    subtitleManager?.destroy();
    subtitleManager = null;
    if (translator) restoreOriginal();
    sidebarVisible = false;
    window._sbContentSurface.removeContentSurfaces(
      document,
      sb,
      window._sbContentSurface.NON_AI_CONTENT_SURFACE_SELECTORS,
    );
  }

  async function switchLanguage(newLang, opts = {}) {
    const storageData = { targetLanguage: newLang, autoTranslate: newLang !== 'en', ...opts.extraStorage };
    chrome.storage.local.set(storageData);

    if (!opts.skipRestore) restoreOriginal();
    currentLang = newLang;
    // Invalidate any in-flight verify-queue work targeting the previous lang
    // so its callbacks don't write stale translations into the now-current
    // page. Mirrors content.js's gtGeneration counter for the GT pipeline.
    translator?.bumpLangGeneration?.();

    try {
      if (newLang === 'en') {
        window._sb.updateLocalizedLabels?.();
        if (subtitleManager) subtitleManager.setLanguage('en');
        return;
      }

      await translator.loadStaticTranslations(newLang);
      // A newer switchLanguage() can run while we await the dictionary load
      // (disk/cache timing resolves loads out of order). currentLang is set
      // synchronously to the latest request, so if it no longer equals this
      // call's target the call is stale — bail rather than paint a now-wrong
      // language over the page. bumpLangGeneration() above guards the verify
      // queue; this guards the static-apply path it doesn't cover.
      if (currentLang !== newLang) return;
      sb._gt.applyStaticTranslations(newLang);
      window._sb.updateLocalizedLabels?.();
      if (subtitleManager) subtitleManager.setLanguage(newLang);
    } finally {
      opts.onDone?.();
    }
  }

  // Non-Latin scripts render with the OS-native font stack declared in
  // content CSS (e.g. 'Apple SD Gothic Neo' / 'Malgun Gothic' for Korean,
  // 'Hiragino Kaku Gothic Pro' / 'Yu Gothic' for Japanese, 'PingFang' /
  // 'Microsoft YaHei' for Chinese). We deliberately do NOT fetch fonts from
  // fonts.googleapis.com: that request would leak the user's IP and reading
  // language to a third party not disclosed in PRIVACY_POLICY.md, contradicting
  // the extension's "no third-party contact / no tracking" promise.

  function updateLangClass(lang) {
    // html lang (screen readers) + dir (RTL) are page-level semantics — set on
    // the document regardless of scope.
    document.documentElement.lang = lang || 'en';
    const rtlLangs = ['ar', 'he'];
    document.documentElement.dir = rtlLangs.includes(lang) ? 'rtl' : 'ltr';
    // Apply the font/lang class to the translation target(s). On document-wide
    // hosts that's <body>; on scoped hosts (claude.com tutorials) it's the
    // lesson root(s) only, so the surrounding marketing shell keeps Anthropic's
    // own typography instead of being restyled into the CJK font stack.
    const scope = sb.translationScope;
    const targets = scope ? Array.from(document.querySelectorAll(scope)) : document.body ? [document.body] : [];
    for (const el of targets) {
      for (const cls of [...el.classList].filter((c) => c.startsWith('si18n-lang-'))) el.classList.remove(cls);
      if (lang && lang !== 'en') el.classList.add(`si18n-lang-${lang}`);
    }
  }

  function safeReplaceText(el, newText) {
    if (el.children.length === 0) {
      el.textContent = newText;
      return;
    }

    // `newText` is the translation of the element's ENTIRE visible text,
    // including any text that lives inside inline children (<strong>, <a>,
    // <em>, …). We must therefore consider every descendant text node — not
    // just the element's direct text-node children.
    //
    // The previous version only collected direct-child text nodes, so a block
    // like `<p><strong>Estimated time:</strong> 15 minutes</p>` left the
    // <strong> text untranslated and wrote the full translation into the
    // trailing text node, rendering "Estimated time:예상 시간: 15분" — the
    // English original and its translation duplicated side by side. Any
    // paragraph with a bold/linked lead-in hit this.
    //
    // Writing the whole translation into the FIRST meaningful descendant text
    // node and clearing every other one removes the duplication while keeping
    // the inline elements in place (links stay clickable, the wrapping
    // <strong> survives). Code/pre/script/style text is preserved untouched,
    // so inline <code> fragments are never overwritten.
    const meaningful = getTextNodes(el);
    if (meaningful.length === 0) {
      el.textContent = newText;
      return;
    }
    const target = meaningful[0];

    // Blank ALL other descendant text nodes — not just the ones getTextNodes
    // returns. getTextNodes skips sub-2-char nodes (punctuation), but those
    // can still hold real original text inside a short inline tag (e.g.
    // `<b>A</b>`) that would otherwise leak in next to the translation.
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    const toBlank = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node === target) continue;
      if (node.parentElement?.closest('code, pre, script, style')) continue;
      toBlank.push(node);
    }
    target.textContent = newText;
    for (const node of toBlank) node.textContent = '';
  }

  // Local copy — gt-queue.js has its own (private to the GT pipeline).
  // Both walk the same tree shape so keeping them in sync is trivial; the
  // alternative (a `sb.getTextNodes` shared handle) would just funnel two
  // independent call sites through one extra indirection for no real win.
  function getTextNodes(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (node.textContent.trim().length < 2) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest('code, pre, script, style')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function getPageContext() {
    const title =
      document.querySelector(`h1, h2, ${SKILLJAR_SELECTORS.courseTitle}`)?.textContent || document.title || '';
    if (isExamPage) {
      return `Certification Exam: ${title}. Page type: exam/assessment. DO NOT help with answers.`;
    }
    // Heading map with the section the user is currently reading marked —
    // gives the tutor a table of contents plus "you are here".
    const hs = Array.from(document.querySelectorAll('h1, h2, h3, h4'));
    let currentIdx = -1;
    for (let i = 0; i < hs.length; i++) {
      if (hs[i].getBoundingClientRect().top <= 80) currentIdx = i;
    }
    const headings = hs
      .slice(0, 8)
      .map((h, i) => (i === currentIdx ? `▶ ${h.textContent.trim()}` : h.textContent.trim()))
      .join(', ');
    const lessonBody = document.querySelector('#lesson-main, .lesson-content, .course-content, main');
    // Viewport-centred extract: long lessons used to send only the FIRST
    // 2,000 chars, so questions about anything past the fold had no grounding.
    // Now: a short lesson opening for global context + the text from the block
    // the user is actually looking at. Hard-capped at 2,000 chars total — the
    // privacy policy discloses "≤2,000 chars of lesson context" and that cap
    // must hold no matter how the pieces combine.
    let bodyText = '';
    if (lessonBody) {
      const flat = lessonBody.innerText.replace(/\s+/g, ' ').trim();
      const blocks = Array.from(lessonBody.querySelectorAll('p, li, h2, h3, h4, pre, td'));
      const vpIdx = blocks.findIndex((el) => el.getBoundingClientRect().bottom > 0);
      if (vpIdx > 0) {
        let current = '';
        for (let i = Math.max(0, vpIdx - 1); i < blocks.length && current.length < 1500; i++) {
          current += blocks[i].innerText.replace(/\s+/g, ' ').trim() + ' ';
        }
        current = current.trim().slice(0, 1500);
        const opening = flat.slice(0, 400);
        bodyText =
          current && !opening.includes(current.slice(0, 80))
            ? `${opening}\n\n[User is currently viewing:]\n${current}`
            : flat.slice(0, 2000);
      } else {
        bodyText = flat.slice(0, 2000);
      }
      bodyText = bodyText.slice(0, 2000);
    }
    return `Course: ${title}. Sections: ${headings}${bodyText ? `\n\nLesson content:\n${bodyText}` : ''}`;
  }

  // Wire helpers onto `_sb` now that their function declarations are in scope.
  // (Function declarations are hoisted, but the namespace object was built
  // before this point and its initial values for these keys were `null`.)
  sb.safeReplaceText = safeReplaceText;
  sb.updateLangClass = updateLangClass;
  sb.showTermPreview = showTermPreview;
  // Build the translatable + exclude selectors once and expose them so
  // gt-queue.js's getTranslatableElements doesn't have to know about the
  // Skilljar selector dictionary.
  sb.translatableSelector = TRANSLATABLE_SELECTOR;
  sb.excludeSelector = EXCLUDE_SELECTOR;
  // Per-host capability profile — the single source of truth (platform.js) for
  // which features may run on this host. Threaded as sb.hostCaps so every
  // host-specific behaviour reads one place instead of ad-hoc host compares.
  // contentScope confines the translation walk + reading aid to the lesson
  // root(s) on claude.com tutorials; null (Skilljar, localhost E2E) = document.
  // Fail open to full features if platform.js somehow didn't load (mirrors the
  // AI-content gate's fail-open) so Skilljar is never silently degraded.
  sb.hostCaps = (window._sbPlatform && window._sbPlatform.getHostCapabilities
    ? window._sbPlatform.getHostCapabilities(location.hostname)
    : null) || {
    platform: 'skilljar',
    trusted: true,
    contentScope: null,
    sidebar: true,
    fab: true,
    bridge: globalThis.__SKILLBRIDGE_AI_GATEWAY_ENABLED__ !== false,
    headerControls: true,
    keyboardShortcuts: true,
    readingAid: true,
    examDetection: true,
    youtubeSubtitles: true,
  };
  sb.translationScope = sb.hostCaps.contentScope;

  const routeController = window._sbContentLifecycle.createRouteController({
    getHref: () => location.href,
    isCertificationHref: (href) => sb.hostCaps.examDetection && CERT_DISABLE_PATTERNS.some((p) => p.test(href)),
    teardownCertificationSurface,
    evaluateGate: (opts) => aiGate.evaluate(opts),
    isGatePaused: () => aiGate.paused,
    isInitStarted: () => initStarted,
    init,
    teardownNonAIContentSurface,
    rehydrateAfterGateResume: () => {
      injectHostSurfaces();
      runActivationCallbacks();
    },
    cancelActiveStream: () => window._sb.cancelActiveStream?.(),
    reenableAfterCertificationSurface,
    ensureObserver: () => domTranslationObserver.observe(),
    ensureSubtitleManager,
    redetectExamPage: () => {
      isExamPage = sb.hostCaps.examDetection ? detectExamPage() : false;
    },
    reapplyTranslations: () => {
      if (currentLang !== 'en' && translator && isReady) {
        setTimeout(() => sb._gt.applyStaticTranslations(currentLang), SKILLBRIDGE_DELAYS.LATE_CONTENT);
      }
    },
    onPageHide: () => {
      domTranslationObserver.disconnect();
      domTranslationObserver.resetPending();
    },
  });

  // ============================================================
  // BOOT
  // ============================================================

  routeController.start();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  setTimeout(() => sb.assertModuleContract(), SKILLBRIDGE_DELAYS.SIDEBAR_BIND);
})();
