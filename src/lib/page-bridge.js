/**
 * Page Bridge - Injected into the HOST PAGE's main world (not extension context)
 * Loads bundled Puter.js from extension resources (no remote code — MV3 compliant).
 * Communicates with the content script via window.postMessage.
 */

(function () {
  'use strict';

  if (window.__SKILLBRIDGE_BRIDGE__) return;
  window.__SKILLBRIDGE_BRIDGE__ = true;

  // Read nonce and local Puter.js URL from injecting script element.
  // document.currentScript may be null for dynamically injected scripts in some
  // browsers/contexts, so fall back to getElementById with a known marker.
  const _currentScript = document.currentScript || document.getElementById('__skillbridge_loader__');
  const _bridgeNonce = _currentScript?.dataset?.nonce || crypto.randomUUID();
  const _puterUrl = _currentScript?.dataset?.puterUrl || '';

  let puterReady = false;
  let puterLoadPromise = null;

  function log(...args) {
    console.warn('[SkillBridge PageBridge]', ...args);
  }

  // Hard upper bound on request payload sizes. Real translations top out
  // at a few kB; chat prompts in the 10-20 kB range. 200 kB sits well
  // above legitimate usage and well below any reasonable Claude / Gemini
  // context limit. Without this guard a buggy caller — or a page-world
  // script that managed to read the loader nonce — could burn the
  // shared Puter.js quota by submitting megabyte-sized prompts.
  const _MAX_PAYLOAD_CHARS = 200_000;

  function _payloadTooLarge(data) {
    return (
      (data?.text?.length || 0) + (data?.systemPrompt?.length || 0) + (data?.userMessage?.length || 0) >
      _MAX_PAYLOAD_CHARS
    );
  }

  function _replyTooLarge(type, id, fallbackText) {
    window.postMessage(
      {
        __skillbridge__: true,
        __nonce__: _bridgeNonce,
        type,
        id,
        success: false,
        error: `Payload exceeds ${_MAX_PAYLOAD_CHARS} chars`,
        result: fallbackText || '',
      },
      window.location.origin,
    );
  }

  // Map of in-flight streaming-CHAT request id → { cancelled: boolean }.
  // The translator's AbortController previously stopped the UI from
  // *displaying* further chunks but did NOT stop Puter.js from generating
  // them — so a user clicking "send" 3x in a row left two zombie streams
  // burning the shared Puter.js quota until completion. CHAT_ABORT flips
  // the flag and the for-await loop breaks on next iteration, which lets
  // the async iterator's `return()` close the underlying connection.
  const _activeStreams = new Map();

  function _handleAbort(id) {
    const entry = _activeStreams.get(id);
    if (entry) entry.cancelled = true;
  }

  // Fallback chain — used when a primary model is rejected by Puter
  // (deprecation, rename, regional availability). Hardcoded here because
  // page-bridge runs in the page world and can't import constants.js.
  const _MODEL_FALLBACKS = {
    'claude-sonnet-4-6': 'claude-sonnet-4-5',
    'claude-opus-4-7': 'claude-opus-4-6',
    'claude-opus-4-6': 'claude-opus-4-5',
    'gemini-2.0-flash': 'gemini-1.5-flash',
  };

  function _isModelError(err) {
    const msg = (err?.message || err?.error || String(err) || '').toLowerCase();
    return /\b(model|invalid|deprecated|unsupported|not[ _-]?found|404)\b/.test(msg);
  }

  async function _puterChat(prompt, opts) {
    try {
      return await puter.ai.chat(prompt, opts);
    } catch (err) {
      const fallback = opts?.model && _MODEL_FALLBACKS[opts.model];
      if (!fallback || !_isModelError(err)) throw err;
      log(`Model "${opts.model}" rejected (${err?.message}); retrying with "${fallback}"`);
      return await puter.ai.chat(prompt, { ...opts, model: fallback });
    }
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
    const response = await _puterChat(prompt, {
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
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n');
    }
    return response?.text || '';
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || !data.__skillbridge__) return;
    // Nonce check. NOTE: the nonce lives in the loader script's
    // data-attribute and is therefore readable by any same-page script.
    // It does NOT secure us against malicious page-world code — the
    // actual gate is `manifest.json` `host_permissions` (the bridge
    // only ever runs on Skilljar pages we trust). This check just stops
    // accidental message echoes from unrelated libraries.
    if (data.__nonce__ !== _bridgeNonce) return;

    // === CHAT_ABORT === (fire-and-forget; no response expected)
    if (data.type === 'CHAT_ABORT') {
      _handleAbort(data.id);
      return;
    }

    // === TRANSLATE ===
    if (data.type === 'TRANSLATE_REQUEST') {
      if (_payloadTooLarge(data)) {
        _replyTooLarge('TRANSLATE_RESPONSE', data.id, data.text);
        return;
      }
      try {
        if (!puterReady) await loadPuter();
        // systemPrompt already contains the full prompt including the text
        const prompt = data.systemPrompt || 'Translate to target language:\n' + data.text;
        const result = await callAI(prompt, data.model);

        window.postMessage(
          {
            __skillbridge__: true,
            __nonce__: _bridgeNonce,
            type: 'TRANSLATE_RESPONSE',
            id: data.id,
            success: true,
            result: result || data.text,
          },
          window.location.origin,
        );
      } catch (err) {
        const errMsg = err?.error || err?.message || String(err);
        log('Translate error:', errMsg);
        window.postMessage(
          {
            __skillbridge__: true,
            __nonce__: _bridgeNonce,
            type: 'TRANSLATE_RESPONSE',
            id: data.id,
            success: false,
            error: errMsg,
            result: data.text,
          },
          window.location.origin,
        );
      }
    }

    // === GEMINI VERIFY (background quality check) ===
    if (data.type === 'VERIFY_REQUEST') {
      if (_payloadTooLarge(data)) {
        _replyTooLarge('VERIFY_RESPONSE', data.id, '');
        return;
      }
      try {
        if (!puterReady) await loadPuter();
        const prompt = data.systemPrompt;
        const result = await callAI(prompt, data.model || 'gemini-2.0-flash');

        window.postMessage(
          {
            __skillbridge__: true,
            __nonce__: _bridgeNonce,
            type: 'VERIFY_RESPONSE',
            id: data.id,
            success: true,
            result: result || '',
          },
          window.location.origin,
        );
      } catch (err) {
        const errMsg = err?.error || err?.message || String(err);
        log('Verify error:', errMsg);
        window.postMessage(
          {
            __skillbridge__: true,
            __nonce__: _bridgeNonce,
            type: 'VERIFY_RESPONSE',
            id: data.id,
            success: false,
            error: errMsg,
            result: '',
          },
          window.location.origin,
        );
      }
    }

    // === CHAT (streaming) ===
    if (data.type === 'CHAT_REQUEST') {
      if (_payloadTooLarge(data)) {
        _replyTooLarge('CHAT_RESPONSE', data.id, '');
        return;
      }
      // Register the stream entry BEFORE awaiting Puter — a CHAT_ABORT
      // can arrive while we're still inside `_puterChat` (e.g. Puter is
      // slow to first-byte) and must take effect when the stream starts.
      const streamEntry = data.stream ? { cancelled: false } : null;
      if (streamEntry) _activeStreams.set(data.id, streamEntry);

      try {
        if (!puterReady) await loadPuter();
        const prompt = data.systemPrompt || data.userMessage;

        if (data.stream) {
          // Streaming mode — send chunks via postMessage
          const response = await _puterChat(prompt, {
            // SkillBridge is Claude-focused; default to Haiku as a cheap,
            // fast Claude fallback if content.js forgets to pass `model`.
            model: data.model || 'claude-haiku-4-5',
            stream: true,
          });

          for await (const chunk of response) {
            // Bail on cancellation — breaking out of for-await calls the
            // iterator's `return()` which signals Puter.js to close the
            // upstream stream and stops billing for further tokens.
            if (streamEntry.cancelled) break;
            const text = chunk?.text || chunk?.message?.content || '';
            if (text) {
              window.postMessage(
                {
                  __skillbridge__: true,
                  __nonce__: _bridgeNonce,
                  type: 'CHAT_STREAM_CHUNK',
                  id: data.id,
                  text,
                },
                window.location.origin,
              );
            }
          }
          // Only emit END for natural completion — a cancelled stream
          // means the translator already rejected with AbortError; an
          // END here would race with that and resolve the orphan
          // promise to "No response".
          if (!streamEntry.cancelled) {
            window.postMessage(
              {
                __skillbridge__: true,
                __nonce__: _bridgeNonce,
                type: 'CHAT_STREAM_END',
                id: data.id,
                success: true,
              },
              window.location.origin,
            );
          }
        } else {
          // Non-streaming fallback
          const result = await callAI(prompt, data.model);
          window.postMessage(
            {
              __skillbridge__: true,
              __nonce__: _bridgeNonce,
              type: 'CHAT_RESPONSE',
              id: data.id,
              success: true,
              result: result || 'No response',
            },
            window.location.origin,
          );
        }
      } catch (err) {
        const errMsg = err?.error || err?.message || String(err);
        log('Chat error:', errMsg);
        window.postMessage(
          {
            __skillbridge__: true,
            __nonce__: _bridgeNonce,
            type: 'CHAT_RESPONSE',
            id: data.id,
            success: false,
            error: errMsg,
            result: 'Error: ' + errMsg,
          },
          window.location.origin,
        );
      } finally {
        if (streamEntry) _activeStreams.delete(data.id);
      }
    }
  });

  loadPuter()
    .then(() => {
      window.postMessage(
        { __skillbridge__: true, __nonce__: _bridgeNonce, type: 'BRIDGE_READY' },
        window.location.origin,
      );
    })
    .catch((err) => {
      log('Auto-load failed:', err.message);
      window.postMessage(
        { __skillbridge__: true, __nonce__: _bridgeNonce, type: 'BRIDGE_ERROR', error: err.message },
        window.location.origin,
      );
    });
})();
