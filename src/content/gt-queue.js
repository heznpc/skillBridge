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
 * restoration and inline-tag detection come from their respective
 * `window._protectedTerms` / `window._geminiBlock` globals.
 *
 * Public surface (on `window._sb._gt`):
 *   - `applyStaticTranslations(targetLang)` — entry point from init / translatePage
 *   - `queueForGoogleTranslate(elements, targetLang, alreadyVisible)` — used by the SPA mutation observer and the online-recovery handler
 *   - `reset()` — clears queue/lock/offline-pending + bumps generation. Called from restoreOriginal.
 *   - `bumpGeneration()` — for switchLanguage to invalidate stale callbacks
 *   - `get gtGeneration` — read-only view of the counter
 *   - `flushOfflinePending(currentLang)` — re-queue items deferred during an offline window
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
  // Element → the text WE last wrote into it, plus the generation we wrote it
  // in. `applyStaticTranslations` is not one-shot: it re-runs on a LATE_CONTENT
  // timer and on every SPA route change, re-scanning the whole page each time.
  // Without this record our own output re-enters processOneElement as if it
  // were source English — which is how "Anthropic courses" → static →
  // "Anthropic 과정" → GT → "인류학적 과정" happened. Keyed by generation so a
  // language switch (which bumps it) deliberately invalidates every mark.
  // WeakMap so detached nodes get GC'd.
  const _lastWritten = new WeakMap();
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
    // Idempotency chokepoint: never re-process text this generation already
    // produced. Every entry path (initial scan, LATE_CONTENT re-scan, lazy
    // observer, DOM-mutation path) lands here, so one guard covers them all.
    if (alreadyTranslated(el, fullText)) return null;
    if (!isLikelyEnglish(fullText)) return null;

    // Exam/quiz safety CHOKEPOINT: never translate answer-choice elements, no
    // matter which entry path reached us. getTranslatableElements() filters only
    // the STATIC scan; the DOM-mutation path (content.js debounceTranslateNew) and
    // the lazy IntersectionObserver call processOneElement() directly on freshly
    // inserted nodes, so a Skilljar quiz that renders its answers AFTER the initial
    // pass would otherwise translate them — violating the exam contract and then
    // caching or transmitting the leaked text. Bailing here keeps exam text
    // out of the GT queue and the IndexedDB cache entirely.
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
      if (sb.safeReplaceText(el, elementMatch) !== false) {
        markTranslated(el);
        return 'static';
      }
      // Guard refused the collapse (block carries link/button labels) — fall
      // through to the per-node static pass below, which replaces text node
      // by node and never flattens inline structure.
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
    if (matchCount > 0) {
      markTranslated(el);
      return 'static';
    }
    return null;
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
  // GT QUEUE — batching, caching, structure-preserving HTML translation
  // ============================================================

  /**
   * @param {Element[]} elements
   * @param {string} targetLang
   * @param {boolean} [alreadyVisible] — if true, skip viewport re-check (caller already classified)
   */
  // Deep check, unlike hasInlineTags (which only looks at DIRECT children and
  // so misses wrapper shapes like <p><span>text <a>link</a></span></p>). Any
  // block carrying a link/button label must never take the flattening
  // safeReplaceText path — see partitionAfterCacheLookup.
  function _hasInteractiveEls(el) {
    return !!el.querySelector('a, button, summary, [role="button"], [role="link"]');
  }

  function queueForGoogleTranslate(elements, targetLang, alreadyVisible) {
    const _hasInlineTags = window._geminiBlock.hasInlineTags;
    if (alreadyVisible) {
      for (const el of elements) {
        if (gtTranslateQueue.length >= SKILLBRIDGE_THRESHOLDS.GT_QUEUE_MAX) break;
        const text = el.textContent.trim();
        if (!text || text.length < 4) continue;
        gtTranslateQueue.push({
          el,
          text,
          targetLang,
          hasInlineTags: _hasInlineTags(el),
          hasInteractive: _hasInteractiveEls(el),
        });
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
        const item = {
          el,
          text,
          targetLang,
          hasInlineTags: _hasInlineTags(el),
          hasInteractive: _hasInteractiveEls(el),
        };
        (isInViewport(el) ? visibleItems : offscreenItems).push(item);
      }
      gtTranslateQueue.push(...visibleItems, ...offscreenItems);
    }
    processGTQueue();
  }

  function partitionAfterCacheLookup(batch, cacheResults, originalTexts, htmlQueue) {
    const uncached = [];
    // Blocks with inline tags or interactive labels are "structured": they must
    // keep their markup. They always take the deterministic HTML-GT path; the
    // presence of an authenticated AI bridge must never change translation's
    // network or privacy behavior. Plain-text blocks take the flat GT path.
    const isStructured = (item) => item.hasInlineTags || item.hasInteractive;

    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      const cached = cacheResults[i];
      if (cached) {
        if (!item.el?.parentNode) continue;
        // The flat cache is keyed by textContent and cannot safely fill a
        // structured block (it would blank link/button labels) — re-translate
        // it through the structure-preserving path instead of applying flat.
        if (isStructured(item)) {
          uncached.push(item);
          continue;
        }
        const translated = window._protectedTerms.restoreProtectedTerms(cached);
        if (sb.safeReplaceText(item.el, translated) === false) continue;
        trackTranslatedElement(item.text, item.el);
        continue;
      }
      uncached.push(item);
    }

    const structured = uncached.filter(isStructured);
    if (htmlQueue) {
      for (const item of structured) if (item.el?.parentNode) htmlQueue.push(item);
    }
    return uncached.filter((item) => !isStructured(item));
  }

  function queueOfflineItems(gtItems) {
    const remaining = SKILLBRIDGE_THRESHOLDS.GT_QUEUE_MAX - _offlinePendingItems.length;
    if (remaining > 0) _offlinePendingItems.push(...gtItems.slice(0, remaining));
  }

  function groupItemsByText(items) {
    const textToItems = new Map();
    for (const item of items) {
      if (!textToItems.has(item.text)) textToItems.set(item.text, []);
      textToItems.get(item.text).push(item);
    }
    return textToItems;
  }

  async function applyGoogleTranslations(uniqueTexts, translations, textToItems, translator, targetLang) {
    for (let i = 0; i < uniqueTexts.length; i++) {
      let translated = translations[i];
      if (!translated || translated === uniqueTexts[i]) continue;
      translated = window._protectedTerms.restoreProtectedTerms(translated);
      const items = textToItems.get(uniqueTexts[i]);
      await translator._cacheTranslation(uniqueTexts[i], translated, targetLang);
      for (const item of items) {
        if (!item.el?.parentNode) continue;
        if (sb.safeReplaceText(item.el, translated) === false) continue;
        trackTranslatedElement(item.text, item.el);
      }
    }
  }

  async function translateGoogleItems(gtItems, targetLang, translator, myGeneration) {
    if (gtItems.length === 0) return true;
    if (sb.isOffline) {
      queueOfflineItems(gtItems);
      return true;
    }

    const textToItems = groupItemsByText(gtItems);
    const uniqueTexts = [...textToItems.keys()];
    const translations = await translator.googleTranslateBatch(uniqueTexts, targetLang);

    if (gtGeneration !== myGeneration) return false;

    await applyGoogleTranslations(uniqueTexts, translations, textToItems, translator, targetLang);
    return true;
  }

  // ==================== HTML-GT (structure-preserving, no AI) ====================

  // Restore protected/brand terms in the visible text of a reconciled block,
  // reusing the single protected-terms chokepoint. GT (HTML mode) translates
  // all inner text including brand terms, so this corrects them deterministically.
  function _restoreProtectedInTextNodes(el) {
    const restore = window._protectedTerms?.restoreProtectedTerms;
    if (!restore) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (node.parentElement?.closest('code, pre, script, style')) continue;
      node.textContent = restore(node.textContent);
    }
  }

  // Fold GT's translated HTML back into the original element via the integrity
  // gate + node-reconciliation module. Returns false (keep original) on any
  // gate failure — never renders a blanked/corrupted structure.
  function _applyHtmlTranslation(el, translatedHtml) {
    const domSafe = window._sbDomSafe;
    const htmlGt = window._sbHtmlGt;
    if (!domSafe || !htmlGt) return false;
    const clean = domSafe.sanitizeInlineHtml(translatedHtml);
    // Parse into an INERT document: innerHTML on a live-document element
    // fetches image sources at parse time, before checkTagIntegrity can
    // reject a block whose srcs a hostile GT response rewrote. Nodes that
    // pass the gate are adopted into the live document by reconcileHtml.
    const container = document.implementation.createHTMLDocument('').createElement(el.tagName);
    container.innerHTML = clean;
    let root = container;
    if (container.children.length === 1 && container.firstElementChild.tagName === el.tagName) {
      root = container.firstElementChild;
    }
    if (!htmlGt.checkTagIntegrity(el, root)) return false;
    if (!htmlGt.reconcileHtml(el, root)) return false;
    _restoreProtectedInTextNodes(el);
    return true;
  }

  async function translateHtmlItems(htmlItems, targetLang, translator, myGeneration) {
    if (!htmlItems || htmlItems.length === 0) return true;
    // Offline: defer like plain items instead of dropping them. Returning
    // early used to strand structured blocks untranslated even after the
    // connection came back, while plain text resumed via the offline queue.
    if (sb.isOffline) {
      queueOfflineItems(htmlItems);
      return true;
    }
    // Dedup identical source blocks so repeated markup costs one GT call.
    const bySource = new Map();
    for (const item of htmlItems) {
      if (!item.el?.parentNode) continue;
      const src = item.el.outerHTML;
      if (!bySource.has(src)) bySource.set(src, []);
      bySource.get(src).push(item);
    }
    const sources = [...bySource.keys()];
    if (sources.length === 0) return true;

    const translations = await translator.googleTranslateBatch(sources, targetLang);
    if (gtGeneration !== myGeneration) return false;

    for (let i = 0; i < sources.length; i++) {
      const translatedHtml = translations[i];
      if (!translatedHtml || translatedHtml === sources[i]) continue;
      for (const item of bySource.get(sources[i])) {
        if (!item.el?.parentNode) continue;
        if (_applyHtmlTranslation(item.el, translatedHtml)) {
          trackTranslatedElement(item.text, item.el);
        }
      }
    }
    return true;
  }

  async function processGTQueue() {
    if (gtProcessing || gtTranslateQueue.length === 0) return;
    gtProcessing = true;
    const myGeneration = gtGeneration;
    const totalItems = gtTranslateQueue.length;
    let processedItems = 0;
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

        const htmlItems = [];
        const gtItems = partitionAfterCacheLookup(batch, cacheResults, originalTexts, htmlItems);
        const gtStillFresh = await translateGoogleItems(gtItems, targetLang, translator, myGeneration);
        if (!gtStillFresh) return;
        const htmlStillFresh = await translateHtmlItems(htmlItems, targetLang, translator, myGeneration);
        if (!htmlStillFresh) return;

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
    }
  }

  // ============================================================
  // BOOKKEEPING — element tracking + memory cap + verify spinner
  // ============================================================

  /**
   * Record what we just rendered into `el` so a later pass recognises it as our
   * own output instead of fresh source text. See `_lastWritten`.
   * @param {Element} el
   * @returns {void}
   */
  function markTranslated(el) {
    if (el) _lastWritten.set(el, { gen: gtGeneration, out: el.textContent.trim() });
  }

  /**
   * True when `el` still holds exactly the text this generation wrote into it.
   * A page-driven re-render changes the text and correctly clears the guard.
   * @param {Element} el
   * @param {string} currentText — el.textContent, already trimmed by the caller
   * @returns {boolean}
   */
  function alreadyTranslated(el, currentText) {
    const prior = _lastWritten.get(el);
    return !!prior && prior.gen === gtGeneration && prior.out === currentText;
  }

  function trackTranslatedElement(originalText, el) {
    const translatedTexts = sb.translatedTexts;
    if (!translatedTexts.has(originalText)) translatedTexts.set(originalText, []);
    translatedTexts.get(originalText).push({ el });
    markTranslated(el);
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
    get gtGeneration() {
      return gtGeneration;
    },
  };

  // Back-compat: code-comments.js + the typedef reference `sb.isLikelyEnglish`.
  // The function was only defined inside the GT section before extraction; we
  // re-attach it here so existing call-sites don't need to know it moved.
  sb.isLikelyEnglish = isLikelyEnglish;
  sb.registerModule?.('gt-queue');
})();
