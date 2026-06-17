/**
 * SkillBridge — Rapid language-switch race E2E.
 *
 * v3.5.7's fix was a class of race condition: the GT batch + verifier
 * queue would write stale-language translations into the DOM after the
 * user had already switched away. The `gtGeneration` counter exists
 * specifically to invalidate in-flight callbacks across language
 * switches — every call-site reads its generation at queue time and
 * bails if it doesn't match the current value on resolution.
 *
 * The golden + spa-navigation specs already cover the language-stays-
 * the-same paths. This spec covers the language-CHANGED-mid-flight
 * path: while the Korean translation pipeline is still working on a
 * page, the user switches back to English, then back to Korean again.
 *
 * Without race protection:
 *   - The first ko translation's late chunks would write Korean text
 *     into elements after `restoreOriginal('en')` had already cleared
 *     them, producing stale-language fragments.
 *   - Generation 1's verifier queue items would write into generation
 *     2's DOM.
 *
 * The spec asserts:
 *   1. After the rapid ko → en → ko cycle, the final page is FULLY
 *      Korean — every fixture element that has a GT_KO entry is
 *      translated, no English fragments left behind in those elements.
 *   2. `gtGeneration` bumped at least twice (once per switch). If
 *      `sb._gt.reset()` were silently broken the counter would lag.
 *   3. `currentLang === 'ko'` (the final state wins).
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

test.describe('SkillBridge — rapid language switch race', () => {
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

  test('ko → en → ko in rapid succession resolves to clean Korean with no stale leak', async () => {
    const initial = await evalInContentWorld(extCtx.context, 'snapshot');
    expect(initial.currentLang).toBe('en');
    const genStart = initial.gtGeneration;

    // Kick off the first Korean translation. Do NOT wait — the whole
    // point is to race the en restore against an in-flight ko pipeline.
    await evalInContentWorld(extCtx.context, 'switchLanguage', 'ko');

    // Tiny pause — long enough for `applyStaticTranslations` to start
    // queuing GT items but not long enough for the batch to complete
    // (the GT batch settle delay is GT_BATCH = ~200ms, plus N batches).
    await page.waitForTimeout(80);

    // Switch back to English. `switchLanguage('en')` → restoreOriginal
    // → sb._gt.reset() (bumps gtGeneration, clears queue, drops
    // _offlinePendingItems). Any in-flight Promise.all callbacks from
    // the ko run must bail when they see the bumped generation.
    await evalInContentWorld(extCtx.context, 'switchLanguage', 'en');

    // And immediately back to Korean. This kicks a fresh translation
    // pipeline at generation N+2. The bug shape v3.5.7 fixed would have
    // generation-1 callbacks landing INTO generation-2's DOM, leaving
    // mixed-language fragments.
    await evalInContentWorld(extCtx.context, 'switchLanguage', 'ko');

    // Wait for the FINAL Korean translation to complete. We poll for
    // multiple elements, not just H1, so we catch the case where only
    // some translations land (partial leak).
    const deadline = Date.now() + 12_000;
    let pt = initial;
    while (Date.now() < deadline) {
      pt = await evalInContentWorld(extCtx.context, 'pageText');
      // All three fixture targets must be in their final translated form.
      if (
        pt.h1 === 'Claude 소개' &&
        pt.p1 &&
        pt.p1.includes('프롬프트 엔지니어링') &&
        pt.li1 &&
        pt.li1.includes('Claude')
      ) {
        break;
      }
      await page.waitForTimeout(200);
    }

    // === Final-state invariants ===

    const after = await evalInContentWorld(extCtx.context, 'snapshot');
    expect(after.currentLang).toBe('ko');

    // gtGeneration must have bumped at least twice (once per switch).
    // `switchLanguage` calls `restoreOriginal` which calls `sb._gt.reset()`
    // which increments. If reset were silently broken this would lag.
    expect(after.gtGeneration).toBeGreaterThanOrEqual(genStart + 2);

    // Page content is fully Korean — no English leftover where Korean
    // should be (which would indicate the GT pipeline didn't complete
    // its second run after the rapid switches).
    expect(pt.h1).toBe('Claude 소개');
    expect(pt.p1).toContain('프롬프트 엔지니어링');
    expect(pt.li1).toContain('Claude');

    // No English fragments in the H1 specifically. If the in-flight ko
    // run from the FIRST switch wrote a half-translated string and then
    // bailed, we might see "Claude" lingering without the rest of the
    // Korean ("Claude" alone, no "소개"). The strict equality above already
    // catches that, but here's the explicit safety net.
    expect.soft(pt.h1, 'H1 must not retain English fragments').not.toContain('Introduction');
  });

  test('a stale dictionary load resolving out of order does NOT paint the previous language', async () => {
    // The GT-queue race above is guarded by gtGeneration. The static-APPLY path
    // has a separate window: switchLanguage(slow) awaits its dictionary load while
    // switchLanguage(fast) runs and applies; if the slow load then resolves it must
    // NOT call applyStaticTranslations(slow) and paint a now-stale language over the
    // page. The op forces the slow lang's load to resolve LAST and records which
    // langs actually reach applyStaticTranslations.
    await evalInContentWorld(extCtx.context, 'switchLanguage', 'en'); // reset
    const result = await evalInContentWorld(extCtx.context, 'rapidSwitchRace', ['ko', 'ja']);

    // currentLang settled on the fast/last request.
    expect(result.currentLang).toBe('ja');
    // The stale 'ko' apply must NOT have run after the user moved to 'ja'.
    expect(result.appliedWith, `appliedWith was ${JSON.stringify(result.appliedWith)}`).not.toContain('ko');
    // ...and the fast lang WAS applied, proving the op exercised the path.
    expect(result.appliedWith).toContain('ja');
  });
});
