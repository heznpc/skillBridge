/**
 * Joining a refinement candidate to its GT baseline.
 *
 * Phase 2 asks a narrow question: on the rows GT already produced, does the
 * post-editor make them better, leave them alone, or make them worse? Every
 * way that question gets answered wrongly is a join or a denominator problem,
 * so those are what this file pins.
 *
 * The dangerous answers are the plausible ones. A candidate joined to a
 * baseline it was not produced from reads as a quality result. A denominator
 * that includes rows GT never managed to translate reports a success rate for
 * work that never happened. And a deterministic PASS is a statement that
 * nothing measurable broke — not that the meaning survived — so it must never
 * be counted as an improvement on its own.
 */

/* global describe, test, expect */

const {
  CANDIDATE_KIND,
  REFINEMENT_SCHEMA_VERSION,
  loadShippedValidator,
  indexRows,
  pairRows,
  scorePair,
  summarizeExperiment,
  releaseVerdict,
} = require('../scripts/lib/refinement-experiment');
const { rowKey } = require('../scripts/run-gt-title-experiment');

const baselineRow = (over = {}) => ({
  source: 'Making a request',
  locale: 'ko',
  gtCandidate: '요청하기',
  measurable: true,
  resultKind: 'ok',
  grade: null,
  ...over,
});

const baselineRun = (records, over = {}) => ({ schemaVersion: 2, records, ...over });

const candidateRow = (over = {}) => ({
  source: 'Making a request',
  locale: 'ko',
  baseline: '요청하기',
  refined: '요청 보내기',
  resultKind: CANDIDATE_KIND.OK,
  ...over,
});

const candidateRun = (records, over = {}) => ({
  schemaVersion: REFINEMENT_SCHEMA_VERSION,
  engine: 'cloud',
  model: 'claude-haiku-4-5',
  records,
  ...over,
});

