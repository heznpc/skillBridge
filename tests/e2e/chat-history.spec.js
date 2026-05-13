/**
 * SkillBridge — Chat history IDB persistence E2E.
 *
 * The v3.5.6 → v3.5.12 hotfix train fixed IDB resilience in two separate
 * places (v3.5.6 history quota retry, v3.5.9 prune+retry cascade). The
 * unit tests cover each helper in isolation, but only an end-to-end test
 * proves the full pipeline:
 *
 *   sidebar-chat.sendChatMessage   (writes initial bubble)
 *     → translator.chatStream      (streams the reply)
 *     → saveConversation(q, a, lang) — fires AFTER stream completes
 *     → openHistoryDb().add(entry) — writes to IDB
 *   later:
 *     → toggleHistoryPanel
 *     → loadHistoryList() — reads from IDB via cursor
 *     → re-renders the saved conversations
 *     → openHistoryDetail(id) — reads single record by primary key
 *
 * A regression anywhere along that chain produces data loss visible to
 * the user (saved conversation disappears, history panel shows empty,
 * detail view doesn't open). Until now: zero automated coverage.
 *
 * Spec steps:
 *   A. Send chat 1, wait for tutor reply to complete (saveConversation
 *      fires in the `if (answerText)` branch of sendChatMessage's finally).
 *   B. Send chat 2 — verifies multiple-entry handling, not just one.
 *   C. Open history panel, wait for loadHistoryList to render.
 *   D. Assert both questions appear in the list (round-trip works).
 *   E. Click first item, assert detail view shows the saved Q + A
 *      (per-record IDB read works).
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

test.describe('SkillBridge — chat history IDB persistence', () => {
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
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('[page:error]', msg.text());
    });

    await page.goto(`${fixture.baseUrl}/lesson`);

    // Wait for namespace + bridge ready.
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const snap = await evalInContentWorld(extCtx.context, 'snapshot');
      const bridge = await evalInContentWorld(extCtx.context, 'bridgeReady');
      if (snap?.init && snap?.sb && snap?.methods?.chat && bridge?.isReady) break;
      await page.waitForTimeout(250);
    }
    const bridge = await evalInContentWorld(extCtx.context, 'bridgeReady');
    if (!bridge?.isReady) throw new Error('Bridge did not become ready in 20s');

    await evalInContentWorld(extCtx.context, 'injectSidebar');
    await evalInContentWorld(extCtx.context, 'toggleSidebar');
  });

  test.afterAll(async () => {
    if (extCtx) await closeExtension(extCtx);
    if (fixture) await stopFixtureServer(fixture.server);
  });

  // Reusable helper: send a chat, wait for the bot bubble to fully render
  // (stream end → saveConversation fires).
  async function sendAndWait(text) {
    const send = await evalInContentWorld(extCtx.context, 'sendChat', text);
    expect(send?.ok).toBe(true);
    // The stub paces chunks at 150ms × 3 = ~450ms; plus message round-
    // trips. Poll for the final chunk text "주는 입력입니다" to land in
    // the latest bot bubble.
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
      const log = await evalInContentWorld(extCtx.context, 'readChatLog');
      const lastBot = log.filter((m) => m.role === 'bot').slice(-1)[0];
      if (lastBot?.text?.includes('주는 입력입니다')) {
        // saveConversation is invoked SYNCHRONOUSLY after the stream ends
        // but the IDB add is async — give it a frame to land.
        await page.waitForTimeout(150);
        return;
      }
      await page.waitForTimeout(120);
    }
    throw new Error(`Chat reply did not complete for "${text}"`);
  }

  test('two chats sent → both appear in history panel → detail view round-trips IDB', async () => {
    await sendAndWait('What is a prompt?');
    await sendAndWait('How does chain-of-thought work?');

    // Open the history panel. loadHistoryList kicks off a cursor read
    // immediately on toggle.
    await evalInContentWorld(extCtx.context, 'toggleHistoryPanel');

    // Poll until both saved entries land in the panel.
    const deadline = Date.now() + 8_000;
    let items = [];
    while (Date.now() < deadline) {
      items = await evalInContentWorld(extCtx.context, 'readHistoryList');
      if (items.length >= 2) break;
      await page.waitForTimeout(150);
    }

    expect(items.length, 'history panel should list both saved chats').toBeGreaterThanOrEqual(2);

    // Newest-first ordering (cursor opens with `'prev'` in chat-history.js).
    // The most-recently-sent question lands first.
    const questions = items.map((i) => i.question);
    expect(questions.some((q) => q.includes('chain-of-thought'))).toBe(true);
    expect(questions.some((q) => q.includes('What is a prompt'))).toBe(true);

    // Open the detail view for the FIRST item. This exercises a different
    // IDB code path: `tx.objectStore(HISTORY_STORE).get(Number(id))` — a
    // single-record read by primary key, not a cursor.
    const firstId = items[0].id;
    expect(firstId, 'history item should have a data-id (IDB primary key)').toBeTruthy();
    const click = await evalInContentWorld(extCtx.context, 'openHistoryDetail', firstId);
    expect(click?.ok).toBe(true);

    // Detail view renders the saved Q + A in two stacked bubbles.
    const deadline2 = Date.now() + 3_000;
    let detail = { present: false };
    while (Date.now() < deadline2) {
      detail = await evalInContentWorld(extCtx.context, 'readHistoryDetail');
      if (detail?.present) break;
      await page.waitForTimeout(100);
    }
    expect(detail.present, 'detail view should render after click').toBe(true);
    // The first item is the most-recent chat — "chain-of-thought" question.
    expect(detail.userText).toContain('chain-of-thought');
    // The bot text is the streamed Korean reply, fully accumulated.
    expect(detail.botText).toContain('주는 입력입니다');
  });
});
