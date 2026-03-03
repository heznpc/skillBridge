/**
 * Page Bridge - Injected into the HOST PAGE's main world (not extension context)
 * This script runs in skilljar.com's context, where external scripts CAN load.
 * Communicates with the content script via window.postMessage.
 */

(function() {
  'use strict';

  if (window.__SKILLJAR_I18N_BRIDGE__) return;
  window.__SKILLJAR_I18N_BRIDGE__ = true;

  let puterReady = false;
  let puterLoadPromise = null;

  function log(...args) {
    console.log('[Skilljar i18n PageBridge]', ...args);
  }

  function loadPuter() {
    if (puterLoadPromise) return puterLoadPromise;
    puterLoadPromise = new Promise((resolve, reject) => {
      if (typeof puter !== 'undefined' && puter.ai) {
        puterReady = true;
        resolve();
        return;
      }
      log('Loading Puter.js from CDN...');
      const script = document.createElement('script');
      script.src = 'https://js.puter.com/v2/';
      script.onload = () => {
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
            reject(new Error('puter.ai not available'));
          }
        }, 100);
      };
      script.onerror = () => reject(new Error('Failed to load Puter.js'));
      document.head.appendChild(script);
    });
    return puterLoadPromise;
  }

  /**
   * Single-prompt call to puter.ai.chat (confirmed working format)
   */
  async function callAI(prompt, model) {
    const response = await puter.ai.chat(prompt, {
      model: model || 'gpt-4o-mini',
      stream: false,
    });
    if (typeof response === 'string') return response;
    return response?.message?.content || response?.text || '';
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || !data.__skilljar_i18n__) return;

    // === TRANSLATE ===
    if (data.type === 'TRANSLATE_REQUEST') {
      try {
        if (!puterReady) await loadPuter();
        // systemPrompt already contains the full prompt including the text
        const prompt = data.systemPrompt || ('Translate to target language:\n' + data.text);
        const result = await callAI(prompt, data.model);

        window.postMessage({
          __skilljar_i18n__: true,
          type: 'TRANSLATE_RESPONSE',
          id: data.id,
          success: true,
          result: result || data.text,
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

    // === CHAT ===
    if (data.type === 'CHAT_REQUEST') {
      try {
        if (!puterReady) await loadPuter();
        const prompt = data.systemPrompt || data.userMessage;
        const result = await callAI(prompt, data.model);

        window.postMessage({
          __skilljar_i18n__: true,
          type: 'CHAT_RESPONSE',
          id: data.id,
          success: true,
          result: result || 'No response',
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

  loadPuter().then(() => {
    window.postMessage({ __skilljar_i18n__: true, type: 'BRIDGE_READY' }, '*');
  }).catch((err) => {
    log('Auto-load failed:', err.message);
    window.postMessage({ __skilljar_i18n__: true, type: 'BRIDGE_ERROR', error: err.message }, '*');
  });
})();
