/**
 * Real vendored Puter boot regression.
 *
 * No SDK stub is installed here. A passive isolated Tutor broker boot must
 * not contact api.puter.com before the user starts Tutor, with or without a
 * stored token.
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

test.describe('SkillBridge — passive isolated Puter broker boot', () => {
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
        const worker = extCtx.context.serviceWorkers()[0];
        const seeded = await worker.evaluate(async (token) => {
          await chrome.storage.local.set({
            sb_puter_auth_token: token,
            sb_puter_app_uid: 'stored-app-regression',
          });
          return (await chrome.storage.local.get('sb_puter_auth_token')).sb_puter_auth_token === token;
        }, storedToken);
        expect(seeded).toBe(true);
      }

      const apiTraffic = [];
      extCtx.context.on('request', (request) => {
        if (new URL(request.url()).hostname === 'api.puter.com') {
          apiTraffic.push({ kind: 'request', url: request.url(), method: request.method() });
        }
      });
      const page = await extCtx.context.newPage();
      const runtimeErrors = [];
      page.on('pageerror', (error) => runtimeErrors.push(error.message));
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
      const broker = await evalInContentWorld(extCtx.context, 'puterBrokerState', storedToken);
      expect(broker?.sdkPresent).toBe(true);
      expect(broker?.privateStorageReady).toBe(true);
      if (storedToken) {
        expect(broker?.liveTokenPresent).toBe(true);
        expect(broker?.liveTokenMatches).toBe(true);
        expect(broker?.persistedTokenMatches).toBe(true);
      }
      expect(await page.evaluate(() => window.localStorage.getItem('puter.auth.token'))).toBeNull();

      // Catch delayed constructor/socket work, not just synchronous boot.
      await page.waitForTimeout(1_000);
      expect(runtimeErrors).toEqual([]);
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

  test('host Puter query parameters fail closed before a stored token can leave the extension', async () => {
    const extCtx = await launchExtension({ puterStub: false });
    try {
      const worker = extCtx.context.serviceWorkers()[0];
      await worker.evaluate(async () => {
        await chrome.storage.local.set({
          sb_puter_auth_token: 'stored-token-must-not-leave',
          sb_puter_app_uid: 'stored-app-must-not-leave',
        });
      });

      const outbound = [];
      extCtx.context.on('request', (request) => {
        const hostname = new URL(request.url()).hostname;
        if (hostname === 'api.puter.com' || hostname === 'evil.example') {
          outbound.push({ url: request.url(), method: request.method() });
        }
      });

      const page = await extCtx.context.newPage();
      await page.goto(
        `${fixture.baseUrl}/lesson?puter.app_instance_id=attacker&puter.api_origin=https%3A%2F%2Fevil.example`,
      );
      await page.waitForTimeout(1_000);

      expect((await evalInContentWorld(extCtx.context, 'bridgeReady'))?.isReady).toBe(false);
      expect(await page.evaluate(() => window.localStorage.getItem('puter.auth.token'))).toBeNull();
      expect(outbound).toEqual([]);
    } finally {
      await closeExtension(extCtx);
    }
  });
});
