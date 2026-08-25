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
    // The observer no longer reads or writes exam state directly — it reports
    // that the DOM settled and the lifecycle decides. Passing a setter back in
    // is what let two call sites disagree about the value.
    onExamDomSettled,
    processOneElement,
    queueForGoogleTranslate,
    delays,
    thresholds,
  } = {}) {
    let observer = null;
    let translateTimeout = null;
    let examTimeout = null;
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

    /**
     * Re-decide exam-safe state after the DOM settles.
     *
     * Deliberately its own debounce rather than a step inside
     * debounceTranslateNew. That function is only reachable when a translation
     * is actually wanted — the observer skips it outright when the target
     * language is English, and when there is no translator yet — so hanging
     * safety off it made exam detection a side effect of translating. On an
     * English-target page a quiz that rendered late never tripped exam mode at
     * all, and the tutor stayed unguarded.
     *
     * Safety must not depend on whether the page is being translated. So this
     * runs on any structural mutation, in any language, and is the only thing
     * the observer routes through unconditionally.
     */
    function scheduleExamRedetect() {
      if (getHostCaps?.()?.examDetection === false) return;
      clearTimeout(examTimeout);
      examTimeout = setTimeout(() => onExamDomSettled?.(), delays.DOM_DEBOUNCE);
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
        // Exam-safe state is NOT decided here — see scheduleExamRedetect.
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
          // Any structural change to the page the learner is looking at. A
          // quiz can arrive as an insertion (SPA renders the choices) or leave
          // as a removal (the lesson replaces them), and both have to re-open
          // the safety question.
          let structuralChange = false;
          for (const mutation of mutations) {
            if (mutation.removedNodes.length > 0) {
              hasRemovals = true;
              structuralChange = true;
            }
            if (!getIsReady?.()) continue;
            for (const node of mutation.addedNodes) {
              if (
                node.nodeType !== Node.ELEMENT_NODE ||
                node.closest('.skillbridge-sidebar') ||
                node.closest('#skillbridge-bridge')
              ) {
                continue;
              }
              structuralChange = true;
              // Queueing for TRANSLATION still needs a target language and a
              // translator; that is a separate question from safety.
              if (getCurrentLang?.() !== 'en' && getTranslator?.()) debounceTranslateNew(node);
            }
          }
          if (structuralChange && getIsReady?.()) scheduleExamRedetect();
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
      clearTimeout(examTimeout);
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
