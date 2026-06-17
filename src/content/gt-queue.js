/**
 * SkillBridge — Static dictionary + Google Translate queue pipeline.
 *
 * Extracted from content.js in v3.5.15. Owns:
 *   - The translation queue (`gtTranslateQueue`) and its processing lock.
 *   - The "language generation" counter (`gtGeneration`) — bumped on every
 *     language switch / restoreOriginal so stale Promise.all callbacks can
 *     bail before writing into the new generation's DOM.
 *   - The offline-pending list — items we couldn't ship to Google because
 *     the user went offline; queued for retry when the `online` event fires.
 *   - Viewport-first chunked scheduling: visible elements translate
 *     immediately, off-screen elements process in `requestIdleCallback`
 *     bites to avoid jank on 500+ element pages.
 *
 * Loaded right after content.js (which constructs `_sb` and owns the
 * `originalTexts` / `translatedTexts` Maps). Cross-module helpers
 * (safeReplaceText, getTranslatableElements, updateLangClass,
 * detectExamPage, showTermPreview) are read off `_sb`; protected-term
 * restoration and Gemini-block translation come from their respective
 * `window._protectedTerms` / `window._geminiBlock` globals.
 *
 * Public surface (on `window._sb._gt`):
 *   - `applyStaticTranslations(targetLang)` — entry point from init / translatePage
 *   - `queueForGoogleTranslate(elements, targetLang, alreadyVisible)` — used by the SPA mutation observer and the online-recovery handler
 *   - `reset()` — clears queue/lock/offline-pending + bumps generation. Called from restoreOriginal.
 *   - `bumpGeneration()` — for switchLanguage to invalidate stale callbacks
 *   - `get gtGeneration` — read-only view of the counter
 *   - `flushOfflinePending(currentLang)` — re-queue items deferred during an offline window
 *   - `removeVerifySpinner(el)` — called from the translator's `onTranslationUpdate` callback when Gemini verification lands
 *
 * Also re-attaches `isLikelyEnglish` onto `_sb` for back-compat with
 * `code-comments.js` (which calls `sb.isLikelyEnglish(...)` while scanning
 * for English fragments inside `<code>` blocks).
 */

