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

const FIXTURE_DIR = path.join(__dirname, '..', 'fixtures');
const LESSON_HTML = fs.readFileSync(path.join(FIXTURE_DIR, 'skilljar-lesson.html'), 'utf8');
const QUIZ_HTML = fs.readFileSync(path.join(FIXTURE_DIR, 'skilljar-quiz.html'), 'utf8');

// Kept exported for back-compat with anything that imported it; new tests
// should use the path-aware server directly.
const FIXTURE_HTML = LESSON_HTML;

/**
 * Pick the fixture body for a given request path. Routes:
 *   /quiz, /exam, /assessment   → quiz fixture (matches EXAM_URL_PATTERNS)
 *   anything else               → lesson fixture
 */
function fixtureForPath(reqPath) {
  if (/^\/(quiz|exam|assessment)(\/|$|\?)/.test(reqPath)) return QUIZ_HTML;
  return LESSON_HTML;
}

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
      const body = fixtureForPath(req.url || '/');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy':
          "default-src * data: blob: 'unsafe-eval' 'unsafe-inline'; " +
          "script-src * 'unsafe-eval' 'unsafe-inline' data: blob:; " +
          "style-src * 'unsafe-inline'",
      });
      res.end(body);
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
  // Lesson fixture
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
  // DELIBERATELY mistranslated entry. "Anthropic" → "인류학적" and
  // "Claude" → "클로드" are exactly the GT mistakes the
  // src/data/ko.json `_protected` map exists to fix. protected-terms.js
  // runs `restoreProtectedTerms()` on every GT batch result before it
  // reaches the DOM, so the user should see "Anthropic" + "Claude" — NOT
  // the wrong forms below. tests/e2e/protected-terms.spec.js asserts
  // exactly that.
  'Anthropic released Claude as a frontier model.': '인류학적은 클로드를 프런티어 모델로 출시했습니다.',
  // Code-comment fixture (tests/e2e/code-comments.spec.js). The Python
  // `# This is a Claude prompt example` comment gets translated by
  // translateCodeComments — the line's leading `# ` is preserved
  // automatically by the regex, only the trimmed text reaches GT.
  'This is a Claude prompt example': 'Claude 프롬프트 예시',
  // Quiz fixture — question text translates, answer options should NOT
  // reach this map at all (the EXAM_SKIP_SELECTORS path filters them out
  // before GT is even called). If they DO appear here it's a regression.
  'Claude Fundamentals Quiz': 'Claude 기초 퀴즈',
  'Which model is best suited for fast, high-volume classification tasks?':
    '어떤 모델이 빠르고 대용량 분류 작업에 가장 적합합니까?',
  // SPA-navigation second-lesson fixture content (injected via the
  // `replaceBodyAndPushState` diagnostic op, not served from a separate
  // HTTP route). Used by tests/e2e/spa-navigation.spec.js.
  'Advanced prompt engineering': '고급 프롬프트 엔지니어링',
  'Chain of thought prompting improves Claude reasoning on multi-step tasks.':
    '연쇄 추론 프롬프팅은 Claude가 다단계 작업에서 추론하는 능력을 향상시킵니다.',
  'Use XML tags to delimit sections': 'XML 태그로 섹션을 구분하세요',
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

  // Puter SDK stub. Two callers exercise this:
  //   - golden / exam / SPA specs never send a chat, so they only need
  //     `window.puter.ai` to exist so page-bridge.js's `loadPuter()` resolves
  //     and emits BRIDGE_READY (which flips translator.isReady=true).
  //   - tutor-chat spec sends a chat — for that the `chat(prompt, opts)` fn
  //     must (a) when called with `{stream:true}`, return an async iterable
  //     yielding `{text}` chunks (the real SDK's contract; see page-bridge
  //     `for await (const chunk of response)` loop), and (b) when called
  //     non-streaming, return `{message:{content:'...'}}`.
  //
  // We hardcode a Korean-ish three-chunk reply so the tutor-chat spec can
  // assert the streamed text shows up in the bot bubble verbatim.
  const PUTER_STUB = `
    (function () {
      const STREAM_CHUNKS = ['안녕하세요! ', '프롬프트는 Claude에게 ', '주는 입력입니다.'];
      window.puter = {
        ai: {
          chat: async function (prompt, opts) {
            if (opts && opts.stream) {
              return {
                [Symbol.asyncIterator]() {
                  let i = 0;
                  return {
                    async next() {
                      // Throttle slightly so the test sees incremental
                      // chunks, not a single batch — exercising the
                      // CHAT_STREAM_CHUNK → onChunk → DOM-update path.
                      await new Promise((r) => setTimeout(r, 20));
                      if (i >= STREAM_CHUNKS.length) return { done: true };
                      return { done: false, value: { text: STREAM_CHUNKS[i++] } };
                    },
                  };
                },
              };
            }
            return { message: { content: STREAM_CHUNKS.join('') } };
          },
        },
      };
    })();
  `;
  await context.route('https://js.puter.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: PUTER_STUB,
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
