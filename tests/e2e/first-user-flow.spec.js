/**
 * SkillBridge — first-user release smoke.
 *
 * Locks the path a new user actually touches:
 * install bundle -> open a lesson -> accept language onboarding -> see translated
 * content -> reload and keep auto-translation without seeing onboarding again.
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

async function waitForSkillBridge(context, page) {
  const deadline = Date.now() + 15_000;
  let snap = null;
  while (Date.now() < deadline) {
    snap = await evalInContentWorld(context, 'snapshot');
    if (snap?.init && snap?.sb && snap?.methods?.gt && snap?.methods?.sb) return snap;
    await page.waitForTimeout(200);
  }
  throw new Error(`SkillBridge did not initialize: ${JSON.stringify(snap)}`);
}

async function waitForPageTranslation(context, page) {
  const deadline = Date.now() + 12_000;
  let text = null;
  while (Date.now() < deadline) {
    text = await evalInContentWorld(context, 'pageText');
    if (text?.h1 === 'Claude 소개' && /프롬프트 엔지니어링/.test(text?.p1 || '')) return text;
    await page.waitForTimeout(200);
  }
  throw new Error(`Page did not translate after first-user action: ${JSON.stringify(text)}`);
}

async function waitForWelcomeBanner(context, page) {
  const deadline = Date.now() + 10_000;
  let banner = null;
  while (Date.now() < deadline) {
    banner = await evalInContentWorld(context, 'welcomeBannerState');
    if (banner.present && banner.visible) return banner;
    await page.waitForTimeout(200);
  }
  throw new Error(`Welcome banner did not become visible: ${JSON.stringify(banner)}`);
}

test.describe('SkillBridge — first-user release smoke', () => {
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

  test('new install -> accept language -> reload keeps auto-translation', async () => {
    await page.goto(`${fixture.baseUrl}/lesson`, { waitUntil: 'networkidle' });
    await waitForSkillBridge(extCtx.context, page);

    const initialStorage = await evalInContentWorld(extCtx.context, 'storageState');
    expect(initialStorage.targetLanguage).toBe('en');
    expect(initialStorage.autoTranslate).toBe(false);
    expect(initialStorage.welcomeShown).toBeFalsy();

    const banner = await waitForWelcomeBanner(extCtx.context, page);
    expect(banner.selectedLang).toBeTruthy();

    const accepted = await evalInContentWorld(extCtx.context, 'acceptWelcomeLanguage', 'ko');
    expect(accepted).toEqual({ ok: true });

    const translated = await waitForPageTranslation(extCtx.context, page);
    expect(translated.h1).toBe('Claude 소개');

    const persisted = await evalInContentWorld(extCtx.context, 'storageState');
    expect(persisted).toMatchObject({
      targetLanguage: 'ko',
      autoTranslate: true,
      welcomeShown: true,
    });

    await page.reload({ waitUntil: 'networkidle' });
    await waitForSkillBridge(extCtx.context, page);
    await waitForPageTranslation(extCtx.context, page);

    const afterReloadBanner = await evalInContentWorld(extCtx.context, 'welcomeBannerState');
    expect(afterReloadBanner.present).toBe(false);

    await evalInContentWorld(extCtx.context, 'switchLanguage', 'en');
    await evalInContentWorld(extCtx.context, 'showWelcomeBanner', 'en');
    const englishIntro = await evalInContentWorld(extCtx.context, 'welcomeBannerState');
    expect(englishIntro.text).toContain('SkillBridge is ready');

    const changed = await evalInContentWorld(extCtx.context, 'changeWelcomeLanguage', 'ko');
    expect(changed).toEqual({ ok: true });
    const afterIntroChange = await evalInContentWorld(extCtx.context, 'welcomeBannerState');
    expect(afterIntroChange.text).toContain('SkillBridge is ready');
    expect(afterIntroChange.text).not.toMatch(/^Korean\b/);
  });
});
