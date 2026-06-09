/**
 * SkillBridge — Playwright extension-launch helper.
 *
 * Loads `dist/bundled/` (the production-shape bundle, not raw src/) into a
 * persistent Chromium context. Returns the context plus the dynamically-
 * discovered extension ID so tests can construct chrome-extension:// URLs.
 *
 * The bundled manifest only matches `https://*.skilljar.com/*`. For E2E we
 * copy the bundle to a temp dir and patch the manifest to ALSO match
 * `http://localhost:*` — Playwright's `route().fulfill()` doesn't trigger
 * content-script injection in Chromium MV3 (confirmed empirically against
 * v3.5.15 on 2026-05-13), so we have to serve the fixture from a real
 * local HTTP server. Patching a temp copy keeps `dist/bundled/` itself
 * untouched (it's the artifact we ship).
 *
 * Caller must build the bundle first; `npm run test:e2e` chains both.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('@playwright/test');

const EXTENSION_SRC = path.join(__dirname, '..', '..', '..', 'dist', 'bundled');

/**
 * Launch a fresh persistent Chromium context with the extension loaded.
 *
 * `userDataDir` is a per-launch temp directory so successive runs don't
 * accumulate IndexedDB state from previous tests (each persistent context
 * needs its own dir; sharing causes "Failed to lock" errors).
 *
 * @returns {Promise<{context: import('@playwright/test').BrowserContext, extensionId: string, userDataDir: string}>}
 */
/**
 * Copy `dist/bundled/` to a fresh temp dir and patch its manifest's
 * content_scripts.matches to also include http://localhost:*. Returns the
 * patched dir path.
 */
function makePatchedExtension() {
  if (!fs.existsSync(path.join(EXTENSION_SRC, 'manifest.json'))) {
    throw new Error(
      `Extension bundle missing at ${EXTENSION_SRC}. ` +
        `Run \`npm run build:bundle\` first. Tests bypass this when invoked ` +
        `through \`npm run test:e2e\` which builds first.`,
    );
  }
  const extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillbridge-e2e-ext-'));
  fs.cpSync(EXTENSION_SRC, extDir, { recursive: true });

  const manifestPath = path.join(extDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const cs of manifest.content_scripts) {
    cs.matches.push('http://localhost:*/*', 'http://127.0.0.1:*/*');
  }
  // Also add localhost to host_permissions and web_accessible_resources so
  // chrome.runtime.getURL() / SW message routing keep working from the
  // fixture page.
  manifest.host_permissions = manifest.host_permissions || [];
  // Port wildcards are required — `http://localhost/*` matches port 80 only.
  // chrome.scripting.executeScript silently refuses to inject without a
  // host_permissions entry that covers the active tab's port.
  manifest.host_permissions.push('http://localhost:*/*', 'http://127.0.0.1:*/*');
  // Tests rely on chrome.scripting (manual injection diagnostics) being
  // available; the production manifest doesn't need it but adding it for
  // E2E doesn't affect runtime behaviour of the content scripts we test.
  manifest.permissions = manifest.permissions || [];
  if (!manifest.permissions.includes('scripting')) manifest.permissions.push('scripting');
  for (const war of manifest.web_accessible_resources || []) {
    war.matches.push('http://localhost:*/*', 'http://127.0.0.1:*/*');
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // Replace the bundled `src/bridge/puter.js` with a stream-friendly stub.
  // The production manifest sends `chrome.runtime.getURL('src/bridge/puter.js')`
  // to page-bridge as the Puter SDK URL — that's a `chrome-extension://`
  // path inside the extension dir, not an external URL, so the
  // `https://js.puter.com/**` route handler never fires. Patching the
  // bundled file is the only way to intercept Puter for tutor-chat E2E.
  const puterStubPath = path.join(extDir, 'src', 'bridge', 'puter.js');
  if (fs.existsSync(puterStubPath)) {
    fs.writeFileSync(puterStubPath, PUTER_STREAM_STUB);
  }

  return extDir;
}

// Stream-friendly Puter SDK stub. `chat(prompt, {stream:true})` returns an
// async iterable yielding 3 Korean chunks — page-bridge.js then forwards
// each as a CHAT_STREAM_CHUNK message, and translator's onChunk fires for
// each. The strings are deliberately distinctive so the tutor-chat spec
// can assert each chunk made it end-to-end.
const PUTER_STREAM_STUB = `
(function () {
  const STREAM_CHUNKS = ['안녕하세요! ', '프롬프트는 Claude에게 ', '주는 입력입니다.'];
  // 150ms per chunk → 450ms total stream. Slow enough for the cancel
  // spec to interrupt between chunks but still fast enough that the
  // tutor-chat spec finishes under its 10s deadline.
  window.__sbE2eChunkDelayMs = 150;
  window.puter = {
    ai: {
      chat: async function (prompt, opts) {
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
        // Non-streaming path = Gemini verify (translator._verifySingle).
        // Returning "OK" tells _verifySingle the GT result is good →
        // _cacheTranslation(original, googleTranslation) — the GT
        // translation gets cached verbatim. Without this we'd cache the
        // chat-stream Korean greeting which is harder for tests to
        // pre-compute. Tutor-chat uses stream=true so it's unaffected.
        return { message: { content: 'OK' } };
      },
    },
  };
})();
`;

async function launchExtension() {
  const EXTENSION_PATH = makePatchedExtension();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillbridge-e2e-'));

  // `channel: 'chromium'` forces the full Chromium browser (not the
  // chromium-headless-shell that Playwright defaults to for headless runs).
  // The shell strips out the extension subsystem entirely — service workers
  // never register, MV3 onInstalled never fires, and the launch hangs on
  // `waitForEvent('serviceworker')`. The full chromium under the new
  // headless mode does support extensions in CI.
  // E2E_HEADED=1 forces visible Chromium; useful locally for debugging.
  // CI uses xvfb-run (see .github/workflows/ci.yml) to give headless Linux
  // an X server, since Chromium MV3 content scripts inject more reliably
  // in non-headless mode (the new headless=new mode in chromium 121+ does
  // technically support extensions but content_scripts injection still
  // misbehaves in some Playwright + chromium combinations as of 2026-05).
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      // Lets `--load-extension` take effect; Chromium 121+ guards it
      // behind this feature flag by default.
      '--disable-features=DisableLoadExtensionCommandLineSwitch',
    ],
  });

  // Wait for the service worker to register so we can grab the extension ID.
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15_000 });
  }
  const extensionId = serviceWorker.url().split('/')[2];

  return { context, extensionId, userDataDir, extensionPath: EXTENSION_PATH };
}

