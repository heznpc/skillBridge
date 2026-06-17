/**
 * SkillBridge — accessibility invariants E2E.
 *
 * The keyboard-shortcuts help overlay is a modal surface injected over the
 * lesson page. For a screen-reader user it has to announce itself as a dialog
 * with a name, and its icon-only × button needs an accessible label (the glyph
 * alone reads as "multiplication sign"). These attributes are easy to drop in a
 * template-literal refactor, so this spec pins them.
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

test.describe('SkillBridge — accessibility', () => {
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
    let snap = null;
    while (Date.now() < deadline) {
      snap = await evalInContentWorld(extCtx.context, 'snapshot');
      if (snap?.init && snap?.sb) break;
      await page.waitForTimeout(200);
    }
    if (!snap?.init) {
      throw new Error(`SkillBridge didn't initialize: ${JSON.stringify(snap)}`);
    }
  });

  test.afterAll(async () => {
    if (extCtx) await closeExtension(extCtx);
    if (fixture) await stopFixtureServer(fixture.server);
  });

  test('keyboard-shortcuts overlay exposes dialog semantics + a named close button', async () => {
    const a11y = await evalInContentWorld(extCtx.context, 'shortcutsOverlayA11y');

    // The panel is the dialog: role + modality + a name pointing at the title.
    expect(a11y.role, 'shortcuts panel must be role="dialog"').toBe('dialog');
    expect(a11y.ariaModal, 'shortcuts panel must be aria-modal').toBe('true');
    expect(a11y.ariaLabelledby, 'panel must be named by the title').toBe('si18n-shortcuts-title');

    // The aria-labelledby target must actually exist and carry the title text,
    // or the name resolves to nothing.
    expect(a11y.titleId).toBe('si18n-shortcuts-title');
    expect(a11y.titleText && a11y.titleText.length).toBeGreaterThan(0);

    // The icon-only × close button needs an accessible name.
    expect(a11y.closeAriaLabel, 'close button needs an aria-label').toBeTruthy();
    expect(a11y.closeAriaLabel).not.toBe('');
  });
});
