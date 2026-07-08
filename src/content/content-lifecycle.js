/**
 * SkillBridge content lifecycle helpers.
 *
 * Loaded before content.js. This file intentionally exposes factory functions
 * instead of touching window._sb so the namespace can still be constructed in
 * one place.
 */

(function () {
  'use strict';

  function createAIGateController({ detectAITrainingContent, warn = console.warn } = {}) {
    let paused = false;
    let verdict = null;

    function evaluate({ logPause = false } = {}) {
      try {
        // `??` (not `||`) so an explicit `{ isAI: false }` is honored. Only a
        // missing detector falls through to the gate-missing default.
        verdict = detectAITrainingContent?.() ?? {
          isAI: true,
          reason: 'gate-missing',
          hits: 0,
        };
        if (verdict.reason === 'gate-missing') {
          warn(
            '[SkillBridge] AI-content gate is not wired (window._sbPlatform missing). ' +
              'Check manifest.content_scripts[].js includes src/lib/platform.js. ' +
              'Failing open: extension will activate as if no gate existed.',
          );
        }
        // Defensive: only an explicit `false` pauses. Future signature drift
        // must not silently pause the extension on real AI pages.
        paused = verdict.isAI === false;
        if (paused && logPause) {
          warn(
            `[SkillBridge] Non-AI Skilljar tenant detected (${verdict.reason}). ` +
              `Extension paused on this site - gated to AI-training content per ` +
              `the standing non-goal "Adding other Skilljar customers". ` +
              `SPA route changes will re-check this gate automatically.`,
          );
        }
      } catch (err) {
        warn('[SkillBridge] AI-content gate failed open:', err?.message);
        paused = false;
        verdict = { isAI: true, reason: 'gate-error', hits: 0 };
      }
      return verdict;
    }

    return {
      evaluate,
      get paused() {
        return paused;
      },
      get verdict() {
        return verdict;
      },
    };
  }

  function createActivationQueue({ isActive, onError = console.warn } = {}) {
    const callbacks = [];

    function whenActive(callback) {
      if (typeof callback !== 'function') return;
      if (isActive?.() !== false) {
        callback();
        return;
      }
      callbacks.push(callback);
    }

    function run() {
      const pending = callbacks.splice(0);
      for (const cb of pending) {
        try {
          cb();
        } catch (err) {
          onError('[SkillBridge] Deferred activation callback failed:', err?.message);
        }
      }
    }

    return { whenActive, run };
  }

  function createRouteController({
    getHref,
    historyObject = history,
    addWindowListener = (...args) => window.addEventListener(...args),
    removeWindowListener = (...args) => window.removeEventListener(...args),
    isCertificationHref,
    teardownCertificationSurface,
    evaluateGate,
    isGatePaused,
    isInitStarted,
    init,
    teardownNonAIContentSurface,
    rehydrateAfterGateResume,
    cancelActiveStream,
    reenableAfterCertificationSurface,
    ensureObserver,
    ensureSubtitleManager,
    redetectExamPage,
    reapplyTranslations,
    onPageHide,
    logInfo = console.info,
  } = {}) {
    let lastHref = getHref?.() || location.href;
    let origPushState = null;
    let origReplaceState = null;

    function onRouteChange() {
      const href = getHref?.() || location.href;
      if (href === lastHref) return;
      lastHref = href;

      // Certification pages must win over the generic AI-content gate. They are
      // intentionally non-AI by content, but require the stronger cert teardown.
      if (isCertificationHref?.(href)) {
        teardownCertificationSurface?.();
        logInfo('[SkillBridge] Navigated to certification page - extension disabled.');
        return;
      }

      const wasPaused = !!isGatePaused?.();
      evaluateGate?.({ logPause: true });
      if (isGatePaused?.()) {
        if (!wasPaused && isInitStarted?.()) teardownNonAIContentSurface?.();
        return;
      }
      if (wasPaused && !isInitStarted?.()) {
        init?.();
        return;
      }
      if (wasPaused && isInitStarted?.()) {
        rehydrateAfterGateResume?.();
      }

      cancelActiveStream?.();
      reenableAfterCertificationSurface?.();
      ensureObserver?.();
      ensureSubtitleManager?.();
      redetectExamPage?.();
      reapplyTranslations?.();
    }

    function start() {
      addWindowListener('popstate', onRouteChange);
      addWindowListener('hashchange', onRouteChange);
      addWindowListener('pagehide', stop);

      // Catch pushState/replaceState (Skilljar SPA uses these). Guard against
      // wrapper stacking across extension reloads or bfcache restores.
      if (!historyObject.pushState.__sb_wrapped__) {
        origPushState = historyObject.pushState;
        origReplaceState = historyObject.replaceState;
        historyObject.pushState = function (...args) {
          origPushState.apply(this, args);
          onRouteChange();
        };
        historyObject.replaceState = function (...args) {
          origReplaceState.apply(this, args);
          onRouteChange();
        };
        historyObject.pushState.__sb_wrapped__ = true;
        historyObject.replaceState.__sb_wrapped__ = true;
      }
    }

    function stop() {
      removeWindowListener('popstate', onRouteChange);
      removeWindowListener('hashchange', onRouteChange);
      removeWindowListener('pagehide', stop);
      onPageHide?.();
      if (origPushState) historyObject.pushState = origPushState;
      if (origReplaceState) historyObject.replaceState = origReplaceState;
    }

    return { start, stop, onRouteChange };
  }

  window._sbContentLifecycle = {
    createAIGateController,
    createActivationQueue,
    createRouteController,
  };
})();
