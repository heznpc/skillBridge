/**
 * SkillBridge content DOM observer.
 *
 * Owns the MutationObserver and lazy translation debounce used after the main
 * page translation pass.
 */

(function () {
  'use strict';

  function createContentDomObserver({
    getCurrentLang,
    getTranslator,
    getIsReady,
    getOriginalTextCount,
    getTranslatedTextCount,
    pruneDetachedEntries,
    getTranslatableSelector,
    getExcludeSelector,
    getTranslationScope,
    getHostCaps,
    getIsExamPage,
    setIsExamPage,
    detectExamPage,
    processOneElement,
    queueForGoogleTranslate,
    delays,
    thresholds,
  } = {}) {
    let observer = null;
    let translateTimeout = null;
    let pendingNodes = [];
    let pruneScheduled = false;
    // Set when a mutation burst exceeds PENDING_NODES_MAX. The nodes past the
    // cap used to be dropped outright, and nothing ever looked at them again —
    // if the page had no further mutations, that content stayed English for the
    // rest of the visit. Instead of tracking which nodes we skipped, the drain
    // re-scans the scope once, which subsumes all of them.
    let overflowed = false;

    function schedulePrune() {
      if (pruneScheduled) return;
      pruneScheduled = true;
      requestAnimationFrame(() => {
        pruneScheduled = false;
        pruneDetachedEntries?.();
      });
    }

    function debounceTranslateNew(node) {
      if (pendingNodes.length >= thresholds.PENDING_NODES_MAX) {
        // Deliberately does NOT extend the debounce: a long mutation stream
        // would otherwise keep postponing the drain forever. The cap is only
        // reachable with nodes already queued, so a drain is always pending and
        // will observe this flag.
        overflowed = true;
        return;
      }
      pendingNodes.push(node);
      clearTimeout(translateTimeout);
      translateTimeout = setTimeout(() => {
        const nodes = pendingNodes.splice(0);
        const didOverflow = overflowed;
        overflowed = false;
        const currentLang = getCurrentLang?.();
        const translator = getTranslator?.();
        if (currentLang === 'en' || !translator) return;

        const translatableSelector = getTranslatableSelector?.();
        const excludeSelector = getExcludeSelector?.();
        const elements = [];
        if (didOverflow) {
          // The node list is incomplete, so walk the document instead of
          // guessing which nodes were skipped. Affordable because
          // processOneElement short-circuits on anything this generation
          // already translated, so the re-scan costs a selector query plus a
          // cheap per-element check rather than re-translating the page.
          elements.push(...Array.from(document.querySelectorAll(translatableSelector)));
        } else {
          for (const n of nodes) {
            if (n.matches?.(translatableSelector)) {
              elements.push(n);
            } else {
              elements.push(...Array.from(n.querySelectorAll?.(translatableSelector) || []));
            }
          }
        }

        const scope = getTranslationScope?.();
        const scoped = scope ? elements.filter((el) => el.closest(scope)) : elements;

        // Freshly inserted nodes may be a late-rendered quiz on a route whose URL
        // did not match an exam pattern at init.
        if (getHostCaps?.()?.examDetection !== false && !getIsExamPage?.()) {
          setIsExamPage?.(!!detectExamPage?.());
        }

        const gtCandidates = [];
        for (const el of scoped) {
          if (el.closest(excludeSelector)) continue;
          const result = processOneElement?.(el, currentLang);
          if (result === 'gt') gtCandidates.push(el);
        }

        if (gtCandidates.length > 0) {
          queueForGoogleTranslate?.(gtCandidates, currentLang);
        }
      }, delays.DOM_DEBOUNCE);
    }

    function observe(target = document.body) {
      if (!target) return;
      if (!observer) {
        observer = new MutationObserver((mutations) => {
          let hasRemovals = false;
          for (const mutation of mutations) {
            if (mutation.removedNodes.length > 0) hasRemovals = true;

            if (getCurrentLang?.() === 'en' || !getTranslator?.() || !getIsReady?.()) continue;
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
          if (hasRemovals && ((getOriginalTextCount?.() || 0) > 0 || (getTranslatedTextCount?.() || 0) > 0)) {
            schedulePrune();
          }
        });
      }
      observer.observe(target, { childList: true, subtree: true });
    }

    function disconnect() {
      observer?.disconnect();
    }

    function resetPending() {
      clearTimeout(translateTimeout);
      pendingNodes = [];
      overflowed = false;
    }

    return {
      observe,
      disconnect,
      resetPending,
      get isObserving() {
        return observer !== null;
      },
    };
  }

  window._sbContentDomObserver = { createContentDomObserver };
})();
