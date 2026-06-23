/**
 * SkillBridge — YouTube subtitle-manager lifecycle E2E.
 *
 * The YouTubeSubtitleManager owns two long-lived resources: a MutationObserver
 * watching document.body for late-mounted video iframes, and a GLOBAL
 * `window` 'message' listener for the YouTube iframe API. `destroy()` releases
 * both — but for a long time nothing CALLED it, so navigating (SPA-style) onto a
 * Skilljar certification page left the observer + global listener alive for the
 * rest of the page's life, watching a cert page that has no videos.
 *
 * The fix wires destroy() into the cert-disable branch of onRouteChange and
 * rebuilds a fresh manager when the user navigates back to a normal lesson
 * (the manager has no in-place reset path, so it must be re-created — otherwise
 * subtitles would silently stop working for the rest of the SPA session).
 *
 * This spec drives the full create → teardown → rebuild cycle:
 *
 *   1. On `/lesson` (localhost ⇒ _CAPS_FULL ⇒ youtubeSubtitles:true) the manager
 *      is created at init.
 *   2. pushState to `/claude-certified` (matches CERT_DISABLE_PATTERNS) fires
 *      onRouteChange's cert-disable branch ⇒ manager destroyed + nulled.
 *   3. pushState back to a normal lesson ⇒ onRouteChange rebuilds the manager.
 *
 * Observed via the read-only `_sb.hasSubtitleManager` seam (subtitleStatus op).
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

test.describe('SkillBridge — YouTube subtitle-manager lifecycle', () => {
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
    let snap = null;
    while (Date.now() < deadline) {
      snap = await evalInContentWorld(extCtx.context, 'snapshot');
      if (snap?.init && snap?.sb && snap?.methods?.gt) break;
      await page.waitForTimeout(200);
    }
    if (!snap?.init) {
      throw new Error(`SkillBridge didn't initialize: ${JSON.stringify(snap)}`);
    }
  });

  test.afterAll(async () => {
    if (extCtx) await closeExtension(extCtx);
    if (fixture) await stopFixtureServer(fixture.server);
  });

  test('create → cert-nav teardown → return rebuild releases and rebuilds the manager', async () => {
    // 1. Created at init on a YouTube-capable host (_CAPS_FULL).
    const atInit = await evalInContentWorld(extCtx.context, 'subtitleStatus');
    expect(atInit.active, 'subtitle manager must be created at init on _CAPS_FULL host').toBe(true);

    // 2. SPA-navigate onto a certification page. content.js wraps pushState to
    //    fire onRouteChange; the cert-disable branch must tear the manager down.
    await evalInContentWorld(extCtx.context, 'replaceBodyAndPushState', {
      html: '<main id="lesson-main"><h1>Certification</h1></main>',
      path: '/claude-certified',
    });
    await page.waitForTimeout(300);
    const onCert = await evalInContentWorld(extCtx.context, 'subtitleStatus');
    expect(onCert.active, 'manager must be destroyed + nulled on cert-page nav').toBe(false);
    const certUi = await evalInContentWorld(extCtx.context, 'certUiStatus');
    expect(certUi).toMatchObject({
      certDisabled: true,
      host: false,
      fab: false,
      sidebar: false,
      headerLang: false,
      darkToggle: false,
      askTutor: false,
    });

    // Popup/shortcut paths must not be able to resurrect the tutor UI while the
    // tab remains on a certification route.
    await evalInContentWorld(extCtx.context, 'toggleSidebar');
    const afterToggle = await evalInContentWorld(extCtx.context, 'certUiStatus');
    expect(afterToggle.sidebar, 'toggleSidebar must be a no-op while cert-disabled').toBe(false);

    // 3. Navigate back to a normal lesson — the manager must be rebuilt, or
    //    subtitles would stay dead for the rest of the SPA session.
    await evalInContentWorld(extCtx.context, 'replaceBodyAndPushState', {
      html: '<main id="lesson-main"><h1>Introduction to Claude</h1></main>',
      path: '/lesson-after-cert',
    });
    await page.waitForTimeout(300);
    const afterReturn = await evalInContentWorld(extCtx.context, 'subtitleStatus');
    expect(afterReturn.active, 'manager must be rebuilt when returning to a normal lesson').toBe(true);
    const returnUi = await evalInContentWorld(extCtx.context, 'certUiStatus');
    expect(returnUi.certDisabled).toBe(false);
    expect(returnUi.host).toBe(true);
    expect(returnUi.fab).toBe(true);
  });
});
