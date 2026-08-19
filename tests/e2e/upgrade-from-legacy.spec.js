/**
 * SkillBridge — upgrade path from the PUBLISHED v1.0.1 build.
 *
 * `TODO.md` P1.5 asked for a "v3.5.41 → 4.0.0 upgrade-path test", but nobody is
 * on 3.5.41: the Chrome Web Store has served v1.0.1 since 2026-03-10, so
 * 1.0.1 → 4.0.0 is the path every existing install takes. This spec covers that
 * one instead.
 *
 * WHAT THIS SPEC CAN AND CANNOT PROVE
 * Playwright loads one unpacked build; there is no way to install 1.0.1 and then
 * update in place. What it can do is reproduce the state an update actually
 * leaves behind — Chrome swaps the code while `chrome.storage.local`, the page
 * origin's IndexedDB and localStorage, and registered alarms all survive — and
 * assert what the shipped v4 bundle does when it meets that state.
 *
 * One claim is deliberately NOT made here. Creating a version-1
 * `skillbridge-cache` from the page is impossible once the content script has
 * already opened it at version 2 (IndexedDB rejects a lower version), and
 * racing the two would make a release gate flaky. So the destructive half of
 * that migration — `oldVersion < 2` drops and recreates the store — is pinned
 * by `tests/translator.test.js` ("_openDB — inherited v1.0.1 cache is dropped,
 * not migrated"). This spec pins the two facts that make it fire and keep it
 * safe for real users: the shipped artifact requests version 2, and the drop is
 * scoped to the upgrade rather than clearing the cache on every page load.
 */
const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

/** Storage keys v1.0.1 wrote that v4 must keep reading. */
const LEGACY_SETTINGS = {
  targetLanguage: 'ko',
  autoTranslate: true,
  welcomeShown: true,
  darkMode: true,
};

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

/**
 * `snapshot.translator.cacheReady` is the readiness signal the other cache
 * specs use; `cacheState.dbOpen` can still be false while initialize() is in
 * flight, so polling it alone races the boot.
 */
async function waitForCacheOpen(context, page) {
  const deadline = Date.now() + 15_000;
  let snap = null;
  while (Date.now() < deadline) {
    snap = await evalInContentWorld(context, 'snapshot');
    if (snap?.translator?.cacheReady) return await evalInContentWorld(context, 'cacheState');
    await page.waitForTimeout(200);
  }
  throw new Error(`Translation cache never opened: ${JSON.stringify(snap)}`);
}

