/**
 * SkillBridge for Anthropic Academy - Content Script
 * Injects translation UI and handles page content translation
 *
 * Respects copyright: only translates displayed text on-the-fly
 * Never stores, caches permanently, or redistributes original content
 */

(function () {
  'use strict';

  // Target ALL visible text elements — including Skilljar-specific
  // Course cards use <div class="coursebox-text"> NOT h2/p!
  const TRANSLATABLE_SELECTOR = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',       // all headings
    'p',                                          // all paragraphs
    'li',                                         // all list items
    'td', 'th',                                   // table cells
    'label',                                      // form labels
    'figcaption',                                  // figure captions
    'span',                                        // spans with text
    '.btn-text', '.nav-text',                     // button/nav text
    'blockquote',                                  // quotes
    'dt', 'dd',                                    // definition lists
    // Skilljar-specific elements
    '.coursebox-text',                             // course card titles
    '.coursebox-text-description',                 // course card descriptions
    '.sj-ribbon-text',                             // "Registered" / "Enrolled" badges
    '.course-time',                                // course duration text
    '.faq-title',                                  // FAQ question titles
    '.faq-post p',                                 // FAQ answer paragraphs
    'div.title',                                   // curriculum lesson titles
    '.lesson-row div.title',                       // lesson row titles
    '.focus-link-v2',                              // tab links (Curriculum, etc.)
    '.section-title',                              // sidebar section headers
    '.left-nav-return-text',                       // "Course Overview" link
    '.sj-text-course-overview',                    // alt course overview text
    '.lesson-top h2',                              // lesson page title
    '.details-pane-description',                   // course description in detail pane
  ].join(', ');

  const EXCLUDE_SELECTOR = [
    'code', 'pre', 'script', 'style', 'noscript',
    '.code-block', '.syntax-highlight',
    '.skillbridge-sidebar',
    '#skillbridge-bridge',
    '#skillbridge-fab',
    'header nav',                                  // skip top header nav only
    '.site-header nav',                            // skip site header nav
    'nav.navbar',                                  // skip main navbar
    'footer',                                      // skip footer
  ].join(', ');

  // Greetings per language for AI Tutor
  const TUTOR_GREETINGS = {
    'en': "Hi! I'm your AI learning assistant. Ask me anything about this course.",
    'ko': "안녕하세요! AI 학습 도우미입니다. 이 과정에 대해 무엇이든 물어보세요.",
    'ja': "こんにちは！AI学習アシスタントです。このコースについて何でも聞いてください。",
    'zh-CN': "你好！我是你的AI学习助手。关于这门课程，有什么都可以问我。",
    'es': "¡Hola! Soy tu asistente de aprendizaje con IA. Pregúntame lo que quieras sobre este curso.",
    'fr': "Bonjour ! Je suis votre assistant d'apprentissage IA. Posez-moi n'importe quelle question sur ce cours.",
    'de': "Hallo! Ich bin dein KI-Lernassistent. Frag mich alles über diesen Kurs.",
  };

  // Send button label per language
  const SEND_LABELS = {
    'en': 'Send', 'ko': '전송', 'ja': '送信', 'zh-CN': '发送',
    'es': 'Enviar', 'fr': 'Envoyer', 'de': 'Senden',
  };

  // Ask Tutor button label per language
  const ASK_TUTOR_LABELS = {
    'en': 'Ask Tutor', 'ko': '튜터에게 질문', 'ja': 'チューターに質問',
    'zh-CN': '问导师', 'es': 'Preguntar', 'fr': 'Demander', 'de': 'Fragen',
  };

  // Input placeholder per language
  const CHAT_PLACEHOLDERS = {
    'en': "Ask about the course content...",
    'ko': "강의 내용에 대해 질문하세요...",
    'ja': "コースの内容について質問してください...",
    'zh-CN': "关于课程内容，请提问...",
    'es': "Pregunta sobre el contenido del curso...",
    'fr': "Posez une question sur le cours...",
    'de': "Frage zum Kursinhalt stellen...",
  };

  // Lookup helper: returns map entry for given lang (default: currentLang), falling back to 'en'
  function t(map, lang) { return map[lang || currentLang] || map['en']; }

  // Quote-mode input placeholder per language
  const QUOTE_PLACEHOLDERS = {
    'en': 'Ask about this text...',
    'ko': '선택한 텍스트에 대해 질문하세요...',
    'ja': '選択したテキストについて質問...',
    'zh-CN': '关于这段文字提问...',
    'es': 'Pregunta sobre este texto...',
    'fr': 'Posez une question sur ce texte...',
    'de': 'Frage zu diesem Text stellen...',
  };

  // Welcome banner UI strings per language
  const BANNER_UI = {
    'en': { prompt: 'Translate this page to', confirm: 'Translate', dismiss: 'Close' },
    'ko': { prompt: '이 페이지를 다음 언어로 번역할까요?', confirm: '번역', dismiss: '닫기' },
    'ja': { prompt: 'このページを翻訳しますか？', confirm: '翻訳', dismiss: '閉じる' },
    'zh-CN': { prompt: '将此页面翻译为', confirm: '翻译', dismiss: '关闭' },
    'es': { prompt: '¿Traducir esta página a', confirm: 'Traducir', dismiss: 'Cerrar' },
    'fr': { prompt: 'Traduire cette page en', confirm: 'Traduire', dismiss: 'Fermer' },
    'de': { prompt: 'Diese Seite übersetzen auf', confirm: 'Übersetzen', dismiss: 'Schließen' },
  };

  let translator = null;
  let subtitleManager = null;
  let currentLang = 'en';
  let isTranslating = false;
  let isReady = false;
  let sidebarVisible = false;
  let originalTexts = new Map();     // el → original innerHTML
  let translatedTexts = new Map();   // originalText → [{ el }]
  let pendingActions = [];
  let gtTranslateQueue = [];
  let gtProcessing = false;
  let gtGeneration = 0;           // Incremented on restoreOriginal to cancel stale GT batches

  // ============================================================
  // TRANSLATION PROGRESS INDICATOR
  // ============================================================

  const PROGRESS_LABELS = {
    'en': 'Translating…', 'ko': '번역 중…', 'ja': '翻訳中…',
    'zh-CN': '翻译中…', 'es': 'Traduciendo…', 'fr': 'Traduction…', 'de': 'Übersetzen…',
  };

  function showTranslationProgress() {
    // Progress bar at top — reuse existing or create new
    let bar = document.getElementById('si18n-progress-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'si18n-progress-bar';
      bar.innerHTML = '<div class="si18n-progress-fill" style="width: 15%"></div>';
      document.body.appendChild(bar);
    } else {
      // Reset fill for re-use
      const fill = bar.querySelector('.si18n-progress-fill');
      if (fill) fill.style.width = '15%';
    }
    // Toast — reuse existing or create new
    let toast = document.getElementById('si18n-progress-toast');
    const label = PROGRESS_LABELS[currentLang] || PROGRESS_LABELS['en'];
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'si18n-progress-toast';
      toast.innerHTML = `<div class="si18n-progress-spinner"></div><span>${label}</span>`;
      document.body.appendChild(toast);
    } else {
      // Update label for new language
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
      setTimeout(() => { bar?.remove(); toast?.remove(); }, 400);
    }, 300);
  }

  // ============================================================
  // REGISTER MESSAGE LISTENER IMMEDIATELY (before async init)
  // ============================================================

  chrome.runtime.onMessage.addListener(handleMessage);
  console.log('[SkillBridge] Message listener registered');

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
        toggleSidebar();
        sendResponse({ success: true });
        return false;

      case 'getPageContext':
        sendResponse({ context: getPageContext() });
        return false;

      case 'setLanguage': {
        const newLang = request.language;
        switchLanguage(newLang, {
          onDone: () => sendResponse({ success: true }),
        }).catch(err => {
          console.error('[SkillBridge] setLanguage error:', err);
          sendResponse({ success: false, error: err.message });
        });
        return true; // async sendResponse
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
      // Restore dark mode before any rendering to minimize flash
      const stored = await chrome.storage.local.get(['targetLanguage', 'autoTranslate', 'welcomeShown', 'darkMode']);
      if (stored.darkMode) document.documentElement.classList.add('si18n-dark');
      currentLang = stored.targetLanguage || 'en';

      translator = new SkilljarTranslator();

      // Load static translations and apply INSTANTLY (no bridge needed)
      if (currentLang !== 'en') {
        await translator.loadStaticTranslations(currentLang);
        if (stored.autoTranslate && Object.keys(translator.staticDict).length > 0) {
          applyStaticTranslations(currentLang);
        }
      }

      injectHeaderLanguageSelect();
      injectDarkModeToggle();
      injectSidebar();
      injectFloatingButton();

      isReady = true;
      console.log('[SkillBridge] Content script ready (static)');

      // Process any queued popup actions
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

      // Start observing DOM for dynamically loaded content (e.g. course cards)
      observeDOM();

      // Re-apply after delays to catch late-loaded content (sidebar, dynamic sections)
      if (stored.autoTranslate && currentLang !== 'en') {
        setTimeout(() => applyStaticTranslations(currentLang), 300);
        setTimeout(() => applyStaticTranslations(currentLang), 1000);
        setTimeout(() => applyStaticTranslations(currentLang), 2500);
        setTimeout(() => applyStaticTranslations(currentLang), 5000);
      }

      // Register Gemini callback — remove spinner, update text if improved
      translator.onTranslationUpdate((originalText, finalTranslation, targetLang, wasImproved) => {
        if (targetLang !== currentLang) return;
        const entries = translatedTexts.get(originalText);
        if (!entries) return;

        for (const entry of entries) {
          if (!entry.el || !entry.el.parentNode) continue;
          // Remove verification spinner
          removeVerifySpinner(entry.el);

          if (wasImproved) {
            // Update with improved translation + fade effect
            safeReplaceText(entry.el, restoreProtectedTerms(finalTranslation));
            entry.el.classList.add('si18n-text-updated');
            setTimeout(() => entry.el.classList.remove('si18n-text-updated'), 500);
          }
        }

        if (wasImproved) {
          console.log(`[SkillBridge] Gemini improved: "${originalText.substring(0, 40)}..."`);
        }
      });

      // Initialize bridge in background (for AI Tutor chat + Gemini verification)
      translator.initialize().then(ok => {
        if (ok) console.log('[SkillBridge] Bridge ready (AI Tutor + Gemini available)');
      });

      // Initialize YouTube subtitle translation (non-blocking)
      if (typeof YouTubeSubtitleManager !== 'undefined') {
        subtitleManager = new YouTubeSubtitleManager(currentLang);
        subtitleManager.initialize().then(() => {
          console.log('[SkillBridge] YouTube subtitle manager ready');
        }).catch(err => {
          console.warn('[SkillBridge] YouTube subtitle init failed:', err);
        });
      }

      // First visit: auto-detect language and show welcome banner
      if (!stored.welcomeShown && currentLang === 'en') {
        const detected = detectBrowserLanguage();
        if (detected && detected !== 'en') {
          // Auto-detect found a supported language → show banner
          setTimeout(() => showWelcomeBanner(detected), 1500);
        }
      } else if (!stored.welcomeShown && currentLang !== 'en') {
        // Language was set (maybe from popup) but welcome not shown yet
        chrome.storage.local.set({ welcomeShown: true });
      }
    } catch (err) {
      console.error('[SkillBridge] Init error:', err);
      isReady = true;
      injectSidebar();
      injectFloatingButton();
    }
  }

  /**
   * Apply translations: static dict first (instant), then queue
   * remaining text for Google Translate + Gemini verification.
   */
  function applyStaticTranslations(targetLang) {
    // Build protected terms map for GT post-processing
    buildProtectedTermsMap(targetLang);

    // Apply language-specific font class to body
    updateLangClass(targetLang);

    const elements = getTranslatableElements();
    let staticCount = 0;
    const gtCandidates = []; // Elements needing Google Translate

    for (const el of elements) {
      const fullText = el.textContent.trim();
      if (!fullText || fullText.length < 2) continue;

      // Skip non-English text (already translated or native)
      if (!isLikelyEnglish(fullText)) continue;

      // Store original
      if (!originalTexts.has(el)) {
        originalTexts.set(el, el.innerHTML);
      }

      // 1. Try static dictionary (element-level)
      const elementMatch = translator.staticLookup(fullText);
      if (elementMatch) {
        safeReplaceText(el, elementMatch);
        staticCount++;
        continue;
      }

      // 2. Try text-node level match
      let allNodesMatched = true;
      const textNodes = getTextNodes(el);
      for (const node of textNodes) {
        const text = node.textContent.trim();
        if (text.length < 2) continue;
        const nodeMatch = translator.staticLookup(text);
        if (nodeMatch) {
          node.textContent = nodeMatch;
          staticCount++;
        } else if (text.length >= 4 && isLikelyEnglish(text)) {
          allNodesMatched = false;
        }
      }

      // 3. If no static match and text is substantial, queue for GT
      if (!allNodesMatched && fullText.length >= 10) {
        gtCandidates.push(el);
      }
    }
    console.log(`[SkillBridge] Static: ${staticCount} translations, GT queue: ${gtCandidates.length}`);

    // Queue candidates for Google Translate (non-blocking)
    if (gtCandidates.length > 0 && targetLang !== 'en') {
      showTranslationProgress();
      updateTranslationProgress(Math.round((staticCount / (staticCount + gtCandidates.length)) * 80));
      queueForGoogleTranslate(gtCandidates, targetLang);
    }
  }

  /**
   * Quick heuristic: is the text likely English?
   * Checks if most characters are Latin alphabet.
   */
  function isLikelyEnglish(text) {
    const latin = text.replace(/[^a-zA-Z]/g, '').length;
    const total = text.replace(/\s/g, '').length;
    if (total === 0) return false;
    return (latin / total) > 0.5;
  }

  /**
   * Queue elements for translation, process in batches.
   * Simple text-only elements → Google Translate (fast batch).
   * Elements with inline tags → Gemini block translation (XML tag preservation).
   * GT cannot preserve inline HTML tags; Gemini (as an LLM) can follow
   * instructions to preserve XML markers and reorder for target grammar.
   */
  function queueForGoogleTranslate(elements, targetLang) {
    for (const el of elements) {
      const text = el.textContent.trim();
      if (!text || text.length < 4) continue;
      const needsGemini = hasInlineTags(el);
      gtTranslateQueue.push({ el, text, targetLang, needsGemini });
    }
    processGTQueue();
  }

  async function processGTQueue() {
    if (gtProcessing || gtTranslateQueue.length === 0) return;
    gtProcessing = true;
    const myGeneration = gtGeneration;  // Snapshot to detect stale batches
    const totalItems = gtTranslateQueue.length;
    let processedItems = 0;

    // Collect elements needing Gemini 2nd pass
    const geminiQueue = [];

    while (gtTranslateQueue.length > 0) {
      // Bail out if language was switched (restoreOriginal increments generation)
      if (gtGeneration !== myGeneration) {
        gtProcessing = false;
        return;
      }

      const batch = gtTranslateQueue.splice(0, 10);
      const targetLang = batch[0].targetLang;

      // Check IndexedDB cache in parallel
      const cacheResults = await Promise.all(
        batch.map(item => translator.cachedLookup(item.text, targetLang))
      );

      // Check again after await — language may have changed
      if (gtGeneration !== myGeneration) {
        gtProcessing = false;
        return;
      }

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

      // Separate: inline-tag elements go straight to Gemini, rest go through GT
      const gtItems = uncached.filter(item => !item.needsGemini);
      const geminiItems = uncached.filter(item => item.needsGemini);

      // Queue inline-tag elements for Gemini block translation (skip GT entirely)
      for (const item of geminiItems) {
        if (item.el && item.el.parentNode) {
          if (!originalTexts.has(item.el)) {
            originalTexts.set(item.el, item.el.innerHTML);
          }
          geminiQueue.push({ el: item.el, targetLang: item.targetLang });
        }
      }

      // 1st pass: Batch Google Translate for simple text-only items
      if (gtItems.length > 0) {
        const texts = gtItems.map(i => i.text);
        const translations = await translator.googleTranslateBatch(texts, targetLang);

        // Check again after await
        if (gtGeneration !== myGeneration) {
          gtProcessing = false;
          return;
        }

        for (let i = 0; i < gtItems.length; i++) {
          const item = gtItems[i];
          let translated = translations[i];
          if (translated && translated !== item.text && item.el && item.el.parentNode) {
            // Post-process: restore protected terms that GT mistranslated
            translated = restoreProtectedTerms(translated);
            safeReplaceText(item.el, translated);
            trackTranslatedElement(item.text, item.el);
            // Queue Gemini verify for quality check
            const queued = translator.queueGeminiVerify(item.text, translated, targetLang);
            if (queued) {
              addVerifySpinner(item.el);
            }
          }
        }
      }

      // Update progress
      processedItems += batch.length;
      updateTranslationProgress(80 + Math.round((processedItems / totalItems) * 15));

      // Minimal delay between batches
      if (gtTranslateQueue.length > 0) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    gtProcessing = false;
    hideTranslationProgress();

    // 2nd pass: Queue Gemini block translations for inline-tag elements
    for (const { el, targetLang } of geminiQueue) {
      if (el && el.parentNode) {
        queueGeminiBlockTranslation(el, targetLang);
      }
    }
  }

  /**
   * Track translated elements so Gemini can update them later.
   */
  function trackTranslatedElement(originalText, el) {
    if (!translatedTexts.has(originalText)) {
      translatedTexts.set(originalText, []);
    }
    translatedTexts.get(originalText).push({ el });
  }

  /**
   * Add a small pulsing dots spinner after an element (Gemini verification indicator).
   */
  function addVerifySpinner(el) {
    // Don't add duplicate spinners
    if (el.querySelector('.si18n-verify-spinner')) return;
    const spinner = document.createElement('span');
    spinner.className = 'si18n-verify-spinner';
    spinner.innerHTML = '<span class="si18n-dot"></span><span class="si18n-dot"></span><span class="si18n-dot"></span>';
    el.appendChild(spinner);
  }

  function removeVerifySpinner(el) {
    const spinner = el.querySelector('.si18n-verify-spinner');
    if (spinner) spinner.remove();
  }

  // ============================================================
  // PAGE TRANSLATION
  // ============================================================

  /**
   * translatePage — kept for popup message compatibility.
   * Delegates to applyStaticTranslations (instant, no LLM).
   */
  async function translatePage(targetLang) {
    if (isTranslating || !translator) return;
    currentLang = targetLang;
    if (targetLang === 'en') { restoreOriginal(); return; }
    if (Object.keys(translator.staticDict).length === 0) {
      await translator.loadStaticTranslations(targetLang);
    }
    applyStaticTranslations(targetLang);
  }

  function restoreOriginal() {
    originalTexts.forEach((html, el) => {
      if (el && el.parentNode) {
        el.innerHTML = html;
      }
    });
    originalTexts.clear();
    translatedTexts.clear();
    gtTranslateQueue = [];
    gtProcessing = false;        // Reset so new queue can process after language switch
    gtGeneration++;              // Invalidate any in-flight GT batches
    currentLang = 'en';
    _protectedTermsLang = null;
    updateLangClass('en');
    hideTranslationProgress();
  }

  /**
   * Shared language-switch flow used by the header selector, message handler,
   * and welcome banner so the logic lives in one place.
   *
   * @param {string} newLang           Target language code
   * @param {object} [opts]
   * @param {boolean} [opts.skipRestore]   Skip restoreOriginal() (e.g. first-visit banner)
   * @param {object}  [opts.extraStorage]  Extra keys to merge into chrome.storage.local.set
   * @param {function} [opts.onDone]       Optional callback after translation completes
   */
  async function switchLanguage(newLang, opts = {}) {
    const storageData = { targetLanguage: newLang, autoTranslate: newLang !== 'en', ...opts.extraStorage };
    chrome.storage.local.set(storageData);

    if (!opts.skipRestore) restoreOriginal();
    currentLang = newLang;

    try {
      if (newLang === 'en') {
        updateLocalizedLabels();
        if (subtitleManager) subtitleManager.setLanguage('en');
        return;
      }

      await translator.loadStaticTranslations(newLang);
      applyStaticTranslations(newLang);
      updateLocalizedLabels();
      if (subtitleManager) subtitleManager.setLanguage(newLang);
    } finally {
      opts.onDone?.();
    }
  }

  /**
   * Inject Google Fonts via <link> tag (more reliable than @import in content scripts).
   * Chrome extension CSS @import can be blocked by page CSP.
   */
  function injectGoogleFonts() {
    if (document.getElementById('sb-google-fonts')) return;
    const link = document.createElement('link');
    link.id = 'sb-google-fonts';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=Noto+Sans+JP:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&family=Noto+Sans+TC:wght@400;500;700&family=Noto+Sans+Arabic:wght@400;500;700&family=Noto+Sans+Devanagari:wght@400;500;700&family=Noto+Sans+Thai:wght@400;500;700&display=swap';
    document.head.appendChild(link);
    console.log('[SkillBridge] Google Fonts injected via <link>');
  }

  /**
   * Apply/remove language-specific CSS class on body for font fallbacks.
   * Classes like .si18n-lang-ko trigger Noto Sans KR, etc.
   */
  function updateLangClass(lang) {
    const body = document.body;
    if (!body) return;
    // Remove all previous language classes
    body.classList.forEach(cls => {
      if (cls.startsWith('si18n-lang-')) body.classList.remove(cls);
    });
    // Add new language class (unless English)
    if (lang && lang !== 'en') {
      body.classList.add(`si18n-lang-${lang}`);
      injectGoogleFonts();
    }
  }

  function getTranslatableElements() {
    const elements = Array.from(document.querySelectorAll(TRANSLATABLE_SELECTOR));

    return elements.filter(el => {
      // Skip our own extension UI
      if (el.closest(EXCLUDE_SELECTOR)) return false;
      // Skip if inside another matched element (avoid duplicate translation)
      const parent = el.parentElement;
      if (parent && parent.matches && parent.matches(TRANSLATABLE_SELECTOR) &&
          !parent.closest(EXCLUDE_SELECTOR)) {
        const parentTag = parent.tagName;
        if (['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH', 'BLOCKQUOTE'].includes(parentTag)) {
          return false;
        }
      }
      // Skip tiny spans (icons, badges) — only for <span>
      if (el.tagName === 'SPAN') {
        const text = el.textContent.trim();
        // Skip spans with very short text or that contain child elements (likely UI components)
        if (text.length < 4) return false;
        // Skip if span has many child elements (likely a container, not text)
        if (el.children.length > 3) return false;
      }
      // Must have actual text content
      const text = el.textContent.trim();
      return text.length > 1;
    });
  }

  function getTextNodes(element) {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (node.textContent.trim().length < 2) return NodeFilter.FILTER_REJECT;
          if (node.parentElement?.closest('code, pre, script, style')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  /**
   * Safely replace text in an element WITHOUT destroying child elements
   * (e.g., SVG checkboxes, icons, badges in sidebar items).
   * Only replaces text nodes, leaving child elements intact.
   */
  function safeReplaceText(el, newText) {
    // No child elements → safe to use textContent
    if (el.children.length === 0) {
      el.textContent = newText;
      return;
    }

    // Has child elements — replace only direct text nodes
    const textNodes = [];
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) {
        textNodes.push(node);
      }
    }

    if (textNodes.length === 1) {
      textNodes[0].textContent = newText;
    } else if (textNodes.length > 1) {
      // Put all text in the first text node, clear the rest
      textNodes[0].textContent = newText;
      for (let i = 1; i < textNodes.length; i++) {
        textNodes[i].textContent = '';
      }
    } else {
      // No direct text nodes but has children — try deeper text nodes
      const deepTextNodes = getTextNodes(el);
      if (deepTextNodes.length > 0) {
        deepTextNodes[0].textContent = newText;
        for (let i = 1; i < deepTextNodes.length; i++) {
          deepTextNodes[i].textContent = '';
        }
      } else {
        // Last resort
        el.textContent = newText;
      }
    }
  }

  // ============================================================
  // PROTECTED TERMS — must NOT be translated by GT
  // These are restored after GT translation via regex replacement.
  // Based on Anthropic's official Korean documentation conventions.
  // ============================================================

  /**
   * Map of GT-corrupted terms → correct forms.
   * Key: known Korean mistranslation by GT (or phonetic).
   * Value: the correct English term to restore.
   * Loaded per-language from the static dict's "_protected" section.
   */
  let _protectedTermsSorted = []; // pre-sorted [wrong, correct] pairs
  let _protectedTermsLang = null;
  let _protectedKeepEnglish = '';

  /**
   * Build the protected terms map from the static dictionary.
   * Called after translator loads static translations.
   * Skips rebuild if language hasn't changed.
   */
  function buildProtectedTermsMap(targetLang) {
    if (_protectedTermsLang === targetLang) return;
    _protectedTermsLang = targetLang;

    const map = {};
    const protectedEntries = translator.getProtectedTerms?.() || {};
    for (const [correct, wrongForms] of Object.entries(protectedEntries)) {
      if (Array.isArray(wrongForms)) {
        for (const wrong of wrongForms) {
          map[wrong] = correct;
        }
      }
    }
    // Pre-sort by length descending so longer terms match first
    _protectedTermsSorted = Object.entries(map)
      .sort((a, b) => b[0].length - a[0].length);
    // Pre-compute keep-English string for Gemini prompts
    const terms = Object.keys(protectedEntries);
    _protectedKeepEnglish = terms.length > 0
      ? terms.join(', ')
      : 'API, SDK, Claude, Anthropic, Claude Code, Enterprise, Personal, Plugin, skill, SKILL.md, frontmatter';
    console.log(`[SkillBridge] Protected terms map: ${_protectedTermsSorted.length} entries`);
  }

  /**
   * Post-process GT translation to restore protected terms.
   * GT often translates "Claude Code" → "클로드 코드", "Enterprise" → "기업" etc.
   * This function reverses those known mistranslations.
   */
  function restoreProtectedTerms(text) {
    if (_protectedTermsSorted.length === 0) return text;
    let result = text;
    for (const [wrong, correct] of _protectedTermsSorted) {
      if (result.includes(wrong)) {
        result = result.replaceAll(wrong, correct);
      }
    }
    return result;
  }

  // ============================================================
  // INLINE TAG PRESERVATION (Gemini-based block translation)
  // ============================================================

  /**
   * Inline tags that indicate a block element has mixed content
   * (text + formatting tags) that should be translated as a unit.
   */
  const INLINE_TAGS = new Set([
    'STRONG', 'B', 'EM', 'I', 'A', 'SPAN', 'CODE',
    'MARK', 'SUB', 'SUP', 'ABBR', 'SMALL', 'U', 'S',
  ]);

  const NO_TRANSLATE_TAGS = new Set(['CODE', 'PRE', 'KBD', 'SAMP', 'VAR']);

  /**
   * Check if a block element contains inline tags that split a sentence.
   */
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

  /**
   * Build a simplified XML representation of a block element for Gemini.
   * Replaces inline tags with numbered XML markers: <x1>content</x1>, <x2>content</x2>
   * Code-like tags use self-closing: <c1/> (content preserved as-is, not translated)
   *
   * Example:
   *   Input:  "The <strong>name</strong> identifies your <code>skill</code>."
   *   Output: { xml: 'The <x1>name</x1> identifies your <c1/>.',
   *             tagInfo: { x1: { tag: 'strong', attrs: '' }, c1: { tag: 'code', original: '<code>skill</code>' } } }
   */
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
          // Code tags: self-closing marker, content NOT translated
          const id = `c${++cCounter}`;
          tagInfo[id] = { tag: node.tagName.toLowerCase(), original: node.outerHTML };
          xml += `<${id}/>`;
        } else {
          // Translatable inline tags: wrap content with marker
          const id = `x${++xCounter}`;
          tagInfo[id] = {
            tag: node.tagName.toLowerCase(),
            attrs: getAttrsString(node),
          };
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
      attrs.push(`${attr.name}="${attr.value}"`);
    }
    return attrs.length ? ' ' + attrs.join(' ') : '';
  }

  /**
   * Convert Gemini's XML-tagged translation back to real HTML.
   * <x1>번역</x1> → <strong>번역</strong>
   * <c1/> → <code>skill</code> (original preserved)
   */
  function xmlToHtml(translatedXml, tagInfo) {
    let html = translatedXml;

    for (const [id, info] of Object.entries(tagInfo)) {
      if (id.startsWith('c')) {
        // Code/preserved tag: replace self-closing marker with original
        const pattern = new RegExp(`<${id}\\s*/>`, 'g');
        html = html.replace(pattern, info.original);
      } else {
        // Translatable tag: replace <xN>content</xN> with real tag
        const pattern = new RegExp(`<${id}>([\\s\\S]*?)</${id}>`, 'g');
        html = html.replace(pattern, (_, content) => {
          return `<${info.tag}${info.attrs}>${content}</${info.tag}>`;
        });
      }
    }

    // Clean up any remaining markers
    html = html.replace(/<[xc]\d+\s*\/?>/g, '');
    html = html.replace(/<\/[xc]\d+>/g, '');

    return html;
  }

  /**
   * Queue a block element with inline tags for Gemini translation.
   * Strategy:
   *   1st pass: Normal node-level GT translation shows quickly (may be fragmented)
   *   2nd pass: Gemini receives the full block as XML, returns natural translation
   *             with tags properly reordered for target language grammar.
   */
  function queueGeminiBlockTranslation(el, targetLang) {
    const { xml, tagInfo } = buildXmlForGemini(el);
    const pureText = el.textContent.trim();

    if (!pureText || pureText.length < 10) return;
    if (!isLikelyEnglish(pureText)) return;

    // Save original for restore
    if (!originalTexts.has(el)) {
      originalTexts.set(el, el.innerHTML);
    }

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

    // Send to Gemini via the existing bridge
    translator._sendRequest({
      type: 'VERIFY_REQUEST',
      systemPrompt: prompt,
      model: 'gemini-2.0-flash',
    }).then(result => {
      if (!result) return;
      const trimmed = result.trim();

      // Sanity check
      if (trimmed.length > xml.length * 3 || trimmed.includes('SOURCE') || trimmed.includes('RULES:')) {
        return; // Gemini returned the prompt, ignore
      }

      // Convert XML markers back to real HTML and update DOM
      el.innerHTML = xmlToHtml(trimmed, tagInfo);
      el.classList.remove('si18n-verifying');

      // Cache the result
      translator._cacheTranslation(pureText, el.textContent.trim(), targetLang);

      console.log(`[SkillBridge] Gemini block translation: "${pureText.substring(0, 40)}..." → "${el.textContent.substring(0, 40)}..."`);
    }).catch(err => {
      console.warn('[SkillBridge] Gemini block translation failed:', err.message);
      el.classList.remove('si18n-verifying');
    });

    // Mark as pending Gemini
    el.classList.add('si18n-verifying');
  }

  function isCodeContent(node) {
    let parent = node.parentElement;
    while (parent) {
      if (['CODE', 'PRE', 'SCRIPT', 'STYLE'].includes(parent.tagName)) return true;
      parent = parent.parentElement;
    }
    return false;
  }

  function getPageContext() {
    const title = document.querySelector('h1, h2, .course-title')?.textContent || document.title || '';
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4'))
      .map(h => h.textContent.trim())
      .slice(0, 5)
      .join(', ');
    return `Course: ${title}. Sections: ${headings}`;
  }

  // ============================================================
  // DOM OBSERVER
  // ============================================================

  function observeDOM() {
    const observer = new MutationObserver((mutations) => {
      if (currentLang === 'en' || isTranslating) return;
      if (!translator || Object.keys(translator.staticDict).length === 0) return;

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

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  let translateTimeout;
  let pendingNodes = [];
  function debounceTranslateNew(node) {
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

        const handledNodes = new Set();
        const gtCandidates = [];

        for (const el of elements) {
          if (el.closest(EXCLUDE_SELECTOR)) continue;
          const fullText = el.textContent.trim();
          if (fullText.length < 2) continue;
          if (!isLikelyEnglish(fullText)) continue;

          // Static dictionary first
          const match = translator.staticLookup(fullText);
          if (match) {
            if (!originalTexts.has(el)) originalTexts.set(el, el.innerHTML);
            safeReplaceText(el, match);
            getTextNodes(el).forEach(tn => handledNodes.add(tn));
          } else if (fullText.length >= 10) {
            gtCandidates.push(el);
          }
        }

        // Text-node level for remaining (static only)
        const allTextNodes = nodes.flatMap(n => getTextNodes(n));
        for (const tn of allTextNodes) {
          if (handledNodes.has(tn)) continue;
          const original = tn.textContent.trim();
          if (original.length >= 2 && !isCodeContent(tn)) {
            const staticResult = translator.staticLookup(original);
            if (staticResult) tn.textContent = staticResult;
          }
        }

        // Queue remaining for Google Translate
        if (gtCandidates.length > 0) {
          for (const el of gtCandidates) {
            if (!originalTexts.has(el)) originalTexts.set(el, el.innerHTML);
          }
          queueForGoogleTranslate(gtCandidates, currentLang);
        }
      }
    }, 300);
  }

  // ============================================================
  // DARK MODE TOGGLE (Claude Docs inspired)
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
    btn.setAttribute('aria-label', 'Toggle dark mode');
    btn.setAttribute('title', 'Toggle dark mode');
    btn.innerHTML = DARK_TOGGLE_ICONS;
    btn.addEventListener('click', toggleDarkMode);
    return btn;
  }

  function injectDarkModeToggle() {
    if (document.getElementById('si18n-dark-toggle')) return;

    // Primary: place inside the lang selector chip for tight grouping
    const langChip = document.querySelector('#si18n-header-lang .si18n-header-lang-chip');
    if (langChip) {
      langChip.insertBefore(createDarkToggleButton(), langChip.firstChild);
      return;
    }

    // Fallback: place in header-right if lang selector doesn't exist yet
    const headerRight = document.getElementById('header-right');
    const linksContainer = headerRight?.querySelector('.header-links-container');
    if (!headerRight || !linksContainer) return;
    headerRight.insertBefore(createDarkToggleButton(), linksContainer);
  }

  function toggleDarkMode() {
    const html = document.documentElement;
    const isDark = html.classList.toggle('si18n-dark');
    chrome.storage.local.set({ darkMode: isDark });
  }

  // ============================================================
  // HEADER LANGUAGE SELECTOR (Claude Docs style)
  // ============================================================

  function injectHeaderLanguageSelect() {
    if (document.getElementById('si18n-header-lang')) return;

    // Find the right insertion point in Skilljar header
    // Structure: header > #header-right > [header-links-container, mobile-toggle, account-nav]
    const headerRight = document.getElementById('header-right');
    if (!headerRight) return;

    // Target: insert before header-links-container (left side of nav)
    const linksContainer = headerRight.querySelector('.header-links-container');
    if (!linksContainer) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'si18n-header-lang';
    wrapper.className = 'headerheight align-vertical';

    const options = AVAILABLE_LANGUAGES
      .map(l => `<option value="${l.code}" ${l.code === currentLang ? 'selected' : ''}>${l.label}</option>`)
      .join('');

    wrapper.innerHTML = `
      <div class="si18n-header-lang-chip">
        <select id="si18n-header-lang-select">${options}</select>
      </div>
    `;

    headerRight.insertBefore(wrapper, linksContainer);

    const select = document.getElementById('si18n-header-lang-select');
    select?.addEventListener('change', (e) => {
      switchLanguage(e.target.value).catch(err =>
        console.error('[SkillBridge] Header lang change error:', err));
    });
  }

  // ============================================================
  // FLOATING BUTTON
  // ============================================================

  function injectFloatingButton() {
    if (document.getElementById('skillbridge-fab')) return;
    const btn = document.createElement('div');
    btn.id = 'skillbridge-fab';
    btn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    `;
    btn.title = 'AI Tutor';
    btn.addEventListener('click', toggleSidebar);
    document.body.appendChild(btn);
  }

  // ============================================================
  // SIDEBAR UI
  // ============================================================

  function injectSidebar() {
    if (document.getElementById('skillbridge-sidebar')) return;
    const sidebar = document.createElement('div');
    sidebar.id = 'skillbridge-sidebar';
    sidebar.className = 'skillbridge-sidebar';
    sidebar.innerHTML = getSidebarHTML();
    document.body.appendChild(sidebar);
    setTimeout(bindSidebarEvents, 100);
    initAskTutorButton();
  }

  function getTutorGreeting() {
    return t(TUTOR_GREETINGS);
  }

  // Premium languages (have static JSON dictionaries)
  const PREMIUM_LANGUAGES = [
    { code: 'ko', label: '한국어' },
    { code: 'ja', label: '日本語' },
    { code: 'zh-CN', label: '中文(简体)' },
    { code: 'es', label: 'Español' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
  ];

  // All supported languages (premium + Google Translate only)
  const AVAILABLE_LANGUAGES = [
    { code: 'en', label: 'English' },
    ...PREMIUM_LANGUAGES,
    { code: 'zh-TW', label: '中文(繁體)' },
    { code: 'pt-BR', label: 'Português (BR)' },
    { code: 'pt', label: 'Português (PT)' },
    { code: 'it', label: 'Italiano' },
    { code: 'nl', label: 'Nederlands' },
    { code: 'ru', label: 'Русский' },
    { code: 'pl', label: 'Polski' },
    { code: 'uk', label: 'Українська' },
    { code: 'cs', label: 'Čeština' },
    { code: 'sv', label: 'Svenska' },
    { code: 'da', label: 'Dansk' },
    { code: 'fi', label: 'Suomi' },
    { code: 'no', label: 'Norsk' },
    { code: 'tr', label: 'Türkçe' },
    { code: 'ar', label: 'العربية' },
    { code: 'hi', label: 'हिन्दी' },
    { code: 'th', label: 'ภาษาไทย' },
    { code: 'vi', label: 'Tiếng Việt' },
    { code: 'id', label: 'Bahasa Indonesia' },
    { code: 'ms', label: 'Bahasa Melayu' },
    { code: 'tl', label: 'Filipino' },
    { code: 'bn', label: 'বাংলা' },
    { code: 'he', label: 'עברית' },
    { code: 'ro', label: 'Română' },
    { code: 'hu', label: 'Magyar' },
    { code: 'el', label: 'Ελληνικά' },
  ];

  function getSidebarHTML() {
    return `
      <div class="si18n-header">
        <button class="si18n-history-btn" id="si18n-history-btn" title="Chat history">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </button>
        <span class="si18n-header-title">SkillBridge Tutor</span>
        <button class="si18n-close" id="si18n-close">&times;</button>
      </div>

      <div class="si18n-panel si18n-panel-chat" id="si18n-panel-chat">
        <div class="si18n-chat-messages" id="si18n-chat-messages">
          <div class="si18n-chat-msg si18n-chat-bot">
            <div class="si18n-chat-avatar">AI</div>
            <div class="si18n-chat-bubble">
              ${getTutorGreeting()}
            </div>
          </div>
        </div>
        <div class="si18n-chat-input-wrap">
          <textarea id="si18n-chat-input" class="si18n-chat-input"
            placeholder="${t(CHAT_PLACEHOLDERS)}"
            rows="1"></textarea>
          <button id="si18n-chat-send" class="si18n-chat-send-btn">${t(SEND_LABELS)}</button>
        </div>
      </div>
    `;
  }

  function bindSidebarEvents() {
    document.getElementById('si18n-close')?.addEventListener('click', toggleSidebar);
    document.getElementById('si18n-history-btn')?.addEventListener('click', toggleHistoryPanel);
    bindChatInputEvents();
  }

  /**
   * Bind chat input events (IME composition, Enter key, send button).
   * Extracted to avoid duplication between bindSidebarEvents and closeHistoryPanel.
   */
  function bindChatInputEvents() {
    const chatInput = document.getElementById('si18n-chat-input');
    let isComposing = false;

    chatInput?.addEventListener('compositionstart', () => { isComposing = true; });
    chatInput?.addEventListener('compositionend', () => { isComposing = false; });

    document.getElementById('si18n-chat-send')?.addEventListener('click', sendChatMessage);
    chatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !isComposing && !e.isComposing) {
        e.preventDefault();
        sendChatMessage();
      }
    });
  }

  function updateLocalizedLabels() {
    // Sync header language selector
    const headerLangSelect = document.getElementById('si18n-header-lang-select');
    if (headerLangSelect) headerLangSelect.value = currentLang;

    const messagesEl = document.getElementById('si18n-chat-messages');
    if (!messagesEl) return;
    const firstBubble = messagesEl.querySelector('.si18n-chat-bot .si18n-chat-bubble');
    if (firstBubble && messagesEl.children.length === 1) {
      firstBubble.textContent = getTutorGreeting();
    }
    // Update input placeholder
    const chatInput = document.getElementById('si18n-chat-input');
    if (chatInput) {
      chatInput.placeholder = t(CHAT_PLACEHOLDERS);
    }
    // Update send button label
    const sendBtn = document.getElementById('si18n-chat-send');
    if (sendBtn) {
      sendBtn.textContent = t(SEND_LABELS);
    }
    // Update Ask Tutor button label
    const askLabel = document.querySelector('.si18n-ask-tutor-label');
    if (askLabel) {
      askLabel.textContent = t(ASK_TUTOR_LABELS);
    }
  }

  // ============================================================
  // CHAT
  // ============================================================

  async function sendChatMessage() {
    const input = document.getElementById('si18n-chat-input');
    const messages = document.getElementById('si18n-chat-messages');
    const text = input.value.trim();
    if (!text) return;

    // Check for attached quote
    const quoteEl = document.querySelector('.si18n-chat-input-wrap .si18n-chat-quote');
    const quotedText = quoteEl?.textContent?.replace('×', '').trim() || '';
    if (quoteEl) quoteEl.remove();

    // Build display: show quote + question together in user bubble
    const displayHtml = quotedText
      ? `<div class="si18n-chat-quote" style="margin-bottom:4px">${escapeHtml(quotedText)}</div>${escapeHtml(text)}`
      : escapeHtml(text);

    messages.innerHTML += `
      <div class="si18n-chat-msg si18n-chat-user">
        <div class="si18n-chat-bubble">${displayHtml}</div>
        <div class="si18n-chat-avatar">You</div>
      </div>
    `;
    input.value = '';
    // Reset placeholder
    input.placeholder = t(CHAT_PLACEHOLDERS);

    const loadingId = 'loading-' + Date.now();
    messages.innerHTML += `
      <div class="si18n-chat-msg si18n-chat-bot" id="${loadingId}">
        <div class="si18n-chat-avatar">AI</div>
        <div class="si18n-chat-bubble">
          <span class="si18n-thinking-dots">
            <span class="si18n-dot"></span>
            <span class="si18n-dot"></span>
            <span class="si18n-dot"></span>
          </span>
        </div>
      </div>
    `;
    messages.scrollTop = messages.scrollHeight;

    // Prepend quoted text as context for the AI
    const fullQuestion = quotedText
      ? `[Regarding this text: "${quotedText}"]\n\n${text}`
      : text;
    const context = getPageContext();
    const bubble = document.querySelector(`#${loadingId} .si18n-chat-bubble`);

    try {
      let started = false;
      await translator.chatStream(fullQuestion, currentLang, context, (chunk, fullText) => {
        if (!started) {
          // First chunk — clear thinking dots, start streaming
          started = true;
          if (bubble) {
            bubble.innerHTML = '';
            bubble.classList.add('si18n-streaming-cursor');
          }
        }
        if (bubble) {
          bubble.innerHTML = formatResponse(fullText);
          messages.scrollTop = messages.scrollHeight;
        }
      });

      // Stream complete — remove cursor + save to history
      if (bubble) {
        bubble.classList.remove('si18n-streaming-cursor');
        const answerText = bubble.textContent?.trim() || '';
        if (answerText) saveConversation(text, answerText, currentLang);
      }
    } catch (err) {
      if (bubble) {
        bubble.innerHTML = currentLang === 'ko'
          ? '죄송합니다. 응답 중 오류가 발생했습니다.'
          : 'Sorry, an error occurred.';
        bubble.classList.remove('si18n-streaming-cursor');
      }
    }
    messages.scrollTop = messages.scrollHeight;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatResponse(text) {
    // Escape HTML FIRST to prevent XSS from AI responses, then apply markdown formatting
    const escaped = escapeHtml(text);

    // Pre-process: insert newlines before markdown markers that are inline
    // (stored text may lack newlines from streaming)
    const normalized = escaped
      .replace(/(?<!\n)(#{2,3}\s)/g, '\n$1')   // newline before ## headings
      .replace(/(?<!\n)([-*]\s)/g, '\n$1')      // newline before - list items
      .replace(/(?<!\n)(\d+[.)]\s)/g, '\n$1');  // newline before 1. ordered items

    const lines = normalized.split('\n');
    const out = [];
    let listBuf = [];
    let listOrdered = false;
    let paraBuf = [];

    const flushList = () => {
      if (!listBuf.length) return;
      const tag = listOrdered ? 'ol' : 'ul';
      out.push(`<${tag}>${listBuf.map(t => `<li>${applyInline(t)}</li>`).join('')}</${tag}>`);
      listBuf = [];
    };
    const flushPara = () => {
      if (!paraBuf.length) return;
      out.push(`<p>${applyInline(paraBuf.join('<br>'))}</p>`);
      paraBuf = [];
    };

    for (const line of lines) {
      const trimmed = line.trim();
      // Empty line → flush current buffers
      if (!trimmed) { flushList(); flushPara(); continue; }
      // Heading (## or ###)
      const hMatch = trimmed.match(/^(#{2,3})\s+(.+)/);
      if (hMatch) {
        flushList(); flushPara();
        out.push(`<h3>${applyInline(hMatch[2])}</h3>`);
        continue;
      }
      // Unordered list item (- or *)
      const ulMatch = trimmed.match(/^[-*]\s+(.*)/);
      if (ulMatch) {
        if (listBuf.length && listOrdered) flushList();
        listOrdered = false;
        flushPara();
        listBuf.push(ulMatch[1]);
        continue;
      }
      // Ordered list item (1. or 1))
      const olMatch = trimmed.match(/^\d+[.)]\s+(.*)/);
      if (olMatch) {
        if (listBuf.length && !listOrdered) flushList();
        listOrdered = true;
        flushPara();
        listBuf.push(olMatch[1]);
        continue;
      }
      // Regular text line → paragraph buffer
      flushList();
      paraBuf.push(trimmed);
    }
    flushList();
    flushPara();

    return out.join('');
  }

  function applyInline(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>');
  }

  // ============================================================
  // TUTOR CONVERSATION HISTORY (IndexedDB)
  // ============================================================

  const HISTORY_DB_NAME = 'skillbridge-tutor';
  const HISTORY_STORE = 'conversations';
  let historyDb = null;

  function openHistoryDb() {
    return new Promise((resolve, reject) => {
      if (historyDb) return resolve(historyDb);
      const req = indexedDB.open(HISTORY_DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(HISTORY_STORE)) {
          const store = db.createObjectStore(HISTORY_STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp');
          store.createIndex('chapter', 'chapter');
        }
      };
      req.onsuccess = (e) => { historyDb = e.target.result; resolve(historyDb); };
      req.onerror = () => reject(req.error);
    });
  }

  async function saveConversation(question, answer, lang) {
    try {
      const db = await openHistoryDb();
      const chapter = document.querySelector('h1')?.textContent?.trim() || 'Unknown';
      const tx = db.transaction(HISTORY_STORE, 'readwrite');
      tx.objectStore(HISTORY_STORE).add({
        question,
        answer,
        lang,
        chapter,
        timestamp: Date.now(),
        url: location.href,
      });
    } catch (e) {
      console.warn('[SkillBridge] Failed to save conversation:', e);
    }
  }

  async function getConversations(limit = 50) {
    try {
      const db = await openHistoryDb();
      return new Promise((resolve) => {
        const tx = db.transaction(HISTORY_STORE, 'readonly');
        const store = tx.objectStore(HISTORY_STORE);
        const idx = store.index('timestamp');
        const results = [];
        const req = idx.openCursor(null, 'prev');
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor && results.length < limit) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        req.onerror = () => resolve([]);
      });
    } catch (e) {
      return [];
    }
  }

  let historyPanelOpen = false;

  function toggleHistoryPanel() {
    const chatPanel = document.getElementById('si18n-panel-chat');
    if (!chatPanel) return;

    if (historyPanelOpen) {
      // Restore chat view
      closeHistoryPanel();
      return;
    }

    historyPanelOpen = true;
    // Save current chat HTML
    chatPanel._savedHTML = chatPanel.innerHTML;
    chatPanel.innerHTML = `
      <div class="si18n-history-header">
        <button class="si18n-history-back" id="si18n-history-back"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
        <span class="si18n-history-title">${currentLang === 'ko' ? '대화 기록' : currentLang === 'ja' ? '会話履歴' : 'Chat History'}</span>
      </div>
      <div class="si18n-history-list" id="si18n-history-list">
        <div class="si18n-history-loading">${currentLang === 'ko' ? '불러오는 중...' : 'Loading...'}</div>
      </div>
    `;

    document.getElementById('si18n-history-back')?.addEventListener('click', closeHistoryPanel);
    loadHistoryList();
  }

  function closeHistoryPanel() {
    const chatPanel = document.getElementById('si18n-panel-chat');
    if (!chatPanel || !chatPanel._savedHTML) return;
    chatPanel.innerHTML = chatPanel._savedHTML;
    delete chatPanel._savedHTML;
    historyPanelOpen = false;

    // Re-bind chat events (DOM was recreated via innerHTML)
    bindChatInputEvents();
  }

  async function loadHistoryList() {
    const listEl = document.getElementById('si18n-history-list');
    if (!listEl) return;

    const conversations = await getConversations();
    if (conversations.length === 0) {
      listEl.innerHTML = `<div class="si18n-history-empty">${
        currentLang === 'ko' ? '대화 기록이 없습니다' : 'No conversations yet'
      }</div>`;
      return;
    }

    // Group by chapter
    const grouped = {};
    for (const conv of conversations) {
      const ch = conv.chapter || 'Other';
      if (!grouped[ch]) grouped[ch] = [];
      grouped[ch].push(conv);
    }

    let html = '';
    for (const [chapter, convs] of Object.entries(grouped)) {
      html += `<div class="si18n-history-chapter">${escapeHtml(chapter)}</div>`;
      for (const conv of convs) {
        const preview = conv.question.length > 50
          ? conv.question.slice(0, 50) + '…'
          : conv.question;
        const time = new Date(conv.timestamp).toLocaleDateString(undefined, {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
        html += `
          <div class="si18n-history-item" data-id="${conv.id}">
            <div class="si18n-history-item-q">${escapeHtml(preview)}</div>
            <div class="si18n-history-item-time">${time}</div>
          </div>
        `;
      }
    }
    listEl.innerHTML = html;

    // Bind click events
    listEl.querySelectorAll('.si18n-history-item').forEach((item) => {
      item.addEventListener('click', () => showConversationDetail(item.dataset.id));
    });
  }

  async function showConversationDetail(id) {
    try {
      const db = await openHistoryDb();
      const tx = db.transaction(HISTORY_STORE, 'readonly');
      const req = tx.objectStore(HISTORY_STORE).get(Number(id));
      req.onsuccess = () => {
        const conv = req.result;
        if (!conv) return;
        const listEl = document.getElementById('si18n-history-list');
        if (!listEl) return;
        const time = conv.timestamp ? new Date(conv.timestamp).toLocaleString() : '';
        const lesson = conv.lessonTitle ? escapeHtml(conv.lessonTitle) : '';
        let metaHtml = '';
        if (lesson || time) {
          metaHtml = `<div class="si18n-history-detail-meta">`;
          if (lesson) metaHtml += `<span class="si18n-detail-lesson">${lesson}</span>`;
          if (time) metaHtml += `<span class="si18n-detail-time">${time}</span>`;
          metaHtml += `</div>`;
        }
        listEl.innerHTML = `
          <div class="si18n-history-detail">
            ${metaHtml}
            <div class="si18n-chat-msg si18n-chat-user">
              <div class="si18n-chat-bubble">${escapeHtml(conv.question)}</div>
            </div>
            <div class="si18n-chat-msg si18n-chat-bot">
              <div class="si18n-chat-bubble">${formatResponse(conv.answer)}</div>
            </div>
          </div>
        `;
      };
    } catch (e) {
      console.warn('[SkillBridge] Failed to load conversation:', e);
    }
  }

  // ============================================================
  // DRAG-TO-ASK TUTOR
  // ============================================================

  let askTutorBtn = null;
  let pendingQuote = null;

  function initAskTutorButton() {
    askTutorBtn = document.createElement('button');
    askTutorBtn.className = 'si18n-ask-tutor-btn';
    askTutorBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <span class="si18n-ask-tutor-label">${t(ASK_TUTOR_LABELS)}</span>
    `;
    document.body.appendChild(askTutorBtn);

    askTutorBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleAskTutor();
    });

    document.addEventListener('mouseup', onTextSelection);
    document.addEventListener('mousedown', onDismissAskButton);
  }

  function onTextSelection(e) {
    // Ignore selections inside the sidebar
    if (e.target.closest?.('.skillbridge-sidebar')) return;
    if (e.target.closest?.('.si18n-ask-tutor-btn')) return;

    // Quick check: skip timeout for normal clicks (no selection)
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      hideAskButton();
      return;
    }

    // Small delay to let browser finalize selection
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (!text || text.length < 3) {
        hideAskButton();
        return;
      }

      // Position the button near the end of selection
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;

      askTutorBtn.style.left = `${rect.right + scrollX - 30}px`;
      askTutorBtn.style.top = `${rect.bottom + scrollY + 6}px`;
      askTutorBtn.classList.add('visible');

      pendingQuote = text.length > 200 ? text.slice(0, 200) + '…' : text;
    }, 10);
  }

  function onDismissAskButton(e) {
    if (e.target.closest?.('.si18n-ask-tutor-btn')) return;
    hideAskButton();
  }

  function hideAskButton() {
    if (askTutorBtn) askTutorBtn.classList.remove('visible');
    pendingQuote = null;
  }

  function handleAskTutor() {
    if (!pendingQuote) return;
    const quote = pendingQuote;
    hideAskButton();
    window.getSelection()?.removeAllRanges();

    // Open sidebar if closed
    if (!sidebarVisible) toggleSidebar();

    // Insert quote block above input
    insertQuoteInChat(quote);
  }

  function insertQuoteInChat(quoteText) {
    const inputWrap = document.querySelector('.si18n-chat-input-wrap');
    if (!inputWrap) return;

    // Remove existing quote if any
    inputWrap.querySelector('.si18n-chat-quote')?.remove();

    const quoteEl = document.createElement('div');
    quoteEl.className = 'si18n-chat-quote';
    quoteEl.innerHTML = `
      <button class="si18n-chat-quote-dismiss" title="Remove quote">&times;</button>
      ${escapeHtml(quoteText)}
    `;
    inputWrap.insertBefore(quoteEl, inputWrap.firstChild);

    quoteEl.querySelector('.si18n-chat-quote-dismiss')?.addEventListener('click', () => {
      quoteEl.remove();
    });

    // Focus input for the user to type their question
    const input = document.getElementById('si18n-chat-input');
    if (input) {
      input.focus();
      input.placeholder = t(QUOTE_PLACEHOLDERS);
    }
  }

  // ============================================================
  // SIDEBAR TOGGLE
  // ============================================================

  function toggleSidebar() {
    const sidebar = document.getElementById('skillbridge-sidebar');
    const fab = document.getElementById('skillbridge-fab');
    sidebarVisible = !sidebarVisible;
    if (sidebar) sidebar.classList.toggle('open', sidebarVisible);
    if (fab) fab.classList.toggle('hidden', sidebarVisible);
  }

  // ============================================================
  // LANGUAGE AUTO-DETECT + WELCOME BANNER
  // ============================================================

  /**
   * Detect user's preferred language from browser settings.
   * Maps browser locale to our supported languages.
   */
  function detectBrowserLanguage() {
    const browserLang = navigator.language || 'en';
    const supported = AVAILABLE_LANGUAGES.map(l => l.code);

    // Exact match first
    if (supported.includes(browserLang)) return browserLang;

    // Try base language (e.g. "ko-KR" → "ko")
    const base = browserLang.split('-')[0];
    if (supported.includes(base)) return base;

    // Special: "zh" → "zh-CN"
    if (base === 'zh') return 'zh-CN';

    return null; // Not in our supported list
  }

  /**
   * Show welcome banner on first visit if user's browser language is supported.
   */
  function showWelcomeBanner(detectedLang) {
    if (!detectedLang || detectedLang === 'en') return;

    const langLabel = AVAILABLE_LANGUAGES.find(l => l.code === detectedLang)?.label || detectedLang;
    const langOptions = AVAILABLE_LANGUAGES
      .filter(l => l.code !== 'en')
      .map(l => `<option value="${l.code}" ${l.code === detectedLang ? 'selected' : ''}>${l.label}</option>`)
      .join('');

    const banner = document.createElement('div');
    banner.id = 'si18n-welcome-banner';
    const ui = t(BANNER_UI, detectedLang);
    banner.innerHTML = `
      <span class="si18n-banner-icon">🌐</span>
      <div class="si18n-banner-text">
        ${ui.prompt} <strong>${langLabel}</strong>
        <select id="si18n-banner-lang">${langOptions}</select>
      </div>
      <div class="si18n-banner-actions">
        <button class="si18n-banner-btn si18n-banner-confirm" id="si18n-banner-yes">${ui.confirm}</button>
        <button class="si18n-banner-btn si18n-banner-change" id="si18n-banner-no">${ui.dismiss}</button>
      </div>
    `;
    document.body.appendChild(banner);

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => banner.classList.add('visible'));
    });

    // Confirm → translate
    document.getElementById('si18n-banner-yes')?.addEventListener('click', async () => {
      const selectedLang = document.getElementById('si18n-banner-lang')?.value || detectedLang;
      banner.classList.remove('visible');
      setTimeout(() => banner.remove(), 400);

      await switchLanguage(selectedLang, {
        skipRestore: true,
        extraStorage: { autoTranslate: true, welcomeShown: true },
      }).catch(err => console.error('[SkillBridge] Banner translate error:', err));
    });

    // Dismiss
    document.getElementById('si18n-banner-no')?.addEventListener('click', () => {
      banner.classList.remove('visible');
      setTimeout(() => banner.remove(), 400);
      chrome.storage.local.set({ welcomeShown: true });
    });

    // Update banner text when language changes
    document.getElementById('si18n-banner-lang')?.addEventListener('change', (e) => {
      const newLabel = AVAILABLE_LANGUAGES.find(l => l.code === e.target.value)?.label || e.target.value;
      const textEl = banner.querySelector('.si18n-banner-text strong');
      if (textEl) textEl.textContent = newLabel;
    });
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
