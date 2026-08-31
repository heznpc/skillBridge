/**
 * SkillBridge — AI Tutor offline guard E2E.
 *
 * Runs in a fresh extension context so the offline guard is tested without
 * interference from an earlier streaming/retry chat.
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

test.describe('SkillBridge — tutor offline guard', () => {
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

  test('offline tutor request renders localized alert without hitting Puter', async () => {
    const offline = await evalInContentWorld(extCtx.context, 'dispatchOffline');
    expect(offline?.isOffline).toBe(true);

    const send = await evalInContentWorld(extCtx.context, 'sendChat', 'Can you answer offline?');
    expect(send?.ok).toBe(true);

    const deadline = Date.now() + 5_000;
    let log = [];
    while (Date.now() < deadline) {
      log = await evalInContentWorld(extCtx.context, 'readChatLog');
      if (log.some((m) => m.alert)) break;
      await page.waitForTimeout(150);
    }

    const alertBubble = log.find((m) => m.alert);
    expect(alertBubble).toBeDefined();
    expect(alertBubble?.text.length).toBeGreaterThan(0);
    await evalInContentWorld(extCtx.context, 'dispatchOnline');
  });

  test('offline state still allows the selected localhost Tutor engine', async () => {
    let localCalls = 0;
    const localRequests = [];
    await extCtx.context.route('http://localhost:11434/v1/chat/completions', async (route) => {
      localCalls++;
      localRequests.push(JSON.parse(route.request().postData() || '{}'));
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: 'data: {"choices":[{"delta":{"content":"LOCAL_OFFLINE_OK"}}]}\n\n' + 'data: [DONE]\n\n',
      });
    });

    const [serviceWorker] = extCtx.context.serviceWorkers();
    await serviceWorker.evaluate(async () => {
      await chrome.storage.local.set({
        sb_ai_engine: 'local',
        sb_local_base: 'http://localhost:11434/v1',
        sb_local_model: 'e2e-local-model',
      });
    });

    const before = await evalInContentWorld(extCtx.context, 'readChatLog');
    const priorAlerts = before.filter((message) => message.alert).length;
    const offline = await evalInContentWorld(extCtx.context, 'dispatchOffline');
    expect(offline?.isOffline).toBe(true);

    const send = await evalInContentWorld(extCtx.context, 'sendChat', 'Use the local engine while offline.');
    expect(send?.ok).toBe(true);

    const deadline = Date.now() + 8_000;
    let log = [];
    while (Date.now() < deadline) {
      log = await evalInContentWorld(extCtx.context, 'readChatLog');
      if (log.some((message) => message.role === 'bot' && message.text.includes('LOCAL_OFFLINE_OK'))) break;
      await page.waitForTimeout(150);
    }

    expect(localCalls).toBe(1);
    expect(log.some((message) => message.role === 'bot' && message.text.includes('LOCAL_OFFLINE_OK'))).toBe(true);
    expect(log.filter((message) => message.alert).length).toBe(priorAlerts);

    const completedLocalReplies = log.filter(
      (message) => message.role === 'bot' && message.text.includes('LOCAL_OFFLINE_OK'),
    ).length;
    expect(await evalInContentWorld(extCtx.context, 'sendChat', 'Local follow-up only.')).toMatchObject({ ok: true });
    const followUpDeadline = Date.now() + 8_000;
    let followUpCompleted = false;
    while (Date.now() < followUpDeadline) {
      log = await evalInContentWorld(extCtx.context, 'readChatLog');
      const replies = log.filter(
        (message) => message.role === 'bot' && message.text.includes('LOCAL_OFFLINE_OK'),
      ).length;
      if (localCalls === 2 && replies > completedLocalReplies) {
        followUpCompleted = true;
        break;
      }
      await page.waitForTimeout(100);
    }
    expect(followUpCompleted).toBe(true);
    expect(localCalls).toBe(2);
    const followUpPayload = JSON.stringify(localRequests[1]);
    expect(followUpPayload).toContain('Local follow-up only.');
    expect(followUpPayload).not.toContain('Use the local engine while offline.');
    expect(followUpPayload).not.toContain('LOCAL_OFFLINE_OK');

    const conversations = await evalInContentWorld(extCtx.context, 'readTutorHistoryRows');
    const localConversation = conversations.find((conversation) =>
      conversation.turns.some((turn) => turn.question === 'Use the local engine while offline.'),
    );
    expect(localConversation?.turns).toEqual([
      expect.objectContaining({ question: 'Use the local engine while offline.', answer: 'LOCAL_OFFLINE_OK' }),
      expect.objectContaining({ question: 'Local follow-up only.', answer: 'LOCAL_OFFLINE_OK' }),
    ]);

    await serviceWorker.evaluate(async () => chrome.storage.local.set({ sb_ai_engine: 'cloud' }));
    await evalInContentWorld(extCtx.context, 'dispatchOnline');
  });
});
