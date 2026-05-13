/**
 * SkillBridge — Lazy translation (IntersectionObserver) E2E.
 *
 * v3.5.32 replaced the previous "idle-chunk every offscreen element"
 * path in gt-queue.js with an IntersectionObserver. A user reading the
 * first 30% of a long Academy lesson no longer pays GT calls for the
 * bottom 70% they never scroll to. The savings claim only holds if
 * elements outside the half-viewport lookahead really stay
 * untranslated until scroll.
 *
 * Spec design:
 *   - Fixture has a `#p-below-fold` paragraph at 1800px down, well
 *     beyond the default Playwright viewport (1280×720) + the
 *     `rootMargin: '50% 0px'` lookahead (~360px below). The paragraph
 *     should NOT translate when the user only loads the page.
 *   - After explicit scroll into view, the IntersectionObserver
 *     callback fires → element gets queued → GT translates → DOM
 *     updates with Korean text.
 *
 * Two assertions:
 *   A. After `switchLanguage('ko')` settles, `#p-below-fold` is still
 *      English (lazy horizon held).
 *   B. After scrolling to it + a brief settle, the same element is
 *      Korean (observer triggered translation on intersect).
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

test.describe('SkillBridge — lazy translation horizon', () => {
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

  test('below-fold paragraph stays English until scrolled; then translates', async () => {
    // === Switch to Korean and wait for visible/near-viewport content ===
    await evalInContentWorld(extCtx.context, 'switchLanguage', 'ko');

    const viewportDeadline = Date.now() + 10_000;
    while (Date.now() < viewportDeadline) {
      const pt = await evalInContentWorld(extCtx.context, 'pageText');
      if (pt.h1 === 'Claude 소개') break;
      await page.waitForTimeout(200);
    }

    // Give the in-viewport GT batch a beat to finish so a slow GT pass
    // doesn't accidentally also pick up the below-fold paragraph.
    await page.waitForTimeout(500);

    // === Assertion A: below-fold paragraph still English ===
    let pt = await evalInContentWorld(extCtx.context, 'pageText');
    expect.soft(pt.h1, 'H1 (above-fold) should be Korean').toBe('Claude 소개');
    // The below-fold paragraph is the exact resource-saving artifact:
    // if it's Korean already, lazy translation didn't actually defer
    // and we're back to the old "translate everything upfront" path.
    expect(pt.pBelowFold, 'below-fold paragraph should stay English until scrolled').toContain(
      'below the lazy-translation horizon',
    );
    expect(pt.pBelowFold, 'no Korean fragments in below-fold paragraph yet').not.toContain('지연 번역');

    // === Scroll the below-fold paragraph into view ===
    await evalInContentWorld(extCtx.context, 'scrollToBelowFold');

    // === Assertion B: lazy observer fired → translation lands ===
    const scrollDeadline = Date.now() + 10_000;
    while (Date.now() < scrollDeadline) {
      pt = await evalInContentWorld(extCtx.context, 'pageText');
      if (pt.pBelowFold && pt.pBelowFold.includes('지연 번역')) break;
      await page.waitForTimeout(200);
    }
    expect(pt.pBelowFold, 'after scroll, below-fold paragraph should be Korean').toContain('지연 번역 지평선');
  });
});
