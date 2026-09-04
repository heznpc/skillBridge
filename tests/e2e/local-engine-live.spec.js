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
const BUNDLE = process.env.SB_EXTENSION_BUNDLE
  ? path.resolve(process.env.SB_EXTENSION_BUNDLE)
  : path.join(ROOT, 'dist', 'bundled');
const OLLAMA = process.env.SB_OLLAMA_BASE_URL || 'http://localhost:11434/v1';
const MODEL = process.env.SB_OLLAMA_MODEL || 'gemma3:4b';

function ollamaModels() {
  return new Promise((resolve) => {
    const req = http.get(`${OLLAMA}/models`, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve(null);
        try {
          return resolve(JSON.parse(body).data?.map((model) => model.id) || []);
        } catch (_err) {
          return resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(null);
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
    const chatUrl = new URL(`${OLLAMA}/chat/completions`);
    const req = http.request(
      {
        host: chatUrl.hostname,
        port: chatUrl.port,
        path: chatUrl.pathname,
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
  let availableModels;

  test.beforeAll(async () => {
    availableModels = await ollamaModels();
    test.skip(!availableModels, `Ollama not reachable at ${OLLAMA}`);
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

    // A Skilljar lesson is both what makes the popup show AI settings and the
    // only kind of surface allowed to open the tutor's chat port. Registered
    // here, not inside a test, so neither test depends on the other running.
    await context.route('https://anthropic.skilljar.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><body><main><h1>Course lesson</h1></main></body></html>',
      }),
    );
  });

  test.afterAll(async () => {
    if (context) await context.close();
    for (const d of [extDir, userDataDir]) {
      if (d && fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
    }
  });

  test('popup selects local engine and the probe reaches the real Ollama server', async () => {
    // Create the popup page FIRST so the later-created lesson tab stays the
    // active tab; the popup then reads the Skilljar tab as the active page
    // (a background tab navigation does not steal focus).
    const popup = await context.newPage();
    const lesson = await context.newPage();
    await lesson.goto('https://anthropic.skilljar.com/live-local', { waitUntil: 'domcontentloaded' });
    await lesson.bringToFront();

    const sw = context.serviceWorkers()[0];
    const manifest = await sw.evaluate(() => chrome.runtime.getManifest());
    // The automated harness owns a temporary port and tells this spec which
    // model it prepared. Seed the same settings a returning user would have so
    // the popup probe and the later tutor stream exercise one configuration.
    await sw.evaluate(
      async ({ baseUrl, model }) => {
        await chrome.storage.local.set({ sb_local_base: baseUrl, sb_local_model: model });
      },
      { baseUrl: OLLAMA, model: MODEL },
    );
    await popup.goto(`chrome-extension://${extensionId}/${manifest.action.default_popup}`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(popup.locator('#engine-field')).toBeVisible();
    await popup.locator('#engine-select').selectOption('local');
    await expect(popup.locator('#local-config')).toBeVisible();
    await expect(popup.locator('#local-base-input')).toHaveValue(OLLAMA);
    await expect(popup.locator('#local-model-input')).toHaveValue(MODEL);

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
    test.skip(
      !availableModels.includes(MODEL),
      `Ollama is reachable but ${MODEL} is not installed. Run npm run test:e2e:ollama to prepare it automatically.`,
    );
    // Drive the exact SW Port path translator._localChatStream uses, against
    // the real model — and from the context that actually uses it. The port is
    // gated to the surfaces `content_scripts` inject into (_isLocalChatPort in
    // background.js), and translator.js — the sole caller of
    // chrome.runtime.connect({name:'sb-local-chat'}) — is a content script on
    // the course sites. An extension page cannot open this port at all, so
    // this drives the lesson tab's ISOLATED world, where the tutor lives.
    const lesson = await context.newPage();
    await lesson.goto('https://anthropic.skilljar.com/live-stream', { waitUntil: 'domcontentloaded' });

    const sw = context.serviceWorkers()[0];
    const result = await sw.evaluate(
      async ({ base, model }) => {
        const [tab] = await chrome.tabs.query({ url: 'https://anthropic.skilljar.com/*' });
        const [injected] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: 'ISOLATED',
          args: [base, model],
          func: (baseUrl, modelName) =>
            new Promise((resolve) => {
              const port = chrome.runtime.connect({ name: 'sb-local-chat' });
              let full = '';
              let chunks = 0;
              const timer = setTimeout(() => resolve({ error: 'timeout', full, chunks }), 60000);
              // A port the gate refuses is disconnected immediately and never
              // answers. Without this the refusal would look identical to a
              // slow model: sixty seconds of silence reported as 'timeout'.
              // A successful stream ends with a 'done' MESSAGE and leaves the
              // port open, so this only ever fires on a real rejection.
              port.onDisconnect.addListener(() => {
                clearTimeout(timer);
                resolve({ error: 'disconnected', full, chunks });
              });
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
                baseUrl,
                model: modelName,
                messages: [{ role: 'user', content: 'Reply with one short word.' }],
              });
            }),
        });
        return injected.result;
      },
      { base: OLLAMA, model: MODEL },
    );

    expect(result.error).toBeUndefined();
    expect(result.chunks).toBeGreaterThan(0);
    // This is a transport test, not a model-quality evaluation. Any non-empty
    // generated text proves the packaged extension carried a real stream from
    // Ollama through the service worker Port and back to the lesson context.
    expect(result.full.trim().length).toBeGreaterThan(0);

    await lesson.close();
  });
});
