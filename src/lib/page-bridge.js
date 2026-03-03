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
        reject(new Error('Failed to load Puter.js'));
      };
      document.head.appendChild(script);
    });

    return puterLoadPromise;
  }

  /**
   * Call puter.ai.chat with the correct API format.
   * Puter.js uses: puter.ai.chat(promptString, options)
   */
  async function callAI(prompt, model) {
    const response = await puter.ai.chat(prompt, {
      model: model || 'gpt-4o-mini',
      stream: false,
    });
    // Response format: { message: { content: "..." } } or string
    if (typeof response === 'string') return response;
    return response?.message?.content || response?.text || '';
  }

  // Handle requests from content script
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || !data.__skilljar_i18n__) return;

    // === BATCH TRANSLATE (multiple texts at once) ===
    if (data.type === 'BATCH_TRANSLATE_REQUEST') {
      try {
        if (!puterReady) await loadPuter();

        const results = [];
        // Process in parallel with concurrency limit
        const concurrency = 3;
        const texts = data.texts;
        for (let i = 0; i < texts.length; i += concurrency) {
          const batch = texts.slice(i, i + concurrency);
          const promises = batch.map(async (item) => {
            try {
              const prompt = data.systemPrompt + '\n\nText to translate:\n' + item.text;
              return { idx: item.idx, result: await callAI(prompt, data.model), success: true };
            } catch(e) {
              return { idx: item.idx, result: item.text, success: false };
            }
          });
          const batchResults = await Promise.all(promises);
          results.push(...batchResults);

          // Notify progress
          window.postMessage({
            __skilljar_i18n__: true,
            type: 'BATCH_PROGRESS',
            id: data.id,
            completed: Math.min(i + concurrency, texts.length),
            total: texts.length,
          }, '*');
        }

        window.postMessage({
          __skilljar_i18n__: true,
          type: 'BATCH_TRANSLATE_RESPONSE',
          id: data.id,
          success: true,
          results: results,
        }, '*');
      } catch (err) {
        const errMsg = err?.error || err?.message || String(err);
        log('Batch translate error:', errMsg);
        window.postMessage({
          __skilljar_i18n__: true,
          type: 'BATCH_TRANSLATE_RESPONSE',
          id: data.id,
          success: false,
          error: errMsg,
          results: [],
        }, '*');
      }
    }

    // === SINGLE TRANSLATE (backward compat) ===
    if (data.type === 'TRANSLATE_REQUEST') {
      try {
        if (!puterReady) await loadPuter();
        const prompt = (data.systemPrompt || '') + '\n\nText to translate:\n' + data.text;
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
        const prompt = (data.systemPrompt || '') + '\n\nUser: ' + data.userMessage;
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
