/**
 * SkillBridge — Playwright network-stub helpers.
 *
 * The extension talks to three external services:
 *   1. translate.googleapis.com — for the GT batch translation pass
 *   2. api.github.com — for the version-check alarm
 *   3. js.puter.com — for the Puter SDK that powers the AI tutor bridge
 *
 * In E2E we don't want any test traffic leaving the runner, and we want
 * deterministic translations so assertions can match exact strings. These
 * helpers register `context.route()` interceptors covering all three.
 *
 * Also stubs the Skilljar host itself so we don't hit anthropic.skilljar.com
 * from CI.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');

const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'skilljar-lesson.html');
const FIXTURE_HTML = fs.readFileSync(FIXTURE_PATH, 'utf8');

/**
 * Start a tiny localhost HTTP server that serves the Skilljar fixture at
 * `/lesson`. Playwright's context.route().fulfill() doesn't trigger MV3
 * content-script injection (see helpers/extension.js for the rationale),
 * so the fixture must come from a real HTTP origin.
 *
 * Returns `{ server, baseUrl }`; caller closes the server in afterAll.
 */
function startFixtureServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      // Serve fixture for any path — keeps the test forgiving about path shape.
      // The permissive CSP lets the diagnostic bridge in helpers/extension.js
      // use `new Function()` from the content-script isolated world, which
      // would otherwise be blocked by the default page CSP. Production
      // Skilljar pages have their own CSP that doesn't include unsafe-eval,
      // but this only affects our test diagnostic bridge — the extension's
      // own runtime never evals at all.
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        // Permissive CSP — needed so the test diagnostic bridge in
        // helpers/extension.js can use `new Function()` from the
        // content-script isolated world. `script-src` must be explicit;
        // `default-src` alone is overridden by Chrome defaults.
        'Content-Security-Policy':
          "default-src * data: blob: 'unsafe-eval' 'unsafe-inline'; " +
          "script-src * 'unsafe-eval' 'unsafe-inline' data: blob:; " +
          "style-src * 'unsafe-inline'",
      });
      res.end(FIXTURE_HTML);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://localhost:${port}` });
    });
  });
}

function stopFixtureServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

/**
 * Map English source text → Korean output. Used by `translate.googleapis.com`
 * stub. Keep entries surgical — we want assertions like
 * `expect(text).toContain('Claude를 소개합니다')` to be unambiguous.
 *
 * The real GT response shape is `[[ ['translated', 'original', ...], ... ], ...]`.
 */
const GT_KO = {
  'Introduction to Claude': 'Claude 소개',
  'Course overview': '코스 개요',
  'This lesson covers prompt engineering fundamentals and how Claude processes user requests.':
    '이 강의는 프롬프트 엔지니어링의 기초와 Claude가 사용자 요청을 처리하는 방법을 다룹니다.',
  'Anthropic builds AI tools for developers and researchers.': 'Anthropic은 개발자와 연구자를 위한 AI 도구를 만듭니다.',
  'Understand the Claude model family': 'Claude 모델 패밀리 이해하기',
  'Write effective prompts': '효과적인 프롬프트 작성하기',
  'Handle long context conversations': '긴 컨텍스트 대화 처리하기',
  'Key concepts': '핵심 개념',
  'A prompt is the input you give to Claude. Better prompts produce better responses.':
    '프롬프트는 Claude에게 주는 입력입니다. 더 나은 프롬프트는 더 나은 응답을 만듭니다.',
};

/**
 * Build a fake Google Translate response for one query string.
 * @param {string} translated
 * @returns {Array} GT response shape
 */
function buildGTResponse(translated) {
  return [[[translated, '', null, null, 1]], null, 'en'];
}

/**
 * Register every stub on a Playwright context.
 *
 * @param {import('@playwright/test').BrowserContext} context
 */
async function registerStubs(context) {
  // The fixture itself is served from a real localhost HTTP server set up
  // separately (see startFixtureServer). Only the EXTERNAL services the
  // extension talks to are intercepted here.

  // Google Translate — return canned Korean for known strings; fall back
  // to a marker so unmapped strings show up clearly in assertions.
  await context.route('https://translate.googleapis.com/**', async (route) => {
    const url = new URL(route.request().url());
    const q = url.searchParams.get('q') || '';
    const decoded = decodeURIComponent(q);
    // Content-script `el.textContent.trim()` preserves internal whitespace,
    // so the same paragraph can hit GT with embedded newlines/double-spaces
    // depending on HTML formatting. Normalize both sides so our GT_KO map
    // doesn't have to match every whitespace permutation.
    const normalized = decoded.replace(/\s+/g, ' ').trim();
    const translated = GT_KO[normalized] || `[UNTRANSLATED:${normalized.slice(0, 40)}]`;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildGTResponse(translated)),
    });
  });

  // 3. GitHub version check — return our own version so no badge appears
  //    and the alarm path doesn't 403.
  await context.route('https://api.github.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tag_name: 'v3.5.16' }),
    });
  });

  // Puter SDK — serve a stub script. The real SDK injects window.puter,
  // we just need *something* loadable so page-bridge.js doesn't throw on
  // the script-injection step. The tutor itself isn't exercised in the
  // golden test (no chat send) so a no-op puter is enough.
  await context.route('https://js.puter.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'window.puter = window.puter || { ai: { chat: () => Promise.resolve({ message: { content: [] } }) } };',
    });
  });

  // Puter backend — the SDK's whoami / socket.io calls happen as soon as
  // it loads; without stubs they hit the real api.puter.com and pollute
  // logs with 401/400 noise. Return harmless empties.
  await context.route('https://api.puter.com/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

module.exports = { registerStubs, startFixtureServer, stopFixtureServer, FIXTURE_HTML, GT_KO };
