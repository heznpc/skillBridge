/**
 * SkillBridge — Playwright extension-launch helper.
 *
 * Loads `dist/bundled/` (the production-shape bundle, not raw src/) into a
 * persistent Chromium context. Returns the context plus the dynamically-
 * discovered extension ID so tests can construct chrome-extension:// URLs.
 *
 * The bundled manifest only matches `https://*.skilljar.com/*`. For E2E we
 * copy the bundle to a temp dir and patch the manifest to ALSO match
 * `http://localhost:*` — Playwright's `route().fulfill()` doesn't trigger
 * content-script injection in Chromium MV3 (confirmed empirically against
 * v3.5.15 on 2026-05-13), so we have to serve the fixture from a real
 * local HTTP server. Patching a temp copy keeps `dist/bundled/` itself
 * untouched (it's the artifact we ship).
 *
 * `npm run test:e2e` builds first, and direct spec runs lazily rebuild when
 * the bundle is absent.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { chromium } = require('@playwright/test');
const { evalInContentWorld } = require('./content-world-operations');
const { PUTER_STREAM_STUB } = require('./puter-stream-stub');

const ROOT = path.join(__dirname, '..', '..', '..');
const EXTENSION_SRC = path.join(ROOT, 'dist', 'bundled');
const TEMP_DIRS = new Set();
const SERVICE_WORKER_READY_TIMEOUT_MS = 20_000;

function buildBundleForE2E() {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-bundle.js')], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

function extensionBundleReady() {
  return fs.existsSync(path.join(EXTENSION_SRC, 'manifest.json'));
}

function removeRegisteredTempDir(dir) {
  try {
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  } finally {
    TEMP_DIRS.delete(dir);
  }
}

function cleanupRegisteredTempDirs() {
  for (const dir of Array.from(TEMP_DIRS)) {
    try {
      if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    } catch (_err) {
      // Best-effort cleanup for interrupted Playwright runs.
    } finally {
      TEMP_DIRS.delete(dir);
    }
  }
}

let cleanupHooksRegistered = false;
function registerTempDir(dir) {
  TEMP_DIRS.add(dir);
  if (cleanupHooksRegistered) return;
  cleanupHooksRegistered = true;
  process.once('exit', cleanupRegisteredTempDirs);
}

/**
 * Launch a fresh persistent Chromium context with the extension loaded.
 *
 * `userDataDir` is a per-launch temp directory so successive runs don't
 * accumulate IndexedDB state from previous tests (each persistent context
 * needs its own dir; sharing causes "Failed to lock" errors).
 *
 * @returns {Promise<{context: import('@playwright/test').BrowserContext, extensionId: string, userDataDir: string}>}
 */
/**
 * Copy `dist/bundled/` to a fresh temp dir and patch its manifest's
 * content_scripts.matches to also include http://localhost:*. Returns the
 * patched dir path.
 */
function makePatchedExtension() {
  if (!extensionBundleReady()) {
    buildBundleForE2E();
  }

  let extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillbridge-e2e-ext-'));
  registerTempDir(extDir);
  try {
    fs.cpSync(EXTENSION_SRC, extDir, { recursive: true });
  } catch (_err) {
    removeRegisteredTempDir(extDir);
    buildBundleForE2E();
    extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillbridge-e2e-ext-'));
    registerTempDir(extDir);
    fs.cpSync(EXTENSION_SRC, extDir, { recursive: true });
  }

  return patchExtensionDir(extDir);
}

function patchExtensionDir(extDir) {
  const manifestPath = path.join(extDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const cs of manifest.content_scripts) {
    cs.matches.push('http://localhost:*/*', 'http://127.0.0.1:*/*');
  }
  // Also add localhost to host_permissions and web_accessible_resources so
  // chrome.runtime.getURL() / SW message routing keep working from the
  // fixture page.
  manifest.host_permissions = manifest.host_permissions || [];
  // Port wildcards are required — `http://localhost/*` matches port 80 only.
  // chrome.scripting.executeScript silently refuses to inject without a
  // host_permissions entry that covers the active tab's port.
  manifest.host_permissions.push('http://localhost:*/*', 'http://127.0.0.1:*/*');
  // Tests rely on chrome.scripting (manual injection diagnostics) being
  // available; the production manifest doesn't need it but adding it for
  // E2E doesn't affect runtime behaviour of the content scripts we test.
  manifest.permissions = manifest.permissions || [];
  if (!manifest.permissions.includes('scripting')) manifest.permissions.push('scripting');
  for (const war of manifest.web_accessible_resources || []) {
    war.matches.push('http://localhost:*/*', 'http://127.0.0.1:*/*');
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // Raw/developer artifacts can contain `src/bridge/puter.js`, which must be
  // patched in-place because page-bridge loads it from a chrome-extension URL.
  // The CWS bundle intentionally omits the file, so this branch is a no-op for
  // the current default E2E artifact.
  const puterStubPath = path.join(extDir, 'src', 'bridge', 'puter.js');
  if (fs.existsSync(puterStubPath)) {
    fs.writeFileSync(puterStubPath, PUTER_STREAM_STUB);
  }

  return extDir;
}

async function launchExtension() {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const extensionPath = makePatchedExtension();
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillbridge-e2e-'));
    registerTempDir(userDataDir);
    let context = null;

    try {
      // `channel: 'chromium'` forces the full Chromium browser (not the
      // chromium-headless-shell that Playwright defaults to for headless runs).
      // The shell strips out the extension subsystem entirely — service workers
      // never register, MV3 onInstalled never fires, and the launch hangs on
      // `waitForEvent('serviceworker')`. Full Chromium's new headless mode
      // supports MV3 extensions while using far less memory for full-suite runs.
      // E2E_HEADED=1 forces visible Chromium; useful locally for debugging.
      context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'chromium',
        headless: process.env.E2E_HEADED === '1' ? false : true,
        args: [
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`,
          '--no-first-run',
          '--no-default-browser-check',
          // Lets `--load-extension` take effect; Chromium 121+ guards it
          // behind this feature flag by default.
          '--disable-features=DisableLoadExtensionCommandLineSwitch',
        ],
      });

      // Wait for the service worker to register so we can grab the extension ID.
      // A bad persistent-context launch usually never produces the worker; keep
      // each attempt comfortably below Playwright's 120s beforeAll timeout so
      // the helper can retry instead of letting the hook expire.
      let [serviceWorker] = context.serviceWorkers();
      if (!serviceWorker) {
        serviceWorker = await context.waitForEvent('serviceworker', { timeout: SERVICE_WORKER_READY_TIMEOUT_MS });
      }
      const extensionId = serviceWorker.url().split('/')[2];

      return { context, extensionId, userDataDir, extensionPath };
    } catch (err) {
      lastError = err;
      if (context) {
        try {
          await context.close();
        } catch (_closeErr) {
          // The browser may already be gone after a failed launch.
        }
      }
      removeRegisteredTempDir(userDataDir);
      removeRegisteredTempDir(extensionPath);
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  throw lastError;
}

/**
 * Tear down a context produced by `launchExtension` plus its temp dirs
 * (both the user-data dir and the patched-extension copy).
 */
async function closeExtension({ context, userDataDir, extensionPath }) {
  try {
    await context.close();
  } finally {
    for (const dir of [userDataDir, extensionPath]) {
      if (dir && fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
      TEMP_DIRS.delete(dir);
    }
  }
}

module.exports = { launchExtension, closeExtension, evalInContentWorld, EXTENSION_SRC, makePatchedExtension };
