/**
 * The optional LLM post-editor: when it may run, and when its output may land.
 *
 * The feature's whole claim is "this cannot make the page worse than not
 * running at all". That rests on two things, and both are tested here.
 *
 * The POLICY decides whether a model is called. Off by default, a consent
 * separate from the Tutor's, and "follow the Tutor" resolving to nothing when
 * the Tutor is off — because "AI off" has to mean off everywhere or it means
 * nothing.
 *
 * The VALIDATOR decides whether a result replaces the Google Translate
 * baseline. Every check has the same shape: something must survive the edit
 * unchanged. That is deliberate — a quality judgement would mean trusting the
 * model to grade its own output, which is not a validator. The failure cases
 * below are the ones a language model actually produces on technical copy:
 * a translated identifier, a normalised number, a "corrected" endpoint, a
 * helpful preamble, a refusal that hands back the English.
 */

/* global describe, test, expect */

const { readProductionSource } = require('./helpers/production-source');

function loadLib(file) {
  const fake = { module: { exports: {} } };
  new Function('globalThis', readProductionSource('src', 'lib', file))(fake);
  return fake.module.exports;
}

const { REFINE_MODE, REFINE_BLOCKED, resolveRefinementEngine, buildRefinementPrompt } = loadLib('refinement-policy.js');
const { REFINE_VIOLATION, validateRefinement } = loadLib('refinement-validator.js');

const TERMS = ['Claude Code', 'Anthropic', 'Claude', 'API', 'SDK'];

describe('when refinement may run at all', () => {
  test('off by default — an empty settings object calls nothing', () => {
    const r = resolveRefinementEngine({});
    expect(r.enabled).toBe(false);
    expect(r.reason).toBe(REFINE_BLOCKED.MODE_OFF);
  });

  test('an explicit off reports the mode, not a missing consent', () => {
    // Reporting "you have not consented" to someone who just turned it off
    // reads as a prompt to turn it on.
    const r = resolveRefinementEngine({ mode: REFINE_MODE.OFF, consented: false });
    expect(r.reason).toBe(REFINE_BLOCKED.MODE_OFF);
  });

  test('picking an engine is not enough without the consent', () => {
    const r = resolveRefinementEngine({ mode: REFINE_MODE.CLOUD, consented: false });
    expect(r.enabled).toBe(false);
    expect(r.reason).toBe(REFINE_BLOCKED.NO_CONSENT);
  });

  test('consent alone is not enough without an engine', () => {
    expect(resolveRefinementEngine({ mode: REFINE_MODE.OFF, consented: true }).enabled).toBe(false);
  });

  test('both together enable it', () => {
    expect(resolveRefinementEngine({ mode: REFINE_MODE.CLOUD, consented: true })).toEqual({
      enabled: true,
      engine: 'cloud',
      reason: null,
    });
    expect(resolveRefinementEngine({ mode: REFINE_MODE.LOCAL, consented: true }).engine).toBe('local');
  });

  test('follow takes the Tutor’s engine', () => {
    expect(resolveRefinementEngine({ mode: REFINE_MODE.FOLLOW, consented: true, tutorEngine: 'local' }).engine).toBe(
      'local',
    );
    expect(resolveRefinementEngine({ mode: REFINE_MODE.FOLLOW, consented: true, tutorEngine: 'cloud' }).engine).toBe(
      'cloud',
    );
  });

  test('follow resolves to NOTHING when the Tutor is off', () => {
    // The point of the setting. "AI off" has to mean off everywhere.
    const r = resolveRefinementEngine({ mode: REFINE_MODE.FOLLOW, consented: true, tutorEngine: 'off' });
    expect(r.enabled).toBe(false);
    expect(r.engine).toBeNull();
    expect(r.reason).toBe(REFINE_BLOCKED.TUTOR_OFF);
  });

  test('an unrecognised value fails closed rather than defaulting to a transport', () => {
    const r = resolveRefinementEngine({ mode: REFINE_MODE.FOLLOW, consented: true, tutorEngine: 'experimental' });
    expect(r.enabled).toBe(false);
    expect(r.engine).toBeNull();
  });

  test('a host with no AI transport cannot run the cloud engine', () => {
    const r = resolveRefinementEngine({ mode: REFINE_MODE.CLOUD, consented: true, hasTransport: false });
    expect(r.enabled).toBe(false);
    expect(r.reason).toBe(REFINE_BLOCKED.NO_TRANSPORT);
  });

  test('but local still works there — it needs no bridge', () => {
    expect(resolveRefinementEngine({ mode: REFINE_MODE.LOCAL, consented: true, hasTransport: false }).enabled).toBe(
      true,
    );
  });
});

