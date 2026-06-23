/**
 * SkillBridge — AI Tutor chat E2E.
 *
 * Locks in the third POSITIONING.md pillar — "contextual AI tutor with
 * zero friction." The README, the CWS listing, and POSITIONING.md all
 * lead with the tutor; v3.5.9 (stream cancel) and v3.5.11 (sanitizer XSS)
 * both fixed bugs along this exact path. Until now there's been zero
 * automated coverage of:
 *
 *   sidebar-chat.sendChatMessage
 *     → translator.chatStream
 *     → window.postMessage({type:'CHAT_REQUEST', stream:true})
 *     → page-bridge (main world) → puter.ai.chat (streaming)
 *     → CHAT_STREAM_CHUNK events × N
 *     → onChunk callback → formatResponse(fullText) → bubble.innerHTML
 *     → CHAT_STREAM_END → saveConversation
 *
 * The Puter SDK stub in helpers/network-stubs.js returns an async-iterable
 * three-chunk Korean reply; the spec asserts every chunk's text ends up
 * in the bot bubble (proving the streaming pipeline didn't silently
 * coalesce or drop a chunk), and that the response was sanitized through
 * the chat-render path (we get a `<p>...</p>` wrapper, not raw text).
 *
 * Steps:
 *   A. Wait for translator.isReady (BRIDGE_READY message from page-bridge).
 *   B. Open the sidebar.
 *   C. sendChat — type a message + click send.
 *   D. Wait for bot bubble to fully render the streamed reply.
 *   E. Assert: user bubble has the typed text, bot bubble has the full
 *      streamed response, no error bubble exists.
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

test.describe('SkillBridge — tutor chat flow', () => {
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
      if (msg.type() === 'error') console.log(`[page:error]`, msg.text());
    });

    await page.goto(`${fixture.baseUrl}/lesson`);

    // Wait for the namespace to be assembled, then for the bridge to be
    // ready (Puter stub loaded + BRIDGE_READY emitted). chatStream throws
    // "Bridge not ready" if called before isReady.
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const snap = await evalInContentWorld(extCtx.context, 'snapshot');
      const bridge = await evalInContentWorld(extCtx.context, 'bridgeReady');
      if (snap?.init && snap?.sb && snap?.methods?.gt && snap?.methods?.chat && bridge?.isReady) break;
      await page.waitForTimeout(250);
    }
    const bridge = await evalInContentWorld(extCtx.context, 'bridgeReady');
    if (!bridge?.isReady) {
      throw new Error("Page bridge didn't become ready in 20s — Puter stub probably broken");
    }

    // Step B: open the sidebar so the chat UI is in the DOM.
    await evalInContentWorld(extCtx.context, 'injectSidebar');
    await evalInContentWorld(extCtx.context, 'toggleSidebar');
  });

  test.afterAll(async () => {
    if (extCtx) await closeExtension(extCtx);
    if (fixture) await stopFixtureServer(fixture.server);
  });

  async function waitForChatReady(timeoutMs = 10_000) {
    const readyDeadline = Date.now() + timeoutMs;
    let sendState = null;
    while (Date.now() < readyDeadline) {
      sendState = await evalInContentWorld(extCtx.context, 'chatSendState');
      if (sendState?.present && !sendState.disabled) return sendState;
      await page.waitForTimeout(100);
    }
    return sendState;
  }

  test('streamed chat reply renders in the bot bubble end-to-end', async () => {
    const before = await evalInContentWorld(extCtx.context, 'readChatLog');
    // Before sending: only the initial tutor greeting bubble (if any).
    const userBubblesBefore = before.filter((m) => m.role === 'user').length;
    expect(userBubblesBefore).toBe(0);

    const send = await evalInContentWorld(extCtx.context, 'sendChat', 'What is a prompt?');
    expect(send?.ok).toBe(true);

    // Poll for the bot bubble to complete. CHAT_STREAM_END is async; the
    // stub paces chunks at 20ms each (3 chunks × 20ms ≈ 60ms baseline,
    // plus the message round-trip latency).
    const deadline = Date.now() + 10_000;
    let log = before;
    let botBubble = null;
    while (Date.now() < deadline) {
      log = await evalInContentWorld(extCtx.context, 'readChatLog');
      // Last bot bubble that isn't the initial greeting (i.e. the one
      // that appeared AFTER our send).
      const botBubbles = log.filter((m) => m.role === 'bot');
      botBubble = botBubbles[botBubbles.length - 1];
      // Streamed response complete when text contains the final chunk.
      if (botBubble?.text?.includes('주는 입력입니다')) break;
      await page.waitForTimeout(150);
    }

    // The user message bubble landed first.
    const userBubble = log.find((m) => m.role === 'user');
    expect(userBubble?.text).toContain('What is a prompt?');

    // Every chunk from the Puter stub made it into the bot bubble.
    expect(botBubble?.text).toContain('안녕하세요'); // chunk 1
    expect(botBubble?.text).toContain('프롬프트'); // chunk 2
    expect(botBubble?.text).toContain('주는 입력입니다'); // chunk 3

    // The response was rendered through chat-render's formatResponse —
    // plain text would have no HTML structure; markdown formatting wraps
    // it in `<p>...</p>`. v3.5.13's chat-render split refactored this path.
    expect(botBubble?.html).toMatch(/^<p>/);

    // No error bubble (CHAT_ERROR_LABELS) — would indicate the stream
    // threw or page-bridge couldn't load the Puter stub.
    const errorishBubble = log.find((m) => m.alert);
    expect(errorishBubble, 'should not render an error bubble').toBeUndefined();

    const sendState = await waitForChatReady();
    expect(sendState?.disabled).toBe(false);
  });

  test('failed chat renders retry control and retry succeeds', async () => {
    await evalInContentWorld(extCtx.context, 'failNextPuterChat');

    const send = await evalInContentWorld(extCtx.context, 'sendChat', 'Please fail once');
    expect(send?.ok).toBe(true);

    let log = [];
    const errorDeadline = Date.now() + 10_000;
    while (Date.now() < errorDeadline) {
      log = await evalInContentWorld(extCtx.context, 'readChatLog');
      if (log.some((m) => m.alert && m.html?.includes('si18n-retry-btn'))) break;
      await page.waitForTimeout(150);
    }
    expect(log.some((m) => m.html?.includes('si18n-retry-btn'))).toBe(true);

    const clicked = await evalInContentWorld(extCtx.context, 'clickRetryButton');
    expect(clicked?.ok).toBe(true);

    const retryDeadline = Date.now() + 10_000;
    let botBubble = null;
    while (Date.now() < retryDeadline) {
      log = await evalInContentWorld(extCtx.context, 'readChatLog');
      const botBubbles = log.filter((m) => m.role === 'bot');
      botBubble = botBubbles[botBubbles.length - 1];
      if (botBubble?.text?.includes('주는 입력입니다')) break;
      await page.waitForTimeout(150);
    }

    expect(botBubble?.text).toContain('프롬프트');
    expect(botBubble?.text).toContain('주는 입력입니다');

    const sendState = await waitForChatReady();
    expect(sendState?.disabled).toBe(false);
  });
});
