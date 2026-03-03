/**
 * Puter.js Bridge
 * Runs inside an iframe (web_accessible_resource) with access to Puter.js SDK.
 * Communicates with the content script via postMessage.
 */

(function () {
  'use strict';

  let puterReady = false;

  function log(...args) {
    console.log('[Skilljar Bridge]', ...args);
  }

  function logError(...args) {
    console.error('[Skilljar Bridge]', ...args);
  }

  // Wait for Puter.js global to become available
  function waitForPuter(maxWaitMs = 10000) {
    return new Promise((resolve, reject) => {
      if (typeof puter !== 'undefined' && puter.ai) {
        resolve();
        return;
      }

      const startTime = Date.now();
      const interval = setInterval(() => {
        if (typeof puter !== 'undefined' && puter.ai) {
          clearInterval(interval);
          log('puter.ai detected');
          resolve();
        } else if (Date.now() - startTime > maxWaitMs) {
          clearInterval(interval);
          reject(new Error('Puter.js did not load within ' + maxWaitMs + 'ms'));
        }
      }, 100);
    });
  }

  async function init() {
    log('Bridge initializing...');
    try {
      await waitForPuter();
      puterReady = true;
      log('Puter.js ready, notifying parent');
      window.parent.postMessage({ type: 'PUTER_BRIDGE_READY' }, '*');
    } catch (err) {
      logError('Init failed:', err.message);
      window.parent.postMessage({
        type: 'PUTER_BRIDGE_ERROR',
        error: err.message,
      }, '*');
    }
  }

  // Handle requests from content script
  window.addEventListener('message', async (event) => {
    const data = event.data;
    if (!data || !data.type) return;

    if (data.type === 'TRANSLATE_REQUEST') {
      const { id, text, systemPrompt, model } = data;
      try {
        if (!puterReady) throw new Error('Puter.js not ready');

        const response = await puter.ai.chat(systemPrompt, text, {
          model: model || 'gpt-4o-mini',
          stream: false,
        });

        const result = typeof response === 'string'
          ? response
          : response?.message?.content || response?.text || text;

        window.parent.postMessage({
          type: 'TRANSLATE_RESPONSE', id, success: true, result,
        }, '*');
      } catch (err) {
        logError('Translate error:', err.message);
        window.parent.postMessage({
          type: 'TRANSLATE_RESPONSE', id, success: false,
          error: err.message, result: text,
        }, '*');
      }
    }

    if (data.type === 'CHAT_REQUEST') {
      const { id, userMessage, systemPrompt, model } = data;
      try {
        if (!puterReady) throw new Error('Puter.js not ready');

        const response = await puter.ai.chat(systemPrompt, userMessage, {
          model: model || 'gpt-4o-mini',
          stream: false,
        });

        const result = typeof response === 'string'
          ? response
          : response?.message?.content || response?.text || 'No response';

        window.parent.postMessage({
          type: 'CHAT_RESPONSE', id, success: true, result,
        }, '*');
      } catch (err) {
        logError('Chat error:', err.message);
        window.parent.postMessage({
          type: 'CHAT_RESPONSE', id, success: false,
          error: err.message, result: 'Error: ' + err.message,
        }, '*');
      }
    }

    if (data.type === 'PING') {
      window.parent.postMessage({ type: 'PONG', ready: puterReady }, '*');
    }
  });

  // Start
  init();
})();
