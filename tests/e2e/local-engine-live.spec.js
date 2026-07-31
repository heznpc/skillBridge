/**
 * SkillBridge — LIVE local-engine round trip (v4 A5).
 *
 * Unlike the rest of the E2E suite this test does NOT stub the AI backend:
 * it drives the real packaged extension against a REAL Ollama server on
 * http://localhost:11434.
 *
 * PREREQUISITE, and not just reachability: start the server as
 *   OLLAMA_ORIGINS='chrome-extension://*' ollama serve
 * Ollama answers 403 to the extension origin by default. Chrome omits the
 * `Origin` header on a bodyless GET and attaches
 * `Origin: chrome-extension://<id>` to the JSON POST, so `/v1/models` can
 * return 200 while every tutor request is rejected. Both preconditions are
 * checked below and skip with an actionable reason rather than going red.
 *
 * It also isolates a real correctness question about the shipped manifest:
 * `optional_host_permissions` declares `http://localhost/*` (no explicit
 * port). This test grants EXACTLY that pattern as a host permission, so if
 * Chrome did not authorize a service-worker fetch to :11434 under it, the
 * probe would fail and this test would go red.
 *
 * Covered in a real Chromium MV3 context:
 *   1. popup UI → select "local" → SW CHECK_LOCAL_ENGINE → real Ollama probe
 *   2. chrome.runtime Port 'sb-local-chat' → SW _streamLocalChat → real
 *      Ollama streaming → tokens back to the caller (the exact SW path the
 *      tutor's translator._localChatStream drives).
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { test, expect, chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..', '..');
const BUNDLE = path.join(ROOT, 'dist', 'bundled');
const OLLAMA = 'http://localhost:11434/v1';
const MODEL = 'gemma3:4b';

function ollamaReachable() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:11434/v1/models', (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Status of the request shape the tutor actually sends. Node attaches no
// `Origin` of its own, so this supplies the one Chrome would — that header is
// what Ollama judges, and without it this probe would see 200 and learn
// nothing about what the extension will get. An empty body is rejected by
// request validation (400) on a permitted origin, so no model is loaded.
function chatOriginStatus() {
  return new Promise((resolve) => {
    const body = '{}';
    const req = http.request(
      {
        host: 'localhost',
        port: 11434,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Origin: `chrome-extension://${'a'.repeat(32)}`,
        },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on('error', () => resolve(0));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(0);
    });
    req.end(body);
  });
}

// Patch a copy of the shipped bundle: promote the EXACT shipped optional
// localhost pattern to a granted host permission (so no runtime dialog is
// needed and the port-pattern question is exercised for real), add the
// localhost content-script match, and keep the real puter bridge untouched.
function makeLiveExtension() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-live-ext-'));
  fs.cpSync(BUNDLE, dir, { recursive: true });
  const mfPath = path.join(dir, 'manifest.json');
  const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
  // Grant exactly the shipped optional pattern — NOT a :* port wildcard.
  mf.host_permissions = [...(mf.host_permissions || []), ...(mf.optional_host_permissions || [])];
  for (const cs of mf.content_scripts) cs.matches.push('http://localhost:*/*');
  mf.permissions = mf.permissions || [];
  if (!mf.permissions.includes('scripting')) mf.permissions.push('scripting');
  fs.writeFileSync(mfPath, JSON.stringify(mf, null, 2));
  return dir;
}

test.describe('SkillBridge — LIVE local engine (real Ollama)', () => {
  let context;
  let extensionId;
  let extDir;
  let userDataDir;

  test.beforeAll(async () => {
    test.skip(!(await ollamaReachable()), 'Ollama not reachable on localhost:11434');
    test.skip(
      (await chatOriginStatus()) === 403,
      'Ollama is reachable but rejects the chrome-extension origin, so the tutor cannot stream and ' +
        'this spec cannot prove the round trip. Restart it with ' +
        "OLLAMA_ORIGINS='chrome-extension://*' ollama serve",
    );
    extDir = makeLiveExtension();
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-live-ud-'));
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: process.env.E2E_HEADED === '1' ? false : true,
      args: [
        `--disable-extensions-except=${extDir}`,
        `--load-extension=${extDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-features=DisableLoadExtensionCommandLineSwitch',
      ],
    });
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 20000 });
    extensionId = sw.url().split('/')[2];
  });

  test.afterAll(async () => {
    if (context) await context.close();
    for (const d of [extDir, userDataDir]) {
      if (d && fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
    }
  });

  test('popup selects local engine and the probe reaches the real Ollama server', async () => {
    // Popup shows the AI settings only on a supported page — serve a Skilljar lesson.
    await context.route('https://anthropic.skilljar.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><body><main><h1>Course lesson</h1></main></body></html>',
      }),
    );
    // Create the popup page FIRST so the later-created lesson tab stays the
    // active tab; the popup then reads the Skilljar tab as the active page
    // (a background tab navigation does not steal focus).
    const popup = await context.newPage();
    const lesson = await context.newPage();
    await lesson.goto('https://anthropic.skilljar.com/live-local', { waitUntil: 'domcontentloaded' });
    await lesson.bringToFront();

    const sw = context.serviceWorkers()[0];
    const manifest = await sw.evaluate(() => chrome.runtime.getManifest());
    await popup.goto(`chrome-extension://${extensionId}/${manifest.action.default_popup}`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(popup.locator('#engine-field')).toBeVisible();
    // Point the model at what this machine actually has, then select local.
    await popup.locator('#engine-select').selectOption('local');
    await expect(popup.locator('#local-config')).toBeVisible();

    // The probe classifies reachability against the REAL server. Under the
    // shipped `http://localhost/*` grant, the SW fetch to :11434 must succeed.
    await expect(popup.locator('#local-status')).toHaveText(/Connected to local server|로컬 서버에 연결됨/, {
      timeout: 15000,
    });

    // Storage reflects the choice (what translator.chatStream reads).
    const engine = await sw.evaluate(async () => (await chrome.storage.local.get('sb_ai_engine')).sb_ai_engine);
    expect(engine).toBe('local');

    await popup.close();
    await lesson.close();
  });

  test('the tutor Port streams real tokens from Ollama end to end', async () => {
    // Drive the exact SW Port path translator._localChatStream uses, from a
    // real extension page context, against the real model.
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`, { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(
      ({ base, model }) =>
        new Promise((resolve) => {
          const port = chrome.runtime.connect({ name: 'sb-local-chat' });
          let full = '';
          let chunks = 0;
          const timer = setTimeout(() => resolve({ error: 'timeout', full, chunks }), 60000);
          port.onMessage.addListener((msg) => {
            if (msg.type === 'chunk') {
              chunks++;
              full += msg.delta;
            } else if (msg.type === 'done') {
              clearTimeout(timer);
              resolve({ full, chunks });
            } else if (msg.type === 'error') {
              clearTimeout(timer);
              resolve({ error: msg.error, full, chunks });
            }
          });
          port.postMessage({
            type: 'start',
            baseUrl: base,
            model,
            messages: [{ role: 'user', content: 'Reply with exactly the word: BRIDGE' }],
          });
        }),
      { base: OLLAMA, model: MODEL },
    );

    expect(result.error).toBeUndefined();
    expect(result.chunks).toBeGreaterThan(0);
    expect(result.full.length).toBeGreaterThan(0);
    // The model was asked to say BRIDGE — a loose check that real content flowed.
    expect(result.full.toUpperCase()).toContain('BRIDGE');

    await page.close();
  });
});
