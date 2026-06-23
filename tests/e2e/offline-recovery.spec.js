/**
 * SkillBridge — offline recovery E2E.
 *
 * Covers the production offline-pending GT path:
 *   offline event → switchLanguage('ko') queues GT items without network
 *   → online event calls flushOfflinePending(currentLang)
 *   → deferred text is translated and protected terms are restored.
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

test.describe('SkillBridge — offline GT recovery', () => {
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

    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const snap = await evalInContentWorld(extCtx.context, 'snapshot');
      if (snap?.init && snap?.sb && snap?.methods?.gt) break;
      await page.waitForTimeout(200);
    }
  });

  test.afterAll(async () => {
    if (extCtx) await closeExtension(extCtx);
    if (fixture) await stopFixtureServer(fixture.server);
  });

  test('deferred GT items translate after online event', async () => {
    const offline = await evalInContentWorld(extCtx.context, 'dispatchOffline');
    expect(offline?.isOffline).toBe(true);

    await evalInContentWorld(extCtx.context, 'switchLanguage', 'ko');
    await page.waitForTimeout(500);

    let pt = await evalInContentWorld(extCtx.context, 'pageText');
    expect(pt.pProtected).toContain('Anthropic released Claude');

    const online = await evalInContentWorld(extCtx.context, 'dispatchOnline');
    expect(online?.isOffline).toBe(false);

    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      pt = await evalInContentWorld(extCtx.context, 'pageText');
      if (pt.pProtected && pt.pProtected.includes('프런티어')) break;
      await page.waitForTimeout(200);
    }

    expect(pt.pProtected).toContain('Anthropic');
    expect(pt.pProtected).toContain('Claude');
    expect(pt.pProtected).toContain('프런티어 모델');
  });
});
