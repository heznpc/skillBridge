/**
 * SkillBridge — CWS no-AI / no-RHC release boundary.
 *
 * Loads the exact `dist/bundled` production artifact (the helper only widens
 * its host match in a temporary copy) and proves that the CWS edition keeps
 * local learning tools while never loading the archived Puter bridge or any
 * remotely hosted JavaScript/WASM.
 */

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld, EXTENSION_SRC } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function isRemoteExecutableRequest(request) {
  let parsed;
  try {
    parsed = new URL(request.url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return false;
  return request.resourceType === 'script' || /\.(?:m?js|wasm)(?:$|[?#])/i.test(parsed.pathname);
}

test.describe('SkillBridge — CWS no-AI / no-RHC boundary', () => {
  /** @type {Awaited<ReturnType<typeof launchExtension>>} */
  let extCtx;
  /** @type {import('@playwright/test').Page} */
  let page;
  /** @type {{server: import('http').Server, baseUrl: string}} */
  let fixture;
  /** @type {Array<{url: string, resourceType: string}>} */
  const requests = [];

  test.beforeAll(async () => {
    fixture = await startFixtureServer();
    extCtx = await launchExtension();
    extCtx.context.on('request', (request) => {
      requests.push({ url: request.url(), resourceType: request.resourceType() });
    });
    await registerStubs(extCtx.context);
    page = await extCtx.context.newPage();
    await page.goto(`${fixture.baseUrl}/lesson`, { waitUntil: 'networkidle' });

    const deadline = Date.now() + 15_000;
    let snap = null;
    while (Date.now() < deadline) {
      snap = await evalInContentWorld(extCtx.context, 'snapshot');
      if (snap?.init && snap?.sb && snap?.translator?.cacheReady) break;
      await page.waitForTimeout(200);
    }
    if (!snap?.translator?.cacheReady) {
      throw new Error(`CWS no-AI runtime did not initialize: ${JSON.stringify(snap)}`);
    }
  });

  test.afterAll(async () => {
    if (extCtx) await closeExtension(extCtx);
    if (fixture) await stopFixtureServer(fixture.server);
  });

  test('production artifact excludes Puter and the page bridge', () => {
    expect(fs.existsSync(path.join(EXTENSION_SRC, 'src', 'bridge', 'puter.js'))).toBe(false);
    expect(fs.existsSync(path.join(EXTENSION_SRC, 'src', 'lib', 'page-bridge.js'))).toBe(false);

    const manifest = JSON.parse(fs.readFileSync(path.join(EXTENSION_SRC, 'manifest.json'), 'utf8'));
    const resources = (manifest.web_accessible_resources || []).flatMap((entry) => entry.resources || []);
    expect(resources).not.toContain('src/bridge/puter.js');
    expect(resources).not.toContain('src/lib/page-bridge.js');
  });

  test('runtime exposes the CWS bridge-off boundary with a live GT cache', async () => {
    const snap = await evalInContentWorld(extCtx.context, 'snapshot');
    expect(snap.hostCaps).toMatchObject({
      trusted: true,
      sidebar: true,
      fab: true,
      bridge: false,
    });
    expect(snap.translator).toEqual({
      aiEnabled: false,
      cacheReady: true,
      bridgeReady: false,
    });
  });

  test('local learning sidebar works without a chat surface', async () => {
    const before = await evalInContentWorld(extCtx.context, 'snapshot');
    if (!before.sidebarVisible) await evalInContentWorld(extCtx.context, 'toggleSidebar');

    await expect
      .poll(async () => (await evalInContentWorld(extCtx.context, 'snapshot')).sidebarVisible, { timeout: 3_000 })
      .toBe(true);
    await expect
      .poll(
        () => page.evaluate(() => document.getElementById('skillbridge-root')?.shadowRoot?.activeElement?.id || null),
        { timeout: 3_000 },
      )
      .toBe('si18n-sidebar-lang-select');

    const ui = await page.evaluate(() => {
      const root = document.getElementById('skillbridge-root')?.shadowRoot;
      return {
        sidebar: !!root?.getElementById('skillbridge-sidebar'),
        languageSelect: !!root?.getElementById('si18n-sidebar-lang-select'),
        toolsButton: !!root?.getElementById('si18n-tools-btn'),
        dashboardButton: !!root?.getElementById('si18n-dash-btn'),
        flashcardsButton: !!root?.getElementById('si18n-fc-btn'),
        bookmarksButton: !!root?.getElementById('si18n-bm-btn'),
        pdfButton: !!root?.getElementById('si18n-pdf-btn'),
        chatInput: !!root?.getElementById('si18n-chat-input'),
        chatSend: !!root?.getElementById('si18n-chat-send'),
      };
    });
    expect(ui).toEqual({
      sidebar: true,
      languageSelect: true,
      toolsButton: true,
      dashboardButton: true,
      flashcardsButton: true,
      bookmarksButton: true,
      pdfButton: true,
      chatInput: false,
      chatSend: false,
    });

    // Change language before opening a local tool. This catches the difference
    // between a select's live value property and its saved innerHTML selected
    // attributes when the base panel is restored later.
    await page.evaluate(() => {
      const select = document
        .getElementById('skillbridge-root')
        ?.shadowRoot?.getElementById('si18n-sidebar-lang-select');
      select.value = 'ko';
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    await expect
      .poll(async () => (await evalInContentWorld(extCtx.context, 'snapshot')).currentLang, { timeout: 3_000 })
      .toBe('ko');
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const root = document.getElementById('skillbridge-root')?.shadowRoot;
            return {
              tools: root?.getElementById('si18n-tools-btn')?.getAttribute('aria-label') || '',
              languageLabel: root?.querySelector('.si18n-lang-panel-label')?.textContent?.trim() || '',
              dashboard: root?.getElementById('si18n-dash-btn')?.textContent?.trim() || '',
              flashcards: root?.getElementById('si18n-fc-btn')?.textContent?.trim() || '',
            };
          }),
        { timeout: 3_000 },
      )
      .toEqual({
        tools: '도구',
        languageLabel: '언어 선택',
        dashboard: '내 학습 현황',
        flashcards: '어휘 플래시카드',
      });

    // Exercise the real click path rather than calling the dashboard module
    // directly. The bridge-free language panel must participate in the shared
    // local sub-panel state machine.
    await page.locator('#si18n-tools-btn').click();
    await page.locator('#si18n-dash-btn').click();
    await expect
      .poll(async () => (await evalInContentWorld(extCtx.context, 'readDashboard')).stats, { timeout: 3_000 })
      .toBe(4);
    await expect(page.locator('#si18n-dash-back')).toHaveAttribute('aria-label', '학습 사이드바로 돌아가기');
    await page.locator('#si18n-dash-back').click();

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const select = document
              .getElementById('skillbridge-root')
              ?.shadowRoot?.getElementById('si18n-sidebar-lang-select');
            return { present: !!select, value: select?.value || null };
          }),
        { timeout: 3_000 },
      )
      .toEqual({ present: true, value: 'ko' });

    // The restored select must also have a fresh listener, not just the right
    // visual value. A second language change proves the rebound path.
    await page.evaluate(() => {
      const select = document
        .getElementById('skillbridge-root')
        ?.shadowRoot?.getElementById('si18n-sidebar-lang-select');
      select.value = 'ja';
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    await expect
      .poll(async () => (await evalInContentWorld(extCtx.context, 'snapshot')).currentLang, { timeout: 3_000 })
      .toBe('ja');
  });

  test('page flow makes no bridge, Puter, remote JavaScript, or remote WASM request', async () => {
    await page.waitForTimeout(500);
    const bridgeRequests = requests.filter(
      ({ url }) => url.includes('/src/bridge/puter.js') || url.includes('/src/lib/page-bridge.js'),
    );
    const puterRequests = requests.filter(({ url }) => {
      const host = hostOf(url);
      return /(^|\.)puter\.com$/i.test(host) || host === 'puter-net.b-cdn.net';
    });
    const remoteExecutables = requests.filter(isRemoteExecutableRequest);

    expect(bridgeRequests).toEqual([]);
    expect(puterRequests).toEqual([]);
    expect(remoteExecutables).toEqual([]);
  });
});
