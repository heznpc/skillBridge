/**
 * Stream-friendly Puter SDK stub used by the extension-bundle E2E patch.
 *
 * page-bridge.js loads the bundled SDK from
 * chrome.runtime.getURL('src/bridge/puter.js'). The E2E helper replaces that
 * file in a temporary bundle so no account or external AI request is needed.
 */

const PUTER_STREAM_STUB = `
(function () {
  const STREAM_CHUNKS = ['안녕하세요! ', '프롬프트는 Claude에게 ', '주는 입력입니다.'];
  // 150ms per chunk → 450ms total stream. Slow enough for the cancel
  // spec to interrupt between chunks but still fast enough that the
  // tutor-chat spec finishes under its 10s deadline.
  window.__sbE2eChunkDelayMs = 150;
  // Mirror the vendored SDK's unsafe auth-message behavior. The production
  // puter-frame-init.js capture filter must stop hostile host origins before
  // this listener can persist a forged token.
  window.addEventListener('message', function (event) {
    if (event.data && event.data.msg === 'puter.token') {
      window.puter.authToken = event.data.token;
      window.localStorage.setItem('puter.auth.token', event.data.token);
    }
  });
  window.puter = {
    // Models a signed-in user so the Tutor can run without a sign-in prompt.
    authToken: 'e2e-stub-token',
    ai: {
      chat: async function (prompt, opts) {
        const state = await chrome.storage.local.get(['sb_e2e_fail_chat_count', 'sb_e2e_chunk_delay']);
        const failCount = Number(state.sb_e2e_fail_chat_count || 0);
        if (opts && opts.stream && failCount > 0) {
          await chrome.storage.local.set({ sb_e2e_fail_chat_count: Math.max(0, failCount - 1) });
          throw new Error('E2E forced chat failure');
        }
        const delay = Number(state.sb_e2e_chunk_delay);
        if (Number.isFinite(delay) && delay > 0) window.__sbE2eChunkDelayMs = delay;
        if (opts && opts.stream) {
          return {
            [Symbol.asyncIterator]() {
              let i = 0;
              return {
                async next() {
                  await new Promise((r) => setTimeout(r, window.__sbE2eChunkDelayMs || 150));
                  if (i >= STREAM_CHUNKS.length) return { done: true };
                  return { done: false, value: { text: STREAM_CHUNKS[i++] } };
                },
              };
            },
          };
        }
        // The Tutor uses stream=true; retain a harmless non-streaming response
        // for SDK compatibility.
        return { message: { content: 'OK' } };
      },
    },
  };
})();
`;

module.exports = { PUTER_STREAM_STUB };
