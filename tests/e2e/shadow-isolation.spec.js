/**
 * E2E — Shadow UI isolation
 *
 * Regression guard for the host-CSS-leak bug class:
 *   - #182: the host page's SVG sizing reset collapsed the FAB icon to 0px.
 *   - #185: the host page's `button { background: #0164cc }` turned the reset
 *     button blue.
 *
 * Both leaked because an injected control inherited the host page's bare
 * element styles. The fix (v3.5.40+) hosts the FAB inside an OPEN shadow root
 * (#skillbridge-root), where page CSS cannot reach it. This test proves that
 * guarantee by injecting hostile host-page rules of exactly those shapes and
 * asserting the shadowed FAB is unaffected.
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

test.describe('SkillBridge — shadow UI isolation', () => {
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

    // Wait until the namespace is assembled and the FAB can be injected.
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const probe = await evalInContentWorld(extCtx.context, 'fabProbe');
      if (probe?.ok) break;
      await page.waitForTimeout(200);
    }
  });

  test.afterAll(async () => {
    if (extCtx) await closeExtension(extCtx);
    if (fixture) await stopFixtureServer(fixture.server);
  });

  test('FAB lives in a shadow root and ignores hostile host-page CSS', async () => {
    // Inject the exact host-page rule shapes that previously leaked:
    // a blue button background (#185) and a zero-width svg (#182).
    await page.addStyleTag({
      content:
        'button, .button { background: rgb(0, 0, 255) !important; padding: 40px !important; }\n' +
        'svg { width: 0 !important; height: 0 !important; }',
    });

    const probe = await evalInContentWorld(extCtx.context, 'fabProbe');
    expect(probe.ok).toBe(true);

    // Encapsulation: the FAB is NOT reachable from the light DOM…
    expect(probe.inLightDom).toBe(false);
    // …it lives inside #skillbridge-root's shadow root.
    expect(probe.inShadow).toBe(true);

    // The hostile light-DOM rules cannot cross the shadow boundary:
    expect(probe.background).toBe('rgb(61, 64, 91)'); // brand navy, not host blue
    expect(probe.svgWidth).toBe(24); // chat-bubble icon intact, not collapsed to 0
  });

  test('content.css is fetched, transformed, and adopted into the shadow root', async () => {
    const r = await evalInContentWorld(extCtx.context, 'shadowSheetReady');
    expect(r.ok).toBe(true);
    expect(r.sheetLoaded).toBe(true);
    // The transform rewrote html.si18n-dark → :host(.si18n-dark) so dark mode
    // still themes the shadowed UI.
    expect(r.hasHostDark).toBe(true);
    // …and the shared sheet is adopted into #skillbridge-root's shadow root.
    expect(r.adopted).toBeGreaterThanOrEqual(1);
  });
});
