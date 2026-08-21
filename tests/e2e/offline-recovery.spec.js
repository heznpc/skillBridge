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
const { SETTLE_MS } = require('./helpers/timeouts');
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

    const deadline = Date.now() + SETTLE_MS;
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
    await page.evaluate(() => {
      const p = document.createElement('p');
      p.id = 'p-offline-structured';
      p.innerHTML = 'Read <a id="offline-doc-link" href="/docs">the documentation</a> carefully.';
      const link = p.querySelector('a');
      const state = { p, link, clicks: 0 };
      link.addEventListener('click', (event) => {
        event.preventDefault();
        state.clicks++;
      });
      window.__sbOfflineStructured = state;
      document.querySelector('#lesson-main').prepend(p);
    });

    const offline = await evalInContentWorld(extCtx.context, 'dispatchOffline');
    expect(offline?.isOffline).toBe(true);

    await evalInContentWorld(extCtx.context, 'switchLanguage', 'ko');
    await page.waitForTimeout(500);

    let pt = await evalInContentWorld(extCtx.context, 'pageText');
    expect(pt.pProtected).toContain('Anthropic released Claude');
    await expect(page.locator('#p-offline-structured')).toContainText('Read the documentation carefully.');

    const online = await evalInContentWorld(extCtx.context, 'dispatchOnline');
    expect(online?.isOffline).toBe(false);

    const deadline = Date.now() + SETTLE_MS;
    while (Date.now() < deadline) {
      pt = await evalInContentWorld(extCtx.context, 'pageText');
      if (pt.pProtected && pt.pProtected.includes('프런티어')) break;
      await page.waitForTimeout(200);
    }

    expect(pt.pProtected).toContain('Anthropic');
    expect(pt.pProtected).toContain('Claude');
    expect(pt.pProtected).toContain('프런티어 모델');

    await expect(page.locator('#p-offline-structured')).toContainText('문서를 주의 깊게 읽으세요.');
    const preserved = await page.evaluate(() => {
      const currentLink = document.querySelector('#offline-doc-link');
      currentLink.click();
      return {
        paragraphIdentity: window.__sbOfflineStructured.p === document.querySelector('#p-offline-structured'),
        linkIdentity: window.__sbOfflineStructured.link === currentLink,
        href: currentLink.getAttribute('href'),
        clicks: window.__sbOfflineStructured.clicks,
      };
    });
    expect(preserved).toEqual({ paragraphIdentity: true, linkIdentity: true, href: '/docs', clicks: 1 });
  });
});
