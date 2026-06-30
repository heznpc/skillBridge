/**
 * SkillBridge — small-viewport polish invariants.
 *
 * The UI is injected on top of a third-party lesson, so a polished build must
 * not introduce horizontal page scroll or panels that spill outside narrow
 * mobile viewports. This locks the geometry behind the visual QA matrix.
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

const VIEWPORTS = [
  { name: 'small phone', width: 320, height: 568 },
  { name: 'modern phone', width: 390, height: 844 },
];

async function waitForSkillBridge(context, page) {
  const deadline = Date.now() + 15_000;
  let snap = null;
  while (Date.now() < deadline) {
    snap = await evalInContentWorld(context, 'snapshot');
    if (snap?.init && snap?.sb && snap?.methods?.gt && snap?.methods?.chat) return snap;
    await page.waitForTimeout(200);
  }
  throw new Error(`SkillBridge did not initialize: ${JSON.stringify(snap)}`);
}

async function waitForBox(context, page, name) {
  const deadline = Date.now() + 5_000;
  let layout = null;
  while (Date.now() < deadline) {
    layout = await evalInContentWorld(context, 'uiLayoutProbe');
    if (layout?.[name]?.width > 0 && layout?.[name]?.height > 0) return layout;
    await page.waitForTimeout(100);
  }
  throw new Error(`Missing layout box "${name}": ${JSON.stringify(layout)}`);
}

function expectWithinViewport(box, viewport, label) {
  expect(box, `${label} should be present`).toBeTruthy();
  expect(box.left, `${label} left edge`).toBeGreaterThanOrEqual(-1);
  expect(box.right, `${label} right edge`).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.width, `${label} width`).toBeLessThanOrEqual(viewport.width + 1);
}

test.describe('SkillBridge — viewport polish', () => {
  /** @type {Awaited<ReturnType<typeof launchExtension>>} */
  let extCtx;
  /** @type {{server: import('http').Server, baseUrl: string}} */
  let fixture;
  /** @type {import('@playwright/test').Page | null} */
  let page = null;

  test.beforeAll(async () => {
    fixture = await startFixtureServer();
    extCtx = await launchExtension();
    await registerStubs(extCtx.context);
  });

  test.afterEach(async () => {
    if (page) await page.close();
    page = null;
  });

  test.afterAll(async () => {
    if (extCtx) await closeExtension(extCtx);
    if (fixture) await stopFixtureServer(fixture.server);
  });

  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}: sidebar, flashcards, and shortcuts stay in viewport`, async () => {
      page = await extCtx.context.newPage();
      page.on('pageerror', (err) => console.log('[page:pageerror]', err.message));
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`${fixture.baseUrl}/lesson`);
      await waitForSkillBridge(extCtx.context, page);
      await evalInContentWorld(extCtx.context, 'suppressOnboarding');

      await evalInContentWorld(extCtx.context, 'switchLanguage', 'ko');
      await evalInContentWorld(extCtx.context, 'injectSidebar');
      await evalInContentWorld(extCtx.context, 'toggleSidebar');
      await evalInContentWorld(extCtx.context, 'toggleFlashcardPanel');

      let layout = await waitForBox(extCtx.context, page, 'flashcardCard');
      expect(layout.overflowX, 'extension UI should not create horizontal page overflow').toBeLessThanOrEqual(1);
      expectWithinViewport(layout.sidebar, layout.viewport, 'sidebar');
      expectWithinViewport(layout.flashcardCard, layout.viewport, 'flashcard card');
      expect(layout.flashcardFront.width, 'flashcard front should fit inside card').toBeLessThanOrEqual(
        layout.flashcardCard.width + 1,
      );
      expect(layout.flashcardBack.width, 'flashcard back should fit inside card').toBeLessThanOrEqual(
        layout.flashcardCard.width + 1,
      );

      await evalInContentWorld(extCtx.context, 'shortcutsOverlayA11y');
      layout = await waitForBox(extCtx.context, page, 'shortcutsPanel');
      expectWithinViewport(layout.shortcutsPanel, layout.viewport, 'shortcuts panel');
    });
  }
});
