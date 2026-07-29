/**
 * SkillBridge — AI Tutor chat E2E.
 *
 * Locks in the third product pillar — "contextual AI tutor with
 * zero friction." The README and the CWS listing both
 * lead with the tutor; v3.5.9 (stream cancel) and v3.5.11 (sanitizer XSS)
 * both fixed bugs along this exact path. Until now there's been zero
 * automated coverage of:
 *
 *   sidebar-chat.sendChatMessage
 *     → translator.chatStream
 *     → extension Port → service-worker broker → isolated content broker
 *     → puter.ai.chat (streaming) → Port chunks × N
 *     → onChunk callback → formatResponse(fullText) → bubble.innerHTML
 *     → CHAT_STREAM_END → saveConversation
 *
 * The vendored-SDK replacement in helpers/puter-stream-stub.js returns an async-iterable
 * three-chunk Korean reply; the spec asserts every chunk's text ends up
 * in the bot bubble (proving the streaming pipeline didn't silently
 * coalesce or drop a chunk), and that the response was sanitized through
 * the chat-render path (we get a `<p>...</p>` wrapper, not raw text).
 *
 * Steps:
 *   A. Wait for translator.isReady (extension broker ready message).
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

    // Wait for the namespace to be assembled, then for the isolated broker to
    // be ready (Puter stub loaded + broker ready emitted). chatStream throws
    // if called before isReady.
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const snap = await evalInContentWorld(extCtx.context, 'snapshot');
      const bridge = await evalInContentWorld(extCtx.context, 'bridgeReady');
      if (snap?.init && snap?.sb && snap?.methods?.gt && snap?.methods?.chat && bridge?.isReady) break;
      await page.waitForTimeout(250);
    }
    const bridge = await evalInContentWorld(extCtx.context, 'bridgeReady');
    if (!bridge?.isReady) {
      throw new Error("Puter broker didn't become ready in 20s — Puter stub probably broken");
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

    // No error bubble (CHAT_ERROR_LABELS) — would indicate the isolated
    // broker could not load or stream from the Puter stub.
    const errorishBubble = log.find((m) => m.alert);
    expect(errorishBubble, 'should not render an error bubble').toBeUndefined();

    const sendState = await waitForChatReady();
    expect(sendState?.disabled).toBe(false);
  });

  test('next cloud chat lazily reconnects both client and broker after MV3 Port loss', async () => {
    // A replacement broker makes the background disconnect the real isolated
    // broker. Dropping the replacement then leaves the tab with no registered
    // broker, which reproduces the state after a service-worker idle restart.
    expect((await evalInContentWorld(extCtx.context, 'replacePuterBroker'))?.ok).toBe(true);
    expect((await evalInContentWorld(extCtx.context, 'disconnectReplacementBroker'))?.ok).toBe(true);
    const unavailableDeadline = Date.now() + 5_000;
    while (Date.now() < unavailableDeadline) {
      if (!(await evalInContentWorld(extCtx.context, 'bridgeReady'))?.isReady) break;
      await page.waitForTimeout(50);
    }
    expect((await evalInContentWorld(extCtx.context, 'bridgeReady'))?.isReady).toBe(false);
    const before = await evalInContentWorld(extCtx.context, 'readChatLog');
    const beforeBots = before.filter((m) => m.role === 'bot').length;

    const send = await evalInContentWorld(extCtx.context, 'sendChat', 'Recover after worker restart');
    expect(send?.ok).toBe(true);
    const deadline = Date.now() + 10_000;
    let log = before;
    while (Date.now() < deadline) {
      log = await evalInContentWorld(extCtx.context, 'readChatLog');
      const bots = log.filter((m) => m.role === 'bot');
      if (bots.length > beforeBots && bots[bots.length - 1]?.text?.includes('주는 입력입니다')) break;
      await page.waitForTimeout(100);
    }
    const bots = log.filter((m) => m.role === 'bot');
    expect(bots).toHaveLength(beforeBots + 1);
    expect(bots[bots.length - 1]?.text).toContain('주는 입력입니다');
    expect((await evalInContentWorld(extCtx.context, 'bridgeReady'))?.isReady).toBe(true);
  });

  test('host main world cannot observe or forge Tutor transport via SDK globals or window messages', async () => {
    await page.evaluate(() => {
      window.__sbHostMessages = [];
      window.addEventListener('message', (event) => {
        window.__sbHostMessages.push(event.data);
      });
    });

    const send = await evalInContentWorld(extCtx.context, 'sendChat', 'HOST-SECRET-PROMPT-7f23');
    expect(send?.ok).toBe(true);
    await page.waitForTimeout(800);

    const hostState = await page.evaluate(() => ({
      puterType: typeof window.puter,
      token: window.localStorage.getItem('puter.auth.token'),
      messages: window.__sbHostMessages,
    }));
    expect(hostState.puterType).toBe('undefined');
    expect(hostState.token).toBeNull();
    expect(JSON.stringify(hostState.messages)).not.toContain('HOST-SECRET-PROMPT-7f23');
    expect(JSON.stringify(hostState.messages)).not.toContain('안녕하세요');

    await page.evaluate(() => {
      window.postMessage({ msg: 'puter.token', token: 'HOST-FORGED-TOKEN' }, location.origin);
    });
    await page.waitForTimeout(100);
    const brokerState = await evalInContentWorld(extCtx.context, 'puterBrokerState', 'HOST-FORGED-TOKEN');
    expect(brokerState?.sdkPresent).toBe(true);
    expect(brokerState?.privateStorageReady).toBe(true);
    expect(brokerState?.liveTokenMatches).toBe(false);

    await page.evaluate(() => {
      for (let i = 0; i < 20; i++) {
        window.postMessage(
          {
            __skillbridge__: true,
            type: i % 2 ? 'CHAT_STREAM_CHUNK' : 'CHAT_STREAM_END',
            id: 'forged',
            text: 'FORGED-TUTOR-ANSWER',
            success: true,
          },
          location.origin,
        );
      }
    });
    await page.waitForTimeout(200);
    const log = await evalInContentWorld(extCtx.context, 'readChatLog');
    expect(JSON.stringify(log)).not.toContain('FORGED-TUTOR-ANSWER');
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
    const userBubbles = log.filter((m) => m.role === 'user' && m.text.includes('Please fail once'));
    expect(userBubbles, 'retry should replace the failed user/error pair, not duplicate the question').toHaveLength(1);

    const sendState = await waitForChatReady();
    expect(sendState?.disabled).toBe(false);
  });

  test('replacing a live broker aborts and fails the active stream', async () => {
    await evalInContentWorld(extCtx.context, 'setPuterChunkDelay', 500);
    const before = await evalInContentWorld(extCtx.context, 'readChatLog');
    const send = await evalInContentWorld(extCtx.context, 'sendChat', 'Replace the active broker');
    expect(send?.ok).toBe(true);

    const partialDeadline = Date.now() + 5_000;
    while (Date.now() < partialDeadline) {
      const log = await evalInContentWorld(extCtx.context, 'readChatLog');
      if (log.length > before.length && log[log.length - 1]?.text?.includes('안녕하세요')) break;
      await page.waitForTimeout(50);
    }
    expect((await evalInContentWorld(extCtx.context, 'replacePuterBroker'))?.ok).toBe(true);

    const errorDeadline = Date.now() + 5_000;
    let log = [];
    while (Date.now() < errorDeadline) {
      log = await evalInContentWorld(extCtx.context, 'readChatLog');
      if (log.slice(before.length).some((m) => m.alert)) break;
      await page.waitForTimeout(50);
    }
    expect(log.slice(before.length).some((m) => m.alert)).toBe(true);
    expect((await waitForChatReady())?.disabled).toBe(false);
    await evalInContentWorld(extCtx.context, 'setPuterChunkDelay', 150);
  });
});
