/**
 * SkillBridge — the Claude Academy lesson ↔ quiz lifecycle.
 *
 * Academy is a different application from Skilljar, and every signal the
 * Skilljar exam path relies on is missing there: no <form>, no
 * input[type=radio], ARIA roles instead of class names, and assessment routes
 * named after their subject (`/quiz-on-…`, `/final-assessment`) which the
 * segment-anchored EXAM_URL_PATTERNS do not match. Run the Skilljar path
 * against Academy and it does not degrade — it detects nothing, leaves
 * exam-safe off, and lets answer choices be translated and quoted to the
 * tutor.
 *
 * Two things are proved here that unit tests structurally cannot.
 *
 * 1. THE WALK. lesson → quiz → lesson → quiz, driven through the real route
 *    controller and the real MutationObserver rather than by calling the
 *    lifecycle directly. The release half is the one with a scar: protection
 *    used to stick ON after leaving a quiz, because a route change re-detected
 *    synchronously against the previous page's DOM and the mutation pass that
 *    would have corrected it could only ever turn protection on.
 *
 * 2. AT ENGLISH. The whole walk runs with the target language left at English.
 *    That is where the bug hid — the observer skipped mutations outright when
 *    nothing was being translated, so safety was a side effect of translating
 *    and an English reader got a late-rendering quiz with no guard at all.
 *
 * The Academy code path is selected by swapping `sb.hostCaps`, which is the
 * seam production code reads: detectExamPage() and routeIsExamPage() both
 * branch on `hostCaps.platform` at call time. E2E runs on localhost, and
 * localhost deliberately gets the Skilljar profile — a released build must
 * never hand a local page a real host's capabilities — so a spec that wants
 * the Academy detector has to ask for it. Nothing about detection itself is
 * stubbed.
 */

const { test, expect } = require('@playwright/test');
const { SETTLE_MS } = require('./helpers/timeouts');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const {
  registerStubs,
  startFixtureServer,
  stopFixtureServer,
  getGTRequests,
  resetGTRequestCount,
} = require('./helpers/network-stubs');

const LESSON_PATH = '/academy/courses/building-with-the-claude-api/accessing-claude-with-the-api';
const QUIZ_PATH = '/academy/courses/building-with-the-claude-api/quiz-on-accessing-claude-with-the-api';
const ASSESSMENT_PATH = '/academy/courses/building-with-the-claude-api/final-assessment';

/**
 * Fragments of answer-choice text that must never leave the page.
 *
 * Nonsense words on purpose. A real distractor ("Claude Haiku — for
 * high-throughput tasks") shares most of its vocabulary with the lesson body,
 * so finding it in a request proves nothing about which element it came from.
 * These appear in exactly one place in the fixture.
 */
const CHOICE_FRAGMENTS = [
  'Zebra-cipher-alpha',
  'Marmalade-vector-bravo',
  'Quartzite-harbor-charlie',
  'Pelican-lantern-delta',
];

