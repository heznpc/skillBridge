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
  manifest.host_permissions.push('http://localhost/*');
  // Tests rely on chrome.scripting (manual injection diagnostics) being
  // available; the production manifest doesn't need it but adding it for
  // E2E doesn't affect runtime behaviour of the content scripts we test.
  manifest.permissions = manifest.permissions || [];
  if (!manifest.permissions.includes('scripting')) manifest.permissions.push('scripting');
  for (const war of manifest.web_accessible_resources || []) {
    war.matches.push('http://localhost:*/*', 'http://127.0.0.1:*/*');
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return extDir;
}

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
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) throw new Error('No active tab to inject into');

      const [{ result, error }] = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
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

module.exports = { launchExtension, closeExtension, evalInContentWorld, EXTENSION_SRC };
