/**
 * SkillBridge — Golden translation E2E.
 *
 * This is the test that validates the v3.5.13–15 structural refactors
 * actually work in a real Chromium with the extension loaded. None of
 * those PRs had any kind of browser verification; this spec is that
 * check. (And on the very first dev run it caught the v3.5.15 `const sb
 * = window._sb` hoisting bug — fixed in the same commit that added this
 * file.)
 *
 * The four steps run as separate `test()` blocks but share the same
 * persistent context via `beforeAll` / `afterAll` — Playwright doesn't
 * have a great way to share a single test() across multiple `expect`
 * blocks while keeping reporter output sane.
 *
 *   Step A — `_sb` namespace assembly:
 *     content.js owns `_sb`; gt-queue.js mounts `_sb._gt`; chat-render.js
 *     + sidebar-chat.js + chat-history.js cooperatively mount `_sb._chat`.
 *     A missing surface here means a manifest load order broke.
 *
 *   Step B — `switchLanguage('ko')`:
 *     Exercises the GT queue end-to-end (with stubbed translate API),
 *     bumps `_gt.gtGeneration`, applies static + GT translations to the
 *     fixture. Asserts page text changed AND generation moved.
 *
 *   Step C — Sidebar panel state machinery:
 *     Opens the sidebar, toggles the history sub-panel, closes it. The
 *     `_sb._chat.state.savedChatHTML` / `historyPanelOpen` flags have
 *     never been exercised outside unit tests until now.
 *
 *   Step D — `switchLanguage('en')`:
 *     Restore path. Calls `restoreOriginal` internally; that function
 *     was refactored in v3.5.15 to delegate to `sb._gt.reset()`.
 *
 * Cross-world access — `window._sb` lives in the content-script ISOLATED
 * world; Playwright's `page.evaluate` runs in the page MAIN world and
 * can't see it. We bridge via `evalInContentWorld(context, opName, arg)`,
 * which uses `chrome.scripting.executeScript` from the SW to run one of
 * a hard-coded menu of diagnostic operations inside the isolated world.
 * See helpers/extension.js for the menu (`snapshot`, `switchLanguage`,
 * `injectSidebar`, `toggleSidebar`, `toggleHistoryPanel`, `closeSubPanel`,
 * `pageText`).
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

test.describe('SkillBridge — golden translation flow', () => {
  /** @type {Awaited<ReturnType<typeof launchExtension>>} */
  let extCtx;
  /** @type {import('@playwright/test').Page} */
  let page;
  /** @type {{server: import('http').Server, baseUrl: string}} */
  let fixture;

  test.beforeAll(async () => {
    fixture = await startFixtureServer();
    extCtx = await launchExtension();
    await registerStubs(extCtx.context);
    page = await extCtx.context.newPage();

    page.on('pageerror', (err) => console.log('[page:pageerror]', err.message));

    await page.goto(`${fixture.baseUrl}/lesson`);

    // The content script registers via `document_idle`. Poll the isolated
    // world for the assembled namespace; cleaner timeout than a bare
    // `waitForFunction` over the main-world `window` (which can't see _sb).
    const deadline = Date.now() + 15_000;
    let snap = null;
    while (Date.now() < deadline) {
      snap = await evalInContentWorld(extCtx.context, 'snapshot');
      if (snap?.init && snap?.sb && snap?.methods?.gt && snap?.methods?.chat) break;
      await page.waitForTimeout(200);
    }
    if (!snap?.init || !snap?.sb) {
      throw new Error(`SkillBridge didn't initialize after 15s. Final snapshot: ${JSON.stringify(snap)}`);
    }
  });

  test.afterAll(async () => {
    if (extCtx) await closeExtension(extCtx);
    if (fixture) await stopFixtureServer(fixture.server);
  });

  test('step A: _sb namespace fully assembled across all content modules', async () => {
    const snap = await evalInContentWorld(extCtx.context, 'snapshot');

    expect(snap.init).toBe(true);
    expect(snap.sb).toBe(true);
    expect(snap.currentLang).toBe('en');
    expect(snap.sidebarVisible).toBe(false);
    expect(snap.gtGeneration).toBe(0);

    // gt-queue.js attached every public method.
    for (const [name, type] of Object.entries(snap.methods.gt)) {
      expect.soft(type, `_gt.${name}`).toBe('function');
    }
    // chat-render.js + sidebar-chat.js + chat-history.js all attached.
    for (const [name, type] of Object.entries(snap.methods.chat)) {
      if (name === 'state') continue;
      expect.soft(type, `_chat.${name}`).toBe('function');
    }
    // content.js own surface (including the v3.5.15-added safeReplaceText).
    for (const [name, type] of Object.entries(snap.methods.sb)) {
      expect.soft(type, `sb.${name}`).toBe('function');
    }

    // Sub-panel state starts cleared.
    expect(snap.methods.chat.state.savedChatHTML).toBeNull();
    expect(snap.methods.chat.state.historyPanelOpen).toBe(false);
    expect(snap.methods.chat.state.flashcardPanelOpen).toBe(false);
  });

  test('step B: switchLanguage(ko) translates page text and bumps gtGeneration', async () => {
    // Baseline page text.
    const before = await evalInContentWorld(extCtx.context, 'pageText');
    expect(before.h1).toBe('Introduction to Claude');

    await evalInContentWorld(extCtx.context, 'switchLanguage', 'ko');

    // Wait for the GT batch to land — switchLanguage's promise resolves
    // after applyStaticTranslations returns synchronously, but processGTQueue
    // is fire-and-forget. Poll until the H1 swaps.
    const deadline = Date.now() + 10_000;
    let after = before;
    while (Date.now() < deadline) {
      after = await evalInContentWorld(extCtx.context, 'pageText');
      if (after.h1 && after.h1 !== before.h1) break;
      await page.waitForTimeout(200);
    }

    const snap = await evalInContentWorld(extCtx.context, 'snapshot');
    expect(snap.currentLang).toBe('ko');
    // restoreOriginal at the head of switchLanguage bumps via sb._gt.reset().
    // If that path is broken (reset never ran) gtGeneration stays at 0.
    expect(snap.gtGeneration).toBeGreaterThan(0);

    expect(after.h1).toBe('Claude 소개'); // from GT stub mapping
    expect(after.p1).toContain('프롬프트 엔지니어링'); // proves GT batch + DOM write worked
  });

  test('step C: sidebar + history sub-panel state machinery', async () => {
    await evalInContentWorld(extCtx.context, 'injectSidebar');
    await evalInContentWorld(extCtx.context, 'toggleSidebar');

    let snap = await evalInContentWorld(extCtx.context, 'snapshot');
    expect(snap.sidebarVisible).toBe(true);
    expect(snap.methods.chat.state.historyPanelOpen).toBe(false);
    expect(snap.methods.chat.state.savedChatHTML).toBeNull();

    // Open the history sub-panel — the v3.5.13 split refactored this path
    // so it goes through `sb._chat.state` rather than module-local flags.
    await evalInContentWorld(extCtx.context, 'toggleHistoryPanel');
    snap = await evalInContentWorld(extCtx.context, 'snapshot');
    expect(snap.methods.chat.state.historyPanelOpen).toBe(true);
    expect(typeof snap.methods.chat.state.savedChatHTML).toBe('string');
    expect(snap.methods.chat.state.savedChatHTML.length).toBeGreaterThan(0);

    // Close it via the shared helper sidebar-chat.js exposes.
    await evalInContentWorld(extCtx.context, 'closeSubPanel');
    snap = await evalInContentWorld(extCtx.context, 'snapshot');
    expect(snap.methods.chat.state.historyPanelOpen).toBe(false);
    expect(snap.methods.chat.state.flashcardPanelOpen).toBe(false);
    expect(snap.methods.chat.state.savedChatHTML).toBeNull();
  });

  test('step D: switchLanguage(en) restores text and bumps generation again', async () => {
    const before = await evalInContentWorld(extCtx.context, 'snapshot');

    await evalInContentWorld(extCtx.context, 'switchLanguage', 'en');

    const deadline = Date.now() + 10_000;
    let pt = null;
    while (Date.now() < deadline) {
      pt = await evalInContentWorld(extCtx.context, 'pageText');
      if (pt.h1 === 'Introduction to Claude') break;
      await page.waitForTimeout(200);
    }

    const after = await evalInContentWorld(extCtx.context, 'snapshot');
    expect(after.currentLang).toBe('en');
    expect(after.gtGeneration).toBeGreaterThan(before.gtGeneration);
    expect(pt.h1).toBe('Introduction to Claude');
    expect(pt.p1).toContain('prompt engineering');
  });
});