test.describe('SkillBridge — Claude Academy lesson ↔ quiz lifecycle', () => {
  /** @type {Awaited<ReturnType<typeof launchExtension>>} */
  let extCtx;
  /** @type {import('@playwright/test').Page} */
  let page;
  /** @type {{server: import('http').Server, baseUrl: string}} */
  let fixture;

  /** Wait for the content script to finish booting on the current page. */
  async function waitForBoot() {
    const deadline = Date.now() + SETTLE_MS;
    let snap = null;
    while (Date.now() < deadline) {
      snap = await evalInContentWorld(extCtx.context, 'snapshot');
      if (snap?.init && snap?.sb && snap?.methods?.gt) return snap;
      await page.waitForTimeout(200);
    }
    throw new Error(`SkillBridge did not initialize: ${JSON.stringify(snap)}`);
  }

  /** Load a fixture route from a cold navigation, then select the Academy profile. */
  async function gotoAcademy(path) {
    await page.goto(`${fixture.baseUrl}${path}`);
    await waitForBoot();
    await evalInContentWorld(extCtx.context, 'useAcademyProfile');
    await evalInContentWorld(extCtx.context, 'settleExamState');
  }

  /** The fixture body a real client-side navigation would have fetched. */
  async function fetchFixture(path) {
    const res = await fetch(`${fixture.baseUrl}${path}`);
    const html = await res.text();
    return html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
  }

  /**
   * One client-side navigation: swap the body and push the new path, exactly
   * as `replaceBodyAndPushState` does for the Skilljar SPA spec. The wrapped
   * history.pushState fires the route controller; the MutationObserver then
   * sees the swap and settles the state.
   */
  async function spaNavigate(path, expectExam) {
    const html = await fetchFixture(path);
    await evalInContentWorld(extCtx.context, 'replaceBodyAndPushState', { html, path });

    // Poll for the value the lifecycle settles on, with NOTHING forced. The
    // settle here has to come from the real MutationObserver and its debounce,
    // because "the DOM-settled pass runs at all" is half of what this walk is
    // proving — calling onExamDomSettled() directly would assert the detector
    // and skip the wiring. The expectation is passed in only to end the poll
    // early on success; the caller still asserts, so a wrong value fails at the
    // deadline with the state that was actually observed.
    const deadline = Date.now() + SETTLE_MS;
    let state = null;
    while (Date.now() < deadline) {
      state = await evalInContentWorld(extCtx.context, 'examState');
      if (state?.url?.includes(path) && state.isExamPage === expectExam) return state;
      await page.waitForTimeout(100);
    }
    return state;
  }

  test.beforeAll(async () => {
    fixture = await startFixtureServer();
    extCtx = await launchExtension();
    await registerStubs(extCtx.context);
    page = await extCtx.context.newPage();
    page.on('pageerror', (err) => console.log('[page:pageerror]', err.message));
  });

  test.afterAll(async () => {
    await closeExtension(extCtx);
    await stopFixtureServer(fixture.server);
  });

  test('step A: an Academy lesson is not an assessment, and the Skilljar path would agree', async () => {
    await gotoAcademy(LESSON_PATH);
    const state = await evalInContentWorld(extCtx.context, 'examState');
    expect(state.isExamPage, 'a lesson route with no choice roles must not be exam-detected').toBe(false);
    expect(state.choiceCount, 'the lesson fixture must carry no answer choices at all').toBe(0);
  });

  test('step B: an Academy quiz IS detected, on a route the Skilljar patterns miss', async () => {
    await gotoAcademy(QUIZ_PATH);
    const state = await evalInContentWorld(extCtx.context, 'examState');
    expect(state.isExamPage, '/quiz-on-… must be detected as an assessment').toBe(true);
    expect(state.choiceCount, 'the quiz fixture must render ARIA choice roles').toBe(4);

    // The point of the previous assertion: the Skilljar URL patterns anchor
    // `/quiz` to the end of a segment, so this route is invisible to them.
    // If this ever starts matching, the Academy adapter is no longer the thing
    // being exercised and step B stops meaning anything.
    const skilljarWouldMatch = /\/(quiz|exam|assessment)(\/|$|\?)/.test(QUIZ_PATH);
    expect(skilljarWouldMatch, 'the Skilljar URL patterns must NOT match an Academy quiz route').toBe(false);
  });

  test('step C: the full lesson → quiz → lesson → quiz walk, with the target left at English', async () => {
    await gotoAcademy(LESSON_PATH);
    const lang = (await evalInContentWorld(extCtx.context, 'snapshot')).currentLang;
    expect(lang, 'this walk is only meaningful with nothing being translated').toBe('en');

    expect((await evalInContentWorld(extCtx.context, 'examState')).isExamPage).toBe(false);

    const onQuiz = await spaNavigate(QUIZ_PATH, true);
    expect(onQuiz.isExamPage, 'lesson → quiz must protect').toBe(true);

    // The release. Protection used to stick here: the route change re-detected
    // synchronously against the quiz DOM still on screen, and the mutation
    // pass that would have corrected it could only turn protection on.
    const backOnLesson = await spaNavigate(LESSON_PATH, false);
    expect(backOnLesson.isExamPage, 'quiz → lesson must RELEASE once the lesson DOM is there').toBe(false);
    expect(backOnLesson.choiceCount, 'the lesson DOM really did replace the quiz DOM').toBe(0);

    const onSecondQuiz = await spaNavigate(ASSESSMENT_PATH, true);
    expect(onSecondQuiz.isExamPage, 'lesson → assessment must protect again').toBe(true);
  });

  test('step D: a quiz that renders LATE, on a lesson route, still protects at English', async () => {
    // The other entry: no assessment signal in the URL at all, and the choices
    // arrive after the page has settled. Nothing is being translated, so the
    // only thing that can notice is the observer's own safety pass — which is
    // exactly what used to be skipped when the target was English.
    await gotoAcademy(LESSON_PATH);
    expect((await evalInContentWorld(extCtx.context, 'examState')).isExamPage).toBe(false);

    const quizBody = await fetchFixture(QUIZ_PATH);
    await evalInContentWorld(extCtx.context, 'replaceBodyAndPushState', { html: quizBody, path: LESSON_PATH });

    const deadline = Date.now() + SETTLE_MS;
    let state = null;
    while (Date.now() < deadline) {
      state = await evalInContentWorld(extCtx.context, 'examState');
      if (state.isExamPage) break;
      await page.waitForTimeout(100);
    }
    expect(state.isExamPage, 'a late-rendering quiz must trip exam mode through the observer alone').toBe(true);
  });

  test('step E: answer-choice text reaches neither Google Translate nor the tutor', async () => {
    await gotoAcademy(QUIZ_PATH);
    expect((await evalInContentWorld(extCtx.context, 'examState')).isExamPage).toBe(true);

    const onPage = await evalInContentWorld(extCtx.context, 'academyChoiceText');
    expect(onPage.choices.length, 'the choices must actually be on the page to be worth protecting').toBe(4);

    // The tutor context is built from the live page every time it is sent.
    const { context } = await evalInContentWorld(extCtx.context, 'tutorContext');
    for (const fragment of CHOICE_FRAGMENTS) {
      expect(context, `tutor context must not carry "${fragment}"`).not.toContain(fragment);
    }

    // Now translate, which is what puts text on the wire at all. Assertions
    // are on the GT REQUEST BODIES rather than on the rendered DOM: a choice
    // that was sent and came back untranslated still leaked.
    resetGTRequestCount();
    await evalInContentWorld(extCtx.context, 'switchLanguage', 'ko');

    const deadline = Date.now() + SETTLE_MS;
    while (Date.now() < deadline) {
      const bodies = getGTRequests().join('\n');
      // The question stem is the positive control — it proves translation
      // really ran, so the absence assertions below are about exclusion and
      // not about nothing having happened.
      if (bodies.includes('Which header carries the credential')) break;
      await page.waitForTimeout(200);
    }

    const bodies = getGTRequests().join('\n');
    expect(bodies, 'the question stem SHOULD be translated — otherwise this proves nothing').toContain(
      'Which header carries the credential',
    );
    for (const fragment of CHOICE_FRAGMENTS) {
      expect(bodies, `answer choice "${fragment}" must never reach Google Translate`).not.toContain(fragment);
    }

    // And the rendered choices are still the original English.
    const after = await evalInContentWorld(extCtx.context, 'academyChoiceText');
    expect(after.choices.join(' | ')).toContain('Zebra-cipher-alpha');
  });
});
