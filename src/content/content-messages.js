/**
 * SkillBridge content-script runtime message router.
 *
 * Keeps chrome.runtime.onMessage branching out of content.js while leaving all
 * page state owned by content.js.
 */

(function () {
  'use strict';

  function createContentMessageRouter({
    isCertificationDisabled,
    isReady,
    translatePage,
    restoreOriginal,
    toggleSidebar,
    getPageContext,
    isSupportedLanguage,
    switchLanguage,
    cleanupCache,
    setCommentTranslation,
    warn = console.warn,
    error = console.error,
  } = {}) {
    let pendingActions = [];

    function handleMessage(request, sender, sendResponse) {
      if (request && typeof request === 'object' && 'type' in request && !('action' in request)) {
        warn('[SkillBridge] Content received `type`-shaped message - should this go to background?', request.type);
      }

      if (isCertificationDisabled?.() && !['ping', 'restoreOriginal', 'cacheCleanup'].includes(request?.action)) {
        sendResponse({ success: false, error: 'SkillBridge disabled on certification pages' });
        return false;
      }

      if (!isReady?.() && request?.action === 'translatePage') {
        pendingActions.push({ request, sendResponse });
        sendResponse({ success: true, queued: true });
        return false;
      }

      switch (request?.action) {
        case 'translatePage':
          translatePage(request.language)
            .then(() => {
              sendResponse({ success: true });
            })
            .catch((err) => {
              error('[SkillBridge] translatePage error:', err);
              sendResponse({ success: false, error: err.message });
            });
          return true;

        case 'restoreOriginal':
          restoreOriginal?.();
          sendResponse({ success: true });
          return false;

        case 'toggleSidebar':
          toggleSidebar?.();
          sendResponse({ success: true });
          return false;

        case 'getPageContext':
          sendResponse({ context: getPageContext?.() });
          return false;

        case 'setLanguage': {
          const newLang = request.language;
          if (!isSupportedLanguage?.(newLang)) {
            sendResponse({ success: false, error: 'Unsupported language' });
            return false;
          }
          switchLanguage(newLang, {
            onDone: () => sendResponse({ success: true }),
          }).catch((err) => {
            error('[SkillBridge] setLanguage error:', err);
            sendResponse({ success: false, error: err.message });
          });
          return true;
        }

        case 'ping':
          sendResponse({ ready: !!isReady?.() });
          return false;

        case 'cacheCleanup':
          cleanupCache?.();
          sendResponse({ success: true });
          return false;

        case 'toggleCommentTranslation':
          setCommentTranslation?.(!!request.enabled);
          sendResponse({ success: true });
          return false;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
          return false;
      }
    }

    function drainPendingTranslateRequests() {
      const pending = pendingActions;
      pendingActions = [];
      return pending.filter(({ request }) => request?.action === 'translatePage').map(({ request }) => request);
    }

    function clearPendingActions() {
      pendingActions = [];
    }

    return { handleMessage, drainPendingTranslateRequests, clearPendingActions };
  }

  window._sbContentMessages = { createContentMessageRouter };
})();
