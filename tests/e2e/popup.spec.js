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
        body: '<!doctype html><html><body><main><h1>Course lesson</h1></main></body></html>',
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
    await expect(popup.locator('#footer')).toContainText('Local learning tools');
    await expect(popup.locator('#footer')).not.toContainText(/Gemini|Tutor|Claude/i);
    await expect(popup.locator('#sidebar-btn')).not.toContainText(/Tutor/i);
    await expect(popup.locator('#lang-select option')).toHaveCount(33);
    await expect(popup.locator('#lang-select optgroup').nth(0)).toHaveAttribute('label', '★ Curated terminology');
    await expect(popup.locator('#lang-select optgroup').nth(1)).toHaveAttribute('label', 'Google Translate');

    await popup.locator('#lang-select').selectOption('ko');
    await expect
      .poll(async () =>
        extCtx.context
          .serviceWorkers()[0]
          .evaluate(async () => (await chrome.storage.local.get('targetLanguage')).targetLanguage),
      )
      .toBe('ko');

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedExtensionRequests).toEqual([]);
    await popup.close();
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
    await expect(popup.locator('#sidebar-btn')).not.toContainText(/Tutor/i);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedExtensionRequests).toEqual([]);
    await popup.close();
    await tutorialPage.close();
  });
});
