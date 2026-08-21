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
const { SETTLE_MS } = require('./helpers/timeouts');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const {
  registerStubs,
  startFixtureServer,
  stopFixtureServer,
  getGTRequestCount,
  resetGTRequestCount,
} = require('./helpers/network-stubs');

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

  test('GT mistranslations of "Anthropic" and "Claude" are restored before reaching the DOM', async () => {
    // Sanity: original English text is on the page pre-translation.
    const before = await evalInContentWorld(extCtx.context, 'pageText');
    expect(before.pProtected).toBe('Anthropic released Claude as a frontier model.');

    await evalInContentWorld(extCtx.context, 'switchLanguage', 'ko');

    // Wait for GT batch to land — proxy via the H1 swap (other tests
    // already prove the GT pipeline runs to completion).
    const deadline = Date.now() + SETTLE_MS;
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
    const enDeadline = Date.now() + SETTLE_MS;
    let before = await evalInContentWorld(extCtx.context, 'pageText');
    while (Date.now() < enDeadline) {
      before = await evalInContentWorld(extCtx.context, 'pageText');
      if (before.pProtected === original) break;
      await page.waitForTimeout(200);
    }
    expect(before.pProtected).toBe(original);

    // seedProtectedTermCache writes straight into IndexedDB and returns
    // `{ error: 'translator cache missing' }` if `translator._db` has not been
    // assigned yet. Nothing above waits for that, so on a slow runner the seed
    // ran against a half-open translator and the test failed with an error
    // object instead of the mistranslation it meant to plant. Wait for the same
    // readiness signal upgrade-from-legacy.spec.js uses.
    const cacheDeadline = Date.now() + SETTLE_MS;
    let cacheSnap = null;
    while (Date.now() < cacheDeadline) {
      cacheSnap = await evalInContentWorld(extCtx.context, 'snapshot');
      if (cacheSnap?.translator?.cacheReady) break;
      await page.waitForTimeout(200);
    }
    expect(cacheSnap?.translator?.cacheReady, 'translation cache never opened').toBe(true);

    const seeded = await evalInContentWorld(extCtx.context, 'seedProtectedTermCache');
    expect(seeded).toMatchObject({ ok: true });

    await evalInContentWorld(extCtx.context, 'switchLanguage', 'ko');

    const deadline = Date.now() + SETTLE_MS;
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

  // Idempotency invariant for the repeated static pass.
  //
  // Background: `applyStaticTranslations` re-runs on a LATE_CONTENT timer and
  // on every SPA route change, re-scanning the whole page. On the live site
  // that fed the static dictionary's own output back into Google Translate —
  // "Anthropic courses" became "Anthropic 과정" (correct), and the next pass
  // read that back as English (it is 82% Latin) and shipped it to GT, which
  // returned "인류학적 과정". The IndexedDB cache still held the proof: a row
  // keyed `ko\tAnthropic 과정`, i.e. an already-translated key.
  //
  // HONEST SCOPE: this asserts the invariant (a repeat pass issues no GT
  // traffic and changes no text); it does NOT reproduce the live defect —
  // removing the `alreadyTranslated` guard still leaves it green, because this
  // fixture does not exercise whichever entry path re-queued the element on the
  // real page. The user-visible half of the bug is covered structurally by
  // brand-term masking (protected-terms.test.js, plus a 12-locale live check
  // against the real GT endpoint), and the guard's wiring by
  // gt-queue.test.js. Left in place because the invariant is worth pinning,
  // but do not read a pass here as proof the re-send path is dead.
  test('a repeated static pass never re-sends text we already translated', async () => {
    await evalInContentWorld(extCtx.context, 'switchLanguage', 'ko');

    // "Anthropic courses" is in the static dictionary, so the first pass
    // renders "Anthropic 과정" without touching the network. That output is
    // 82% Latin and 12 characters — over both thresholds processOneElement
    // uses — which is exactly what made the next pass treat it as English.
    // The precondition here is QUIESCENCE, not just "the static write landed".
    // Three things have to be true before the counter is reset below, and only
    // the first is visible in brandHeading:
    //   1. the dictionary write rendered,
    //   2. the first pass's GT round trip for the elements the dictionary does
    //      NOT cover has come back — pProtected is one of those, so its Korean
    //      arriving proves the response was applied and the element marked,
    //   3. the LATE_CONTENT re-scan (SKILLBRIDGE_DELAYS.LATE_CONTENT, 1500ms
    //      after the first pass) has come and gone without sending anything.
    // Anything still in flight when resetGTRequestCount() runs lands afterwards
    // and is indistinguishable from the re-send this test exists to catch —
    // that is exactly how a text-only poll produced "expected 0, received 1".
    // The quiet window is deliberately longer than LATE_CONTENT so passing it
    // *is* the proof that the automatic re-scan stayed silent.
    const QUIET_POLLS = 10; // × 200ms = 2s > LATE_CONTENT
    const deadline = Date.now() + SETTLE_MS;
    let before = await evalInContentWorld(extCtx.context, 'pageText');
    let lastCount = getGTRequestCount();
    let quietPolls = 0;
    while (Date.now() < deadline) {
      await page.waitForTimeout(200);
      before = await evalInContentWorld(extCtx.context, 'pageText');
      const count = getGTRequestCount();
      quietPolls = count === lastCount ? quietPolls + 1 : 0;
      lastCount = count;
      const settled = before.brandHeading === 'Anthropic 과정' && before.pProtected?.includes('프런티어');
      if (settled && quietPolls >= QUIET_POLLS) break;
    }
    expect(before.brandHeading).toBe('Anthropic 과정');
    expect(before.pProtected, 'first-pass GT round trip must have landed').toContain('프런티어');

    // Assert on the NETWORK, not the rendered text: a re-send is the defect
    // itself, and whether its response happens to survive validation is
    // incidental. Counting requests fails loudly the moment the guard goes.
    resetGTRequestCount();

    // Three more passes: the LATE_CONTENT re-scan plus SPA route changes.
    for (let i = 0; i < 3; i++) {
      await evalInContentWorld(extCtx.context, 'reapplyStaticTranslations', 'ko');
      await page.waitForTimeout(500);
    }

    expect(getGTRequestCount()).toBe(0);
    const after = await evalInContentWorld(extCtx.context, 'pageText');
    expect(after.brandHeading).toBe('Anthropic 과정');
    expect(after.h1).toBe(before.h1);
    expect(after.pProtected).toContain('Anthropic');
    expect(after.pProtected).toContain('Claude');
  });
});
