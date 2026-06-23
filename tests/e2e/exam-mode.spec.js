/**
 * SkillBridge — Exam-mode E2E.
 *
 * POSITIONING.md lists "exam awareness" as one of the three product
 * pillars: quiz answer choices are NEVER translated, and proctored
 * certification exams disable the extension entirely. If this contract
 * silently breaks, students get translated answer labels and could be
 * flagged for cheating — existential brand risk.
 *
 * Steps:
 *
 *   Step A — detectExamPage() trips on a quiz URL (`/quiz`) AND/OR on
 *     the quiz DOM shape (`.quiz-form` + `.answer-option`). The fixture
 *     has both, so either path is enough; both being detected is a
 *     positive signal.
 *
 *   Step B — switchLanguage('ko') translates the lesson title and the
 *     question text but LEAVES every `.answer-option` label in English.
 *     This is the actual user-facing exam-mode contract.
 *
 *   Step C — `_sb.translator.staticDict` / GT batch never sees the
 *     answer-option strings (they were filtered by EXAM_SKIP_SELECTORS
 *     before GT was called). We assert via DOM: answer text === original
 *     English. Indirect but sufficient.
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

test.describe('SkillBridge — exam-mode flow', () => {
  /** @type {Awaited<ReturnType<typeof launchExtension>>} */
  let extCtx;
  /** @type {import('@playwright/test').Page} */
  let page;
  /** @type {{server: import('http').Server, baseUrl: string}} */
  let fixture;

  test.beforeAll(async () => {
    fixture = await startFixtureServer();
    extCtx = await launchExtension();
    await registerStubs(extCtx.context);
    page = await extCtx.context.newPage();
    page.on('pageerror', (err) => console.log('[page:pageerror]', err.message));
  });

  async function gotoAndWait(path) {
    // /quiz triggers EXAM_URL_PATTERNS[0]. The fixture also has the DOM
    // shape that detectExamPage's DOM-path uses, as a redundancy.
    await page.goto(`${fixture.baseUrl}${path}`);

    const deadline = Date.now() + 15_000;
    let snap = null;
    while (Date.now() < deadline) {
      snap = await evalInContentWorld(extCtx.context, 'snapshot');
      if (snap?.init && snap?.sb && snap?.methods?.gt && snap?.methods?.chat) break;
      await page.waitForTimeout(200);
    }
    if (!snap?.init || !snap?.sb) {
      throw new Error(`SkillBridge didn't initialize on ${path} after 15s: ${JSON.stringify(snap)}`);
    }
  }

  test.afterAll(async () => {
    if (extCtx) await closeExtension(extCtx);
    if (fixture) await stopFixtureServer(fixture.server);
  });

  test('step A: detectExamPage trips on /quiz URL + .quiz-form DOM', async () => {
    await gotoAndWait('/quiz');

    const { isExamPage } = await evalInContentWorld(extCtx.context, 'examStatus');
    expect(isExamPage).toBe(true);
  });

  test('step B: switchLanguage(ko) translates question but NOT answer options', async () => {
    await gotoAndWait('/quiz');

    const before = await evalInContentWorld(extCtx.context, 'quizText');
    expect(before.title).toBe('Claude Fundamentals Quiz');
    expect(before.question).toBe('Which model is best suited for fast, high-volume classification tasks?');
    // Pre-translation: every answer-option label has its English text.
    expect(before.answers).toHaveLength(4);
    expect(before.answers[1]).toContain('Claude Haiku');

    await evalInContentWorld(extCtx.context, 'switchLanguage', 'ko');

    // Poll until the title swaps (the GT batch lands fire-and-forget).
    const deadline = Date.now() + 10_000;
    let after = before;
    while (Date.now() < deadline) {
      after = await evalInContentWorld(extCtx.context, 'quizText');
      if (after.title && after.title !== before.title) break;
      await page.waitForTimeout(200);
    }

    // Question + title translated.
    expect(after.title).toBe('Claude 기초 퀴즈');
    expect(after.question).toContain('가장 적합');

    // EVERY answer-option label remains in English. This is the bright-line
    // exam-mode contract — if any of these flip to a translated string we
    // ship a real cheating-tool risk to users.
    expect(after.answers).toHaveLength(4);
    for (let i = 0; i < after.answers.length; i++) {
      const text = after.answers[i] || '';
      // Quick sanity: no Hangul characters.
      expect.soft(/[가-힯]/.test(text), `answer[${i}] should be untranslated (got "${text}")`).toBe(false);
    }
    // Stronger: each known English phrase still present verbatim.
    expect(after.answers[0]).toContain('Claude Opus');
    expect(after.answers[0]).toContain('longest reasoning chains');
    expect(after.answers[1]).toContain('Claude Haiku');
    expect(after.answers[1]).toContain('high-throughput');
    expect(after.answers[2]).toContain('Claude Sonnet');
    expect(after.answers[2]).toContain('balanced general-purpose model');
    expect(after.answers[3]).toContain('None of the above');
  });

  test('step C: an answer-option inserted AFTER the initial pass (SPA quiz render) stays English', async () => {
    await gotoAndWait('/quiz');
    await evalInContentWorld(extCtx.context, 'switchLanguage', 'ko');

    // step B covers answers present at load (filtered by getTranslatableElements).
    // This locks the shared chokepoint in processOneElement: a Skilljar quiz that
    // renders its answers LATE (SPA) must not leak them via the MutationObserver
    // path. Insert a new .answer-option whose text the GT stub WOULD translate (the
    // question string — step B showed it becomes Korean), then assert the mutation
    // observer left it English.
    const probe = 'Which model is best suited for fast, high-volume classification tasks?';
    await page.evaluate((txt) => {
      const form = document.querySelector('.quiz-form') || document.body;
      // Mirror the fixture's real answer shape: <label class="answer-option"> — a
      // <label> matches TRANSLATABLE_SELECTOR (a bare <div> does not, which is why
      // the shape matters), so the mutation path actually reaches processOneElement.
      const opt = document.createElement('label');
      opt.className = 'answer-option';
      opt.id = 'sb-late-answer';
      opt.textContent = txt;
      form.appendChild(opt);
    }, probe);

    // Let the MutationObserver → debounce → (would-be) GT batch run.
    await page.waitForTimeout(2500);

    const text = await page.evaluate(() => document.getElementById('sb-late-answer')?.textContent || '');
    // No Hangul: the late-inserted answer was skipped at the chokepoint, not translated.
    expect(/[가-힯]/.test(text), `late-inserted answer must stay English (got "${text}")`).toBe(false);
    expect(text).toContain('high-volume classification');
  });

  test('step D: a quiz answer that renders LATE on a NON-exam URL re-trips exam mode and stays English', async () => {
    // Steps A–C all run on /quiz, where detectExamPage trips on the URL at init,
    // so isExamPage is already true before any answer is processed. They never
    // exercise the OTHER chokepoint entry: a lesson on a plain (non-exam) URL whose
    // quiz answers render AFTER the language switch. applyStaticTranslations re-detects
    // exam mode, but only at switch time — by then this page has no quiz DOM, so it
    // stays false. The mutation path (debounceTranslateNew) is the ONLY thing that can
    // re-detect for answers inserted later; without that re-detect the chokepoint never
    // fires and the answer leaks (translated, cached, Gemini-verified). This locks it.
    await gotoAndWait('/lesson');
    // Precondition: a plain /lesson URL is NOT exam-detected at init. This is exactly
    // what makes the mutation-path re-detect load-bearing — there is no URL signal.
    const pre = await evalInContentWorld(extCtx.context, 'examStatus');
    expect(pre.isExamPage, 'a /lesson URL must NOT be exam-detected at init').toBe(false);

    // Switch to Korean and let applyStaticTranslations settle while the page still has
    // NO quiz DOM — so its re-detect sees nothing and isExamPage stays false.
    await evalInContentWorld(extCtx.context, 'switchLanguage', 'ko');
    await page.waitForTimeout(1500);

    // Now the quiz renders (SPA/AJAX). Use a string the GT stub DOES translate to
    // Hangul ('Introduction to Claude' → 'Claude 소개'); an unknown string would come
    // back as a non-Hangul [UNTRANSLATED:…] marker and false-pass the no-Hangul check.
    await page.evaluate(() => {
      const root = document.getElementById('lesson-main') || document.body;
      const form = document.createElement('form');
      form.className = 'quiz-form';
      const opt = document.createElement('label');
      opt.className = 'answer-option';
      opt.id = 'sb-nonexam-answer';
      opt.textContent = 'Introduction to Claude';
      form.appendChild(opt);
      root.appendChild(form);
    });

    // Let the MutationObserver → debounce → re-detect → (would-be) GT batch run.
    await page.waitForTimeout(2500);

    const text = await page.evaluate(() => document.getElementById('sb-nonexam-answer')?.textContent || '');
    const post = await evalInContentWorld(extCtx.context, 'examStatus');
    // The mutation path must have re-tripped exam mode from the freshly-rendered DOM…
    expect(post.isExamPage, 'late quiz DOM must re-trip exam mode via the mutation path').toBe(true);
    // …and skipped the answer at the chokepoint, leaving it English (no Hangul).
    expect(/[가-힯]/.test(text), `non-exam-URL late answer must stay English (got "${text}")`).toBe(false);
    expect(text).toBe('Introduction to Claude');
  });
});
