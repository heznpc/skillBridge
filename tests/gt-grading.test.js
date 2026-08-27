/**
 * The GT experiment's grading protocol, as tests rather than a document.
 *
 * The experiment's output is evidence for deciding whether curated
 * per-title translation memory keeps earning its place. That makes the
 * protocol load-bearing: a record that dodges it is a vote to delete a
 * curated asset on weaker grounds than we agreed to.
 */

/* global describe, test, expect */

const {
  GRADES,
  GRADE_MEANINGS,
  extractNumbers,
  detectViolations,
  validateGradeRecord,
  needsSecondReview,
  summarize,
} = require('../scripts/lib/gt-grading');

/** A record that satisfies the protocol; tests override one field at a time. */
const ok = (over = {}) => ({
  source: 'Making a request',
  locale: 'ko',
  gtCandidate: '요청 만들기',
  grade: 'A',
  evaluatorConfidence: 'high',
  violations: { protectedTerm: false, numberOrUnit: false, productName: false, meaning: false },
  rationale: null,
  ...over,
});

describe('grade vocabulary', () => {
  test('every grade has a stated meaning', () => {
    expect(Object.keys(GRADE_MEANINGS).sort()).toEqual([...GRADES].sort());
  });

  test('C is where ambiguity goes', () => {
    // Agreed rule: uncertain reads become C, not D. Without it, a grader who
    // is unsure of a locale drifts toward failing grades, and the experiment
    // reports a quality problem that is really an evaluator problem.
    expect(GRADE_MEANINGS.C).toMatch(/uncertain/i);
  });
});

describe('detectViolations', () => {
  test('a dropped protected term is caught', () => {
    const v = detectViolations({
      source: 'Introducing MCP',
      candidate: '모델 컨텍스트 프로토콜 소개',
      protectedTerms: ['MCP'],
    });
    expect(v.protectedTerm).toBe(true);
  });

  test('a preserved protected term is not a violation', () => {
    const v = detectViolations({
      source: 'Introducing MCP',
      candidate: 'MCP 소개',
      protectedTerms: ['MCP'],
    });
    expect(v.protectedTerm).toBe(false);
  });

  test('a term absent from the source cannot be a violation', () => {
    const v = detectViolations({ source: 'Temperature', candidate: '온도', protectedTerms: ['Claude'] });
    expect(v.protectedTerm).toBe(false);
  });

  test('brand damage is flagged separately from generic term damage', () => {
    // A report reads differently when a BRAND is lost, even though both are
    // caught the same way.
    const brand = detectViolations({
      source: 'Anthropic apps',
      candidate: '인류학적 앱',
      protectedTerms: ['Anthropic'],
    });
    expect(brand).toMatchObject({ protectedTerm: true, productName: true });

    const generic = detectViolations({ source: 'Using MCP', candidate: '프로토콜 사용', protectedTerms: ['MCP'] });
    expect(generic).toMatchObject({ protectedTerm: true, productName: false });
  });

  test('numbers must survive, in any order', () => {
    expect(detectViolations({ source: 'BM25 lexical search', candidate: 'BM25 어휘 검색' }).numberOrUnit).toBe(false);
    expect(detectViolations({ source: 'BM25 lexical search', candidate: 'BM 어휘 검색' }).numberOrUnit).toBe(true);
    expect(detectViolations({ source: '15 minutes, 3 steps', candidate: '3단계, 15분' }).numberOrUnit).toBe(false);
    expect(detectViolations({ source: '15 minutes', candidate: '50분' }).numberOrUnit).toBe(true);
  });

  test('decimals are compared as written', () => {
    expect(extractNumbers('Claude 4.5 and 3')).toEqual(['3', '4.5']);
  });
});

describe('validateGradeRecord', () => {
  test('accepts a complete record', () => {
    expect(validateGradeRecord(ok())).toEqual({ ok: true, errors: [] });
  });

  test('D and F require a written reason', () => {
    // These are the grades that drive the decision, so they carry the burden
    // of proof. Otherwise the experiment is an unfalsifiable letter grid.
    for (const grade of ['D', 'F']) {
      const out = validateGradeRecord(ok({ grade, rationale: null, violations: ok().violations }));
      expect(out.ok).toBe(false);
      expect(out.errors.join(' ')).toMatch(/requires a rationale/);
    }
    expect(validateGradeRecord(ok({ grade: 'D', rationale: 'reverses the subject' })).ok).toBe(true);
  });

  test('A/B/C do not require a rationale', () => {
    for (const grade of ['A', 'B', 'C']) expect(validateGradeRecord(ok({ grade })).ok).toBe(true);
  });

  test('a deterministic violation cannot be graded anything but F', () => {
    // The guard against averaging away the exact failure the experiment
    // exists to catch: "the brand name vanished, grade B".
    const out = validateGradeRecord(
      ok({
        grade: 'B',
        violations: { protectedTerm: true, numberOrUnit: false, productName: true, meaning: false },
      }),
    );
    expect(out.ok).toBe(false);
    expect(out.errors.join(' ')).toMatch(/must be graded F/);
  });

  test('rejects unknown grades and confidences', () => {
    expect(validateGradeRecord(ok({ grade: 'E' })).ok).toBe(false);
    expect(validateGradeRecord(ok({ evaluatorConfidence: 'certain' })).ok).toBe(false);
  });

  test('a failed translation is recorded, not omitted', () => {
    // googleTranslate returns null on an unmask failure. That outcome is data
    // — dropping the row would quietly improve the result.
    expect(validateGradeRecord(ok({ gtCandidate: '', grade: 'F', rationale: 'unmask failed; no candidate' })).ok).toBe(
      true,
    );
    expect(validateGradeRecord(ok({ gtCandidate: undefined })).ok).toBe(false);
  });

  test('requires the identifying fields', () => {
    expect(validateGradeRecord(ok({ source: '' })).ok).toBe(false);
    expect(validateGradeRecord(ok({ locale: undefined })).ok).toBe(false);
    expect(validateGradeRecord({}).ok).toBe(false);
  });
});

