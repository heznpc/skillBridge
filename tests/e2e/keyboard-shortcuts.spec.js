/**
 * SkillBridge — keyboard-shortcuts behavioral E2E.
 *
 * keyboard-shortcuts.js binds a document-level keydown handler offering global
 * shortcuts (the modifier is Cmd on macOS, Ctrl elsewhere — mirrored
 * here via process.platform so the test exercises the same branch the handler
 * takes on the host OS):
 *
 *   - Mod+Shift+S  → toggle the learning-tools sidebar
 *   - Mod+Shift+F  → open the sidebar and toggle the flashcards panel
 *   - Mod+Shift+/  → toggle the shortcuts help overlay
 *   - Escape       → close the overlay when it's open
 *   - /            → focus the tutor chat input (AI-enabled sidebar)
 *   - Mod+Shift+L  → toggle dark mode (si18n-dark class on <html>)
 *
 * a11y.spec.js covers the overlay's ARIA shape; this spec covers that the key
 * BINDINGS actually fire and mutate the page, which the op-driven a11y spec
 * bypasses by calling the toggle directly.
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

// The handler uses metaKey on macOS, ctrlKey elsewhere; match the host OS so we
// press the modifier the page's navigator-based `isMac` check actually reads.
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe('SkillBridge — keyboard shortcuts', () => {
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
      if (snap?.init && snap?.sb) break;
      await page.waitForTimeout(200);
    }
    if (!snap?.init) {
      throw new Error(`SkillBridge didn't initialize: ${JSON.stringify(snap)}`);
    }
    // Ensure keydown lands on the document, not a stray focused control.
    await page.evaluate(() => document.body && document.body.focus());
  });

  test.afterAll(async () => {
    if (extCtx) await closeExtension(extCtx);
    if (fixture) await stopFixtureServer(fixture.server);
  });

  const overlayPresent = () => page.evaluate(() => !!document.getElementById('si18n-shortcuts-overlay'));
  const snapshot = () => evalInContentWorld(extCtx.context, 'snapshot');
  const sidebar = () => page.locator('#skillbridge-sidebar');
  const sidebarOpen = () => sidebar().evaluate((element) => element.classList.contains('open'));
  const expectSidebarOpen = async (open) => {
    if (open) await expect(sidebar()).toHaveClass(/\bopen\b/, { timeout: 15_000 });
    else await expect(sidebar()).not.toHaveClass(/\bopen\b/, { timeout: 15_000 });
  };
  const flashcardsVisible = async () => (await snapshot()).methods.chat.state.flashcardPanelOpen;
  const sidebarInputState = () =>
    page.evaluate(() => {
      const root = document.getElementById('skillbridge-root')?.shadowRoot;
      return {
        languageSelect: !!root?.getElementById('si18n-sidebar-lang-select'),
        chatInput: !!root?.getElementById('si18n-chat-input'),
        activeId: root?.activeElement?.id || null,
      };
    });

  test('Mod+Shift+/ opens the shortcuts overlay and Escape closes it', async () => {
    expect(await overlayPresent(), 'overlay should not be open before the shortcut').toBe(false);

    await page.keyboard.press(`${MOD}+Shift+Slash`);
    // showHelpOverlay appends synchronously; give the handler a beat regardless.
    await expect.poll(overlayPresent, { timeout: 3_000 }).toBe(true);
    const descriptions = await page.locator('.si18n-shortcut-desc').allTextContents();
    expect(descriptions).toContain('Toggle learning sidebar');
    // v4: the AI tutor ships, so the sidebar has a chat input and the overlay
    // lists the "Focus chat input" (/) shortcut.
    expect(descriptions.join(' ')).toMatch(/Focus chat input/i);

    await page.keyboard.press('Escape');
    // hideHelpOverlay removes after an OVERLAY_REMOVE transition delay, so poll.
    await expect.poll(overlayPresent, { timeout: 3_000 }).toBe(false);
  });

  test('Mod+Shift+L toggles dark mode on the document element', async () => {
    const isDark = () => page.evaluate(() => document.documentElement.classList.contains('si18n-dark'));
    const before = await isDark();

    await page.keyboard.press(`${MOD}+Shift+KeyL`);
    await expect.poll(isDark, { timeout: 3_000 }).toBe(!before);

    // Toggling again returns to the original state — proves it's a real toggle,
    // not a one-way set.
    await page.keyboard.press(`${MOD}+Shift+KeyL`);
    await expect.poll(isDark, { timeout: 3_000 }).toBe(before);
  });

  test('Mod+Shift+S toggles the learning-tools sidebar and Escape closes it', async () => {
    if (await sidebarOpen()) {
      await page.keyboard.press(`${MOD}+Shift+KeyS`);
      await expectSidebarOpen(false);
    }

    await page.keyboard.press(`${MOD}+Shift+KeyS`);
    await expectSidebarOpen(true);

    await page.keyboard.press('Escape');
    await expectSidebarOpen(false);
  });

  test('Mod+Shift+F opens flashcards and / focuses the tutor chat input', async () => {
    if (await sidebarOpen()) {
      await page.keyboard.press('Escape');
      await expectSidebarOpen(false);
    }

    await page.keyboard.press(`${MOD}+Shift+KeyF`);
    await expectSidebarOpen(true);
    await expect.poll(flashcardsVisible, { timeout: 3_000 }).toBe(true);

    await page.keyboard.press(`${MOD}+Shift+KeyF`);
    await expect.poll(flashcardsVisible, { timeout: 3_000 }).toBe(false);

    // v4 (AI tutor build): the sidebar carries a chat input, so pressing / (not
    // in a field) focuses it and consumes the key.
    if (!(await sidebarOpen())) {
      await page.keyboard.press(`${MOD}+Shift+KeyS`);
      await expectSidebarOpen(true);
    }
    const beforeSlash = await sidebarInputState();
    expect(beforeSlash.chatInput, 'AI sidebar exposes a chat input').toBe(true);
    const consumed = await page.evaluate(
      () =>
        !document.body.dispatchEvent(
          new window.KeyboardEvent('keydown', { key: '/', code: 'Slash', bubbles: true, cancelable: true }),
        ),
    );
    expect(consumed, '/ should focus the tutor chat input and consume the key').toBe(true);
    const afterSlash = await sidebarInputState();
    expect(afterSlash.activeId).toBe('si18n-chat-input');
  });
});
