/**
 * Page Bridge - Injected into the HOST PAGE's main world (not extension context)
 * This script runs in skilljar.com's context, where external scripts CAN load.
 * Communicates with the content script via window.postMessage.
 */

(function() {
  'use strict';

  if (window.__SKILLBRIDGE_BRIDGE__) return;
  window.__SKILLBRIDGE_BRIDGE__ = true;

  // Read nonce from injecting script element for message validation
  const _bridgeNonce = document.currentScript?.dataset?.nonce || '';

  let puterReady = false;
  let puterLoadPromise = null;

  function log(...args) {
    console.log('[SkillBridge PageBridge]', ...args);
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

    // Handle different model response formats
    const content = response?.message?.content;
    if (typeof content === 'string') return content;
    // Claude returns content as array: [{type:"text", text:"..."}]
    if (Array.isArray(content)) {
      return content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');
    }
    return response?.text || '';
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || !data.__skillbridge__) return;
    // Validate nonce to prevent other page scripts from spoofing messages
    if (_bridgeNonce && data.__nonce__ !== _bridgeNonce) return;

    // === TRANSLATE ===
    if (data.type === 'TRANSLATE_REQUEST') {
      try {
        if (!puterReady) await loadPuter();
        // systemPrompt already contains the full prompt including the text
        const prompt = data.systemPrompt || ('Translate to target language:\n' + data.text);
        const result = await callAI(prompt, data.model);

        window.postMessage({
          __skillbridge__: true,
          type: 'TRANSLATE_RESPONSE',
          id: data.id,
          success: true,
          result: result || data.text,
        }, '*');
      } catch (err) {
        const errMsg = err?.error || err?.message || String(err);
        log('Translate error:', errMsg);
        window.postMessage({
          __skillbridge__: true,
          type: 'TRANSLATE_RESPONSE',
          id: data.id,
          success: false,
          error: errMsg,
          result: data.text,
        }, '*');
      }
    }

    // === GEMINI VERIFY (background quality check) ===
    if (data.type === 'VERIFY_REQUEST') {
      try {
        if (!puterReady) await loadPuter();
        const prompt = data.systemPrompt;
        const result = await callAI(prompt, data.model || 'gemini-2.0-flash');

        window.postMessage({
          __skillbridge__: true,
          type: 'VERIFY_RESPONSE',
          id: data.id,
          success: true,
          result: result || '',
        }, '*');
      } catch (err) {
        const errMsg = err?.error || err?.message || String(err);
        log('Verify error:', errMsg);
        window.postMessage({
          __skillbridge__: true,
          type: 'VERIFY_RESPONSE',
          id: data.id,
          success: false,
          error: errMsg,
          result: '',
        }, '*');
      }
    }

    // === CHAT (streaming) ===
    if (data.type === 'CHAT_REQUEST') {
      try {
        if (!puterReady) await loadPuter();
        const prompt = data.systemPrompt || data.userMessage;

        if (data.stream) {
          // Streaming mode — send chunks via postMessage
          const response = await puter.ai.chat(prompt, {
            model: data.model || 'gpt-4o-mini',
            stream: true,
          });

          for await (const chunk of response) {
            const text = chunk?.text || chunk?.message?.content || '';
            if (text) {
              window.postMessage({
                __skillbridge__: true,
                type: 'CHAT_STREAM_CHUNK',
                id: data.id,
                text,
              }, '*');
            }
          }
          window.postMessage({
            __skillbridge__: true,
            type: 'CHAT_STREAM_END',
            id: data.id,
            success: true,
          }, '*');
        } else {
          // Non-streaming fallback
          const result = await callAI(prompt, data.model);
          window.postMessage({
            __skillbridge__: true,
            type: 'CHAT_RESPONSE',
            id: data.id,
            success: true,
            result: result || 'No response',
          }, '*');
        }
      } catch (err) {
        const errMsg = err?.error || err?.message || String(err);
        log('Chat error:', errMsg);
        window.postMessage({
          __skillbridge__: true,
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
    window.postMessage({ __skillbridge__: true, type: 'BRIDGE_READY' }, '*');
  }).catch((err) => {
    log('Auto-load failed:', err.message);
    window.postMessage({ __skillbridge__: true, type: 'BRIDGE_ERROR', error: err.message }, '*');
  });
})();
