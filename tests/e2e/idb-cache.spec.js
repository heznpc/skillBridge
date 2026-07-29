/**
 * SkillBridge — Translator IDB cache E2E.
 *
 * `translator.cachedLookup` + `_cacheTranslation` are the layer that
 * makes repeat translations zero-network — without them every page
 * load would re-hit Google Translate, blowing through the rate-limiter
 * and slowing the UX. v3.5.6 fixed a real bug in the cache cleanup
 * alarm path. The cache helpers have unit tests in isolation but
 * there's been no end-to-end proof of the full lifecycle:
 *
 *   CWS translator.translate(text, lang)
 *     → cachedLookup miss
 *     → googleTranslate fires (source: 'google')
 *     → writes the GT result directly to IDB
 *
 *   later — same (text, lang):
 *     → cachedLookup HIT
 *     → returns { text: cached, source: 'cache' } (no network)
 *
 *   different lang — same text:
 *     → cachedLookup miss (key includes lang)
 *     → googleTranslate fires again
 *
 * The spec exercises all three transitions.
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

test.describe('SkillBridge — CWS direct-GT IDB cache', () => {
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

    // The CWS artifact deliberately has no page bridge. Storage initialization
    // must still complete so GT results can be cached directly.
    const deadline = Date.now() + 15_000;
    let snap = null;
    while (Date.now() < deadline) {
      snap = await evalInContentWorld(extCtx.context, 'snapshot');
      if (snap?.init && snap?.sb && snap?.methods?.gt && snap?.translator?.cacheReady) break;
      await page.waitForTimeout(250);
    }
    if (!snap?.translator?.cacheReady) {
      throw new Error(`CWS translator cache did not initialize: ${JSON.stringify(snap)}`);
    }
    // v4: the AI tutor ships, so the full-cap host has the bridge enabled.
    // The GT→IDB cache lifecycle below is independent of the AI layer.
    expect(snap.hostCaps?.bridge).toBe(true);
    expect(snap.translator).toMatchObject({ aiEnabled: true, cacheReady: true });
  });

  test.afterAll(async () => {
    if (extCtx) await closeExtension(extCtx);
    if (fixture) await stopFixtureServer(fixture.server);
  });

  test('first translate hits GT; second hits cache; different lang misses cache', async () => {
    const TEXT = 'Cache this course sentence through the IndexedDB translation layer.';
    const KO = 'IndexedDB 번역 레이어를 통해 이 강의 문장을 캐시하세요.';

    // === Cycle 1: cold miss → GT ===
    const cold = await evalInContentWorld(extCtx.context, 'translateOnce', { text: TEXT, lang: 'ko' });
    expect(cold.text).toBe(KO);
    expect(cold.source).toBe('google');

    // Poll translate() until the IndexedDB transaction commits and the cache
    // is observed.
    const deadline = Date.now() + 6_000;
    let warm = cold;
    while (Date.now() < deadline) {
      warm = await evalInContentWorld(extCtx.context, 'translateOnce', { text: TEXT, lang: 'ko' });
      if (warm.source === 'cache') break;
      await page.waitForTimeout(200);
    }

    // === Cycle 2: warm hit → cache ===
    expect(warm.source, 'second translate() should hit the IDB cache').toBe('cache');
    expect(warm.text).toBe(KO);

    // === Cross-language: cache key must include lang ===
    // Same TEXT, different lang. The ko cache entry must NOT serve a ja
    // request — if it did, the cache key wasn't including lang. We assert
    // source !== 'cache' regardless of what the GT stub returns for ja
    // (our stub doesn't differentiate target lang in its response, so the
    // ja "translation" text happens to be the same Korean — but the
    // `source` field is what proves the cache lookup correctly missed).
    const crossLang = await evalInContentWorld(extCtx.context, 'translateOnce', { text: TEXT, lang: 'ja' });
    expect(crossLang.source, 'different lang must NOT use the ko cache entry').toBe('google');
  });
});
