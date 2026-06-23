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
 *   2. `workers: process.env.CI ? 2 : 1` — `launchExtension` builds a
 *      fresh per-launch temp dir for the user data + patched-manifest
 *      copy, so parallel workers are safe (no shared mutable state).
 *      Locally we keep workers=1 so the output is easier to read while
 *      debugging; CI parallelizes for wall-time. Each spec has its own
 *      Chromium + extension load (~15s cold start), so two workers
 *      roughly halve the total e2e job time once we have 4+ specs.
 *   3. `timeout: 120_000` because the first launch (cold cache, extension
 *      install, service-worker registration) can take 5–10s before any
 *      page navigation is even possible; full-suite local runs can also
 *      spend tens of seconds in Chromium process teardown between specs.
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
  // `workers` controls cross-FILE parallelism. `fullyParallel: false`
  // keeps WITHIN-file specs sequential — which we want because chat-
  // history.spec.js relies on the sequential setup ordering of its
  // beforeAll. CI=2 was measured to take ~3m vs sequential ~7m on 8
  // specs; bumping further hits Chromium-instance memory ceilings on
  // ubuntu-latest's 2-vCPU / 7GB runners.
  workers: process.env.CI ? 2 : 1,
  timeout: 120_000,
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
