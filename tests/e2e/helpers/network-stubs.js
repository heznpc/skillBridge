/**
 * SkillBridge — Playwright network-stub helpers.
 *
 * The extension talks to one external service during the non-Tutor flows that
 * use this helper: translate.googleapis.com, for the GT batch translation pass.
 * (v4.0.0 also stubbed api.github.com for a weekly release-check alarm. That
 * feature and its host permission were removed, so a stub here would only
 * suggest a request the extension no longer makes — the route is gone. If a
 * github.com request ever reappears in a run, that is a finding, not noise.)
 *
 * In E2E we don't want any test traffic leaving the runner, and we want
 * deterministic translations so assertions can match exact strings. These
 * helpers register `context.route()` interceptors covering that. Tutor specs
 * replace the vendored SDK file through helpers/puter-stream-stub.js instead
 * of intercepting a remote script URL.
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
// An officially localized page (Korean bodies, English titles) — see the
// fixture's own header for what each element tests.
const LOCALIZED_HTML = fs.readFileSync(path.join(FIXTURE_DIR, 'localized-lesson.html'), 'utf8');

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
  if (/^\/localized(\/|$|\?)/.test(reqPath)) return LOCALIZED_HTML;
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
  // Localized fixture (/localized): the English residue that SHOULD translate.
  'Tools allow Claude to access information from the outside world.':
    '도구를 사용하면 Claude가 외부 세계의 정보에 접근할 수 있습니다.',
  // Localized fixture (/localized): the English residue that SHOULD translate.
  'Making a request': '요청 만들기',
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
  // DELIBERATELY mistranslated entry. "Anthropic" → "앤스로픽" and
  // "Claude" → "클로드" are exactly the GT mistakes the
  // src/data/ko.json `_protected` map exists to fix. protected-terms.js
  // runs `restoreProtectedTerms()` on every GT batch result before it
  // reaches the DOM, so the user should see "Anthropic" + "Claude" — NOT
  // the wrong forms below. tests/e2e/protected-terms.spec.js asserts
  // exactly that. (NB: 앤스로픽 is a transliteration, not a real word — the
  // ambiguous common-word wrong-forms like 인류학적/인류 were removed from the
  // dictionary because they corrupt correct prose; see protected-terms.test.js.)
  'Anthropic released Claude as a frontier model.': '앤스로픽은 클로드를 프런티어 모델로 출시했습니다.',
  '<p id="p-offline-structured">Read <a id="offline-doc-link" href="/docs">the documentation</a> carefully.</p>':
    '<p id="p-offline-structured"><a id="offline-doc-link" href="/docs">문서</a>를 주의 깊게 읽으세요.</p>',
  // Code-comment fixture (tests/e2e/code-comments.spec.js). The Python
  // `# This is a Claude prompt example` comment gets translated by
  // translateCodeComments — the line's leading `# ` is preserved
  // automatically by the regex, only the trimmed text reaches GT.
  // Deliberately mistranslate "Claude" here as well: code-comments.js is a
  // separate write path from the main GT queue, so it must run protected-term
  // restoration on its own before splicing the translated comment into HTML.
  'This is a Claude prompt example': '클로드 프롬프트 예시',
  // Cache E2E (tests/e2e/idb-cache.spec.js). The string is deliberately
  // NOT in any static dictionary so the first lookup misses → GT call;
  // the second lookup must hit the IDB cache written directly by translate().
  'Cache this course sentence through the IndexedDB translation layer.':
    'IndexedDB 번역 레이어를 통해 이 강의 문장을 캐시하세요.',
  // Lazy translation E2E (tests/e2e/lazy-translate.spec.js). Distinctive
  // strings so we can detect by Hangul presence whether the lazy path
  // queued this paragraph or not.
  'This paragraph is below the lazy-translation horizon and should stay English until scrolled.':
    '이 문단은 지연 번역 지평선 아래에 있어 스크롤하기 전까지 영어로 남아 있어야 합니다.',
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
// Brand/technical terms the extension masks before it calls Google Translate
// (src/lib/protected-terms.js). Longest-first, mirroring the production sort.
const STUB_PROTECTED_TERMS = ['Claude Code', 'Anthropic Academy', 'Anthropic', 'Claude', 'API', 'SDK'];
const MASK_RE = /\u27E6\d+\u27E7/g;
// Wrong renderings used by the deliberately-mistranslated fixture entries, so
// the stub can locate where a term ended up in canned Korean that never spells
// the term out. Kept tiny and explicit — it mirrors GT_KO, not production data.
const STUB_WRONG_FORMS = { Anthropic: ['앤스로픽'], Claude: ['클로드'] };

// Google Translate requests are issued by the background service worker, not
// the page, so `page.on('request')` never sees them. Count here instead — this
// handler is the one place every GT call must pass through.
let gtRequestCount = 0;
// The bodies too, not just the count: "how many requests" cannot tell you
// WHICH block was re-sent, and a cache assertion that counts everything on the
// page is hostage to unrelated content.
let gtRequestBodies = [];
const getGTRequestCount = () => gtRequestCount;
const getGTRequests = () => [...gtRequestBodies];
const resetGTRequestCount = () => {
  gtRequestCount = 0;
  gtRequestBodies = [];
};

/** Replace protected terms with a neutral marker so masked and unmasked forms compare equal. */
function foldProtected(text) {
  let folded = text.replace(MASK_RE, '\u0000');
  for (const term of STUB_PROTECTED_TERMS) {
    folded = folded.replace(new RegExp(`(?<!\\p{L})${term}(?!\\p{L})`, 'gu'), '\u0000');
  }
  return folded;
}

