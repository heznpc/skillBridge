/**
 * SkillBridge — the mixed-localization contract.
 *
 * Anthropic opened academy.claude.com on 2026-08-20 and serves several
 * locales officially. Measured 2026-08-22: lesson BODIES come back in the
 * target language while lesson TITLES and some section headers stay
 * English. SkillBridge therefore has to stop being "the thing that
 * translates the page" and become "the thing that fills the gaps".
 *
 * The contract, one case per fixture element:
 *   1. Content already in the target language is NEVER re-translated.
 *   2. Complete English residue IS translated.
 *   3. A target-language sentence dense with English technical terms is
 *      NOT mistaken for English residue.
 *
 * Case 3 is the one with a scar. `isLikelyEnglish` is a >50% Latin-ratio
 * gate; #299's incident string "Anthropic 과정" is 82% Latin, which is
 * exactly how our own Korean output got sent back to Google and returned
 * as "인류학적 과정". The `_lastWritten` guard added there cannot cover a
 * localized page: it only recognises text SkillBridge itself wrote, and
 * none of the official Korean is ours.
 *
 * Assertions are on the GT REQUEST BODIES, not the rendered text. A
 * re-send is the defect itself; whether the response happens to survive
 * validation, or happens to be identical to what was already on screen,
 * is incidental and would hide the bug.
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

/**
 * Korean fragments that must never appear in a Google Translate request.
 *
 * Deliberately the NON-protected part of each sentence. Protected terms are
 * replaced with ⟦N⟧ placeholders before the text is sent, so asserting on a
 * full sentence like "Claude API를 사용하세요" passes even when the sentence
 * WAS sent — the body reads "⟦0⟧를 사용하세요". The Korean tail is what
 * actually proves the send happened.
 */
const KOREAN_FRAGMENTS = ['환경 설정하기', '응답 추출하기', '를 사용하세요', '를 사용한', '서버와', '를 연결합니다'];

test.describe('SkillBridge — mixed-localization contract', () => {
  /** @type {Awaited<ReturnType<typeof launchExtension>>} */
  let extCtx;
  /** @type {import('@playwright/test').Page} */
  let page;
  /** @type {{server: import('http').Server, baseUrl: string}} */
  let fixture;
  /** @type {Record<string, string|null>} */
  let before;

  test.beforeAll(async () => {
    fixture = await startFixtureServer();
    extCtx = await launchExtension();
    await registerStubs(extCtx.context);
    page = await extCtx.context.newPage();
    await page.goto(`${fixture.baseUrl}/localized`);

    const deadline = Date.now() + SETTLE_MS;
    let snap = null;
    while (Date.now() < deadline) {
      snap = await evalInContentWorld(extCtx.context, 'snapshot');
      if (snap?.init && snap?.sb && snap?.methods?.gt) break;
      await page.waitForTimeout(200);
    }
    if (!snap?.methods?.gt) throw new Error(`SkillBridge did not initialize: ${JSON.stringify(snap)}`);

    before = await evalInContentWorld(extCtx.context, 'localizedText');
    resetGTRequestCount();
    await evalInContentWorld(extCtx.context, 'switchLanguage', 'ko');

    // Wait for the English residue to translate — that is the pass
    // completing — and then for GT traffic to go quiet, so a straggler
    // request cannot land after the assertions have read the list.
    const settleBy = Date.now() + SETTLE_MS;
    let quiet = 0;
    let last = getGTRequests().length;
    while (Date.now() < settleBy) {
      await page.waitForTimeout(200);
      const now = getGTRequests().length;
      quiet = now === last ? quiet + 1 : 0;
      last = now;
      const text = await evalInContentWorld(extCtx.context, 'localizedText');
      if (text['t-title-en'] !== before['t-title-en'] && quiet >= 5) break;
    }
  });

  test.afterAll(async () => {
    if (extCtx) await closeExtension(extCtx);
    if (fixture) await stopFixtureServer(fixture.server);
  });

  test('never sends text that is already in the target language to Google', async () => {
    const sent = getGTRequests().join('\n');
    for (const korean of KOREAN_FRAGMENTS) {
      expect(sent, `already-Korean text must not be re-sent: ${korean}`).not.toContain(korean);
    }
  });

  test('term-dense Korean is not misread as English residue', async () => {
    // The narrow case behind the general rule above: these are Korean
    // sentences whose Latin ratio is high because Claude / MCP / API /
    // SDK are kept in English by design.
    const after = await evalInContentWorld(extCtx.context, 'localizedText');
    expect(after['t-mixed-1']).toBe(before['t-mixed-1']);
    expect(after['t-mixed-2']).toBe(before['t-mixed-2']);
    expect(after['t-mixed-3']).toBe(before['t-mixed-3']);
  });

  test('official Korean prose is left byte-identical', async () => {
    const after = await evalInContentWorld(extCtx.context, 'localizedText');
    expect(after['t-heading-ko']).toBe(before['t-heading-ko']);
    expect(after['t-body-ko']).toBe(before['t-body-ko']);
    expect(after['t-item-ko']).toBe(before['t-item-ko']);
  });

  test('English residue on the localized page still gets translated', async () => {
    // The other half of the contract: gap-filling must keep working, or
    // "never re-translate" would be trivially satisfiable by doing nothing.
    //
    // Polled rather than read once. The request is issued by the translation
    // pass started in the shared setup, so reading it synchronously assumes
    // that pass has already reached the network — which it had locally and
    // did not on a slower CI runner, failing with an empty request list.
    // academy-lifecycle.spec.js waits the same way for the same reason.
    await expect.poll(() => getGTRequests().join('\n'), { timeout: 10_000 }).toContain('Making a request');
    const sent = getGTRequests().join('\n');
    expect(sent).toContain('Making a request');
    const after = await evalInContentWorld(extCtx.context, 'localizedText');
    expect(after['t-title-en']).not.toBe(before['t-title-en']);
    expect(after['t-body-en']).not.toBe(before['t-body-en']);
  });
});
