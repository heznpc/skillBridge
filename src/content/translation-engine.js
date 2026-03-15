/**
 * SkillBridge — Translation Engine
 * Handles static translations, Google Translate queue processing,
 * and translation progress UI.
 * Accesses shared state via window._sb namespace.
 */

(function () {
  'use strict';

  let gtTranslateQueue = [];
  let gtProcessing = false;
  let gtGeneration = 0;

  // ============================================================
  // TRANSLATION PROGRESS INDICATOR
  // ============================================================

  function showTranslationProgress() {
    const sb = window._sb;
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
  // VERIFY SPINNERS
  // ============================================================

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
  // TRANSLATED ELEMENT TRACKING
  // ============================================================

  function trackTranslatedElement(originalText, el) {
    const sb = window._sb;
    if (!sb.translatedTexts.has(originalText)) sb.translatedTexts.set(originalText, []);
    sb.translatedTexts.get(originalText).push({ el });
  }

  // ============================================================
  // STATIC TRANSLATIONS + GT QUEUE
  // ============================================================

  function applyStaticTranslations(targetLang) {
    const sb = window._sb;
    sb.buildProtectedTermsMap(targetLang);
    updateLangClass(targetLang);

    const elements = sb.getTranslatableElements();
    let staticCount = 0;
    const gtCandidates = [];

    for (const el of elements) {
      const fullText = el.textContent.trim();
      if (!fullText || fullText.length < 2) continue;
      if (!sb.isLikelyEnglish(fullText)) continue;

      if (!sb.originalTexts.has(el)) {
        sb.originalTexts.set(el, el.innerHTML);
      }

      const elementMatch = sb.translator.staticLookup(fullText);
      if (elementMatch) {
        sb.safeReplaceText(el, elementMatch);
        staticCount++;
        continue;
      }

      let allNodesMatched = true;
      const textNodes = sb.getTextNodes(el);
      for (const node of textNodes) {
        const text = node.textContent.trim();
        if (text.length < 2) continue;
        const nodeMatch = sb.translator.staticLookup(text);
        if (nodeMatch) {
          node.textContent = nodeMatch;
          staticCount++;
        } else if (text.length >= 4 && sb.isLikelyEnglish(text)) {
          allNodesMatched = false;
        }
      }

      if (!allNodesMatched && fullText.length >= 10) {
        gtCandidates.push(el);
      }
    }
    if (gtCandidates.length > 0 && targetLang !== 'en') {
      showTranslationProgress();
      updateTranslationProgress(Math.round((staticCount / (staticCount + gtCandidates.length)) * 80));
      queueForGoogleTranslate(gtCandidates, targetLang);
    }
  }

  function queueForGoogleTranslate(elements, targetLang) {
    const sb = window._sb;
    for (const el of elements) {
      const text = el.textContent.trim();
      if (!text || text.length < 4) continue;
      const needsGemini = sb.hasInlineTags(el);
      gtTranslateQueue.push({ el, text, targetLang, needsGemini });
    }
    processGTQueue();
  }

  async function processGTQueue() {
    const sb = window._sb;
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
        batch.map(item => sb.translator.cachedLookup(item.text, targetLang))
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
              sb.safeReplaceText(item.el, cacheResults[i]);
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
          if (!sb.originalTexts.has(item.el)) sb.originalTexts.set(item.el, item.el.innerHTML);
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
        const translations = await sb.translator.googleTranslateBatch(uniqueTexts, targetLang);

        if (gtGeneration !== myGeneration) { gtProcessing = false; return; }

        for (let i = 0; i < uniqueTexts.length; i++) {
          let translated = translations[i];
          if (!translated || translated === uniqueTexts[i]) continue;
          translated = sb.restoreProtectedTerms(translated);
          const items = textToItems.get(uniqueTexts[i]);
          let verifyQueued = false;
          for (const item of items) {
            if (!item.el?.parentNode) continue;
            sb.safeReplaceText(item.el, translated);
            trackTranslatedElement(item.text, item.el);
            if (!verifyQueued) {
              verifyQueued = !!sb.translator.queueGeminiVerify(item.text, translated, targetLang);
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

    for (const { el, targetLang } of geminiQueue) {
      if (el && el.parentNode) sb.queueGeminiBlockTranslation(el, targetLang);
    }
  }

  // ============================================================
  // LANGUAGE CLASS + GOOGLE FONTS
  // ============================================================

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

  // ============================================================
  // GT STATE MANAGEMENT (used by content.js orchestrator)
  // ============================================================

  function clearGTQueue() {
    gtTranslateQueue = [];
    gtProcessing = false;
    gtGeneration++;
  }

  // Expose on window._sb
  const sb = window._sb;
  sb.applyStaticTranslations = applyStaticTranslations;
  sb.queueForGoogleTranslate = queueForGoogleTranslate;
  sb.showTranslationProgress = showTranslationProgress;
  sb.updateTranslationProgress = updateTranslationProgress;
  sb.hideTranslationProgress = hideTranslationProgress;
  sb.addVerifySpinner = addVerifySpinner;
  sb.removeVerifySpinner = removeVerifySpinner;
  sb.trackTranslatedElement = trackTranslatedElement;
  sb.updateLangClass = updateLangClass;
  sb.clearGTQueue = clearGTQueue;
})();