/**
 * Tear down a context produced by `launchExtension` plus its temp dirs
 * (both the user-data dir and the patched-extension copy).
 */
async function closeExtension({ context, userDataDir, extensionPath }) {
  try {
    await context.close();
  } finally {
    for (const dir of [userDataDir, extensionPath]) {
      if (dir && fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  }
}

/**
 * Run a NAMED diagnostic in the extension's content-script isolated world
 * (where `window._sb` lives — Playwright's `page.evaluate` runs in the
 * page main world, which can't see content-script globals).
 *
 * Why a named-menu API instead of accepting arbitrary functions:
 *   - MV3 content-script CSP forbids `new Function`/`eval`, so we can't
 *     ship a function-as-source across the bridge and recompile it
 *     inside the content script.
 *   - `chrome.scripting.executeScript({ func })` CAN accept a function
 *     literal, but only when that literal is statically defined inside
 *     the SW evaluate body — Playwright's CDP `evaluate` does its own
 *     stringify+eval on the SW side, which IS allowed because the SW
 *     itself has a more permissive CSP than the content-script CSP.
 *   - The right shape is: enumerate a fixed set of diagnostic operations
 *     each defined as a static function literal in this file. Tests
 *     compose those operations.
 *
 * Operations:
 *   - 'snapshot' — return a JSON-serializable read of `_sb`/`_sb._gt`/
 *     `_sb._chat.state` (everything the golden test needs)
 *   - 'switchLanguage' — call `_sb.switchLanguage(arg)` and return after
 *     the promise resolves (so the await chain stays meaningful)
 *   - 'injectSidebar' — call `_sb.injectSidebar()`
 *   - 'toggleSidebar' — call `_sb.toggleSidebar()`
 *   - 'toggleHistoryPanel' — call `_sb._chat.toggleHistoryPanel()`
 *   - 'closeSubPanel' — call `_sb._chat.closeSubPanel()`
 *   - 'pageText' — return `document.body.textContent` (snapshot the
 *     translated DOM without exposing _sb)
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string} op
 * @param {any} [arg]
 */
async function evalInContentWorld(context, op, arg) {
  const sw = context.serviceWorkers()[0];
  if (!sw) throw new Error('No extension service worker — was launchExtension called?');
  const safeArg = arg === undefined ? null : arg;
  return await sw.evaluate(
    async ([opName, payload]) => {
      // Query by URL pattern, not active-tab: Playwright sometimes loses
      // "current window" focus when the page-bridge injects its
      // web_accessible_resource <script>, and `{active:true}` then returns
      // a tab from a different window that the extension has no host
      // permission for. Matching on the fixture URL is unambiguous.
      const allTabs = await chrome.tabs.query({ url: ['http://localhost/*', 'http://localhost:*/*'] });
      // Prefer the most-recently-active matching tab.
      const tab = allTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
      if (!tab) throw new Error('No fixture tab to inject into');

      const [{ result, error }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'ISOLATED',
        func: async (opNameInner, payloadInner) => {
          // Re-declare the ops table inside the content-script world.
          // (chrome.scripting.executeScript can't pass closures.)
          const ops = {
            snapshot: () => {
              const sb = window._sb;
              if (!sb) return { init: window.__skillbridge_initialized__, sb: null };
              return {
                init: window.__skillbridge_initialized__,
                sb: true,
                currentLang: sb.currentLang,
                sidebarVisible: sb.sidebarVisible,
                gtGeneration: sb._gt && sb._gt.gtGeneration,
                isOffline: sb.isOffline,
                methods: {
                  gt: sb._gt && {
                    applyStaticTranslations: typeof sb._gt.applyStaticTranslations,
                    queueForGoogleTranslate: typeof sb._gt.queueForGoogleTranslate,
                    reset: typeof sb._gt.reset,
                    pruneDetachedEntries: typeof sb._gt.pruneDetachedEntries,
                    removeVerifySpinner: typeof sb._gt.removeVerifySpinner,
                    processOneElement: typeof sb._gt.processOneElement,
                    flushOfflinePending: typeof sb._gt.flushOfflinePending,
                  },
                  chat: sb._chat && {
                    formatResponse: typeof sb._chat.formatResponse,
                    sanitizeHtml: typeof sb._chat.sanitizeHtml,
                    closeSubPanel: typeof sb._chat.closeSubPanel,
                    toggleHistoryPanel: typeof sb._chat.toggleHistoryPanel,
                    saveConversation: typeof sb._chat.saveConversation,
                    state: sb._chat.state && {
                      savedChatHTML: sb._chat.state.savedChatHTML,
                      historyPanelOpen: sb._chat.state.historyPanelOpen,
                      flashcardPanelOpen: sb._chat.state.flashcardPanelOpen,
                    },
                  },
                  sb: {
                    switchLanguage: typeof sb.switchLanguage,
                    isLikelyEnglish: typeof sb.isLikelyEnglish,
                    escapeHtml: typeof sb.escapeHtml,
                    safeReplaceText: typeof sb.safeReplaceText,
                  },
                },
              };
            },
            switchLanguage: async (lang) => {
              await window._sb.switchLanguage(lang);
              return true;
            },
            injectSidebar: () => {
              window._sb.injectSidebar();
              return true;
            },
            toggleSidebar: () => {
              window._sb.toggleSidebar();
              return true;
            },
            // ── Store-asset capture ops (additive; unused by the E2E specs) ──
            // Open/close the flashcard sub-panel (sidebar must be open first).
            toggleFlashcardPanel: () => {
              window._sb.toggleFlashcardPanel();
              return true;
            },
            // Show the first-run onboarding banner — the genuine in-product
            // language picker, used for the "language selection" screenshot.
            showWelcomeBanner: (lang) => {
              window._sb.showWelcomeBanner(lang || 'ko');
              return true;
            },
            // Suppress onboarding so it doesn't obscure other scenes: remove any
            // banner already shown and mark it seen so the delayed one never fires.
            suppressOnboarding: () => {
              document.getElementById('si18n-welcome-banner')?.remove();
              try {
                chrome.storage.local.set({ welcomeShown: true });
              } catch (_e) {
                /* storage may be unavailable in some contexts */
              }
              return true;
            },
            // Remove transient clutter right before a screenshot: the per-lesson
            // term-preview popover and any in-flight GT verify spinners ("•••").
            cleanForCapture: () => {
              document.getElementById('si18n-term-preview')?.remove();
              document.querySelectorAll('.si18n-verify-spinner').forEach((el) => el.remove());
              return true;
            },
            toggleHistoryPanel: () => {
              window._sb._chat.toggleHistoryPanel();
              return true;
            },
            closeSubPanel: () => {
              window._sb._chat.closeSubPanel();
              return true;
            },
            pageText: () => ({
              h1: document.querySelector('h1') && document.querySelector('h1').textContent,
              p1: document.querySelector('#p-1') && document.querySelector('#p-1').textContent,
              li1: document.querySelector('#li-1') && document.querySelector('#li-1').textContent,
              // #p-protected exists in the lesson fixture specifically for
              // protected-terms.spec.js — the GT stub returns mistranslated
              // content and we assert the wrong forms got fixed.
              pProtected: document.querySelector('#p-protected') && document.querySelector('#p-protected').textContent,
              pBelowFold:
                document.querySelector('#p-below-fold') && document.querySelector('#p-below-fold').textContent,
            }),
            // Read quiz fixture state. `answers` is the array of answer-option
            // label texts AFTER translation — the test asserts these are
            // still English (the v3.5.x "exam-mode" contract).
            quizText: () => {
              const trim = (s) => (s == null ? null : s.replace(/\s+/g, ' ').trim());
              return {
                title: trim(document.querySelector('#quiz-title') && document.querySelector('#quiz-title').textContent),
                question: trim(
                  document.querySelector('#quiz-question') && document.querySelector('#quiz-question').textContent,
                ),
                answers: Array.from(document.querySelectorAll('.answer-option')).map((el) => trim(el.textContent)),
              };
            },
            // Whether content.js's detectExamPage() flipped isExamPage true.
            // Read via the `_sb.isExamPage` getter content.js exposes.
            examStatus: () => ({ isExamPage: !!(window._sb && window._sb.isExamPage) }),
            // Diagnostic: probe translator IDB cache state directly.
            // Returns the count of entries + the verifyQueue length +
            // whether _db is open. Used by idb-cache.spec.js to verify
            // the cache write path is actually running, not just trust
            // the translator.translate() return value.
            cacheState: async () => {
              const t = window._sb?.translator;
              if (!t) return { error: 'translator missing' };
              const dbOpen = !!t._db;
              const verifyLen = (t._verifyQueue && t._verifyQueue.length) || 0;
              if (!dbOpen) return { dbOpen, verifyLen, count: null };
              const count = await new Promise((resolve) => {
                try {
                  const tx = t._db.transaction('translations', 'readonly');
                  const req = tx.objectStore('translations').count();
                  req.onsuccess = () => resolve(req.result);
                  req.onerror = () => resolve(-1);
                } catch (_e) {
                  resolve(-2);
                }
              });
              return { dbOpen, verifyLen, count, isReady: t.isReady, gen: t._langGeneration };
            },
            // Call `sb.translator.translate(text, lang)` once and return
            // the `{text, source}` shape. `source` is one of static | cache
            // | google | original — used by tests/e2e/idb-cache.spec.js to
            // assert that a second translate() of the same (text, lang)
            // pair hits the cache (source==='cache') instead of re-firing
            // the GT network call (source==='google').
            translateOnce: async (payload) => {
              if (!window._sb?.translator?.translate) return { error: 'translator.translate missing' };
              const { text, lang } = payload || {};
              const result = await window._sb.translator.translate(text, lang);
              return { text: result?.text, source: result?.source };
            },
            // Run sb.translateCodeComments on the current language.
            // Mirrors what the popup's `toggleCommentTranslation` message
            // handler does on enable. Returns when the translate pass
            // completes (the function is async; resolves after every
            // <code> block has its translate() call resolve).
            translateCodeComments: async () => {
              if (!window._sb || !window._sb.translateCodeComments) {
                return { error: 'translateCodeComments missing' };
              }
              await window._sb.translateCodeComments(window._sb.currentLang);
              return { ok: true };
            },
            // Read the Python fixture code block. Returns its textContent
            // so the spec can assert on both the translated comment AND
            // the preserved code keywords (def/return/pass).
            readCodeFencePython: () => {
              const el = document.querySelector('#code-fence-python code');
              return { text: el ? el.textContent : null };
            },
            // Scroll the below-the-fold paragraph into view — used by
            // tests/e2e/lazy-translate.spec.js to verify the lazy
            // IntersectionObserver fires translation work only when
            // content nears the viewport (not upfront on page load).
            scrollToBelowFold: () => {
              const el = document.querySelector('#p-below-fold');
              if (!el) return { error: 'no #p-below-fold element' };
              el.scrollIntoView({ behavior: 'instant', block: 'center' });
              return { ok: true };
            },
            // Simulate a Skilljar SPA-style navigation: atomically swap the
            // body HTML and push a new history entry. Triggers the wrapped
            // `history.pushState` which content.js intercepts to fire
            // `onRouteChange`. payload = { html, path }.
            replaceBodyAndPushState: (p) => {
              document.body.innerHTML = p.html;
              history.pushState({}, '', p.path);
              return { url: location.href };
            },
            // Snapshot of body text after a SPA nav — used to assert both
            // (a) new content was translated and (b) old content didn't
            // leak through.
            bodyTextSnapshot: () => ({
              text: document.body.textContent.replace(/\s+/g, ' ').trim(),
              h1: document.querySelector('h1') && document.querySelector('h1').textContent,
              p: document.querySelector('p') && document.querySelector('p').textContent,
            }),
            // Whether the page-bridge has finished initializing and the
            // tutor is callable. Used by tutor-chat.spec.js to gate the
            // first sendChat — translator.chatStream throws "Bridge not
            // ready" if you call it before BRIDGE_READY lands.
            bridgeReady: () => ({
              isReady: !!(window._sb && window._sb.translator && window._sb.translator.isReady),
            }),
            // Simulate the user typing in the chat input + clicking send.
            // This exercises the full sidebar-chat.sendChatMessage path:
            //   input.value = text → click handler → translator.chatStream
            //   → CHAT_REQUEST postMessage → page-bridge → puter stub →
            //   CHAT_STREAM_CHUNK events → onChunk → formatResponse →
            //   bubble.innerHTML update → CHAT_STREAM_END → saveConversation.
            sendChat: (text) => {
              const input = document.getElementById('si18n-chat-input');
              const sendBtn = document.getElementById('si18n-chat-send');
              if (!input || !sendBtn) {
                return { error: 'chat UI not present — open sidebar first' };
              }
              input.value = text;
              sendBtn.click();
              return { ok: true };
            },
            // Trigger sb.cancelActiveStream — the same path that fires on
            // sidebar close / SPA nav / sub-panel switch. After this, any
            // in-flight chatStream should reject with AbortError, sidebar-
            // chat's catch handler should remove the streaming-cursor
            // class on the bot bubble, and isSending should be reset.
            cancelStream: () => {
              if (!window._sb || !window._sb.cancelActiveStream) {
                return { error: 'cancelActiveStream not on _sb' };
              }
              window._sb.cancelActiveStream();
              return { ok: true };
            },
            // Read history-panel list items after toggleHistoryPanel +
            // loadHistoryList have run. Each `.si18n-history-item` has a
            // `data-id` matching the IndexedDB primary key, a preview of
            // the question text, and a localized timestamp. The test
            // asserts both expected questions appear, proving the
            // saveConversation → IDB → loadHistoryList round-trip works.
            readHistoryList: () => {
              const items = document.querySelectorAll('.si18n-history-item');
              return Array.from(items).map((el) => ({
                id: el.dataset.id,
                question: el.querySelector('.si18n-history-item-q')?.textContent.trim() || '',
              }));
            },
            // Click a history list item by its data-id, opening the detail
            // view. Returns the rendered detail HTML so the test can
            // assert the original question and bot-answer text are present
            // (proves IDB read of a single record by primary key works).
            openHistoryDetail: (id) => {
              const item = document.querySelector(`.si18n-history-item[data-id="${id}"]`);
              if (!item) return { error: 'no item with id=' + id };
              item.click();
              return { ok: true };
            },
            // Read the detail-view content after openHistoryDetail.
            readHistoryDetail: () => {
              const detail = document.querySelector('.si18n-history-detail');
              if (!detail) return { present: false };
              return {
                present: true,
                userText: detail.querySelector('.si18n-chat-user .si18n-chat-bubble')?.textContent.trim() || '',
                botText: detail.querySelector('.si18n-chat-bot .si18n-chat-bubble')?.textContent.trim() || '',
              };
            },
            // Read every chat bubble currently in the messages area.
            // Returns role + text per bubble so the test can assert (a) a
            // user bubble with the typed text exists and (b) a bot bubble
            // with the streamed-and-formatted response exists.
            readChatLog: () => {
              const msgs = document.querySelectorAll('#si18n-chat-messages .si18n-chat-msg');
              return Array.from(msgs).map((m) => {
                const role = m.classList.contains('si18n-chat-user')
                  ? 'user'
                  : m.classList.contains('si18n-chat-bot')
                    ? 'bot'
                    : 'other';
                const bubble = m.querySelector('.si18n-chat-bubble');
                return {
                  role,
                  text: bubble ? bubble.textContent.replace(/\s+/g, ' ').trim() : '',
                  html: bubble ? bubble.innerHTML : '',
                };
              });
            },
          };
          if (!ops[opNameInner]) throw new Error('Unknown op: ' + opNameInner);
          return await ops[opNameInner](payloadInner);
        },
        args: [opName, payload],
      });
      if (error) throw new Error('executeScript error: ' + JSON.stringify(error));
      return result;
    },
    [op, safeArg],
  );
}

module.exports = { launchExtension, closeExtension, evalInContentWorld, EXTENSION_SRC, makePatchedExtension };
