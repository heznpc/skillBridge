/**
 * Page Bridge - Injected into the HOST PAGE's main world (not extension context)
 * Loads bundled Puter.js from extension resources (no remote code — MV3 compliant).
 * Communicates with the content script via window.postMessage.
 */

(function() {
  'use strict';

  if (window.__SKILLBRIDGE_BRIDGE__) return;
  window.__SKILLBRIDGE_BRIDGE__ = true;

  // Read nonce and local Puter.js URL from injecting script element.
  // document.currentScript may be null for dynamically injected scripts in some
  // browsers/contexts, so fall back to getElementById with a known marker.
  const _currentScript = document.currentScript
    || document.getElementById('__skillbridge_loader__');
  const _bridgeNonce = _currentScript?.dataset?.nonce || crypto.randomUUID();
  const _puterUrl = _currentScript?.dataset?.puterUrl || '';

  let puterReady = false;
  let puterLoadPromise = null;

  function log(...args) {
    console.warn('[SkillBridge PageBridge]', ...args);
  }

  function loadPuter() {
    if (puterLoadPromise) return puterLoadPromise;
    puterLoadPromise = new Promise((resolve, reject) => {
      if (typeof puter !== 'undefined' && puter.ai) {
        puterReady = true;
        resolve();
        return;
      }
      if (!_puterUrl) {
        reject(new Error('No local Puter.js URL provided'));
        return;
      }
      const script = document.createElement('script');
      script.src = _puterUrl;
      script.onload = () => {
        let checks = 0;
        const interval = setInterval(() => {
          checks++;
          if (typeof puter !== 'undefined' && puter.ai) {
            clearInterval(interval);
            puterReady = true;
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
      model: model || 'gemini-2.0-flash',
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
    // Always enforce — nonce is never empty (crypto.randomUUID fallback above)
    if (data.__nonce__ !== _bridgeNonce) return;

    // === TRANSLATE ===
    if (data.type === 'TRANSLATE_REQUEST') {
      try {
        if (!puterReady) await loadPuter();
        // systemPrompt already contains the full prompt including the text
        const prompt = data.systemPrompt || ('Translate to target language:\n' + data.text);
        const result = await callAI(prompt, data.model);

        window.postMessage({
          __skillbridge__: true,
          __nonce__: _bridgeNonce,
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
          __nonce__: _bridgeNonce,
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
          __nonce__: _bridgeNonce,
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
          __nonce__: _bridgeNonce,
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
                __nonce__: _bridgeNonce,
                type: 'CHAT_STREAM_CHUNK',
                id: data.id,
                text,
              }, '*');
            }
          }
          window.postMessage({
            __skillbridge__: true,
            __nonce__: _bridgeNonce,
            type: 'CHAT_STREAM_END',
            id: data.id,
            success: true,
          }, '*');
        } else {
          // Non-streaming fallback
          const result = await callAI(prompt, data.model);
          window.postMessage({
            __skillbridge__: true,
            __nonce__: _bridgeNonce,
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
    window.postMessage({ __skillbridge__: true, __nonce__: _bridgeNonce, type: 'BRIDGE_READY' }, '*');
  }).catch((err) => {
    log('Auto-load failed:', err.message);
    window.postMessage({ __skillbridge__: true, type: 'BRIDGE_ERROR', error: err.message }, '*');
  });
})();
