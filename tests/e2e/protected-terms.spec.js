/**
 * SkillBridge — Protected Terms restoration E2E.
 *
 * `protected-terms.js` is the post-processing pass that fixes Google
 * Translate's brand-name / technical-term mistakes ("Anthropic" →
 * "앤스로픽" gets restored back to "Anthropic", "Claude" → "클로드" gets
 * restored back to "Claude", etc). The unit tests in
 * `tests/protected-terms.test.js` cover the function in isolation. But
 * the function only matters if `gt-queue.js` actually invokes it on every
 * GT result before the DOM write — and there's been no end-to-end proof
 * of that. A silent refactor that bypassed the restoration step would
 * pass every unit test and ship.
 *
 * This spec closes that gap. The fixture has a sentence chosen because
 * Google Translate has historically mistranslated both "Anthropic" and
 * "Claude" in Korean (per `src/data/ko.json` `_protected` map). The GT
 * stub returns the deliberately-wrong translation — and we assert the
 * user-facing DOM shows the corrected English brand names, NOT the
 * mistranslation.
 *
 * Three assertions, ranked by importance:
 *   1. Wrong forms ("앤스로픽", "클로드") are NOT in the DOM.
 *   2. Correct forms ("Anthropic", "Claude") ARE in the DOM.
 *   3. The surrounding Korean translation is intact (proving we didn't
 *      accidentally revert the WHOLE GT result).
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

test.describe('SkillBridge — protected terms restoration', () => {
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

  test('GT mistranslations of "Anthropic" and "Claude" are restored before reaching the DOM', async () => {
    // Sanity: original English text is on the page pre-translation.
    const before = await evalInContentWorld(extCtx.context, 'pageText');
    expect(before.pProtected).toBe('Anthropic released Claude as a frontier model.');

    await evalInContentWorld(extCtx.context, 'switchLanguage', 'ko');

    // Wait for GT batch to land — proxy via the H1 swap (other tests
    // already prove the GT pipeline runs to completion).
    const deadline = Date.now() + 10_000;
    let pt = before;
    while (Date.now() < deadline) {
      pt = await evalInContentWorld(extCtx.context, 'pageText');
      if (pt.pProtected && pt.pProtected !== before.pProtected) break;
      await page.waitForTimeout(200);
    }

    // === Critical assertions ===

    // 1. The wrong forms the GT stub deliberately returned must NOT make it
    //    to the user. If protected-terms.js's `restoreProtectedTerms` was
    //    bypassed or no longer hooked into gt-queue.js, these would land.
    expect.soft(pt.pProtected, '앤스로픽 (Anthropic transliteration) wrong form').not.toContain('앤스로픽');
    expect.soft(pt.pProtected, '클로드 wrong form').not.toContain('클로드');

    // 2. The English brand names must appear in their correct form, restored
    //    by the protected-terms map.
    expect(pt.pProtected).toContain('Anthropic');
    expect(pt.pProtected).toContain('Claude');

    // 3. Sanity — the surrounding Korean is intact (we didn't accidentally
    //    revert the whole translation). "프런티어 모델로" is the bit of
    //    the GT stub's output that wasn't a protected term.
    expect(pt.pProtected).toContain('프런티어 모델로');

    // 4. Cross-check: other paragraphs that DON'T trigger protected-terms
    //    still translate normally (proves the restoration is surgical, not
    //    a wholesale GT-bypass).
    expect(pt.h1).toBe('Claude 소개');
    expect(pt.p1).toContain('프롬프트 엔지니어링');
  });

  test('cached GT mistranslations are restored before reaching the DOM', async () => {
    await evalInContentWorld(extCtx.context, 'switchLanguage', 'en');

    const original = 'Anthropic released Claude as a frontier model.';
    const enDeadline = Date.now() + 10_000;
    let before = await evalInContentWorld(extCtx.context, 'pageText');
    while (Date.now() < enDeadline) {
      before = await evalInContentWorld(extCtx.context, 'pageText');
      if (before.pProtected === original) break;
      await page.waitForTimeout(200);
    }
    expect(before.pProtected).toBe(original);

    const seeded = await evalInContentWorld(extCtx.context, 'seedProtectedTermCache');
    expect(seeded).toMatchObject({ ok: true });

    await evalInContentWorld(extCtx.context, 'switchLanguage', 'ko');

    const deadline = Date.now() + 10_000;
    let pt = before;
    while (Date.now() < deadline) {
      pt = await evalInContentWorld(extCtx.context, 'pageText');
      if (pt.pProtected && pt.pProtected !== before.pProtected) break;
      await page.waitForTimeout(200);
    }

    expect.soft(pt.pProtected, 'cached 앤스로픽 wrong form').not.toContain('앤스로픽');
    expect.soft(pt.pProtected, 'cached 클로드 wrong form').not.toContain('클로드');
    expect(pt.pProtected).toContain('Anthropic');
    expect(pt.pProtected).toContain('Claude');
    expect(pt.pProtected).toContain('프런티어 모델로');
  });
});
