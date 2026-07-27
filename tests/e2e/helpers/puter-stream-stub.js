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
  window.puter = {
    // Models a signed-in user so the Tutor can run without a sign-in prompt.
    authToken: 'e2e-stub-token',
    ai: {
      chat: async function (prompt, opts) {
        const failAttr = 'data-sb-e2e-fail-chat-count';
        const failCount = Number(document.documentElement.getAttribute(failAttr) || 0);
        if (opts && opts.stream && failCount > 0) {
          if (failCount > 1) {
            document.documentElement.setAttribute(failAttr, String(failCount - 1));
          } else {
            document.documentElement.removeAttribute(failAttr);
          }
          throw new Error('E2E forced chat failure');
        }
        const delay = Number(document.documentElement.dataset.sbE2eChunkDelayMs);
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