describe('unmeasurable rows', () => {
  test('an empty candidate must not read as a protected-term violation', () => {
    // The endpoint throttles per source IP (HTTP 429). A run that treated
    // failed requests as translations would report every row as having lost
    // its brand name — a quality catastrophe that is really a network one.
    // The runner only computes violations when there is a candidate; this
    // pins why that guard exists.
    const empty = detectViolations({ source: 'Introducing MCP', candidate: '', protectedTerms: ['MCP'] });
    expect(empty.protectedTerm).toBe(true);
    // ...which is exactly why the runner must not call it for an empty
    // candidate, and records all-false instead.
    const recorded = { protectedTerm: false, numberOrUnit: false, productName: false, meaning: false };
    expect(validateGradeRecord(ok({ gtCandidate: '', grade: 'C', violations: recorded })).ok).toBe(true);
  });
});

describe('needsSecondReview', () => {
  test('flags a low-confidence failing grade', () => {
    // The guard against a weak read in an unfamiliar locale ending a curated
    // dictionary's life on its own.
    const records = [
      ok({ grade: 'F', evaluatorConfidence: 'low', rationale: 'brand lost' }),
      ok({ grade: 'D', evaluatorConfidence: 'medium', rationale: 'meaning flipped' }),
      ok({ grade: 'F', evaluatorConfidence: 'high', rationale: 'brand lost' }),
      ok({ grade: 'C', evaluatorConfidence: 'low' }),
    ];
    const flagged = needsSecondReview(records);
    expect(flagged).toHaveLength(2);
    expect(flagged.every((r) => ['D', 'F'].includes(r.grade))).toBe(true);
  });

  test('an empty or malformed set does not throw', () => {
    expect(needsSecondReview(null)).toEqual([]);
    expect(needsSecondReview([null, undefined])).toEqual([]);
  });
});

describe('summarize', () => {
  test('reports counts, never a single score', () => {
    // n=67 per locale is ~1.5% resolution. One number invites reading a band
    // as a point, which is how "95%" becomes a decision.
    const out = summarize([
      ok({ grade: 'A' }),
      ok({ grade: 'B' }),
      ok({ grade: 'C' }),
      ok({ grade: 'D', rationale: 'x', evaluatorConfidence: 'low' }),
    ]);
    expect(out).toMatchObject({
      total: 4,
      usable: 2,
      curationCandidates: 1,
      failures: 1,
      pendingSecondReview: 1,
    });
    expect(out).not.toHaveProperty('score');
    expect(out.byGrade).toMatchObject({ A: 1, B: 1, C: 1, D: 1, F: 0 });
  });

  test('rows GT never translated are named, so a rate is never taken over them', () => {
    // The Phase 1 run in hand is 123 usable rows out of 304: the rest are
    // rate-limited, ungraded, and unmeasurable. `total` counts every row it
    // was handed, so a summary that reported only `total` would let a reader
    // divide graded outcomes by rows that were never translated at all.
    const out = summarize([
      ok({ grade: 'A' }),
      ok({ grade: 'B' }),
      { ...ok(), gtCandidate: '', measurable: false, resultKind: 'rate-limited', grade: null },
      { ...ok(), gtCandidate: '', measurable: false, resultKind: 'rate-limited', grade: null },
    ]);
    expect(out).toMatchObject({ total: 4, measurable: 2, unusable: 2, graded: 2, usable: 2 });
  });

  test('a measurable row nobody has graded yet is neither usable nor unusable', () => {
    // Ungraded is the state most of the dataset is actually in, and it is not
    // the same as failed.
    const out = summarize([ok({ grade: 'A' }), { ...ok(), grade: null }]);
    expect(out).toMatchObject({ total: 2, measurable: 2, unusable: 0, graded: 1, usable: 1, failures: 0 });
  });

  test('counts a record with any violation', () => {
    const out = summarize([ok({ violations: { ...ok().violations, meaning: true } })]);
    expect(out.violations).toBe(1);
  });
});
