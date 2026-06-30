/**
 * SkillBridge — user-perceived translation performance budgets.
 *
 * These are intentionally broad E2E budgets, not microbenchmarks: they guard
 * the first visible translation and the lazy scroll translation from drifting
 * into "the extension feels stuck" territory on the production bundle.
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

const VISIBLE_TRANSLATION_BUDGET_MS = Number(process.env.SB_E2E_VISIBLE_TRANSLATION_BUDGET_MS || 8_000);
const LAZY_SCROLL_TRANSLATION_BUDGET_MS = Number(process.env.SB_E2E_LAZY_SCROLL_TRANSLATION_BUDGET_MS || 5_000);

async function waitForSkillBridge(context, page) {
  const deadline = Date.now() + 15_000;
  let snap = null;
  while (Date.now() < deadline) {
    snap = await evalInContentWorld(context, 'snapshot');
    if (snap?.init && snap?.sb && snap?.methods?.gt) return snap;
    await page.waitForTimeout(200);
  }
  throw new Error(`SkillBridge did not initialize: ${JSON.stringify(snap)}`);
}

async function waitForText(context, page, predicate, budgetMs, label) {
  const started = Date.now();
  let text = null;
  while (Date.now() - started <= budgetMs) {
    text = await evalInContentWorld(context, 'pageText');
    if (predicate(text)) return { text, elapsedMs: Date.now() - started };
    await page.waitForTimeout(100);
  }
  throw new Error(`${label} exceeded ${budgetMs}ms budget: ${JSON.stringify(text)}`);
}

test.describe('SkillBridge — translation performance budget', () => {
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
    await waitForSkillBridge(extCtx.context, page);
  });

  test.afterAll(async () => {
    if (extCtx) await closeExtension(extCtx);
    if (fixture) await stopFixtureServer(fixture.server);
  });

  test('visible lesson translation lands within budget', async () => {
    const started = Date.now();
    await evalInContentWorld(extCtx.context, 'switchLanguage', 'ko');
    const result = await waitForText(
      extCtx.context,
      page,
      (text) => text?.h1 === 'Claude 소개' && /프롬프트 엔지니어링/.test(text?.p1 || ''),
      Math.max(0, VISIBLE_TRANSLATION_BUDGET_MS - (Date.now() - started)),
      'visible translation',
    );
    const elapsedMs = Date.now() - started;

    expect(result.text.h1).toBe('Claude 소개');
    expect(elapsedMs, `visible translation should stay under ${VISIBLE_TRANSLATION_BUDGET_MS}ms`).toBeLessThanOrEqual(
      VISIBLE_TRANSLATION_BUDGET_MS,
    );
  });

  test('lazy below-fold translation lands within scroll budget', async () => {
    const before = await evalInContentWorld(extCtx.context, 'pageText');
    expect(before.pBelowFold).toContain('below the lazy-translation horizon');

    const started = Date.now();
    await evalInContentWorld(extCtx.context, 'scrollToBelowFold');
    const result = await waitForText(
      extCtx.context,
      page,
      (text) => (text?.pBelowFold || '').includes('지연 번역 지평선'),
      LAZY_SCROLL_TRANSLATION_BUDGET_MS,
      'lazy scroll translation',
    );

    expect(result.text.pBelowFold).toContain('지연 번역 지평선');
    expect(
      Date.now() - started,
      `lazy scroll translation should stay under ${LAZY_SCROLL_TRANSLATION_BUDGET_MS}ms`,
    ).toBeLessThanOrEqual(LAZY_SCROLL_TRANSLATION_BUDGET_MS);
  });
});
