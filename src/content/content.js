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

  // ── AI-content gate (v3.5.34, 2026-05-26) ──────────────────
  // Manifest host_permission is `*.skilljar.com` (broader than just
  // anthropic.skilljar.com so the same code can serve other Skilljar-
  // hosted AI courses if any emerge). On a non-anthropic tenant we run
  // the AI-content detector and short-circuit on non-AI pages
  // (Calendly Academy etc. — Skilljar's general B2B LMS customers
  // that fell into our host pattern but aren't our audience).
  //
  // Anthropic Academy users see no change: the detector's fast path
  // unconditionally activates for `anthropic.skilljar.com`.
  //
  // Sync-only on purpose. An async storage-backed override (for the
  // rare case the heuristic mis-rejects an AI page) would require
  // wrapping the entire IIFE body in an async callback; that
  // refactor is deliberately deferred. For now the heuristic is
  // intentionally generous (anthropic-host fast path + 2 keyword
  // matches in any of title/h1/breadcrumb/body-head).
  //
  // Known follow-up (separate PR): SPA route changes do not re-evaluate
  // the gate. If the first page rejects, the extension stays paused for
  // the tab's lifetime even after navigating into an AI lesson on the
  // same tenant. Re-evaluation on pushState/popstate is being designed.
  try {
    // `??` (not `||`) so an explicit `{ isAI: false }` is honored — only
    // an actually-missing call falls through to the gate-missing default.
    // The default warns LOUDLY so a future content-script wiring regression
    // (e.g. platform.js removed from manifest.content_scripts[].js) is
    // observable in production rather than silently bypassed.
    const verdict = window._sbPlatform?.detectAITrainingContent?.() ?? {
      isAI: true,
      reason: 'gate-missing',
      hits: 0,
    };
    if (verdict.reason === 'gate-missing') {
      // `console.warn` is preserved by the production minifier (see
      // scripts/build-bundle.js PROD_PURE). `console.info` is dropped.
      console.warn(
        '[SkillBridge] AI-content gate is not wired (window._sbPlatform missing). ' +
          'Check manifest.content_scripts[].js includes src/lib/platform.js. ' +
          'Failing open: extension will activate as if no gate existed.',
      );
    }
    // Defensive: only an explicit `false` pauses. Future signature drift
    // (e.g. detector returning `{ isAI: undefined }` for a pending async
    // lookup) MUST NOT silently pause the extension on real AI pages.
    if (verdict.isAI === false) {
      console.warn(
        `[SkillBridge] Non-AI Skilljar tenant detected (${verdict.reason}). ` +
          `Extension paused on this site — gated to AI-training content per ` +
          `POSITIONING non-goal "Adding other Skilljar customers". ` +
          `Reload after navigating to an AI-keyword-rich page if you believe ` +
          `this was a false negative (SPA route changes do not re-evaluate yet).`,
      );
      return;
    }
  } catch (err) {
    console.warn('[SkillBridge] AI-content gate failed open:', err?.message);
    // Fail open — better to over-activate than to silently break the
    // extension on a transient gate error.
  }

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
  let pendingActions = [];
  // gtTranslateQueue / gtProcessing / gtGeneration / _offlinePendingItems
  // moved to gt-queue.js in v3.5.15. Read via sb._gt.gtGeneration; mutate
  // via sb._gt.reset() / bumpGeneration() / flushOfflinePending().
  let domObserver = null;
  let commentTranslateEnabled = false;
  const originalComments = new Map(); // el → original innerHTML for code elements
  let isOffline = !navigator.onLine;
  let _termPreviewShown = false;

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

  // escapeHtml is defined in gemini-block.js (loaded first) — reuse it
  const escapeHtml = window._geminiBlock.escapeHtml;

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
    get mapSizeCap() {
      return MAP_SIZE_CAP;
    },
    t,
    escapeHtml,
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

  // ============================================================
  // PER-LESSON TERM PREVIEW
  // ============================================================

  function showTermPreview() {
    if (_termPreviewShown) return;
    if (currentLang === 'en' || isExamPage) return;
    if (!translator?.staticDict || Object.keys(translator.staticDict).length === 0) return;
    if (document.getElementById('si18n-term-preview')) return;

    // Match current URL to a course
    const url = location.pathname.toLowerCase();
    let matchedSlug = null;
    let sections = null;
    for (const [slug, sects] of FLASHCARD_COURSE_SLUGS_SORTED) {
      if (url.includes(slug)) {
        matchedSlug = slug;
        sections = sects;
        break;
      }
    }
    if (!matchedSlug) return;
    _termPreviewShown = true;

    const dismissKey = `termPreview_${matchedSlug}`;
    chrome.storage.local.get([dismissKey], (result) => {
      if (result[dismissKey]) return;

      // Gather terms from matched sections
      let terms = [];
      const lang = currentLang;
      if (sections && translator.premiumLanguages.includes(lang)) {
        try {
          const jsonUrl = chrome.runtime.getURL(`src/data/${lang}.json`);
          fetch(jsonUrl)
            .then((r) => r.json())
            .then((data) => {
              for (const sect of sections) {
                if (data[sect] && typeof data[sect] === 'object') {
                  for (const [en, tr] of Object.entries(data[sect])) {
                    if (en !== tr && en.length >= 3 && en.length <= 40 && tr.length >= 1) {
                      terms.push({ en, tr });
                    }
                  }
                }
              }
              if (terms.length > 0) _renderTermPreview(terms.slice(0, 6), matchedSlug, dismissKey);
            })
            .catch(() => {});
        } catch (_ignored) {
          /* non-fatal */
        }
      } else {
        // Fallback: pick short terms from staticDict
        terms = Object.entries(translator.staticDict)
          .filter(([k, v]) => k !== v && k.length >= 3 && k.length <= 40)
          .map(([en, tr]) => ({ en, tr }))
          .slice(0, 6);
        if (terms.length > 0) _renderTermPreview(terms, matchedSlug, dismissKey);
      }
    });
  }

  function _renderTermPreview(terms, slug, dismissKey) {
    _termPreviewShown = true;
    const card = document.createElement('div');
    card.id = 'si18n-term-preview';
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');

    const courseName = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    card.innerHTML = `
      <div class="si18n-tp-header">
        <span class="si18n-tp-title">${escapeHtml(t(TERM_PREVIEW_LABELS.title))} · ${escapeHtml(courseName)}</span>
        <button class="si18n-tp-close" aria-label="Close">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="si18n-tp-terms">
        ${terms.map((term) => `<div class="si18n-tp-chip"><span class="si18n-tp-en">${escapeHtml(term.en)}</span><span class="si18n-tp-tr">${escapeHtml(term.tr)}</span></div>`).join('')}
      </div>
      <button class="si18n-tp-viewall">${escapeHtml(t(TERM_PREVIEW_LABELS.viewAll))} →</button>
    `;
    document.body.appendChild(card);

    requestAnimationFrame(() => card.classList.add('visible'));

    const dismiss = () => {
      card.classList.remove('visible');
      chrome.storage.local.set({ [dismissKey]: true });
      setTimeout(() => card.remove(), 400);
    };

    card.querySelector('.si18n-tp-close').addEventListener('click', dismiss);
    card.querySelector('.si18n-tp-viewall').addEventListener('click', () => {
      dismiss();
      window._sb.toggleSidebar?.();
      setTimeout(() => window._sb.toggleFlashcardPanel?.(), 400);
    });

    // Auto-dismiss after 15 seconds
    setTimeout(() => {
      if (document.getElementById('si18n-term-preview')) dismiss();
    }, 15000);
  }

  // ============================================================
  // REGISTER MESSAGE LISTENER IMMEDIATELY (before async init)
  // ============================================================

  chrome.runtime.onMessage.addListener(handleMessage);

  function handleMessage(request, sender, sendResponse) {
    // Catch the inverse of background.js' guard: if a `type`-shaped message
    // (intended for the bg worker) somehow reached the content script, we
    // would otherwise silently fall through to "Unknown action" and the
    // sender just sees a generic failure. Warn loudly in dev so the
    // misroute is obvious.
    if (request && typeof request === 'object' && 'type' in request && !('action' in request)) {
      console.warn(
        '[SkillBridge] Content received `type`-shaped message — should this go to background?',
        request.type,
      );
    }

    if (!isReady && request.action === 'translatePage') {
      pendingActions.push({ request, sendResponse });
      sendResponse({ success: true, queued: true });
      return false;
    }

    switch (request.action) {
      case 'translatePage':
        translatePage(request.language)
          .then(() => {
            sendResponse({ success: true });
          })
          .catch((err) => {
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
        }).catch((err) => {
          console.error('[SkillBridge] setLanguage error:', err);
          sendResponse({ success: false, error: err.message });
        });
        return true;
      }

      case 'ping':
        sendResponse({ ready: isReady });
        return false;

      case 'cacheCleanup':
        // Triggered by the 24h alarm in background.js. Page-load fallback
        // also runs this on translator init, so the alarm path is for
        // long-pinned tabs that never get a fresh load.
        translator
          ?._cleanupExpiredCache()
          .then(() => translator?._checkStorageQuota())
          .catch((err) => console.warn('[SkillBridge] alarm cleanup error:', err.message));
        sendResponse({ success: true });
        return false;

      case 'toggleCommentTranslation':
        commentTranslateEnabled = request.enabled;
        chrome.storage.local.set({ commentTranslate: request.enabled });
        if (request.enabled && currentLang !== 'en') {
          window._sb.translateCodeComments?.(currentLang);
        } else {
          originalComments.forEach((html, el) => {
            if (el && el.parentNode) el.innerHTML = html;
          });
          originalComments.clear();
        }
        sendResponse({ success: true });
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

      translator = new SkilljarTranslator();

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
      // The AI-tutor sidebar / FAB / Puter bridge run only on trusted hosts
      // (anthropic.skilljar.com + the localhost E2E fixture). Other Skilljar
      // tenants get dictionary + Google Translate but not the bridge (its
      // postMessage nonce is readable by any page-world script); claude.com
      // tutorials are translation-only. See getHostCapabilities (platform.js).
      if (sb.hostCaps.sidebar) {
        window._sb.injectSidebar?.();
      }
      if (sb.hostCaps.fab) {
        window._sb.injectFloatingButton?.();
      }

      isReady = true;

      for (const { request } of pendingActions) {
        if (request.action === 'translatePage') {
          currentLang = request.language;
          if (Object.keys(translator.staticDict).length === 0) {
            await translator.loadStaticTranslations(request.language);
          }
          sb._gt.applyStaticTranslations(request.language);
        }
      }
      pendingActions = [];

      observeDOM();

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

      if (sb.hostCaps.bridge) {
        translator.initialize().catch((err) => {
          console.warn('[SkillBridge] Bridge init failed (AI features unavailable):', err);
        });
      }

      if (sb.hostCaps.youtubeSubtitles && typeof YouTubeSubtitleManager !== 'undefined') {
        subtitleManager = new YouTubeSubtitleManager(currentLang);
        subtitleManager.initialize().catch((err) => {
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
      // Mirror the trusted-host gate above: never inject the tutor UI on a
      // translation-only host (claude.com) just because init threw.
      if (sb.hostCaps.sidebar) {
        window._sb.injectSidebar?.();
      }
      if (sb.hostCaps.fab) {
        window._sb.injectFloatingButton?.();
      }
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
    if (Object.keys(translator.staticDict).length === 0) {
      await translator.loadStaticTranslations(targetLang);
    }
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
    clearTimeout(translateTimeout);
    pendingNodes = [];
    currentLang = 'en';
    window._protectedTerms.resetProtectedTerms();
    updateLangClass('en');
    window._sb.hideTranslationProgress?.();
    originalComments.forEach((html, el) => {
      if (el && el.parentNode) el.innerHTML = html;
    });
    originalComments.clear();
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

  // Language → Google Fonts family (load only what's needed)
  const _LANG_FONT_MAP = {
    ko: 'Noto+Sans+KR',
    ja: 'Noto+Sans+JP',
    'zh-CN': 'Noto+Sans+SC',
    'zh-TW': 'Noto+Sans+TC',
    ar: 'Noto+Sans+Arabic',
    hi: 'Noto+Sans+Devanagari',
    bn: 'Noto+Sans+Bengali',
    th: 'Noto+Sans+Thai',
    he: 'Noto+Sans+Hebrew',
  };

  function injectGoogleFonts(lang) {
    if (document.getElementById('sb-google-fonts')) return;
    const family = _LANG_FONT_MAP[lang];
    if (!family) return; // Latin-script languages use system fonts

    const link = document.createElement('link');
    link.id = 'sb-google-fonts';
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${family}:wght@400;500;700&display=swap`;
    link.onerror = () => {
      // Graceful fallback — system fonts will be used via CSS font-family stack
      console.debug('[SkillBridge] Google Fonts unavailable, using system fonts');
      link.remove();
    };
    document.head.appendChild(link);
  }

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
    if (lang && lang !== 'en') injectGoogleFonts(lang);
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
    bridge: true,
    headerControls: true,
    keyboardShortcuts: true,
    readingAid: true,
    examDetection: true,
    youtubeSubtitles: true,
  };
  sb.translationScope = sb.hostCaps.contentScope;

  // ============================================================
  // DOM OBSERVER (with cleanup)
  // ============================================================

  let _pruneScheduled = false;
  function schedulePrune() {
    if (_pruneScheduled) return;
    _pruneScheduled = true;
    requestAnimationFrame(() => {
      _pruneScheduled = false;
      sb._gt.pruneDetachedEntries();
    });
  }

  function observeDOM() {
    domObserver = new MutationObserver((mutations) => {
      let hasRemovals = false;
      for (const mutation of mutations) {
        if (mutation.removedNodes.length > 0) hasRemovals = true;

        if (currentLang === 'en' || !translator || !isReady) continue;
        for (const node of mutation.addedNodes) {
          if (
            node.nodeType === Node.ELEMENT_NODE &&
            !node.closest('.skillbridge-sidebar') &&
            !node.closest('#skillbridge-bridge')
          ) {
            debounceTranslateNew(node);
          }
        }
      }
      if (hasRemovals && (originalTexts.size > 0 || translatedTexts.size > 0)) {
        schedulePrune();
      }
    });

    domObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Cleanup on page hide (pagehide is preferred over unload — doesn't block bfcache)
  window.addEventListener('pagehide', () => {
    domObserver?.disconnect();
    clearTimeout(translateTimeout);
    pendingNodes = [];
    // Restore original history methods to prevent wrapper stacking on bfcache restore
    if (_origPushState) history.pushState = _origPushState;
    if (_origReplaceState) history.replaceState = _origReplaceState;
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

        // Honour the per-host content scope: on claude.com tutorials only
        // translate freshly-inserted nodes that live inside the lesson root,
        // never the surrounding marketing shell. null scope = no restriction.
        const scope = sb.translationScope;
        const scoped = scope ? elements.filter((el) => el.closest(scope)) : elements;

        const gtCandidates = [];

        for (const el of scoped) {
          if (el.closest(EXCLUDE_SELECTOR)) continue;
          const result = sb._gt.processOneElement(el, currentLang);
          if (result === 'gt') gtCandidates.push(el);
        }

        if (gtCandidates.length > 0) {
          sb._gt.queueForGoogleTranslate(gtCandidates, currentLang);
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

    // Abort any in-flight tutor stream — its target lesson context is now
    // stale, and onChunk would write into a chat bubble for a page the
    // user has already left.
    window._sb.cancelActiveStream?.();

    // If user navigated to a Skilljar certification exam page, tear down.
    // Skipped on hosts without Skilljar exams (claude.com tutorials).
    if (sb.hostCaps.examDetection && CERT_DISABLE_PATTERNS.some((p) => p.test(href))) {
      domObserver?.disconnect();
      restoreOriginal();
      document.getElementById('si18n-exam-banner')?.remove();
      console.info('[SkillBridge] Navigated to certification page — extension disabled.');
      return;
    }

    // Re-enable observer if it was disconnected (e.g., after visiting a cert page)
    if (!domObserver || !document.body) {
      observeDOM();
    } else {
      try {
        domObserver.observe(document.body, { childList: true, subtree: true });
      } catch (_ignored) {
        /* observer already active */
      }
    }

    // Re-detect exam mode for the new page (Skilljar hosts only — claude.com
    // tutorials have no Skilljar exams, so honour examDetection here too).
    isExamPage = sb.hostCaps.examDetection ? detectExamPage() : false;

    // Re-apply translations for new content
    if (currentLang !== 'en' && translator && isReady) {
      setTimeout(() => sb._gt.applyStaticTranslations(currentLang), SKILLBRIDGE_DELAYS.LATE_CONTENT);
    }
  }

  window.addEventListener('popstate', onRouteChange);
  window.addEventListener('hashchange', onRouteChange);

  // Catch pushState/replaceState (Skilljar SPA uses these).
  // Guard against double-wrapping: extension reloads/updates re-run this
  // module; without the marker we'd capture the previous wrapper as the
  // "original" and stack handlers, doubling onRouteChange per nav.
  let _origPushState = null;
  let _origReplaceState = null;
  if (!history.pushState.__sb_wrapped__) {
    _origPushState = history.pushState;
    _origReplaceState = history.replaceState;
    history.pushState = function (...args) {
      _origPushState.apply(this, args);
      onRouteChange();
    };
    history.replaceState = function (...args) {
      _origReplaceState.apply(this, args);
      onRouteChange();
    };
    history.pushState.__sb_wrapped__ = true;
    history.replaceState.__sb_wrapped__ = true;
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