test.describe('SkillBridge — upgrade from the published v1.0.1', () => {
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
  });

  test.afterAll(async () => {
    if (extCtx) await closeExtension(extCtx);
    if (fixture) await stopFixtureServer(fixture.server);
  });

  test('legacy settings survive and the retired release-check alarm is absent', async () => {
    const [serviceWorker] = extCtx.context.serviceWorkers();
    await serviceWorker.evaluate(
      async (settings) => chrome.storage.local.set(settings),
      /** @type {any} */ (LEGACY_SETTINGS),
    );

    await page.goto(`${fixture.baseUrl}/lesson`, { waitUntil: 'networkidle' });
    await waitForSkillBridge(extCtx.context, page);

    // An upgrader must not be re-onboarded or lose their language.
    const persisted = await evalInContentWorld(extCtx.context, 'storageState', [
      'targetLanguage',
      'autoTranslate',
      'welcomeShown',
      'darkMode',
    ]);
    expect(persisted).toMatchObject(LEGACY_SETTINGS);

    // `welcomeShown` carried over means the first-run banner must stay away.
    const banner = await evalInContentWorld(extCtx.context, 'welcomeBannerState');
    expect(banner.present).toBe(false);

    // v4 removed the weekly GitHub Releases poll along with its host
    // permission. It must not be registered. (Clearing the one Chrome persisted
    // from the old build is covered by tests/background.test.js, which can call
    // registerAlarms directly — onInstalled has already fired by the time a
    // spec can seed anything here.)
    const alarms = await serviceWorker.evaluate(async () => (await chrome.alarms.getAll()).map((a) => a.name));
    expect(alarms).not.toContain('version-check');
    expect(alarms).toContain('cache-cleanup');
  });

  test('the Puter session v1.0.1 left in the course page is scrubbed, unrelated keys are not', async () => {
    // v1.0.1 ran the Puter SDK in the PAGE world, so its session token landed in
    // the course site's own localStorage where page scripts could read it.
    // puter-content-init.js scrubs every `puter.` key on boot — but only on a
    // lesson visit, so the window stays open until then.
    await page.evaluate(() => {
      localStorage.setItem('puter.auth.token', 'legacy-page-world-token');
      localStorage.setItem('puter.app.id', 'legacy-app-uid');
      localStorage.setItem('skilljar.course.progress', 'keep-me');
    });

    await page.reload({ waitUntil: 'networkidle' });
    await waitForSkillBridge(extCtx.context, page);

    const hostKeys = await page.evaluate(() => Object.keys(localStorage));
    expect(hostKeys.filter((key) => key.startsWith('puter.'))).toEqual([]);
    // The scrub is prefix-scoped: it must not clear the host site's own state.
    expect(hostKeys).toContain('skilljar.course.progress');
  });

  test('no tutor session is inherited — the upgrader has to sign in again', async () => {
    const state = await evalInContentWorld(extCtx.context, 'puterBrokerState', 'legacy-page-world-token');
    // The scrubbed page-world token must not have been adopted by the SDK or
    // promoted into extension storage. Every upgrading user therefore meets the
    // sign-in card on their first tutor question, which is why that card grew a
    // durable exit (see puter-content-broker.js).
    //
    // Note we assert on the legacy token specifically, not on "no token at all":
    // helpers/puter-stream-stub.js ships a pre-set `authToken` so the tutor
    // specs can stream without driving a sign-in, so `liveTokenPresent` is
    // always true under this harness and would prove nothing.
    expect(state.liveTokenMatches).toBe(false);
    expect(state.persistedTokenMatches).toBe(false);
  });

  test('the shipped bundle requests cache schema v3, which is what triggers the drop', async () => {
    await waitForCacheOpen(extCtx.context, page);
    const databases = await page.evaluate(async () => {
      const list = await indexedDB.databases();
      return list.map(({ name, version }) => ({ name, version }));
    });
    // v1.0.1 wrote this same store at version 1, and every build before
    // brand-term masking wrote it at 2. Requesting 3 is what makes
    // onupgradeneeded fire for every upgrading user and drop both the rows
    // v1.0.1's Puter/Gemini verify step could have poisoned and the v2 rows
    // that may hold a mistranslated brand name (observed live:
    // `ko\tAnthropic 과정` → `인류학적 과정`).
    expect(databases).toEqual(expect.arrayContaining([{ name: 'skillbridge-cache', version: 3 }]));
  });

  test('the drop is scoped to the upgrade — a normal reload keeps the cache', async () => {
    await waitForCacheOpen(extCtx.context, page);
    const seeded = await evalInContentWorld(extCtx.context, 'seedProtectedTermCache', {
      lang: 'ko',
      original: 'Upgrade-scope probe sentence.',
      translation: '업그레이드 범위 확인 문장.',
    });
    expect(seeded.ok).toBe(true);
    const before = await evalInContentWorld(extCtx.context, 'cacheState');
    expect(before.count).toBeGreaterThan(0);

    await page.reload({ waitUntil: 'networkidle' });
    await waitForSkillBridge(extCtx.context, page);
    const after = await waitForCacheOpen(extCtx.context, page);

    // If the migration ever became an unconditional wipe, every page load would
    // re-fetch every block from Google Translate — blowing the rate limiter and
    // the performance budget while looking like a harmless "clear the cache".
    expect(after.count).toBeGreaterThan(0);
  });
});
