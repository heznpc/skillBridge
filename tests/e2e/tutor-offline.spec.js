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
});