describe('the prompt is an edit task, not a translation task', () => {
  const prompt = buildRefinementPrompt({
    source: 'Send the key in the x-api-key header.',
    baseline: '키를 x-api-key 헤더로 보내세요.',
    langName: 'Korean',
    protectedTerms: TERMS,
  });

  test('it carries both the English and the machine translation', () => {
    // The terminology is what machine translation gets wrong, and the
    // terminology is in the English.
    expect(prompt).toContain('Send the key in the x-api-key header.');
    expect(prompt).toContain('키를 x-api-key 헤더로 보내세요.');
  });

  test('it says edit, not retranslate, and forbids touching the invariants', () => {
    expect(prompt).toMatch(/Edit, do not retranslate/i);
    expect(prompt).toMatch(/Do not change numbers.*URLs, code, or HTML/i);
    expect(prompt).toMatch(/Return ONLY/i);
  });

  test('it names the protected terms', () => {
    expect(prompt).toContain('Anthropic');
    expect(prompt).toContain('Claude Code');
  });

  test('it tolerates having no terms to name', () => {
    expect(buildRefinementPrompt({ source: 'a', baseline: 'b', langName: 'Korean' })).not.toContain(
      'Keep these exactly',
    );
  });
});

describe('a refinement may only land if nothing load-bearing changed', () => {
  const ok = (candidate, extra = {}) =>
    validateRefinement({ baseline: extra.baseline ?? BASE, candidate, protectedTerms: TERMS, ...extra });
  const BASE = 'Anthropic Claude API 키를 x-api-key 헤더에 넣어 3번 호출하세요.';

  test('a genuine post-edit passes', () => {
    // Same terms, same number, better Korean.
    const r = ok('Anthropic Claude API 키를 x-api-key 헤더에 담아 3번 요청하세요.');
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  test('an unchanged baseline passes — "already correct" is a valid answer', () => {
    expect(ok(BASE).ok).toBe(true);
  });

  test('a translated protected term is rejected', () => {
    const r = ok('앤스로픽 클로드 API 키를 x-api-key 헤더에 넣어 3번 호출하세요.');
    expect(r.ok).toBe(false);
    expect(r.violations).toContain(REFINE_VIOLATION.PROTECTED_TERM);
  });

  test('dropping one of several occurrences is rejected, not just dropping all', () => {
    // A presence check would call this fine, and the passage would still be
    // half-corrupted.
    const r = validateRefinement({
      baseline: 'Claude and Claude and Claude',
      candidate: 'Claude and 클로드 and Claude',
      protectedTerms: ['Claude'],
    });
    expect(r.violations).toContain(REFINE_VIOLATION.PROTECTED_TERM);
    expect(r.detail.terms[0]).toMatchObject({ term: 'Claude', baseline: 3, candidate: 2 });
  });

  test('a changed number is rejected', () => {
    expect(ok('Anthropic Claude API 키를 x-api-key 헤더에 넣어 4번 호출하세요.').violations).toContain(
      REFINE_VIOLATION.NUMBER,
    );
  });

  test('a "normalised" version number is rejected', () => {
    // 1.0 and 1 are the same quantity and different versions, and the second
    // is what appears in technical copy.
    const r = validateRefinement({ baseline: 'Use SDK 1.0 today', candidate: 'Use SDK 1 today' });
    expect(r.violations).toContain(REFINE_VIOLATION.NUMBER);
  });

  test('a changed separator is rejected too', () => {
    const r = validateRefinement({ baseline: 'up to 1,000 tokens', candidate: 'up to 1.000 tokens' });
    expect(r.violations).toContain(REFINE_VIOLATION.NUMBER);
  });

  test('a rewritten URL is rejected', () => {
    const r = validateRefinement({
      baseline: 'https://api.anthropic.com/v1/messages 로 POST 하세요.',
      candidate: 'https://api.anthropic.com/v1/message 로 POST 하세요.',
    });
    expect(r.violations).toContain(REFINE_VIOLATION.URL);
  });

  test('an invented URL is rejected', () => {
    const r = validateRefinement({
      baseline: '문서를 참고하세요.',
      candidate: '문서(https://example.com)를 참고하세요.',
    });
    expect(r.violations).toContain(REFINE_VIOLATION.URL);
  });

  test('an edited code span is rejected', () => {
    const r = validateRefinement({
      baseline: '<code>max_tokens</code> 값을 올리세요.',
      candidate: '<code>maxTokens</code> 값을 올리세요.',
    });
    expect(r.violations).toContain(REFINE_VIOLATION.CODE);
  });

  test('a backtick span counts as code too', () => {
    const r = validateRefinement({ baseline: '`x-api-key` 헤더', candidate: '`X-API-Key` 헤더' });
    expect(r.violations).toContain(REFINE_VIOLATION.CODE);
  });

  test('a dropped tag is rejected', () => {
    const r = validateRefinement({
      baseline: '<a href="/docs">문서</a>를 읽으세요.',
      candidate: '문서를 읽으세요.',
    });
    expect(r.violations).toContain(REFINE_VIOLATION.HTML);
  });

  test('a rewritten link target is rejected even when the tags match', () => {
    const r = validateRefinement({
      baseline: '<a href="/docs">문서</a>',
      candidate: '<a href="/documentation">문서</a>',
    });
    expect(r.violations).toContain(REFINE_VIOLATION.HTML);
  });

  test('reordered tags are rejected — order is what reconciliation relies on', () => {
    const r = validateRefinement({
      baseline: '<strong>A</strong><em>B</em>',
      candidate: '<em>B</em><strong>A</strong>',
    });
    expect(r.violations).toContain(REFINE_VIOLATION.HTML);
  });

  test('a helpful preamble is rejected by length', () => {
    // "Here is the corrected translation: …" preserves every term and is still
    // not a translation.
    const r = ok(`Here is the corrected translation, with the terminology fixed and the tone improved: ${BASE}`);
    expect(r.violations).toContain(REFINE_VIOLATION.LENGTH);
  });

  test('a summary is rejected by length', () => {
    const r = ok('키를 넣으세요.');
    expect(r.violations).toContain(REFINE_VIOLATION.LENGTH);
  });

  test('an empty answer is rejected', () => {
    expect(ok('   ').violations).toEqual([REFINE_VIOLATION.EMPTY]);
  });

  test('handing back the untranslated English is rejected', () => {
    const source = 'Put the Anthropic Claude API key in the x-api-key header and call it 3 times.';
    const r = validateRefinement({ baseline: BASE, candidate: source, source, protectedTerms: TERMS });
    expect(r.violations).toContain(REFINE_VIOLATION.REVERTED_TO_SOURCE);
  });

  test('but an English baseline that stays English is not a "reversion"', () => {
    // Some blocks legitimately have no translation to improve — a code-heavy
    // line, a brand name on its own. Flagging those would reject the correct
    // answer.
    const source = 'Claude Code';
    const r = validateRefinement({ baseline: source, candidate: source, source, protectedTerms: TERMS });
    expect(r.violations).not.toContain(REFINE_VIOLATION.REVERTED_TO_SOURCE);
  });

  test('reflowed whitespace alone is not a violation', () => {
    const r = validateRefinement({ baseline: 'a  b\n c', candidate: 'a b c' });
    expect(r.ok).toBe(true);
  });

  test('every violation is reported, not just the first', () => {
    const r = validateRefinement({
      baseline: 'Claude 3 times at https://a.test',
      candidate: '클로드 4 times at https://b.test',
      protectedTerms: ['Claude'],
    });
    expect(r.violations).toEqual(
      expect.arrayContaining([REFINE_VIOLATION.PROTECTED_TERM, REFINE_VIOLATION.NUMBER, REFINE_VIOLATION.URL]),
    );
  });
});
