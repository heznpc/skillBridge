/**
 * SkillBridge — PDF export sanitization E2E.
 *
 * Locks in v3.5.9's fix for the PDF-export XSS. Before that fix,
 * `exportLessonPDF` wrote `lessonContent.innerHTML` directly into a new
 * `window.open('', '_blank')`-spawned popup via `document.write`, then
 * tried to remove `<script>`/`<iframe>` AFTER `document.close()` — by
 * which point inline scripts had already executed in the new about:blank
 * context. Skilljar lessons are third-party content, so any attacker-
 * influenced lesson body could execute JS in the print popup.
 *
 * The fix clones + sanitizes the lesson DOM BEFORE serializing it into
 * the popup. This spec asserts each sanitization invariant on a fixture
 * containing the four attacker-shapes we know about:
 *
 *   - `<script>` element (strip element)
 *   - `<iframe>` element (strip element)
 *   - `onclick` attribute (strip attribute)
 *   - `javascript:` href (strip attribute)
 *
 * Plus a harmless `<p id="p-pdf-marker">` to confirm the sanitization is
 * surgical — lesson body content still makes it through.
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

test.describe('SkillBridge — PDF export sanitization', () => {
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
    while (Date.now() < deadline) {
      const snap = await evalInContentWorld(extCtx.context, 'snapshot');
      if (snap?.init && snap?.sb && snap?.methods?.chat) break;
      await page.waitForTimeout(200);
    }

    // Open sidebar so #si18n-pdf-btn exists in the DOM and its click
    // handler (bound by sidebar-chat.bindSidebarEvents) is live.
    await evalInContentWorld(extCtx.context, 'injectSidebar');
    await evalInContentWorld(extCtx.context, 'toggleSidebar');
  });

  test.afterAll(async () => {
    if (extCtx) await closeExtension(extCtx);
    if (fixture) await stopFixtureServer(fixture.server);
  });

  test('print popup contains lesson body but NO scripts / iframes / on* handlers / javascript: URLs', async () => {
    // The button is in the DOM (added by sidebar-chat's renderer) and its
    // click handler is bound in the content-script isolated world.
    // Playwright's `page.click` fires a synthetic click event on the DOM
    // element, which bubbles to the isolated-world listener normally.
    //
    // `window.open` spawns a popup that Playwright tracks as a new Page.
    // Promise.all + waitForEvent('popup') captures it without racing.
    // PDF export now lives in the consolidated "Tools" menu, so open it first
    // (the button is hidden until the menu is expanded).
    await page.click('#si18n-tools-btn');
    // Wait for the PDF button to actually be visible before racing the popup —
    // the Tools menu expands via a transition, and clicking before it settles
    // can no-op (no window.open → popup never fires). The 5s popup timeout was
    // also too tight under headless CI load; 15s matches the suite's other waits.
    await page.waitForSelector('#si18n-pdf-btn', { state: 'visible', timeout: 5_000 });
    const [popup] = await Promise.all([page.waitForEvent('popup', { timeout: 15_000 }), page.click('#si18n-pdf-btn')]);
    expect(popup, 'window.open must spawn a popup').toBeTruthy();
    // Give document.write a beat to land.
    await popup.waitForLoadState('domcontentloaded').catch(() => {});

    const html = await popup.content();
    const bodyText = await popup.evaluate(() => document.body.textContent || '');

    // === The surgical invariant — sanitization preserved the lesson body ===
    expect(bodyText).toContain('Printable content survived sanitization.');
    expect(bodyText).toContain('Introduction to Claude'); // h1
    expect(bodyText).toContain('Anthropic'); // brand name from p-2

    // === The bright-line security invariants ===

    // 1. The XSS marker MUST NOT have run in the popup window.
    //    The fixture's `<script>` element runs at LOAD time on the main
    //    page (browser default behavior; that's not the bug we're guarding
    //    against), so `window.__pdfExportXssRan` is set on the main page
    //    by design. The bug v3.5.9 fixed was the script ALSO executing in
    //    the new about:blank popup because the old code wrote raw
    //    `lessonContent.innerHTML` and only stripped tags AFTER inline
    //    scripts had already run. The fix sanitizes the clone first —
    //    so the script never appears in the popup HTML to begin with.
    const popupXss = await popup.evaluate(() => 'undefined' === typeof window.__pdfExportXssRan);
    expect(popupXss, 'XSS marker MUST NOT have run in the popup').toBe(true);

    // 2. No <script> tag survived into the popup HTML.
    //    Case-insensitive because document.write may normalize tag case.
    expect.soft(html).not.toMatch(/<script\b/i);

    // 3. No <iframe> tag survived.
    expect.soft(html).not.toMatch(/<iframe\b/i);

    // 4. No `on*` event-handler attributes survived. We assert the
    //    SPECIFIC ones we put in the fixture so a partial regex regression
    //    doesn't slip through.
    expect.soft(html).not.toMatch(/onclick\s*=/i);

    // 5. No `javascript:` URLs survived as `href` values.
    expect.soft(html).not.toMatch(/href\s*=\s*["']?javascript:/i);

    // 6. Obfuscated / namespaced / form URL schemes are stripped too. The old
    //    blocklist only tested /^\s*javascript:/ on href|src, so it missed
    //    control-char obfuscation (java&#9;script:), xlink:href, and formaction.
    //    Assert the SPECIFIC dangerous attributes were removed from the elements.
    const stripped = await popup.evaluate(() => ({
      ctrl: document.getElementById('pdf-xss-ctrl')?.getAttribute('href') ?? null,
      xlink: document.getElementById('pdf-xss-xlink')?.getAttribute('xlink:href') ?? null,
      formaction: document.getElementById('pdf-xss-formaction')?.getAttribute('formaction') ?? null,
    }));
    expect.soft(stripped.ctrl, 'tab-obfuscated javascript: href must be stripped').toBeNull();
    expect.soft(stripped.xlink, 'xlink:href javascript: must be stripped').toBeNull();
    expect.soft(stripped.formaction, 'formaction javascript: must be stripped').toBeNull();

    await popup.close();
  });
});