(function () {
  'use strict';

  const sb = window._sb;
  if (!sb) {
    console.warn('[SkillBridge] gt-queue: _sb not ready');
    return;
  }

  // Local state — owned by this module.
  let gtTranslateQueue = [];
  let gtProcessing = false;
  let gtGeneration = 0;
  let _offlinePendingItems = [];
  // One IntersectionObserver per language generation. Constructed lazily
  // (first applyStaticTranslations call); disconnected + nulled in reset()
  // and bumpGeneration(). The generation it was built for is captured in
  // the callback's closure, NOT module state — a module-state version
  // would be overwritten when the next-gen observer is created and
  // wouldn't help a stale callback discriminate.
  let _lazyObserver = null;
  // Observed-element → target lang. WeakMap so removed DOM nodes get GC'd
  // without explicit cleanup.
  const _lazyElements = new WeakMap();

  // ============================================================
  // SHARED HELPERS (moved from content.js: only callers were inside this section)
  // ============================================================

  function isInViewport(el) {
    const rect = el.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  }

  function isLikelyEnglish(text) {
    let latin = 0;
    let total = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13) continue; // whitespace
      total++;
      if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) latin++;
    }
    return total > 0 && latin / total > 0.5;
  }

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

  // `getTranslatableElements` uses TRANSLATABLE_SELECTOR / EXCLUDE_SELECTOR
  // strings built lazily in content.js (they reference Skilljar selectors that
  // may not be loaded until later). content.js exposes the prebuilt strings
  // via `sb.translatableSelector` / `sb.excludeSelector` (added in v3.5.15).
  function getTranslatableElements() {
    const examSkip = sb.isExamPage ? EXAM_SKIP_SELECTORS.join(', ') : null;
    const TRANSLATABLE_SELECTOR = sb.translatableSelector;
    const EXCLUDE_SELECTOR = sb.excludeSelector;
    // On scoped hosts (e.g. claude.com tutorials) restrict the walk to the
    // lesson root(s); otherwise walk the whole document (Skilljar default).
    const scope = sb.translationScope;
    // One-time signal if a scoped host's lesson root is absent (e.g. claude.com
    // re-skinned its Webflow markup): translation silently does nothing, so
    // surface it instead of failing dark. console.warn survives the prod minifier.
    if (scope && !document.querySelector(scope) && !sb._scopeWarned) {
      sb._scopeWarned = true;
      console.warn(
        '[SkillBridge] translation scope',
        scope,
        'matched no elements — page structure may have changed; skipping.',
      );
    }
    return Array.from(document.querySelectorAll(TRANSLATABLE_SELECTOR)).filter((el) => {
      // On scoped hosts keep only elements inside the lesson root(s); mirrors
      // the debounce path in content.js (closest()-filter form).
      if (scope && !el.closest(scope)) return false;
      if (el.closest(EXCLUDE_SELECTOR)) return false;
      // On exam pages, skip answer choice elements.
      if (examSkip && el.matches(examSkip)) return false;
      if (examSkip && el.closest(examSkip)) return false;
      const parent = el.parentElement;
      if (parent && parent.matches && parent.matches(TRANSLATABLE_SELECTOR) && !parent.closest(EXCLUDE_SELECTOR)) {
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

  // ============================================================
  // PROCESS ONE ELEMENT — static dict lookup, decides GT / static / no-op
  // ============================================================

  /**
   * Try to translate `el` via the static dictionary. Returns:
   *   'static' — fully or partially handled by the dict
   *   'gt'     — needs Google Translate (mixed-language or no dict hit)
   *   null     — non-English or too short to bother
   */
  function processOneElement(el, _targetLang) {
    const fullText = el.textContent.trim();
    if (!fullText || fullText.length < 2) return null;
    if (!isLikelyEnglish(fullText)) return null;

    // Exam/quiz safety CHOKEPOINT: never translate answer-choice elements, no
    // matter which entry path reached us. getTranslatableElements() filters only
    // the STATIC scan; the DOM-mutation path (content.js debounceTranslateNew) and
    // the lazy IntersectionObserver call processOneElement() directly on freshly
    // inserted nodes, so a Skilljar quiz that renders its answers AFTER the initial
    // pass would otherwise translate them — violating the exam contract and then
    // caching the leaked text + sending it to Gemini. Bailing here keeps exam text
    // out of the GT queue, the IndexedDB cache, and the verify path entirely.
    if (sb.isExamPage) {
      const examSkip = EXAM_SKIP_SELECTORS.join(', ');
      if (el.matches(examSkip) || el.closest(examSkip)) return null;
    }

    const originalTexts = sb.originalTexts;
    if (!originalTexts.has(el)) {
      originalTexts.set(el, el.innerHTML);
    }

    const translator = sb.translator;
    const elementMatch = translator.staticLookup(fullText);
    if (elementMatch) {
      sb.safeReplaceText(el, elementMatch);
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

  // ============================================================
  // APPLY STATIC TRANSLATIONS — top-level entry, splits visible vs offscreen
  // ============================================================

  function applyStaticTranslations(targetLang) {
    const translator = sb.translator;
    window._protectedTerms.buildProtectedTermsMap(targetLang, translator);
    sb.updateLangClass(targetLang);
    // Re-detect exam page (DOM may have loaded since init).
    // Honour the per-host examDetection capability (claude.com tutorials skip
    // Skilljar exam detection). Fail open if hostCaps is somehow unset.
    if (sb.hostCaps?.examDetection !== false && !sb.isExamPage) sb.isExamPage = sb.detectExamPage();
    if (sb.isExamPage && targetLang !== 'en') sb.showExamBanner?.();

    const elements = getTranslatableElements();
    if (elements.length === 0) return;

    // Split into viewport (visible) and offscreen for prioritized processing.
    const visible = [];
    const offscreen = [];
    for (const el of elements) {
      (isInViewport(el) ? visible : offscreen).push(el);
    }

    // Phase 1 — Process visible elements immediately (no jank for above-fold).
    let staticCount = 0;
    const gtCandidates = [];

    for (const el of visible) {
      const result = processOneElement(el, targetLang);
      if (result === 'static') staticCount++;
      else if (result === 'gt') gtCandidates.push(el);
    }

    // Start GT for visible elements right away (skip redundant viewport check).
    if (gtCandidates.length > 0 && targetLang !== 'en') {
      sb.showTranslationProgress?.();
      sb.updateTranslationProgress?.(
        Math.round((staticCount / (staticCount + gtCandidates.length + offscreen.length)) * 80),
      );
      queueForGoogleTranslate(gtCandidates, targetLang, true);
    }

    // Phase 2 — Register offscreen elements for lazy translation as
    // they enter the viewport. Replaces the previous "idle-chunk every
    // offscreen element" path: a user reading the first 30% of a long
    // lesson no longer pays GT calls for the bottom 70% they never
    // scroll to. See v3.5.32 changelog for the cost analysis.
    if (offscreen.length > 0) {
      observeLazyTranslation(offscreen, targetLang);
    }

    if (sb.commentTranslateEnabled) {
      sb.translateCodeComments?.(targetLang);
    }
  }

  /**
   * Register offscreen elements with an IntersectionObserver so each
   * one only triggers translation work when it nears the viewport.
   * `rootMargin: '50% 0px'` gives a half-viewport lookahead so typical
   * reading-speed scroll keeps content ready BEFORE it's visible — fast
   * scrollers may briefly see English flash but reading patterns are
   * well covered.
   *
   * Generation safety: stale observers from a previous language are
   * disconnected in `reset()` / `bumpGeneration()`. A callback queued
   * but not yet executed before disconnect compares its closure-
   * captured generation against the live `gtGeneration` and bails
   * if they differ — protects against the disconnect-races-rebuild
   * window.
   */
  function observeLazyTranslation(elements, targetLang) {
    if (!_lazyObserver) {
      // Closure-capture the generation. A module-scope `_lazyObserverGen`
      // would be overwritten when the NEXT-gen observer is constructed,
      // so a stale callback that fires after disconnect+rebuild would
      // mistakenly see its gen match the new one. Capturing here freezes
      // the value with the callback that uses it.
      const observerGen = gtGeneration;
      // `obs` likewise captured so a stale callback's `unobserve` runs
      // against the observer the callback was attached to, not against
      // whatever `_lazyObserver` currently points at (could be a new one).
      const obs = new IntersectionObserver(
        (entries) => {
          if (gtGeneration !== observerGen) return;
          const candidates = [];
          let lang = targetLang;
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const el = entry.target;
            const elLang = _lazyElements.get(el);
            if (!elLang) continue;
            obs.unobserve(el);
            _lazyElements.delete(el);
            lang = elLang;
            const result = processOneElement(el, elLang);
            if (result === 'gt') candidates.push(el);
          }
          if (candidates.length > 0 && lang !== 'en') {
            queueForGoogleTranslate(candidates, lang, true);
          }
        },
        {
          // Half-viewport lookahead — content gets translated before the
          // user actually sees it under typical reading-speed scroll.
          // Bumping this up trades GT-call savings for fewer English
          // flashes on fast scroll; '50% 0px' is the sweet spot.
          rootMargin: '50% 0px',
          threshold: 0,
        },
      );
      _lazyObserver = obs;
    }
    for (const el of elements) {
      _lazyElements.set(el, targetLang);
      _lazyObserver.observe(el);
    }
  }

  // ============================================================
  // GT QUEUE — batching, caching, Gemini verify scheduling
  // ============================================================

  /**
   * @param {Element[]} elements
   * @param {string} targetLang
   * @param {boolean} [alreadyVisible] — if true, skip viewport re-check (caller already classified)
   */
  function queueForGoogleTranslate(elements, targetLang, alreadyVisible) {
    const _hasInlineTags = window._geminiBlock.hasInlineTags;
    if (alreadyVisible) {
      for (const el of elements) {
        if (gtTranslateQueue.length >= SKILLBRIDGE_THRESHOLDS.GT_QUEUE_MAX) break;
        const text = el.textContent.trim();
        if (!text || text.length < 4) continue;
        gtTranslateQueue.push({ el, text, targetLang, needsGemini: _hasInlineTags(el) });
      }
    } else {
      const visibleItems = [];
      const offscreenItems = [];
      for (const el of elements) {
        if (
          gtTranslateQueue.length + visibleItems.length + offscreenItems.length >=
          SKILLBRIDGE_THRESHOLDS.GT_QUEUE_MAX
        )
          break;
        const text = el.textContent.trim();
        if (!text || text.length < 4) continue;
        const item = { el, text, targetLang, needsGemini: _hasInlineTags(el) };
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
    const translator = sb.translator;
    const originalTexts = sb.originalTexts;

    // Wrap the whole batch loop so progress UI and detached-entry pruning
    // always run, even if the user switches language mid-batch (which trips
    // the gtGeneration check below). Without this, the progress bar and
    // verify spinners stay on screen until next nav.
    try {
      while (gtTranslateQueue.length > 0) {
        if (gtGeneration !== myGeneration) return;

        const batch = gtTranslateQueue.splice(0, SKILLBRIDGE_THRESHOLDS.GT_BATCH_SIZE);
        const targetLang = batch[0].targetLang;

        const cacheResults = await Promise.all(batch.map((item) => translator.cachedLookup(item.text, targetLang)));

        if (gtGeneration !== myGeneration) return;

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

        const gtItems = uncached.filter((item) => !item.needsGemini);
        const geminiItems = uncached.filter((item) => item.needsGemini);

        for (const item of geminiItems) {
          if (item.el && item.el.parentNode) {
            if (!originalTexts.has(item.el)) originalTexts.set(item.el, item.el.innerHTML);
            geminiQueue.push({ el: item.el, targetLang: item.targetLang });
          }
        }

        if (gtItems.length > 0) {
          if (sb.isOffline) {
            const remaining = SKILLBRIDGE_THRESHOLDS.GT_QUEUE_MAX - _offlinePendingItems.length;
            if (remaining > 0) _offlinePendingItems.push(...gtItems.slice(0, remaining));
          } else {
            // Deduplicate texts — group elements by text to avoid redundant API calls.
            const textToItems = new Map();
            for (const item of gtItems) {
              if (!textToItems.has(item.text)) textToItems.set(item.text, []);
              textToItems.get(item.text).push(item);
            }
            const uniqueTexts = [...textToItems.keys()];
            const translations = await translator.googleTranslateBatch(uniqueTexts, targetLang);

            if (gtGeneration !== myGeneration) return;

            for (let i = 0; i < uniqueTexts.length; i++) {
              let translated = translations[i];
              if (!translated || translated === uniqueTexts[i]) continue;
              translated = window._protectedTerms.restoreProtectedTerms(translated);
              const items = textToItems.get(uniqueTexts[i]);
              let verifyQueued = false;
              for (const item of items) {
                if (!item.el?.parentNode) continue;
                sb.safeReplaceText(item.el, translated);
                trackTranslatedElement(item.text, item.el);
                if (!verifyQueued) {
                  verifyQueued = !!translator.queueGeminiVerify(item.text, translated, targetLang);
                }
                if (verifyQueued) addVerifySpinner(item.el);
              }
            }
          }
        }

        processedItems += batch.length;
        sb.updateTranslationProgress?.(80 + Math.round((processedItems / totalItems) * 15));

        if (gtTranslateQueue.length > 0) {
          await new Promise((r) => setTimeout(r, SKILLBRIDGE_DELAYS.GT_BATCH));
        }
      }
    } finally {
      gtProcessing = false;
      sb.hideTranslationProgress?.();
      pruneDetachedEntries();

      // Term-preview only on full completion; on cancellation, the new
      // generation will trigger its own preview.
      if (gtGeneration === myGeneration) {
        setTimeout(() => sb.showTermPreview?.(), 1500);
      }

      // Flush any block-translation work queued during this generation.
      // Stale items get filtered by parentNode + targetLang on the consumer.
      for (const { el, targetLang } of geminiQueue) {
        if (el && el.parentNode) {
          window._geminiBlock.queueGeminiBlockTranslation(el, targetLang, {
            translator,
            originalTexts,
            isLikelyEnglish,
          });
        }
      }
    }
  }

  // ============================================================
  // BOOKKEEPING — element tracking + memory cap + verify spinner
  // ============================================================

  function trackTranslatedElement(originalText, el) {
    const translatedTexts = sb.translatedTexts;
    if (!translatedTexts.has(originalText)) translatedTexts.set(originalText, []);
    translatedTexts.get(originalText).push({ el });
  }

  function pruneDetachedEntries() {
    const originalTexts = sb.originalTexts;
    const translatedTexts = sb.translatedTexts;
    const originalComments = sb.originalComments;
    const cap = sb.mapSizeCap;

    for (const [el] of originalTexts) {
      if (!el.parentNode) originalTexts.delete(el);
    }
    for (const [text, entries] of translatedTexts) {
      const live = entries.filter((e) => e.el?.parentNode);
      if (live.length === 0) translatedTexts.delete(text);
      else if (live.length < entries.length) translatedTexts.set(text, live);
    }
    if (originalTexts.size > cap) {
      const excess = originalTexts.size - cap;
      const iter = originalTexts.keys();
      for (let i = 0; i < excess; i++) {
        const key = iter.next().value;
        originalTexts.delete(key);
      }
    }
    if (translatedTexts.size > cap) {
      const excess = translatedTexts.size - cap;
      const iter = translatedTexts.keys();
      for (let i = 0; i < excess; i++) {
        const key = iter.next().value;
        translatedTexts.delete(key);
      }
    }
    // Cap originalComments consistently with other Maps.
    if (originalComments.size > cap) {
      const excess = originalComments.size - cap;
      const iter = originalComments.keys();
      for (let i = 0; i < excess; i++) {
        const key = iter.next().value;
        originalComments.delete(key);
      }
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
  // PUBLIC API — content.js / SPA observer / online recovery
  // ============================================================

  /**
   * Drop queued items + clear the processing lock + bump generation.
   * Called by content.js's restoreOriginal so any in-flight
   * Promise.all callback bails before writing into the now-restored DOM.
   */
  function reset() {
    gtTranslateQueue = [];
    gtProcessing = false;
    _offlinePendingItems = [];
    gtGeneration++;
    _disconnectLazyObserver();
  }

  function bumpGeneration() {
    gtGeneration++;
    _disconnectLazyObserver();
  }

  // Tear down the lazy IntersectionObserver. Any pending offscreen
  // elements stop receiving intersect callbacks for the now-stale
  // generation. The observer gets re-created lazily on the next
  // applyStaticTranslations call.
  function _disconnectLazyObserver() {
    if (_lazyObserver) {
      _lazyObserver.disconnect();
      _lazyObserver = null;
    }
  }

  /**
   * Re-queue items that were deferred during an offline window.
   * Called from the `online` event listener in content.js.
   */
  function flushOfflinePending(currentLang) {
    if (_offlinePendingItems.length === 0) return false;
    const pending = _offlinePendingItems.filter((item) => item.el?.parentNode);
    _offlinePendingItems = [];
    if (pending.length > 0) {
      queueForGoogleTranslate(
        pending.map((item) => item.el),
        currentLang,
      );
    }
    return true;
  }

  sb._gt = {
    applyStaticTranslations,
    queueForGoogleTranslate,
    // `processOneElement` + `pruneDetachedEntries` are used by content.js's
    // SPA mutation observer (debounceTranslateNew + schedulePrune) — they're
    // not strictly part of the queue surface but they live in the same module
    // because the observer is the only external caller of either.
    processOneElement,
    pruneDetachedEntries,
    reset,
    bumpGeneration,
    flushOfflinePending,
    removeVerifySpinner,
    get gtGeneration() {
      return gtGeneration;
    },
  };

  // Back-compat: code-comments.js + the typedef reference `sb.isLikelyEnglish`.
  // The function was only defined inside the GT section before extraction; we
  // re-attach it here so existing call-sites don't need to know it moved.
  sb.isLikelyEnglish = isLikelyEnglish;
})();
