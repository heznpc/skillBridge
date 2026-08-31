/**
 * SkillBridge — loaded-page offline resilience E2E.
 *
 * Covers the user-visible contract that can work without adding an
 * extension-owned offline reader:
 *
 *   warm flat + structured translation caches online
 *     → load the same served lesson while navigator.onLine starts false
 *     → replay both cache shapes without GT traffic
 *     → leave a cache miss in the original language and explain the partial state
 *     → reconnect, translate only the miss, and clear the status banner.
 *
 * The fixture is still served locally. A genuinely cold browser-offline reload
 * would show Chromium's network error before a host page (and therefore a
 * content script) exists; that is intentionally outside this feature's scope.
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { SETTLE_MS } = require('./helpers/timeouts');
const {
  registerStubs,
  startFixtureServer,
  stopFixtureServer,
  getGTRequests,
  resetGTRequestCount,
} = require('./helpers/network-stubs');

test.describe.serial('SkillBridge — loaded-page offline resilience', () => {
  /** @type {Awaited<ReturnType<typeof launchExtension>>} */
  let extCtx;
  /** @type {import('@playwright/test').Page} */
  let page;
  /** @type {{server: import('http').Server, baseUrl: string}} */
  let fixture;

  async function waitForSkillBridge() {
    const deadline = Date.now() + SETTLE_MS;
    let snap = null;
    while (Date.now() < deadline) {
      snap = await evalInContentWorld(extCtx.context, 'snapshot');
      if (snap?.init && snap?.sb && snap?.methods?.gt && snap?.translator?.cacheReady) return snap;
      await page.waitForTimeout(200);
    }
    throw new Error(`SkillBridge cache did not initialize: ${JSON.stringify(snap)}`);
  }

  test.beforeAll(async () => {
    fixture = await startFixtureServer();
    extCtx = await launchExtension();
    await registerStubs(extCtx.context);
    page = await extCtx.context.newPage();
    page.on('pageerror', (err) => console.log('[page:pageerror]', err.message));
  });

  test.afterAll(async () => {
    if (extCtx) await closeExtension(extCtx);
    if (fixture) await stopFixtureServer(fixture.server);
  });

  test('cached flat and structured text survive startup offline; only misses resume online', async () => {
    const warmUrl = `${fixture.baseUrl}/lesson?__sb_e2e_cache_probe=1`;
    await page.goto(warmUrl);
    await waitForSkillBridge();

    // Warm both cache shapes online. switchLanguage persists the Korean
    // auto-translate preference that the next document reads during init.
    await evalInContentWorld(extCtx.context, 'switchLanguage', 'ko');
    await expect(page.locator('#p-protected')).toContainText('프런티어 모델', { timeout: SETTLE_MS });
    await expect(page.locator('#p-offline-structured')).toContainText('문서를 주의 깊게 읽으세요.', {
      timeout: SETTLE_MS,
    });
    await expect(page.locator('#offline-doc-link')).toHaveAttribute('href', '/docs');

    // Tear down the warm document before zeroing the transport probe. A late
    // visible-item batch from that online page must not be attributed to the
    // startup-offline document that follows.
    await page.goto('about:blank');
    await page.waitForTimeout(300);
    resetGTRequestCount();
    const offlineUrl = `${fixture.baseUrl}/lesson?__sb_e2e_cache_probe=1` + '&__sb_e2e_uncached=1&__sb_e2e_offline=1';
    await page.goto(offlineUrl);
    const startup = await waitForSkillBridge();
    expect(startup.isOffline).toBe(true);

    // Cached content is rendered, including markup, while a new paragraph is
    // held in English. The persistent banner tells the learner it is partial.
    await expect(page.locator('#p-protected')).toContainText('프런티어 모델', { timeout: SETTLE_MS });
    await expect(page.locator('#p-offline-structured')).toContainText('문서를 주의 깊게 읽으세요.', {
      timeout: SETTLE_MS,
    });
    await expect(page.locator('#offline-doc-link')).toHaveAttribute('href', '/docs');
    await expect(page.locator('#p-offline-uncached')).toHaveText(
      'This paragraph has never been cached and must wait for the connection.',
    );
    const banner = page.locator('#si18n-offline-banner');
    await expect(banner).toBeVisible({ timeout: SETTLE_MS });
    await expect(banner).toHaveAttribute('data-status', 'partial');
    expect(getGTRequests(), 'startup-offline rendering must make zero GT calls').toEqual([]);

    // Reconnection flushes only deferred misses. The cached structured block
    // stays intact and is not sent back to GT.
    await evalInContentWorld(extCtx.context, 'dispatchOnline');
    await expect(page.locator('#p-offline-uncached')).toHaveText(
      '이 문단은 캐시된 적이 없으므로 연결을 기다려야 합니다.',
      { timeout: SETTLE_MS },
    );
    await expect(banner).toHaveCount(0, { timeout: SETTLE_MS });

    const requests = getGTRequests();
    expect(requests.filter((q) => q.includes('offline-doc-link'))).toEqual([]);
    expect(
      requests.filter((q) => q === 'This paragraph has never been cached and must wait for the connection.'),
    ).toHaveLength(1);
    await expect(page.locator('#offline-doc-link')).toHaveAttribute('href', '/docs');

    // A later idle offline episode must not inherit this page's old partial
    // status. Everything currently rendered was translated and cached, so the
    // live coverage seed settles directly on cache-only instead of remaining
    // unknown forever.
    await evalInContentWorld(extCtx.context, 'dispatchOffline');
    await expect(banner).toHaveAttribute('data-status', 'cacheOnly');

    // An in-page anchor is not a new lesson. The route lifecycle still
    // schedules a translation re-scan for hash changes, but the current page's
    // cache evidence must survive beyond that delayed pass.
    await page.evaluate(() => {
      location.hash = 'offline-section';
    });
    await expect(page).toHaveURL(/#offline-section$/);
    await page.waitForTimeout(2_000);
    await expect(banner).toHaveAttribute('data-status', 'cacheOnly');

    // A same-language SPA lesson gets a separate page epoch: it starts unknown
    // and then recomputes only from the next lesson's DOM.
    await evalInContentWorld(extCtx.context, 'replaceBodyAndPushState', {
      path: '/lesson?__sb_e2e_offline=1&__sb_e2e_spa=next',
      html: '<main id="lesson-main"><h1>Introduction to Claude</h1><p id="p-next-cached">This paragraph has never been cached and must wait for the connection.</p></main>',
    });
    await expect(page.locator('#si18n-offline-banner')).toHaveAttribute('data-status', 'unknown');
    await expect(page.locator('#p-next-cached')).toHaveText('이 문단은 캐시된 적이 없으므로 연결을 기다려야 합니다.', {
      timeout: SETTLE_MS,
    });
    await expect(page.locator('#si18n-offline-banner')).toHaveAttribute('data-status', 'cacheOnly');
  });

  test('idle offline entry combines rendered coverage with a new visible cache miss', async () => {
    await page.goto(`${fixture.baseUrl}/lesson`);
    await waitForSkillBridge();
    await expect(page.locator('#p-protected')).toContainText('프런티어 모델', { timeout: SETTLE_MS });
    await page.waitForTimeout(500);
    resetGTRequestCount();

    const missingText = 'This newly visible paragraph is intentionally absent from the offline translation cache.';
    await page.evaluate((text) => {
      const paragraph = document.createElement('p');
      paragraph.id = 'p-idle-offline-miss';
      paragraph.textContent = text;
      document.querySelector('#lesson-main').prepend(paragraph);
    }, missingText);

    const offline = await evalInContentWorld(extCtx.context, 'dispatchOffline');
    expect(offline).toEqual({ isOffline: true });

    const banner = page.locator('#si18n-offline-banner');
    await expect(banner).toBeVisible({ timeout: SETTLE_MS });
    await expect(banner).toHaveAttribute('data-status', 'partial', { timeout: SETTLE_MS });
    await expect(page.locator('#p-idle-offline-miss')).toHaveText(missingText);
    expect(getGTRequests(), 'offline miss classification must not contact Google Translate').toEqual([]);
  });

  test('local study tools and reading state keep working during startup offline', async () => {
    resetGTRequestCount();
    await page.goto(`${fixture.baseUrl}/lesson?__sb_e2e_offline=1`);
    const startup = await waitForSkillBridge();
    expect(startup).toMatchObject({ isOffline: true, currentLang: 'ko' });

    // The localhost fixture has Skilljar capabilities but is intentionally not
    // a production lesson-identity host. Adapt that single test-host boundary,
    // then let the real SPA timers mount the outline and record the visit.
    expect(await evalInContentWorld(extCtx.context, 'useResumeFixtureIdentity')).toEqual({ ok: true });
    await page.evaluate(() => {
      const url = new URL(location.href);
      url.searchParams.set('__sb_e2e_lesson_tick', String(Date.now()));
      history.pushState({}, '', url.href);
    });
    await expect
      .poll(async () => await evalInContentWorld(extCtx.context, 'readingAidState'), { timeout: SETTLE_MS })
      .toMatchObject({ barPresent: true, tocPresent: true, tocVisible: true, outlineItems: 3 });

    expect(await evalInContentWorld(extCtx.context, 'toggleReadingOutline')).toEqual({ ok: true });
    await expect
      .poll(async () => (await evalInContentWorld(extCtx.context, 'readingAidState')).tocOpen, {
        timeout: SETTLE_MS,
      })
      .toBe(true);

    await expect
      .poll(async () => (await evalInContentWorld(extCtx.context, 'recentState')).records.length, {
        timeout: SETTLE_MS,
      })
      .toBe(1);
    await page.locator('#p-below-fold').scrollIntoViewIfNeeded();
    await expect
      .poll(async () => (await evalInContentWorld(extCtx.context, 'readingAidState')).progress, {
        timeout: SETTLE_MS,
      })
      .toBeGreaterThan(0);
    await expect
      .poll(
        async () => {
          const { records } = await evalInContentWorld(extCtx.context, 'recentState');
          return records[0]?.scrollY || 0;
        },
        { timeout: SETTLE_MS },
      )
      .toBeGreaterThan(0);

    await evalInContentWorld(extCtx.context, 'injectSidebar');
    await evalInContentWorld(extCtx.context, 'toggleSidebar');

    await evalInContentWorld(extCtx.context, 'toggleBookmarksPanel');
    expect(await evalInContentWorld(extCtx.context, 'addCurrentBookmark')).toEqual({ ok: true });
    await expect
      .poll(
        async () => {
          const stored = await evalInContentWorld(extCtx.context, 'storageState', ['sb_bookmarks']);
          return stored.sb_bookmarks?.length || 0;
        },
        { timeout: SETTLE_MS },
      )
      .toBe(1);
    expect(await evalInContentWorld(extCtx.context, 'bookmarkPanelState')).toMatchObject({
      count: 1,
      titles: ['Anthropic Academy — Test Lesson'],
    });

    await evalInContentWorld(extCtx.context, 'closeSubPanel');
    await evalInContentWorld(extCtx.context, 'toggleFlashcardPanel');
    await expect
      .poll(
        async () => {
          const card = await evalInContentWorld(extCtx.context, 'flashcardPanelState');
          return card.present && card.front.length > 0 && card.back.length > 0;
        },
        { timeout: SETTLE_MS },
      )
      .toBe(true);
    expect(await evalInContentWorld(extCtx.context, 'markFlashcardCorrect')).toEqual({ ok: true });
    await expect
      .poll(
        async () => {
          const stored = await evalInContentWorld(extCtx.context, 'storageState', ['fc_all_ko']);
          return Object.keys(stored.fc_all_ko?.boxes || {}).length;
        },
        { timeout: SETTLE_MS },
      )
      .toBe(1);

    await evalInContentWorld(extCtx.context, 'closeSubPanel');
    await evalInContentWorld(extCtx.context, 'toggleDashboardPanel');
    await expect
      .poll(async () => (await evalInContentWorld(extCtx.context, 'readDashboard')).values, {
        timeout: SETTLE_MS,
      })
      .toEqual(['1', '1', '1', '0/1']);

    expect(getGTRequests(), 'local offline tools must not contact Google Translate').toEqual([]);
  });

  test('startup offline remains visible when English is selected', async () => {
    await evalInContentWorld(extCtx.context, 'switchLanguage', 'en');
    resetGTRequestCount();
    await page.goto(`${fixture.baseUrl}/lesson?__sb_e2e_offline=1`);
    const startup = await waitForSkillBridge();
    expect(startup).toMatchObject({ isOffline: true, currentLang: 'en' });

    const banner = page.locator('#si18n-offline-banner');
    await expect(banner).toBeVisible({ timeout: SETTLE_MS });
    await expect(banner).toHaveAttribute('data-status', 'unknown');
    await expect(banner).toContainText('Offline');
    expect(getGTRequests()).toEqual([]);
  });
});
