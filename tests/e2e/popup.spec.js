/**
 * SkillBridge — production popup release smoke.
 *
 * Loads the packaged MV3 default_popup in a real Chromium extension context.
 * This is deliberately not a static HTML test: Chrome must resolve every
 * packaged script, initialize the popup, query the active lesson tab, and
 * persist a language change.
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension } = require('./helpers/extension');
const { registerStubs } = require('./helpers/network-stubs');
const dutchDictionary = require('../../src/data/nl.json');

test.describe('SkillBridge — bundled action popup', () => {
  /** @type {Awaited<ReturnType<typeof launchExtension>>} */
  let extCtx;
  test.beforeAll(async () => {
    extCtx = await launchExtension();
    await registerStubs(extCtx.context);
  });

  test.afterAll(async () => {
    if (extCtx) await closeExtension(extCtx);
  });

  test('loads the packaged default_popup with no missing resources or boot errors', async () => {
    const pageErrors = [];
    const consoleErrors = [];
    const failedExtensionRequests = [];
    const popup = await extCtx.context.newPage();
    popup.on('pageerror', (err) => pageErrors.push(err.message));
    popup.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    popup.on('requestfailed', (request) => {
      if (request.url().startsWith('chrome-extension://')) failedExtensionRequests.push(request.url());
    });

    // Keep a supported course tab in the foreground while navigating the
    // already-created background tab to the packaged popup URL. popup.js then
    // observes the same active-tab state it would receive from the toolbar.
    await extCtx.context.route('https://anthropic.skilljar.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><body><main><h1>Anthropic courses</h1></main></body></html>',
      }),
    );
    const lessonPage = await extCtx.context.newPage();
    await lessonPage.goto('https://anthropic.skilljar.com/e2e-popup-lesson', { waitUntil: 'domcontentloaded' });
    await lessonPage.bringToFront();

    const manifest = await extCtx.context.serviceWorkers()[0].evaluate(() => chrome.runtime.getManifest());
    await popup.goto(`chrome-extension://${extCtx.extensionId}/${manifest.action.default_popup}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(popup.locator('#main-content')).toBeVisible();
    await expect(popup.locator('#not-skilljar')).toBeHidden();
    await expect(popup.locator('#footer')).toContainText('Google Translate');
    // v4: page translation stays deterministic while the optional Tutor ships.
    await expect(popup.locator('#footer')).toContainText('AI Tutor');
    await expect(popup.locator('#footer')).toContainText(/Claude/i);
    await expect(popup.locator('#sidebar-btn')).toContainText(/Tutor/i);
    await expect(popup.locator('#lang-select option')).toHaveCount(33);
    await expect(popup.locator('#lang-select optgroup').nth(0)).toHaveAttribute('label', '★ Curated terminology');
    await expect(popup.locator('#lang-select optgroup').nth(1)).toHaveAttribute('label', 'Google Translate');
    await expect(popup.locator('#lang-select optgroup').nth(0).locator('option[value="nl"]')).toHaveCount(1);
    await expect(popup.locator('#lang-select optgroup').nth(1).locator('option[value="nl"]')).toHaveCount(0);

    // v4 A5/A4: the tutor engine selector ships (cloud/local/off). Choosing
    // "local" reveals the on-device config and persists the pref.
    await expect(popup.locator('#engine-field')).toBeVisible();
    await expect(popup.locator('#engine-select option')).toHaveCount(3);
    await expect(popup.locator('#local-config')).toBeHidden();
    await popup.locator('#engine-select').selectOption('local');
    await expect(popup.locator('#local-config')).toBeVisible();
    await expect(popup.locator('#local-base-input')).toHaveAttribute('placeholder', 'http://localhost:11434/v1');
    await expect
      .poll(async () =>
        extCtx.context
          .serviceWorkers()[0]
          .evaluate(async () => (await chrome.storage.local.get('sb_ai_engine')).sb_ai_engine),
      )
      .toBe('local');
    await popup.locator('#engine-select').selectOption('cloud');
    await expect(popup.locator('#local-config')).toBeHidden();

    await popup.locator('#lang-select').selectOption('nl');
    await expect
      .poll(async () =>
        extCtx.context
          .serviceWorkers()[0]
          .evaluate(async () => (await chrome.storage.local.get('targetLanguage')).targetLanguage),
      )
      .toBe('nl');
    await expect(popup.locator('#refine-label')).toHaveText('Vertaling verfijnen (optioneel)');
    await expect(popup.locator('#refine-opt-off')).toHaveText('Uit');
    await expect(popup.locator('#refine-hint')).toContainText('Google Translate geeft de pagina');
    await expect(lessonPage.locator('h1')).toHaveText(dutchDictionary.catalog['Anthropic courses']);

    // A newly opened lesson must honor the persisted nl + autoTranslate state
    // without an internal switchLanguage test hook or another popup action.
    const coldStartPage = await extCtx.context.newPage();
    await coldStartPage.goto('https://anthropic.skilljar.com/e2e-popup-cold-start', {
      waitUntil: 'domcontentloaded',
    });
    await expect(coldStartPage.locator('h1')).toHaveText(dutchDictionary.catalog['Anthropic courses']);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedExtensionRequests).toEqual([]);
    await popup.close();
    await coldStartPage.close();
    await lessonPage.close();
  });

  test('recognizes a Claude tutorial through the content-script ping when tab.url is hidden', async () => {
    const pageErrors = [];
    const consoleErrors = [];
    const failedExtensionRequests = [];
    const popup = await extCtx.context.newPage();
    popup.on('pageerror', (err) => pageErrors.push(err.message));
    popup.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    popup.on('requestfailed', (request) => {
      if (request.url().startsWith('chrome-extension://')) failedExtensionRequests.push(request.url());
    });

    await extCtx.context.route('https://claude.com/resources/tutorials/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><body><main id="tutorial_content"><h1>Claude tutorial</h1></main></body></html>',
      }),
    );
    const tutorialPage = await extCtx.context.newPage();
    await tutorialPage.goto('https://claude.com/resources/tutorials/e2e-popup', {
      waitUntil: 'domcontentloaded',
    });
    await tutorialPage.bringToFront();

    const serviceWorker = extCtx.context.serviceWorkers()[0];
    const activeTab = await serviceWorker.evaluate(
      async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0],
    );
    expect(activeTab.url).toBeUndefined();
    const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());
    await popup.goto(`chrome-extension://${extCtx.extensionId}/${manifest.action.default_popup}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(popup.locator('#main-content')).toBeVisible();
    await expect(popup.locator('#not-skilljar')).toBeHidden();
    // The Dutch choice persisted by the first popup instance also re-renders
    // this fresh popup when Chrome withholds the tab URL.
    await expect(popup.locator('#sidebar-btn')).toContainText('Zijbalk van AI Tutor openen');

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedExtensionRequests).toEqual([]);
    await popup.close();
    await tutorialPage.close();
  });
});
