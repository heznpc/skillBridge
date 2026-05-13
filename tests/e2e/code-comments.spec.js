/**
 * SkillBridge — Code-comment translation E2E.
 *
 * `code-comments.js` is the path that runs when the user toggles
 * "Translate code comments" in the popup. It finds inline comments in
 * `<pre><code>` blocks via per-language regex (// for JS, # for Python,
 * `<!-- -->` for HTML), translates ONLY the comment text via
 * `translator.translate()`, and splices the result back into innerHTML.
 *
 * v3.5.11's fix added `sb.escapeHtml(result.text)` before the splice
 * because GT output is untrusted text — a jailbroken/MITM'd response
 * containing raw HTML would otherwise XSS the lesson page. There's no
 * E2E proof that escape held until now.
 *
 * The spec asserts BOTH halves of the code-comment contract:
 *   1. **English comment translates** to Korean (proves the path runs).
 *   2. **Code keywords are preserved** verbatim. Translating `def`,
 *      `return`, `pass` would break the user's ability to copy + run
 *      the snippet, which is the whole reason this feature exists.
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

test.describe('SkillBridge — code-comment translation', () => {
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

    await page.goto(`${fixture.baseUrl}/lesson`);

    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const snap = await evalInContentWorld(extCtx.context, 'snapshot');
      if (snap?.init && snap?.sb && snap?.methods?.gt) break;
      await page.waitForTimeout(200);
    }
  });

  test.afterAll(async () => {
    if (extCtx) await closeExtension(extCtx);
    if (fixture) await stopFixtureServer(fixture.server);
  });

  test('code comment translates to Korean; Python keywords preserved verbatim', async () => {
    // Baseline: code block in original English.
    const before = await evalInContentWorld(extCtx.context, 'readCodeFencePython');
    expect(before.text).toContain('# This is a Claude prompt example');
    expect(before.text).toContain('def hello():');
    expect(before.text).toContain('return "world"');

    // Switch to Korean — runs the normal GT pipeline on prose.
    await evalInContentWorld(extCtx.context, 'switchLanguage', 'ko');
    // Wait for H1 to translate (sanity check that page-level GT ran).
    const h1Deadline = Date.now() + 10_000;
    while (Date.now() < h1Deadline) {
      const pt = await evalInContentWorld(extCtx.context, 'pageText');
      if (pt.h1 === 'Claude 소개') break;
      await page.waitForTimeout(200);
    }

    // Code comments are an opt-in feature. Trigger the path the popup
    // toggleCommentTranslation handler runs.
    await evalInContentWorld(extCtx.context, 'translateCodeComments');

    // The translate pass is awaited inside the op, so by the time we're
    // here the code block should already be in its translated state.
    // Brief poll just in case innerHTML rewrite is microtask-deferred.
    const deadline = Date.now() + 5_000;
    let after = before;
    while (Date.now() < deadline) {
      after = await evalInContentWorld(extCtx.context, 'readCodeFencePython');
      if (after.text && after.text.includes('Claude 프롬프트 예시')) break;
      await page.waitForTimeout(150);
    }

    // === The translation half ===
    // Comment text translated to Korean, leading `# ` preserved.
    expect(after.text).toContain('# Claude 프롬프트 예시');
    // Original English comment text gone.
    expect.soft(after.text).not.toContain('This is a Claude prompt example');

    // === The preservation half — Python code keywords verbatim ===
    expect(after.text).toContain('def hello():');
    expect(after.text).toContain('return "world"');
    // No spurious translation of Python keywords (these would have
    // matched isLikelyEnglish but the comment regex shouldn't have
    // even captured them).
    expect.soft(after.text).not.toMatch(/def\s+[^h]/); // `def` only as `def hello`
  });
});
