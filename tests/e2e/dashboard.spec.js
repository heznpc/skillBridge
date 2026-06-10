/**
 * E2E — Local progress dashboard (Tools ▸ My progress)
 *
 * Boots the bundle on the lesson fixture, opens the sidebar, toggles the
 * dashboard sub-panel, and asserts the panel renders its four stat cards
 * from an empty chrome.storage.local (zero-state). Proves the new module is
 * wired through manifest → Tools menu → sub-panel lifecycle.
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

test.describe('SkillBridge — local progress dashboard', () => {
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
    await page.goto(`${fixture.baseUrl}/lesson`);

    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const snap = await evalInContentWorld(extCtx.context, 'snapshot');
      if (snap?.init && snap?.sb) break;
      await page.waitForTimeout(250);
    }
    await evalInContentWorld(extCtx.context, 'injectSidebar');
    await evalInContentWorld(extCtx.context, 'toggleSidebar');
  });

  test.afterAll(async () => {
    if (extCtx) await closeExtension(extCtx);
    if (fixture) await stopFixtureServer(fixture.server);
  });

  test('dashboard panel opens and renders four stat cards (zero-state)', async () => {
    await evalInContentWorld(extCtx.context, 'toggleDashboardPanel');
    await page.waitForTimeout(300); // storage callback + render

    const dash = await evalInContentWorld(extCtx.context, 'readDashboard');
    expect(dash.title.length).toBeGreaterThan(0); // localized "My progress" header
    expect(dash.stats).toBe(4); // lessons / bookmarks / decks / mastered
  });
});
