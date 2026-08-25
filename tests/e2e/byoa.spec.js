/**
 * SkillBridge — Ask another assistant, end to end.
 *
 * The panel's value is a hand-off, and its correctness is mostly a set of
 * refusals. tests/byoa-bundle.test.js owns the prompt's shape and the
 * boundaries as source-level facts; this owns the parts only a real browser
 * can answer:
 *
 *   - the panel renders and the prompt is visible BEFORE anything is copied,
 *     because "I could not see what I was about to send" is what this feature
 *     answers;
 *   - Copy prompt puts exactly the visible text on the real clipboard;
 *   - a real DOM Selection reaches the prompt on a lesson, and a real Selection
 *     over an answer choice does NOT reach it on a quiz.
 *
 * That last pair is the one worth a browser. The guard reads a live Range, and
 * a jsdom Range is not the thing a learner's drag produces.
 */

const { test, expect } = require('@playwright/test');
const { SETTLE_MS } = require('./helpers/timeouts');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

const LESSON_PATH = '/academy/courses/building-with-the-claude-api/accessing-claude-with-the-api';
const QUIZ_PATH = '/academy/courses/building-with-the-claude-api/quiz-on-accessing-claude-with-the-api';

test.describe('SkillBridge — ask another assistant', () => {
  /** @type {Awaited<ReturnType<typeof launchExtension>>} */
  let extCtx;
  /** @type {import('@playwright/test').Page} */
  let page;
  /** @type {{server: import('http').Server, baseUrl: string}} */
  let fixture;

  async function openPanelAt(path) {
    await page.goto(`${fixture.baseUrl}${path}`);
    const deadline = Date.now() + SETTLE_MS;
    let snap = null;
    while (Date.now() < deadline) {
      snap = await evalInContentWorld(extCtx.context, 'snapshot');
      if (snap?.init && snap?.sb && snap?.methods?.gt) break;
      await page.waitForTimeout(200);
    }
    if (!snap?.init) throw new Error(`SkillBridge did not initialize: ${JSON.stringify(snap)}`);
    await evalInContentWorld(extCtx.context, 'useAcademyProfile');
    await evalInContentWorld(extCtx.context, 'settleExamState');
    await evalInContentWorld(extCtx.context, 'injectSidebar');
    await evalInContentWorld(extCtx.context, 'toggleSidebar');
    await evalInContentWorld(extCtx.context, 'toggleByoaPanel');
    return evalInContentWorld(extCtx.context, 'readByoaPanel');
  }

  test.beforeAll(async () => {
    fixture = await startFixtureServer();
    extCtx = await launchExtension();
    await registerStubs(extCtx.context);
    // Real clipboard access, so "Copy prompt" is exercised rather than stubbed.
    await extCtx.context.grantPermissions(['clipboard-read', 'clipboard-write']);
    page = await extCtx.context.newPage();
    page.on('pageerror', (err) => console.log('[page:pageerror]', err.message));
  });

  test.afterAll(async () => {
    await closeExtension(extCtx);
    await stopFixtureServer(fixture.server);
  });

  test('the panel shows the prompt before anything is copied', async () => {
    const panel = await openPanelAt(LESSON_PATH);
    expect(panel.present, 'the panel must render').toBe(true);
    expect(panel.prompt.length).toBeGreaterThan(0);
    expect(panel.prompt).toContain('Accessing Claude with the API');
    expect(panel.prompt).toContain('/academy/courses/');
    // Readable and selectable, so a browser that refuses clipboard access
    // still leaves the learner a way to copy.
    expect(panel.readOnly).toBe(true);
  });

  test('all three assistants are offered, and each is only a name', async () => {
    const panel = await openPanelAt(LESSON_PATH);
    expect(panel.assistants.map((a) => a.id).sort()).toEqual(['chatgpt', 'claude', 'gemini']);
  });

  test('the typed question lands in the prompt as it is typed', async () => {
    await openPanelAt(LESSON_PATH);
    await evalInContentWorld(extCtx.context, 'typeByoaQuestion', 'Why is the credential a header?');
    const panel = await evalInContentWorld(extCtx.context, 'readByoaPanel');
    expect(panel.prompt).toContain('Why is the credential a header?');
  });

  test('Copy prompt puts exactly the visible text on the clipboard', async () => {
    const before = await openPanelAt(LESSON_PATH);
    // Non-empty first. `toBe(before.prompt)` passes when both are '' — which
    // is exactly what happened while the panel was silently failing to render,
    // and this test was the only one still green.
    expect(before.prompt.length).toBeGreaterThan(50);
    const copied = await evalInContentWorld(extCtx.context, 'clickByoaCopy');
    expect(copied.clipboard, `clipboard read failed: ${copied.clipboard}`).not.toMatch(/^__unreadable__/);
    expect(copied.clipboard).toBe(before.prompt);
  });

  test('a real selection on a lesson reaches the prompt', async () => {
    await openPanelAt(LESSON_PATH);
    const selected = await evalInContentWorld(extCtx.context, 'selectElementText', '#academy-lesson-body');
    expect(selected.selected).toContain('A prompt is the input you give to Claude');
    // Re-render with the selection live.
    await evalInContentWorld(extCtx.context, 'typeByoaQuestion', 'explain this');
    const panel = await evalInContentWorld(extCtx.context, 'readByoaPanel');
    expect(panel.prompt).toContain('A prompt is the input you give to Claude');
    await evalInContentWorld(extCtx.context, 'clearSelection');
  });

  test('a real selection over an answer choice does NOT reach the prompt', async () => {
    const panel = await openPanelAt(QUIZ_PATH);
    expect((await evalInContentWorld(extCtx.context, 'examState')).isExamPage).toBe(true);
    // The exam note is already on screen before anything is selected.
    expect(panel.notes.join(' ')).toMatch(/quiz|Answer choices/i);

    const selected = await evalInContentWorld(extCtx.context, 'selectElementText', '#academy-choice-a');
    expect(selected.selected, 'the choice really was selected').toContain('Zebra-cipher-alpha');

    await evalInContentWorld(extCtx.context, 'typeByoaQuestion', 'is this right?');
    const after = await evalInContentWorld(extCtx.context, 'readByoaPanel');
    expect(after.prompt, 'answer-choice text must not reach the clipboard prompt').not.toContain('Zebra-cipher-alpha');
    // And the learner is told, rather than left assuming the assistant has it.
    expect(after.notes.join(' ')).toMatch(/answer choice/i);

    // The clipboard gets the withheld version too — not a second build that
    // forgot the guard.
    const copied = await evalInContentWorld(extCtx.context, 'clickByoaCopy');
    expect(copied.clipboard).not.toContain('Zebra-cipher-alpha');
    await evalInContentWorld(extCtx.context, 'clearSelection');
  });

  test('on a quiz the prompt carries the do-not-answer instruction and no lesson body', async () => {
    const panel = await openPanelAt(QUIZ_PATH);
    expect(panel.prompt).toContain('Do not give me the answer');
    for (const fragment of ['Zebra-cipher-alpha', 'Marmalade-vector-bravo', 'carries the credential']) {
      expect(panel.prompt).not.toContain(fragment);
    }
  });
});
