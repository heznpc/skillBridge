/**
 * Puter.js Bridge
 * Runs inside an iframe with access to Puter.js SDK.
 * Communicates with the content script via postMessage.
 */

(function () {
  'use strict';

  let puterReady = false;

  // Wait for Puter.js to be available
  function waitForPuter(retries = 30) {
    return new Promise((resolve, reject) => {
      if (typeof puter !== 'undefined') {
        resolve();
        return;
      }
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (typeof puter !== 'undefined') {
          clearInterval(interval);
          resolve();
        } else if (attempts >= retries) {
          clearInterval(interval);
          reject(new Error('Puter.js failed to load'));
        }
      }, 200);
    });
  }

  async function init() {
    try {
      await waitForPuter();
      puterReady = true;
      // Notify parent that bridge is ready
      window.parent.postMessage({ type: 'PUTER_BRIDGE_READY' }, '*');
      console.log('[Bridge] Puter.js ready');
    } catch (err) {
      console.error('[Bridge] Init failed:', err);
      window.parent.postMessage({
        type: 'PUTER_BRIDGE_ERROR',
        error: 'Puter.js failed to load'
      }, '*');
    }
  }

  // Handle messages from content script
  window.addEventListener('message', async (event) => {
    const { type, id, text, targetLang, systemPrompt, userMessage, model } = event.data || {};

    if (type === 'TRANSLATE_REQUEST') {
      try {
        if (!puterReady) {
          throw new Error('Puter.js not ready');
        }

        const response = await puter.ai.chat(systemPrompt, text, {
          model: model || 'glm-4-flash',
          stream: false,
        });

        const result = typeof response === 'string'
          ? response
          : response?.message?.content || response?.text || text;

        window.parent.postMessage({
          type: 'TRANSLATE_RESPONSE',
          id,
          success: true,
          result,
        }, '*');
      } catch (err) {
        window.parent.postMessage({
          type: 'TRANSLATE_RESPONSE',
          id,
          success: false,
          error: err.message,
          result: text, // fallback to original
        }, '*');
      }
    }

    if (type === 'CHAT_REQUEST') {
      try {
        if (!puterReady) {
          throw new Error('Puter.js not ready');
        }

        const response = await puter.ai.chat(systemPrompt, userMessage, {
          model: model || 'glm-4-flash',
          stream: false,
        });

        const result = typeof response === 'string'
          ? response
          : response?.message?.content || response?.text || 'No response';

        window.parent.postMessage({
          type: 'CHAT_RESPONSE',
          id,
          success: true,
          result,
        }, '*');
      } catch (err) {
        window.parent.postMessage({
          type: 'CHAT_RESPONSE',
          id,
          success: false,
          error: err.message,
          result: 'Sorry, an error occurred. Please try again.',
        }, '*');
      }
    }

    if (type === 'PING') {
      window.parent.postMessage({
        type: 'PONG',
        ready: puterReady,
      }, '*');
    }
  });

  init();
})();
