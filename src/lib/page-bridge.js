/**
 * Page Bridge - Injected into the HOST PAGE's main world (not extension context)
 * This script runs in skilljar.com's context, where external scripts CAN load.
 * Communicates with the content script via window.postMessage / CustomEvent.
 */

(function() {
  'use strict';

  // Prevent double-injection
  if (window.__SKILLJAR_I18N_BRIDGE__) return;
  window.__SKILLJAR_I18N_BRIDGE__ = true;

  let puterReady = false;
  let puterLoadPromise = null;

  function log(...args) {
    console.log('[Skilljar i18n PageBridge]', ...args);
  }

  // Load Puter.js into the page
  function loadPuter() {
    if (puterLoadPromise) return puterLoadPromise;

    puterLoadPromise = new Promise((resolve, reject) => {
      if (typeof puter !== 'undefined' && puter.ai) {
        log('Puter.js already available');
        puterReady = true;
        resolve();
        return;
      }

      log('Loading Puter.js from CDN...');
      const script = document.createElement('script');
      script.src = 'https://js.puter.com/v2/';
      script.onload = () => {
        // Wait for puter.ai to be available
        let checks = 0;
        const interval = setInterval(() => {
          checks++;
          if (typeof puter !== 'undefined' && puter.ai) {
            clearInterval(interval);
            puterReady = true;
            log('Puter.js loaded and ready');
            resolve();
          } else if (checks > 50) {
            clearInterval(interval);
            reject(new Error('puter.ai not available after script load'));
          }
        }, 100);
      };
      script.onerror = () => {
        log('Failed to load Puter.js from CDN');
        reject(new Error('Failed to load Puter.js'));
      };
      document.head.appendChild(script);
    });

    return puterLoadPromise;
  }

  // Handle requests from content script
  window.addEventListener('message', async (event) => {
    // Only accept messages from same window (content script)
    if (event.source !== window) return;
    const data = event.data;
    if (!data || !data.__skilljar_i18n__) return;

    if (data.type === 'TRANSLATE_REQUEST') {
      try {
        if (!puterReady) await loadPuter();

        const response = await puter.ai.chat(data.systemPrompt, data.text, {
          model: data.model || 'gpt-4o-mini',
          stream: false,
        });

        const result = typeof response === 'string'
          ? response
          : response?.message?.content || response?.text || data.text;

        window.postMessage({
          __skilljar_i18n__: true,
          type: 'TRANSLATE_RESPONSE',
          id: data.id,
          success: true,
          result: result,
        }, '*');
      } catch (err) {
        const errMsg = err?.error || err?.message || String(err);
        log('Translate error:', errMsg);
        window.postMessage({
          __skilljar_i18n__: true,
          type: 'TRANSLATE_RESPONSE',
          id: data.id,
          success: false,
          error: errMsg,
          result: data.text,
        }, '*');
      }
    }

    if (data.type === 'CHAT_REQUEST') {
      try {
        if (!puterReady) await loadPuter();

        const response = await puter.ai.chat(data.systemPrompt, data.userMessage, {
          model: data.model || 'gpt-4o-mini',
          stream: false,
        });

        const result = typeof response === 'string'
          ? response
          : response?.message?.content || response?.text || 'No response';

        window.postMessage({
          __skilljar_i18n__: true,
          type: 'CHAT_RESPONSE',
          id: data.id,
          success: true,
          result: result,
        }, '*');
      } catch (err) {
        const errMsg = err?.error || err?.message || String(err);
        log('Chat error:', errMsg);
        window.postMessage({
          __skilljar_i18n__: true,
          type: 'CHAT_RESPONSE',
          id: data.id,
          success: false,
          error: errMsg,
          result: 'Error: ' + errMsg,
        }, '*');
      }
    }
  });

  // Auto-load Puter.js immediately
  loadPuter().then(() => {
    window.postMessage({
      __skilljar_i18n__: true,
      type: 'BRIDGE_READY',
    }, '*');
  }).catch((err) => {
    log('Auto-load failed:', err.message);
    window.postMessage({
      __skilljar_i18n__: true,
      type: 'BRIDGE_ERROR',
      error: err.message,
    }, '*');
  });
})();
