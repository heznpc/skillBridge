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
const { SETTLE_MS } = require('./helpers/timeouts');
const {
  registerStubs,
  startFixtureServer,
  stopFixtureServer,
  getGTRequestCount,
  getGTRequests,
  resetGTRequestCount,
} = require('./helpers/network-stubs');

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

  // Structured blocks (inline tags / interactive labels) deliberately bypass
  // the FLAT cache, because a flat string cannot safely fill markup. That left
  // them with no cache at all: the same block was re-sent to Google Translate
  // on every page load and every SPA return. They now have their own key
  // namespace, and a cache hit still goes through the sanitizer and the
  // tag-integrity gate.
  test('a structured block is served from cache on the second pass, with no GT traffic', async () => {
    // outerHTML must match the stub's canned key EXACTLY — the HTML path posts
    // the whole block as \`q\`, so even a different id is a cache/stub miss.
    const MARKUP = 'Read <a id="offline-doc-link" href="/docs">the documentation</a> carefully.';
    await page.evaluate((html) => {
      const p = document.createElement('p');
      p.id = 'p-offline-structured';
      p.innerHTML = html;
      document.querySelector('#lesson-main').prepend(p);
    }, MARKUP);

    const block = page.locator('#p-offline-structured');

    await evalInContentWorld(extCtx.context, 'switchLanguage', 'ko');
    await expect(block).toContainText('주의 깊게 읽으세요', { timeout: SETTLE_MS });
    // The link must survive the round trip — that is what the flat cache could
    // not guarantee and why this path exists at all.
    await expect(page.locator('#offline-doc-link')).toHaveAttribute('href', '/docs');

    await evalInContentWorld(extCtx.context, 'switchLanguage', 'en');
    await expect(block).toContainText('the documentation', { timeout: SETTLE_MS });

    resetGTRequestCount();
    await evalInContentWorld(extCtx.context, 'switchLanguage', 'ko');
    await expect(block).toContainText('주의 깊게 읽으세요', { timeout: SETTLE_MS });

    // Assert on WHAT was re-sent, not on a global count: other content on the
    // page can legitimately miss the flat cache, and a bare count would make
    // this test fail for reasons that have nothing to do with the block.
    const resent = getGTRequests().filter((q) => q.includes('offline-doc-link'));
    expect(resent, `structured block was re-sent to GT: ${JSON.stringify(resent)}`).toEqual([]);
  });
});
