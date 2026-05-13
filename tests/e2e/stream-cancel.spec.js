/**
 * SkillBridge — Tutor stream cancel E2E.
 *
 * Stream lifecycle has been the single most recurring bug class across
 * the v3.5.6 → 3.5.12 hotfix train (v3.5.6 timer/listener cleanup,
 * v3.5.9 stream cancel, v3.5.10 YouTube subtitle timer leak). The
 * tutor-chat spec verifies the happy path; this spec verifies the
 * INTERRUPT path — what happens when the user closes the sidebar / pushes
 * a new route / opens a sub-panel while a Claude response is mid-stream.
 *
 * sidebar-chat.cancelActiveStream is the single entry point that all
 * those interrupt sources funnel through. It aborts the AbortController
 * that translator.chatStream is listening on; chatStream rejects with
 * AbortError; the catch block in sendChatMessage removes the streaming-
 * cursor class and returns early (no error bubble); finally resets
 * isSending so the user can send again.
 *
 * Asserts after cancel:
 *   - The bot bubble has SOME streamed text (the chunk that landed before
 *     the abort) but NOT the full reply.
 *   - The `si18n-streaming-cursor` class is gone (cleanup ran).
 *   - No `role="alert"` error bubble — cancel is clean, not failure.
 *   - A second sendChat succeeds (isSending was correctly reset by the
 *     `finally` even on the AbortError early-return).
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

test.describe('SkillBridge — tutor stream cancel flow', () => {
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

  test('cancelActiveStream mid-stream cleans up cursor + leaves partial text + allows next send', async () => {
    // Stream is paced at 150ms/chunk × 3 chunks = ~450ms total.
    const send = await evalInContentWorld(extCtx.context, 'sendChat', 'Cancel-me prompt');
    expect(send?.ok).toBe(true);

    // Wait long enough for chunk 1 to land but NOT chunk 3.
    // Chunk 1 should arrive around 150ms; we wait 250ms to be safe.
    await page.waitForTimeout(250);

    const cancel = await evalInContentWorld(extCtx.context, 'cancelStream');
    expect(cancel?.ok).toBe(true);

    // Give the abort signal a moment to propagate through the message
    // handler cleanup + the catch block.
    await page.waitForTimeout(200);

    const log = await evalInContentWorld(extCtx.context, 'readChatLog');
    const botBubbles = log.filter((m) => m.role === 'bot');
    const cancelledBubble = botBubbles[botBubbles.length - 1];

    // Partial text landed. Could be "안녕하세요! " alone, or that plus
    // "프롬프트는 Claude에게 " depending on exactly when the cancel hit.
    // The hard invariant: chunk 3 ("주는 입력입니다") MUST NOT have landed
    // — that would mean cancel didn't actually stop the stream.
    expect(cancelledBubble?.text || '', '재취소 후 텍스트').not.toContain('주는 입력입니다');
    // But SOMETHING streamed (otherwise the test isn't proving cancel
    // happened mid-stream; it'd just be proving it didn't start). If this
    // ever flakes, increase the pre-cancel wait above.
    expect(cancelledBubble?.text || '').toContain('안녕하세요');

    // Cleanup invariants: streaming-cursor class is gone, no error bubble.
    expect.soft(cancelledBubble?.html || '').not.toContain('si18n-streaming-cursor');
    const errorish = log.find((m) => m.html?.includes('role="alert"'));
    expect(errorish, 'cancel should NOT render an error bubble').toBeUndefined();

    // Final invariant: isSending was reset by the `finally` even on the
    // AbortError early-return. Easiest way to assert this without poking
    // module-internal state: send AGAIN and verify the second send goes
    // through (the click handler wouldn't even fire if isSending stuck true).
    const send2 = await evalInContentWorld(extCtx.context, 'sendChat', 'Second message after cancel');
    expect(send2?.ok).toBe(true);

    // Wait for the second stream to complete.
    const secondDeadline = Date.now() + 5_000;
    let secondLog = null;
    while (Date.now() < secondDeadline) {
      secondLog = await evalInContentWorld(extCtx.context, 'readChatLog');
      const lastBot = secondLog.filter((m) => m.role === 'bot').slice(-1)[0];
      if (lastBot?.text?.includes('주는 입력입니다')) break;
      await page.waitForTimeout(100);
    }
    const lastBot = secondLog.filter((m) => m.role === 'bot').slice(-1)[0];
    expect(lastBot?.text).toContain('주는 입력입니다');
  });
});
