/**
 * SkillBridge — named E2E operations executed in the content-script isolated world.
 *
 * Keeping the static operation table here prevents extension launch/patching code
 * from becoming the merge bottleneck whenever a new E2E probe is added.
 */

const SERVICE_WORKER_READY_TIMEOUT_MS = 20_000;

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
  const safeArg = arg === undefined ? null : arg;
  for (let attempt = 0; attempt < 3; attempt++) {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: SERVICE_WORKER_READY_TIMEOUT_MS });
    }
    try {
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
                    hostCaps: sb.hostCaps
                      ? {
                          platform: sb.hostCaps.platform,
                          trusted: sb.hostCaps.trusted,
                          sidebar: sb.hostCaps.sidebar,
                          fab: sb.hostCaps.fab,
                          bridge: sb.hostCaps.bridge,
                        }
                      : null,
                    translator: sb.translator
                      ? {
                          aiEnabled: sb.translator.aiEnabled !== false,
                          cacheReady: !!sb.translator._db,
                          bridgeReady: !!sb.translator.isReady,
                        }
                      : null,
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
                        toggleDashboardPanel: typeof sb._chat.toggleDashboardPanel,
                        toggleFlashcardPanel: typeof sb._chat.toggleFlashcardPanel,
                        saveConversation: typeof sb._chat.saveConversation,
                        state: sb._chat.state && {
                          savedChatHTML: sb._chat.state.savedChatHTML,
                          historyPanelOpen: sb._chat.state.historyPanelOpen,
                          dashboardPanelOpen: sb._chat.state.dashboardPanelOpen,
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
                dispatchOffline: () => {
                  window.dispatchEvent(new window.Event('offline'));
                  return { isOffline: !!window._sb?.isOffline };
                },
                dispatchOnline: () => {
                  window.dispatchEvent(new window.Event('online'));
                  return { isOffline: !!window._sb?.isOffline };
                },
                // Deterministically reproduce the static-apply language-switch race:
                // force the FIRST (slow) language's dictionary load to resolve AFTER
                // the second (fast) one, then record which langs actually reach
                // applyStaticTranslations. A stale apply (the slow lang painting over
                // the page after the user already switched) shows up as the slow lang
                // appearing in `appliedWith`. Patches the translator/gt ONLY for the
                // duration of the op (restored in finally) — no production change.
                rapidSwitchRace: async (arg) => {
                  const sb = window._sb;
                  const tr = sb.translator;
                  const gt = sb._gt;
                  const slowLang = arg[0];
                  const fastLang = arg[1];
                  const origLoad = tr.loadStaticTranslations.bind(tr);
                  const origApply = gt.applyStaticTranslations.bind(gt);
                  const appliedWith = [];
                  gt.applyStaticTranslations = (lang) => {
                    appliedWith.push(lang);
                    return origApply(lang);
                  };
                  tr.loadStaticTranslations = async (lang) => {
                    const r = await origLoad(lang);
                    if (lang === slowLang) await new Promise((res) => setTimeout(res, 400));
                    return r;
                  };
                  try {
                    // no await — starts the slow path; swallow rejection so a stubbed
                    // load failure can't surface as an unhandled rejection.
                    sb.switchLanguage(slowLang).catch(() => {});
                    await sb.switchLanguage(fastLang); // fast path applies first
                    await new Promise((res) => setTimeout(res, 700)); // let the slow load resolve + (bail|apply)
                  } finally {
                    tr.loadStaticTranslations = origLoad;
                    gt.applyStaticTranslations = origApply;
                  }
                  return { appliedWith, currentLang: sb.currentLang };
                },
                injectSidebar: () => {
                  window._sb.injectSidebar();
                  return true;
                },
                toggleSidebar: () => {
                  window._sb.toggleSidebar();
                  return true;
                },
                // Inject the FAB and report whether it is shadow-isolated + its
                // computed style. Used by shadow-isolation.spec.js to prove host
                // page CSS cannot reach the FAB inside #skillbridge-root's shadow.
                fabProbe: () => {
                  if (!window._sb || !window._sb.injectFloatingButton) return { ok: false };
                  window._sb.injectFloatingButton();
                  const host = document.getElementById('skillbridge-root');
                  const fab = host && host.shadowRoot && host.shadowRoot.getElementById('skillbridge-fab');
                  if (!fab) return { ok: false };
                  const cs = window.getComputedStyle(fab);
                  const svg = fab.querySelector('svg');
                  const r = svg && svg.getBoundingClientRect();
                  return {
                    ok: true,
                    inLightDom: !!document.getElementById('skillbridge-fab'),
                    inShadow: fab.getRootNode() === host.shadowRoot,
                    background: cs.backgroundColor,
                    svgWidth: r ? Math.round(r.width) : null,
                  };
                },
                // Await the transformed content CSS sheet + report adoption. Proves
                // the runtime fetch → transform → adoptedStyleSheets path works.
                shadowSheetReady: async () => {
                  if (!window._sbShadowCss) return { ok: false };
                  let sheet = null;
                  for (let i = 0; i < 10; i++) {
                    sheet = await window._sbShadowCss.loadShadowSheet();
                    if (sheet) break;
                    await new Promise((r) => setTimeout(r, 200));
                  }
                  const host = document.getElementById('skillbridge-root');
                  const root = host && host.shadowRoot;
                  if (root) window._sbShadowCss.ensureShadowStylesheet(root);
                  for (let i = 0; i < 10 && sheet && root && !root.adoptedStyleSheets.includes(sheet); i++) {
                    await new Promise((r) => setTimeout(r, 50));
                  }
                  let hasHostDark = false;
                  try {
                    if (sheet) {
                      for (const rule of sheet.cssRules) {
                        if (rule.selectorText && rule.selectorText.includes(':host(.si18n-dark)')) {
                          hasHostDark = true;
                          break;
                        }
                      }
                    }
                  } catch (_e) {
                    /* cssRules can throw on cross-origin sheets; ours is same-origin */
                  }
                  return {
                    ok: true,
                    sheetLoaded: !!sheet,
                    adopted: root ? root.adoptedStyleSheets.length : 0,
                    hasHostDark,
                  };
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
                welcomeBannerState: () => {
                  const banner = document.getElementById('si18n-welcome-banner');
                  const select = document.getElementById('si18n-banner-lang');
                  return {
                    present: !!banner,
                    visible: !!banner?.classList.contains('visible'),
                    selectedLang: select?.value || null,
                    text: banner?.textContent?.replace(/\s+/g, ' ').trim() || '',
                  };
                },
                changeWelcomeLanguage: (lang) => {
                  const select = document.getElementById('si18n-banner-lang');
                  if (!select) return { error: 'welcome banner select missing' };
                  select.value = lang || 'ko';
                  select.dispatchEvent(new window.Event('change', { bubbles: true }));
                  return { ok: true };
                },
                acceptWelcomeLanguage: (lang) => {
                  const select = document.getElementById('si18n-banner-lang');
                  const button = document.getElementById('si18n-banner-yes');
                  if (!select || !button) return { error: 'welcome banner controls missing' };
                  select.value = lang || 'ko';
                  select.dispatchEvent(new window.Event('change', { bubbles: true }));
                  button.click();
                  return { ok: true };
                },
                storageState: async (keys) => {
                  const requested = Array.isArray(keys) ? keys : ['targetLanguage', 'autoTranslate', 'welcomeShown'];
                  return await new Promise((resolve) => chrome.storage.local.get(requested, resolve));
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
                  document.getElementById('si18n-progress-bar')?.remove();
                  document.getElementById('si18n-progress-toast')?.remove();
                  document.querySelectorAll('.si18n-verify-spinner').forEach((el) => el.remove());
                  return true;
                },
                toggleDashboardPanel: () => {
                  window._sb._chat.toggleDashboardPanel();
                  return true;
                },
                readDashboard: () => {
                  const root = window._sb._uiHost?.shadowRoot || document;
                  const title = root.querySelector('.si18n-history-title')?.textContent?.trim() || '';
                  const stats = root.querySelectorAll('.si18n-dash-stat').length;
                  return { title, stats };
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
                  pProtected:
                    document.querySelector('#p-protected') && document.querySelector('#p-protected').textContent,
                  pBelowFold:
                    document.querySelector('#p-below-fold') && document.querySelector('#p-below-fold').textContent,
                }),
                // Read quiz fixture state. `answers` is the array of answer-option
                // label texts AFTER translation — the test asserts these are
                // still English (the v3.5.x "exam-mode" contract).
                quizText: () => {
                  const trim = (s) => (s == null ? null : s.replace(/\s+/g, ' ').trim());
                  return {
                    title: trim(
                      document.querySelector('#quiz-title') && document.querySelector('#quiz-title').textContent,
                    ),
                    question: trim(
                      document.querySelector('#quiz-question') && document.querySelector('#quiz-question').textContent,
                    ),
                    answers: Array.from(document.querySelectorAll('.answer-option')).map((el) => trim(el.textContent)),
                  };
                },
                // Whether content.js's detectExamPage() flipped isExamPage true.
                // Read via the `_sb.isExamPage` getter content.js exposes.
                examStatus: () => ({ isExamPage: !!(window._sb && window._sb.isExamPage) }),
                // Whether the YouTube subtitle manager is currently live. Read via
                // the read-only `_sb.hasSubtitleManager` seam content.js exposes; used
                // by youtube-lifecycle.spec.js to assert teardown/rebuild on cert nav.
                subtitleStatus: () => ({ active: !!(window._sb && window._sb.hasSubtitleManager) }),
                certUiStatus: () => {
                  const host = document.getElementById('skillbridge-root');
                  const root = host?.shadowRoot || null;
                  return {
                    certDisabled: !!window._sb?.certDisabled,
                    host: !!host,
                    fab: !!(root?.getElementById('skillbridge-fab') || document.getElementById('skillbridge-fab')),
                    sidebar: !!(
                      root?.getElementById('skillbridge-sidebar') || document.getElementById('skillbridge-sidebar')
                    ),
                    headerLang: !!document.getElementById('si18n-header-lang'),
                    darkToggle: !!document.getElementById('si18n-dark-toggle'),
                    askTutor: !!document.querySelector('.si18n-ask-tutor-btn'),
                  };
                },
                // Open the keyboard-shortcuts help overlay and report its a11y
                // attributes — used by a11y.spec.js to lock dialog semantics.
                shortcutsOverlayA11y: () => {
                  if (!window._sb || !window._sb.toggleShortcutsHelp) return { error: 'sb-not-ready' };
                  window._sb.toggleShortcutsHelp();
                  const panel = document.querySelector('#si18n-shortcuts-overlay .si18n-shortcuts-panel');
                  const title = document.getElementById('si18n-shortcuts-title');
                  const close = document.querySelector('#si18n-shortcuts-overlay .si18n-shortcuts-close');
                  return {
                    role: panel ? panel.getAttribute('role') : null,
                    ariaModal: panel ? panel.getAttribute('aria-modal') : null,
                    ariaLabelledby: panel ? panel.getAttribute('aria-labelledby') : null,
                    titleId: title ? title.id : null,
                    titleText: title ? title.textContent : null,
                    closeAriaLabel: close ? close.getAttribute('aria-label') : null,
                  };
                },
                uiLayoutProbe: () => {
                  const host = document.getElementById('skillbridge-root');
                  const root = host?.shadowRoot || document;
                  const readBox = (el) => {
                    if (!el) return null;
                    const rect = el.getBoundingClientRect();
                    const style = window.getComputedStyle(el);
                    return {
                      left: rect.left,
                      top: rect.top,
                      right: rect.right,
                      bottom: rect.bottom,
                      width: rect.width,
                      height: rect.height,
                      display: style.display,
                      visibility: style.visibility,
                      overflowX: style.overflowX,
                    };
                  };
                  const doc = document.documentElement;
                  const body = document.body;
                  return {
                    viewport: { width: window.innerWidth, height: window.innerHeight },
                    overflowX: Math.max(doc?.scrollWidth || 0, body?.scrollWidth || 0) - window.innerWidth,
                    sidebar: readBox(root.getElementById('skillbridge-sidebar')),
                    flashcardCard: readBox(root.querySelector('.si18n-flashcard-card')),
                    flashcardFront: readBox(root.querySelector('.si18n-flashcard-front')),
                    flashcardBack: readBox(root.querySelector('.si18n-flashcard-back')),
                    shortcutsPanel: readBox(document.querySelector('#si18n-shortcuts-overlay .si18n-shortcuts-panel')),
                  };
                },
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
                // Seed a deliberately un-restored protected-term translation into
                // the translator cache. Used by protected-terms.spec.js to prove a
                // cache hit still passes through restoreProtectedTerms before DOM
                // write.
                seedProtectedTermCache: async (payload) => {
                  const t = window._sb?.translator;
                  if (!t?._db) return { error: 'translator cache missing' };
                  const entry = Object.assign(
                    {
                      lang: 'ko',
                      original: 'Anthropic released Claude as a frontier model.',
                      translation: '앤스로픽은 클로드를 프런티어 모델로 출시했습니다.',
                      timestamp: Date.now(),
                    },
                    payload || {},
                  );
                  entry.id = `${entry.lang}\t${entry.original.trim()}`;
                  await new Promise((resolve, reject) => {
                    const tx = t._db.transaction('translations', 'readwrite');
                    const timer = setTimeout(() => reject(new Error('seedProtectedTermCache timed out')), 5_000);
                    const req = tx.objectStore('translations').put(entry);
                    req.onsuccess = () => {
                      clearTimeout(timer);
                      resolve();
                    };
                    req.onerror = () => {
                      clearTimeout(timer);
                      reject(req.error);
                    };
                    tx.onerror = () => reject(tx.error);
                    tx.onabort = () => reject(tx.error);
                  });
                  return { ok: true, id: entry.id };
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
                  const input = window._sb.$id('si18n-chat-input');
                  const sendBtn = window._sb.$id('si18n-chat-send');
                  if (!input || !sendBtn) {
                    return { error: 'chat UI not present — open sidebar first' };
                  }
                  input.value = text;
                  sendBtn.click();
                  return { ok: true };
                },
                chatSendState: () => {
                  const sendBtn = window._sb.$id('si18n-chat-send');
                  return { present: !!sendBtn, disabled: !!sendBtn?.disabled };
                },
                failNextPuterChat: () => {
                  document.documentElement.setAttribute('data-sb-e2e-fail-chat-count', '1');
                  return { ok: true };
                },
                setPuterChunkDelay: (delayMs) => {
                  const delay = Number(delayMs) || 150;
                  document.documentElement.dataset.sbE2eChunkDelayMs = String(delay);
                  return { ok: true, delay };
                },
                clickRetryButton: () => {
                  const root = window._sb._uiHost?.shadowRoot || document;
                  const retry = root.querySelector('.si18n-retry-btn');
                  if (!retry) return { error: 'retry button not present' };
                  retry.click();
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
                  const items = (window._sb._uiHost?.shadowRoot || document).querySelectorAll('.si18n-history-item');
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
                  const item = window._sb.$(`.si18n-history-item[data-id="${id}"]`);
                  if (!item) return { error: 'no item with id=' + id };
                  item.click();
                  return { ok: true };
                },
                // Read the detail-view content after openHistoryDetail.
                readHistoryDetail: () => {
                  const detail = window._sb.$('.si18n-history-detail');
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
                  const msgs = (window._sb._uiHost?.shadowRoot || document).querySelectorAll(
                    '#si18n-chat-messages .si18n-chat-msg',
                  );
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
                      alert: bubble ? bubble.getAttribute('role') === 'alert' : false,
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
    } catch (err) {
      if (
        attempt < 2 &&
        /Service worker restarted|Target page, context or browser has been closed|Execution context was destroyed/.test(
          String(err?.message || err),
        )
      ) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      throw err;
    }
  }
}

module.exports = { evalInContentWorld };
