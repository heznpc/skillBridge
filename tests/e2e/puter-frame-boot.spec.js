/**
 * Real vendored Puter boot regression.
 *
 * No SDK stub is installed here. A passive Tutor frame boot must not contact
 * api.puter.com before the user starts Tutor, with or without a stored token.
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

test.describe('SkillBridge — passive Puter frame boot', () => {
  /** @type {{server: import('http').Server, baseUrl: string}} */
  let fixture;

  test.beforeAll(async () => {
    fixture = await startFixtureServer();
  });

  test.afterAll(async () => {
    if (fixture) await stopFixtureServer(fixture.server);
  });

  async function assertPassiveBoot({ storedToken }) {
    const extCtx = await launchExtension({ puterStub: false });
    try {
      if (storedToken) {
        await extCtx.context.addInitScript((token) => {
          if (
            window.location.protocol === 'chrome-extension:' &&
            window.location.pathname.endsWith('/src/bridge/puter-frame.html')
          ) {
            window.localStorage.setItem('puter.auth.token', token);
          }
        }, storedToken);
      }

      const apiTraffic = [];
      extCtx.context.on('request', (request) => {
        if (new URL(request.url()).hostname === 'api.puter.com') {
          apiTraffic.push({ kind: 'request', url: request.url(), method: request.method() });
        }
      });
      const page = await extCtx.context.newPage();
      page.on('websocket', (socket) => {
        if (new URL(socket.url()).hostname === 'api.puter.com') {
          apiTraffic.push({ kind: 'websocket', url: socket.url() });
        }
      });
      await page.goto(`${fixture.baseUrl}/lesson`);

      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        const ready = await evalInContentWorld(extCtx.context, 'bridgeReady');
        if (ready?.isReady) break;
        await page.waitForTimeout(100);
      }
      expect((await evalInContentWorld(extCtx.context, 'bridgeReady'))?.isReady).toBe(true);
      const brokerFrame = page.frames().find((frame) => frame.url().includes('/src/bridge/puter-frame.html'));
      expect(brokerFrame).toBeTruthy();
      if (storedToken) {
        await expect(brokerFrame.evaluate(() => window.localStorage.getItem('puter.auth.token'))).resolves.toBe(
          storedToken,
        );
      }

      // Catch delayed constructor/socket work, not just synchronous boot.
      await page.waitForTimeout(1_000);
      expect(apiTraffic).toEqual([]);
    } finally {
      await closeExtension(extCtx);
    }
  }

  test('fresh profile makes zero api.puter.com requests before Tutor start', async () => {
    await assertPassiveBoot({ storedToken: null });
  });

  test('stored-token profile makes zero api.puter.com requests before Tutor start', async () => {
    await assertPassiveBoot({ storedToken: 'stored-token-regression' });
  });
});