describe('the validator the experiment scores with', () => {
  test('is the one the extension ships, loaded as-is', () => {
    // Re-implementing the checks here would measure a copy of the runtime and
    // report it as the runtime's behaviour.
    const { validateRefinement, REFINE_VIOLATION } = loadShippedValidator();
    expect(typeof validateRefinement).toBe('function');
    const verdict = validateRefinement({
      baseline: 'Claude 2 API',
      candidate: 'Claude 3 API',
      targetLang: '',
      protectedTerms: ['Claude'],
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.violations).toContain(REFINE_VIOLATION.NUMBER);
  });
});

describe('building an index of rows', () => {
  test('a repeated locale+source is a collision, not a last-one-wins', () => {
    expect(() => indexRows([baselineRow(), baselineRow()], { label: 'baseline' })).toThrow(/collision/i);
  });

  test('the same title in two locales is two rows', () => {
    const index = indexRows([baselineRow(), baselineRow({ locale: 'ja' })], { label: 'baseline' });
    expect(index.size).toBe(2);
    expect(index.has(rowKey('ja', 'Making a request'))).toBe(true);
  });
});

describe('pairing candidates to baselines', () => {
  test('a candidate is joined only to its own locale', () => {
    const { pairs, orphaned } = pairRows({
      baseline: baselineRun([baselineRow()]),
      candidates: candidateRun([candidateRow({ locale: 'ja' })]),
    });
    expect(pairs).toHaveLength(0);
    expect(orphaned).toHaveLength(1);
    expect(orphaned[0]).toMatchObject({ locale: 'ja', reason: 'no-baseline-row' });
  });

  test('a candidate produced from different baseline text is refused, not scored', () => {
    // The failure that looks like a result: a candidate carried over from an
    // earlier GT run, joined to a baseline the model never saw.
    const { pairs, stale } = pairRows({
      baseline: baselineRun([baselineRow({ gtCandidate: '요청하기' })]),
      candidates: candidateRun([candidateRow({ baseline: '리퀘스트 만들기' })]),
    });
    expect(pairs).toHaveLength(0);
    expect(stale).toHaveLength(1);
    expect(stale[0]).toMatchObject({ locale: 'ko', source: 'Making a request' });
  });

  test('a candidate for a baseline row GT never translated is orphaned, not counted', () => {
    const { pairs, orphaned } = pairRows({
      baseline: baselineRun([baselineRow({ gtCandidate: '', measurable: false, resultKind: 'rate-limited' })]),
      candidates: candidateRun([candidateRow({ baseline: '' })]),
    });
    expect(pairs).toHaveLength(0);
    expect(orphaned[0].reason).toBe('baseline-not-measurable');
  });

  test('an eligible baseline row with no candidate is reported as missing', () => {
    const { pairs, missing } = pairRows({
      baseline: baselineRun([baselineRow(), baselineRow({ source: 'Temperature', gtCandidate: '온도' })]),
      candidates: candidateRun([candidateRow()]),
    });
    expect(pairs).toHaveLength(1);
    expect(missing).toEqual([rowKey('ko', 'Temperature')]);
  });

  test('an unusable baseline row is never counted as missing a candidate', () => {
    // It is not work the refinement pass failed to do; it is work GT never
    // produced an input for.
    const { missing, eligible } = pairRows({
      baseline: baselineRun([baselineRow({ gtCandidate: '', measurable: false, resultKind: 'rate-limited' })]),
      candidates: candidateRun([]),
    });
    expect(missing).toEqual([]);
    expect(eligible).toBe(0);
  });

  test('a failed candidate pairs, but is marked as failed rather than dropped', () => {
    // Dropping it would quietly shrink the denominator, which is the same as
    // scoring the failures as successes.
    const { pairs } = pairRows({
      baseline: baselineRun([baselineRow()]),
      candidates: candidateRun([candidateRow({ refined: '', resultKind: CANDIDATE_KIND.MODEL_ERROR })]),
    });
    expect(pairs).toHaveLength(1);
    expect(pairs[0].candidateKind).toBe(CANDIDATE_KIND.MODEL_ERROR);
  });

  test('a candidate run from an unknown schema version is refused', () => {
    expect(() =>
      pairRows({
        baseline: baselineRun([baselineRow()]),
        candidates: candidateRun([candidateRow()], { schemaVersion: 99 }),
      }),
    ).toThrow(/schemaVersion/);
  });
});

describe('scoring one pair', () => {
  const validate = loadShippedValidator().validateRefinement;

  test('a deterministic pass is recorded as a pass, and says nothing about meaning', () => {
    const pair = {
      locale: 'ko',
      source: 'Making a request',
      baseline: 'Claude API 요청하기',
      refined: 'Claude API 요청 보내기',
      candidateKind: CANDIDATE_KIND.OK,
    };
    const scored = scorePair(pair, { protectedTerms: ['Claude', 'API'], validate });
    expect(scored.deterministic.ok).toBe(true);
    // The point of the whole field: a pass is not an improvement.
    expect(scored.semantic).toBeNull();
    expect(scored.outcome).toBe('ungraded');
  });

  test('a damaged protected term is a deterministic failure with its category named', () => {
    const pair = {
      locale: 'ko',
      source: 'Making a request',
      baseline: 'Claude API 요청하기',
      refined: '클로드 API 요청하기',
      candidateKind: CANDIDATE_KIND.OK,
    };
    const scored = scorePair(pair, { protectedTerms: ['Claude', 'API'], validate });
    expect(scored.deterministic.ok).toBe(false);
    expect(scored.deterministic.violations).toContain('protected-term');
  });

  test('a failed candidate is not run through the validator at all', () => {
    // An empty candidate trivially loses every term, which would be recorded
    // as the post-editor damaging terminology rather than as a failed call.
    const calls = [];
    const spy = (...args) => {
      calls.push(args);
      return { ok: false, violations: ['empty'], detail: {} };
    };
    const scored = scorePair(
      { locale: 'ko', source: 's', baseline: 'b', refined: '', candidateKind: CANDIDATE_KIND.MODEL_ERROR },
      { protectedTerms: [], validate: spy },
    );
    expect(calls).toHaveLength(0);
    expect(scored.deterministic).toBeNull();
    expect(scored.outcome).toBe('failed');
  });

  test('an outcome comes from the grades, not from the validator', () => {
    // All three pass every deterministic check, so only the grades can move
    // the outcome.
    const graded = scorePair(
      {
        locale: 'ko',
        source: 'Making a request',
        baseline: '요청하기',
        refined: '요청 보내기',
        candidateKind: CANDIDATE_KIND.OK,
        baselineGrade: 'C',
        refinedGrade: 'A',
      },
      { protectedTerms: [], validate },
    );
    expect(graded.outcome).toBe('improved');

    const worse = scorePair(
      {
        locale: 'ko',
        source: 'Making a request',
        baseline: '요청하기',
        refined: '요청 보내기',
        candidateKind: CANDIDATE_KIND.OK,
        baselineGrade: 'A',
        refinedGrade: 'C',
      },
      { protectedTerms: [], validate },
    );
    expect(worse.outcome).toBe('regression');

    const same = scorePair(
      {
        locale: 'ko',
        source: 'Making a request',
        baseline: '요청하기',
        refined: '요청 보내기',
        candidateKind: CANDIDATE_KIND.OK,
        baselineGrade: 'B',
        refinedGrade: 'B',
      },
      { protectedTerms: [], validate },
    );
    expect(same.outcome).toBe('neutral');
  });

  test('a deterministic failure is a regression whatever the grades say', () => {
    // A rejected refinement never reaches a reader, so it cannot be an
    // improvement — and a grader who liked the text must not outvote a lost
    // brand name.
    const scored = scorePair(
      {
        locale: 'ko',
        source: 'Claude',
        baseline: 'Claude 입문',
        refined: '클로드 입문',
        candidateKind: CANDIDATE_KIND.OK,
        baselineGrade: 'C',
        refinedGrade: 'A',
      },
      { protectedTerms: ['Claude'], validate },
    );
    expect(scored.deterministic.ok).toBe(false);
    expect(scored.outcome).toBe('regression');
  });
});

describe('the denominators a decision would be read off', () => {
  const scored = (over = {}) => ({
    locale: 'ko',
    source: 's',
    candidateKind: CANDIDATE_KIND.OK,
    deterministic: { ok: true, violations: [], detail: {} },
    semantic: null,
    outcome: 'ungraded',
    ...over,
  });

  test('graded outcomes are counted over graded pairs only', () => {
    const summary = summarizeExperiment(
      [scored({ outcome: 'improved' }), scored({ outcome: 'ungraded' }), scored({ outcome: 'neutral' })],
      { eligibleBaselineRows: 3, missing: [], phase1: { totalRows: 10, usableRows: 3 } },
    );
    expect(summary.graded).toBe(2);
    expect(summary.outcomes).toMatchObject({ improved: 1, neutral: 1, regression: 0 });
    expect(summary.ungraded).toBe(1);
  });

  test('a failed candidate is excluded from the graded outcomes and reported on its own', () => {
    const summary = summarizeExperiment(
      [scored({ outcome: 'improved' }), scored({ outcome: 'failed', candidateKind: CANDIDATE_KIND.MODEL_ERROR })],
      { eligibleBaselineRows: 2, missing: [], phase1: { totalRows: 10, usableRows: 2 } },
    );
    expect(summary.graded).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.outcomes.improved).toBe(1);
  });

  test('the Phase 1 coverage the result rests on is carried, not hidden', () => {
    // 123 of 304 rows usable is the difference between a finding and a
    // fragment, and it cannot be recovered from the pair counts alone.
    const summary = summarizeExperiment([scored({ outcome: 'improved' })], {
      eligibleBaselineRows: 123,
      missing: ['a', 'b'],
      phase1: { totalRows: 304, usableRows: 123 },
    });
    expect(summary.phase1).toEqual({ totalRows: 304, usableRows: 123 });
    expect(summary.coverage).toEqual({ eligibleBaselineRows: 123, paired: 1, missing: 2 });
  });

  test('deterministic rejections are counted separately from graded regressions', () => {
    const summary = summarizeExperiment(
      [
        scored({ outcome: 'regression', deterministic: { ok: false, violations: ['protected-term'], detail: {} } }),
        scored({ outcome: 'regression' }),
      ],
      { eligibleBaselineRows: 2, missing: [], phase1: { totalRows: 2, usableRows: 2 } },
    );
    expect(summary.deterministic).toMatchObject({ rejected: 1, passed: 1 });
    expect(summary.violationsByCategory).toMatchObject({ 'protected-term': 1 });
  });
});

