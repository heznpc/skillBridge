/**
 * Playwright config for the SkillBridge E2E suite.
 *
 * Why this looks different from typical web-app Playwright configs:
 *   1. Browser launch goes through `chromium.launchPersistentContext` (not
 *      `browser.newContext`) so we can pass `--load-extension`. Headless
 *      Chrome historically couldn't load extensions; the new "headless=new"
 *      mode supports it, and we set `headless: false` here to be safe
 *      because some older runners (and earlier Playwright versions) still
 *      fail silently with --load-extension under the old headless flag.
 *   2. `workers: 1` because the extension claims a single user-data dir.
 *      Parallel workers would race on it and produce confusing failures.
 *   3. `timeout: 60_000` because the first launch (cold cache, extension
 *      install, service-worker registration) can take 5–10s before any
 *      page navigation is even possible.
 *
 * Each spec is responsible for its own launch — see
 * tests/e2e/helpers/extension.js for the boilerplate. The default
 * `chromium` project below exists so `npx playwright test` works, but the
 * specs construct their own contexts directly.
 */

const { defineConfig } = require('@playwright/test');
const path = require('path');

module.exports = defineConfig({
  testDir: path.join(__dirname, 'tests', 'e2e'),
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    // The translate path is async — give DOM-text assertions a slightly
    // wider window than the default 5s.
    timeout: 10_000,
  },
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  use: {
    headless: true, // headless=new supports --load-extension since Chrome 121
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