/**
 * Stand in for Google Translate closely enough to exercise brand-term masking.
 *
 * Real GT carries `⟦0⟧`-style placeholders through untouched and translates the
 * words around them (verified 2026-08-19 across all 12 curated locales). A stub
 * that only did an exact-key lookup would miss every masked request and report
 * the page as untranslated, so: match the canned entry with placeholders folded
 * away, then hand back its Korean with the placeholders put back where the
 * corresponding term sat. The extension unmasks and must land on the canned
 * Korean — which is exactly the round trip under test.
 */
function translateLikeGoogle(normalized, map = GT_KO, onMiss = (t) => `[UNTRANSLATED:${t.slice(0, 40)}]`) {
  const placeholders = normalized.match(MASK_RE) || [];
  if (placeholders.length === 0) {
    return map[normalized] || onMiss(normalized);
  }
  const wanted = foldProtected(normalized);
  const sourceKey = Object.keys(map).find((key) => foldProtected(key) === wanted);
  if (!sourceKey) return onMiss(normalized);

  // Terms in the order they appear in the SOURCE line up with the placeholders
  // in the order they appear in the masked request.
  const termOrder = [];
  foldProtected(
    sourceKey.replace(new RegExp(`(?<!\\p{L})(${STUB_PROTECTED_TERMS.join('|')})(?!\\p{L})`, 'gu'), (m) => {
      termOrder.push(m);
      return m;
    }),
  );
  // Put the placeholders back where each term's rendering sits in the canned
  // Korean. Two wrinkles the naive form gets wrong:
  //   - No letter boundary. Korean particles attach directly ("Claude가"), and
  //     Hangul counts as \p{L}, so a boundary-anchored match never fires.
  //   - Some fixture entries are DELIBERATELY mistranslated, so the English
  //     term is absent and the wrong form stands in its place. Real GT can no
  //     longer produce those forms through this path (it never sees the term),
  //     which is precisely what masking guarantees — so the stub maps the wrong
  //     form back to the placeholder to model the post-fix world.
  let out = map[sourceKey];
  termOrder.forEach((term, i) => {
    const placeholder = placeholders[i];
    if (!placeholder) return;
    for (const form of [term, ...(STUB_WRONG_FORMS[term] || [])]) {
      if (!out.includes(form)) continue;
      out = out.replace(form, placeholder);
      return;
    }
  });
  return out;
}

async function registerStubs(context) {
  // The fixture itself is served from a real localhost HTTP server set up
  // separately (see startFixtureServer). Only the EXTERNAL services the
  // extension talks to are intercepted here.

  // Google Translate — return canned Korean for known strings; fall back
  // to a marker so unmapped strings show up clearly in assertions.
  await context.route('https://translate.googleapis.com/**', async (route) => {
    // Opt-in latency, off unless SB_E2E_GT_DELAY_MS is set. The stub normally
    // answers instantly, which hides every race between a DOM write (no
    // network) and the GT round trip that follows it — those only surface on a
    // loaded CI runner, where they look like ordinary flake. Setting a delay
    // makes that ordering deterministic and reproducible on a quiet machine:
    //   SB_E2E_GT_DELAY_MS=800 npx playwright test tests/e2e/protected-terms.spec.js
    if (process.env.SB_E2E_GT_DELAY_MS) {
      await new Promise((r) => setTimeout(r, Number(process.env.SB_E2E_GT_DELAY_MS)));
    }
    const request = route.request();
    const url = new URL(request.url());
    // Since v4 the extension sends `q` in the POST body (lesson text must not
    // sit in a URL, and HTML blocks overrun URL length limits). Read the body
    // first and keep the query fallback so this stub still works if a caller
    // ever uses GET.
    let q = url.searchParams.get('q') || '';
    if (request.method() === 'POST') {
      const body = request.postData() || '';
      q = new URLSearchParams(body).get('q') || '';
    }
    // URLSearchParams decodes both query and form values exactly once.
    const decoded = q;
    // Content-script `el.textContent.trim()` preserves internal whitespace,
    // so the same paragraph can hit GT with embedded newlines/double-spaces
    // depending on HTML formatting. Normalize both sides so our GT_KO map
    // doesn't have to match every whitespace permutation.
    gtRequestCount += 1;
    const normalized = decoded.replace(/\s+/g, ' ').trim();
    gtRequestBodies.push(normalized);
    const translated = translateLikeGoogle(normalized);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildGTResponse(translated)),
    });
  });
}

module.exports = {
  registerStubs,
  startFixtureServer,
  stopFixtureServer,
  FIXTURE_HTML,
  GT_KO,
  buildGTResponse,
  getGTRequestCount,
  getGTRequests,
  resetGTRequestCount,
  translateLikeGoogle,
};
