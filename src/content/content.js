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
  const TRANSLATABLE_SELECTOR = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'li', 'td', 'th', 'label', 'figcaption',
    'span', '.btn-text', '.nav-text', 'blockquote', 'dt', 'dd',
    '.coursebox-text', '.coursebox-text-description',
    '.sj-ribbon-text', '.course-time',
    '.faq-title', '.faq-post p',
    'div.title', '.lesson-row div.title',
    '.focus-link-v2', '.section-title',
    '.left-nav-return-text', '.sj-text-course-overview',
    '.lesson-top h2', '.details-pane-description',
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

  window._sb = {
    get currentLang() { return currentLang; },
    set currentLang(v) { currentLang = v; },
    get sidebarVisible() { return sidebarVisible; },
    set sidebarVisible(v) { sidebarVisible = v; },
    get translator() { return translator; },
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
      console.log('[SkillBridge] Content script ready (static)');

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

        for (const entry of entries) {
          if (!entry.el || !entry.el.parentNode) continue;
          removeVerifySpinner(entry.el);
          if (wasImproved) {
            safeReplaceText(entry.el, restoreProtectedTerms(finalTranslation));
            entry.el.classList.add('si18n-text-updated');
            setTimeout(() => entry.el.classList.remove('si18n-text-updated'), SKILLBRIDGE_DELAYS.TEXT_UPDATE_FADE);
          }
        }

        if (wasImproved) {
          console.log(`[SkillBridge] Gemini improved: "${originalText.substring(0, 40)}..."`);
        }
      });

      translator.initialize().then(ok => {
        if (ok) console.log('[SkillBridge] Bridge ready (AI Tutor + Gemini available)');
      });

      if (typeof YouTubeSubtitleManager !== 'undefined') {
        subtitleManager = new YouTubeSubtitleManager(currentLang);
        subtitleManager.initialize().then(() => {
          console.log('[SkillBridge] YouTube subtitle manager ready');
        }).catch(err => {
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
  // STATIC TRANSLATIONS + GT QUEUE
  // ============================================================

  function applyStaticTranslations(targetLang) {
    buildProtectedTermsMap(targetLang);
    updateLangClass(targetLang);

    const elements = getTranslatableElements();
    let staticCount = 0;
    const gtCandidates = [];

    for (const el of elements) {
      const fullText = el.textContent.trim();
      if (!fullText || fullText.length < 2) continue;
      if (!isLikelyEnglish(fullText)) continue;

      if (!originalTexts.has(el)) {
        originalTexts.set(el, el.innerHTML);
      }

      const elementMatch = translator.staticLookup(fullText);
      if (elementMatch) {
        safeReplaceText(el, elementMatch);
        staticCount++;
        continue;
      }

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

      if (!allNodesMatched && fullText.length >= 10) {
        gtCandidates.push(el);
      }
    }
    console.log(`[SkillBridge] Static: ${staticCount} translations, GT queue: ${gtCandidates.length}`);

    if (gtCandidates.length > 0 && targetLang !== 'en') {
      showTranslationProgress();
      updateTranslationProgress(Math.round((staticCount / (staticCount + gtCandidates.length)) * 80));
      queueForGoogleTranslate(gtCandidates, targetLang);
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
        const texts = gtItems.map(i => i.text);
        const translations = await translator.googleTranslateBatch(texts, targetLang);

        if (gtGeneration !== myGeneration) { gtProcessing = false; return; }

        for (let i = 0; i < gtItems.length; i++) {
          const item = gtItems[i];
          let translated = translations[i];
          if (translated && translated !== item.text && item.el && item.el.parentNode) {
            translated = restoreProtectedTerms(translated);
            safeReplaceText(item.el, translated);
            trackTranslatedElement(item.text, item.el);
            const queued = translator.queueGeminiVerify(item.text, translated, targetLang);
            if (queued) addVerifySpinner(item.el);
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

    for (const { el, targetLang } of geminiQueue) {
      if (el && el.parentNode) queueGeminiBlockTranslation(el, targetLang);
    }
  }

  function trackTranslatedElement(originalText, el) {
    if (!translatedTexts.has(originalText)) translatedTexts.set(originalText, []);
    translatedTexts.get(originalText).push({ el });
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
    console.log('[SkillBridge] Google Fonts injected via <link>');
  }

  function updateLangClass(lang) {
    const body = document.body;
    if (!body) return;
    // Collect first, then remove (safe iteration)
    const toRemove = [...body.classList].filter(cls => cls.startsWith('si18n-lang-'));
    for (const cls of toRemove) body.classList.remove(cls);
    if (lang && lang !== 'en') {
      body.classList.add(`si18n-lang-${lang}`);
      injectGoogleFonts();
    }
  }

  function getTranslatableElements() {
    return Array.from(document.querySelectorAll(TRANSLATABLE_SELECTOR)).filter(el => {
      if (el.closest(EXCLUDE_SELECTOR)) return false;
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
      : 'API, SDK, Claude, Anthropic, Claude Code, Enterprise, Personal, Plugin, skill, SKILL.md, frontmatter';
    console.log(`[SkillBridge] Protected terms map: ${_protectedTermsSorted.length} entries`);
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
    for (const attr of el.attributes) attrs.push(`${attr.name}="${attr.value}"`);
    return attrs.length ? ' ' + attrs.join(' ') : '';
  }

  function xmlToHtml(translatedXml, tagInfo) {
    let html = translatedXml;
    for (const [id, info] of Object.entries(tagInfo)) {
      if (id.startsWith('c')) {
        html = html.replace(new RegExp(`<${id}\\s*/>`, 'g'), info.original);
      } else {
        html = html.replace(new RegExp(`<${id}>([\\s\\S]*?)</${id}>`, 'g'), (_, content) => {
          return `<${info.tag}${info.attrs}>${content}</${info.tag}>`;
        });
      }
    }
    html = html.replace(/<[xc]\d+\s*\/?>/g, '');
    html = html.replace(/<\/[xc]\d+>/g, '');
    return html;
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
      console.log(`[SkillBridge] Gemini block translation: "${pureText.substring(0, 40)}..." → "${el.textContent.substring(0, 40)}..."`);
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
    const title = document.querySelector('h1, h2, .course-title')?.textContent || document.title || '';
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4'))
      .map(h => h.textContent.trim())
      .slice(0, 5)
      .join(', ');
    return `Course: ${title}. Sections: ${headings}`;
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

  // Cleanup observer on page unload
  window.addEventListener('unload', () => domObserver?.disconnect());

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

          const match = translator.staticLookup(fullText);
          if (match) {
            if (!originalTexts.has(el)) originalTexts.set(el, el.innerHTML);
            safeReplaceText(el, match);
            getTextNodes(el).forEach(tn => handledNodes.add(tn));
          } else if (fullText.length >= 10) {
            gtCandidates.push(el);
          }
        }

        const allTextNodes = nodes.flatMap(n => getTextNodes(n));
        for (const tn of allTextNodes) {
          if (handledNodes.has(tn)) continue;
          const original = tn.textContent.trim();
          if (original.length >= 2 && !isCodeContent(tn)) {
            const staticResult = translator.staticLookup(original);
            if (staticResult) tn.textContent = staticResult;
          }
        }

        if (gtCandidates.length > 0) {
          for (const el of gtCandidates) {
            if (!originalTexts.has(el)) originalTexts.set(el, el.innerHTML);
          }
          queueForGoogleTranslate(gtCandidates, currentLang);
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