describe('the release decision', () => {
  const summary = (over = {}) => ({
    pairs: 10,
    graded: 10,
    ungraded: 0,
    failed: 0,
    outcomes: { improved: 6, neutral: 3, regression: 1 },
    deterministic: { passed: 10, rejected: 0 },
    violationsByCategory: {},
    coverage: { eligibleBaselineRows: 10, paired: 10, missing: 0 },
    phase1: { totalRows: 10, usableRows: 10 },
    ...over,
  });

  test('no verdict without grades, however many pairs there are', () => {
    const v = releaseVerdict(summary({ graded: 0, ungraded: 10 }), { improvedAtLeast: 0.5, regressionAtMost: 0.1 });
    expect(v.verdict).toBeNull();
    expect(v.reason).toMatch(/graded/);
  });

  test('no verdict without release criteria, because those are not the harness to choose', () => {
    const v = releaseVerdict(summary(), null);
    expect(v.verdict).toBeNull();
    expect(v.reason).toMatch(/criteria/);
    expect(v.evidence).toBeDefined();
  });

  test('criteria met keeps the production UI', () => {
    expect(releaseVerdict(summary(), { improvedAtLeast: 0.5, regressionAtMost: 0.15 }).verdict).toBe('A');
  });

  test('a result too weak to ship but not harmful goes experimental', () => {
    const v = releaseVerdict(summary({ outcomes: { improved: 2, neutral: 7, regression: 1 } }), {
      improvedAtLeast: 0.5,
      regressionAtMost: 0.15,
    });
    expect(v.verdict).toBe('B');
  });

  test('regressions beyond the bar disable it', () => {
    const v = releaseVerdict(summary({ outcomes: { improved: 5, neutral: 0, regression: 5 } }), {
      improvedAtLeast: 0.5,
      regressionAtMost: 0.15,
    });
    expect(v.verdict).toBe('C');
  });

  test('a partial Phase 1 is stated on the verdict, not silently averaged away', () => {
    const v = releaseVerdict(summary({ phase1: { totalRows: 304, usableRows: 123 } }), {
      improvedAtLeast: 0.5,
      regressionAtMost: 0.15,
    });
    expect(v.evidence.phase1).toEqual({ totalRows: 304, usableRows: 123 });
    expect(v.caveats).toContain('phase-1-partial');
  });
});
