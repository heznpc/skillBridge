/**
 * Phase 2 — joining a refinement candidate to the GT baseline it was made from.
 *
 * The question is narrow, and stating it is most of the work: on the rows GT
 * already produced, does the optional post-editor make them better, leave them
 * alone, or make them worse? It is not "is the model good at Korean", and it
 * is not a re-run of Phase 1.
 *
 * Everything here exists because the ways that question gets answered WRONGLY
 * are the ways that look like answers:
 *
 *   - A candidate joined to a baseline the model never saw reads as a quality
 *     result. So a candidate carries the baseline text it was produced from,
 *     and a mismatch is refused rather than scored.
 *   - A denominator that includes the rows GT never translated reports a
 *     success rate for work that never happened. So eligibility is decided by
 *     the baseline row, and unusable rows are neither paired nor counted.
 *   - A deterministic PASS means nothing measurable broke. It does not mean
 *     the meaning survived. It is recorded as `deterministic`, next to a
 *     `semantic` field that stays null until a human fills it, and a pass on
 *     its own is never an improvement.
 *
 * The validator is the SHIPPED one, loaded as-is from src/lib. The runtime
 * decides whether a refinement replaces the baseline on screen with exactly
 * this function; measuring a re-implementation of it would report a copy's
 * behaviour as the product's. Note the direction of that relationship: this
 * module borrows the runtime's veto, it does not describe what the runtime
 * did. A row that was accepted at runtime and cached is not an "improved" row
 * here, and nothing in this file reads the refined cache.
 */

const fs = require('fs');
const path = require('path');
const { rowKey } = require('../run-gt-title-experiment');

/** The candidate-file shape this module reads. */
const REFINEMENT_SCHEMA_VERSION = 1;

/** Why a candidate row has no usable refinement. Mirrors the Phase 1 split. */
const CANDIDATE_KIND = Object.freeze({
  OK: 'ok',
  /** The model answered, but not with something usable. */
  MODEL_ERROR: 'model-error',
  /** The call never produced an answer at all. */
  EMPTY: 'empty',
  /** The harness itself threw. */
  HARNESS_ERROR: 'harness-error',
});

const GRADE_ORDER = Object.freeze(['F', 'D', 'C', 'B', 'A']);

/**
 * The extension's own refinement validator, evaluated as the browser does.
 *
 * src/lib/refinement-validator.js publishes onto `window` / `globalThis.module`
 * rather than Node's `module`, so it is loaded through the same shim the unit
 * tests use instead of being copied or re-exported.
 */
function loadShippedValidator() {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'lib', 'refinement-validator.js'), 'utf8');
  const shim = { module: { exports: {} } };
  new Function('globalThis', src)(shim);
  return shim.module.exports;
}

/**
 * Index rows by locale + source.
 *
 * A repeated key is a hard error rather than a last-one-wins overwrite: two
 * rows claiming the same identity means one dataset is describing something
 * the other is not, and silently keeping one of them is how a result gets
 * attributed to the wrong text.
 */
function indexRows(records, { label }) {
  const index = new Map();
  for (const row of records || []) {
    const key = rowKey(row.locale, row.source);
    if (index.has(key)) {
      throw new Error(`${label} collision: ${row.locale} / ${row.source} appears more than once`);
    }
    index.set(key, row);
  }
  return index;
}

/** Rows GT actually produced a candidate for — the only rows Phase 2 can measure. */
const isEligibleBaseline = (row) => row?.resultKind === 'ok' && row?.measurable === true && !!row?.gtCandidate;

/**
 * Join a candidate run to its baseline run.
 *
 * Returns the pairs that may be scored plus, separately, every row that could
 * not be paired and why. None of the rejected categories is a quiet drop:
 * each one changes what a denominator means, so each is reported.
 */
function pairRows({ baseline, candidates }) {
  if (!candidates || typeof candidates !== 'object') throw new Error('candidate file is not a run');
  if (candidates.schemaVersion !== REFINEMENT_SCHEMA_VERSION) {
    throw new Error(
      `candidate schemaVersion ${JSON.stringify(candidates.schemaVersion)} is not the one this harness reads ` +
        `(${REFINEMENT_SCHEMA_VERSION})`,
    );
  }
  const baseIndex = indexRows(baseline?.records, { label: 'baseline' });
  const candIndex = indexRows(candidates.records, { label: 'candidate' });

  const pairs = [];
  const orphaned = [];
  const stale = [];
  const seen = new Set();

  for (const [key, candidate] of candIndex) {
    const base = baseIndex.get(key);
    if (!base) {
      orphaned.push({ locale: candidate.locale, source: candidate.source, reason: 'no-baseline-row' });
      continue;
    }
    if (!isEligibleBaseline(base)) {
      // GT never produced text here, so there was nothing to post-edit. Scoring
      // this would credit or blame the refinement pass for Phase 1's gap.
      orphaned.push({ locale: candidate.locale, source: candidate.source, reason: 'baseline-not-measurable' });
      continue;
    }
    if (String(candidate.baseline ?? '') !== String(base.gtCandidate)) {
      // The candidate was produced from different text. Joining it anyway is
      // the single most convincing way to get a wrong answer here.
      stale.push({
        locale: candidate.locale,
        source: candidate.source,
        baselineInRun: base.gtCandidate,
        baselineInCandidate: candidate.baseline ?? '',
      });
      continue;
    }
    seen.add(key);
    pairs.push({
      locale: base.locale,
      source: base.source,
      baseline: base.gtCandidate,
      refined: candidate.refined ?? '',
      candidateKind: candidate.resultKind || CANDIDATE_KIND.OK,
      baselineGrade: base.grade ?? null,
      refinedGrade: candidate.grade ?? null,
      rationale: candidate.rationale ?? null,
    });
  }

  const eligibleKeys = [...baseIndex].filter(([, row]) => isEligibleBaseline(row)).map(([key]) => key);
  return {
    pairs,
    orphaned,
    stale,
    // Only eligible rows can be "missing" a candidate. A rate-limited Phase 1
    // row is not work the refinement pass failed to do.
    missing: eligibleKeys.filter((key) => !seen.has(key)),
    eligible: eligibleKeys.length,
  };
}

/**
 * Score one pair.
 *
 * `deterministic` and `semantic` are kept apart on purpose. The first is the
 * runtime's veto: did anything measurable break. The second is a judgement
 * nothing here can make, so it stays null until someone records one.
 */
function scorePair(pair, { protectedTerms = [], validate }) {
  if (pair.candidateKind !== CANDIDATE_KIND.OK) {
    // An empty or errored candidate trivially loses every protected term, so
    // running the validator on it would file a failed call as terminology
    // damage.
    return { ...pair, deterministic: null, semantic: null, outcome: 'failed' };
  }
  const deterministic = validate({
    baseline: pair.baseline,
    candidate: pair.refined,
    source: pair.source,
    targetLang: pair.locale,
    protectedTerms,
  });
  const semantic =
    pair.baselineGrade && pair.refinedGrade ? { baseline: pair.baselineGrade, refined: pair.refinedGrade } : null;

  let outcome;
  if (!deterministic.ok) {
    // A rejected refinement never reaches a reader, so it cannot be an
    // improvement — and a grader who liked the wording must not outvote a
    // lost brand name.
    outcome = 'regression';
  } else if (!semantic) {
    outcome = 'ungraded';
  } else {
    const before = GRADE_ORDER.indexOf(semantic.baseline);
    const after = GRADE_ORDER.indexOf(semantic.refined);
    outcome = after > before ? 'improved' : after < before ? 'regression' : 'neutral';
  }
  return { ...pair, deterministic, semantic, outcome };
}

/**
 * Roll scored pairs up into the table a decision would be read off.
 *
 * Reports counts and the coverage they rest on, never a single score. The
 * Phase 1 numbers travel with the summary because 123 usable rows out of 304
 * is the difference between a finding and a fragment, and nothing downstream
 * can recover that from the pair counts.
 */
function summarizeExperiment(scored, { eligibleBaselineRows, missing = [], phase1 }) {
  const outcomes = { improved: 0, neutral: 0, regression: 0 };
  const violationsByCategory = Object.create(null);
  let graded = 0;
  let ungraded = 0;
  let failed = 0;
  let passed = 0;
  let rejected = 0;

  for (const row of scored) {
    if (row.outcome === 'failed') {
      failed += 1;
      continue;
    }
    if (row.deterministic?.ok) passed += 1;
    else if (row.deterministic) rejected += 1;
    for (const violation of row.deterministic?.violations || []) {
      violationsByCategory[violation] = (violationsByCategory[violation] || 0) + 1;
    }
    if (row.outcome === 'ungraded') {
      ungraded += 1;
      continue;
    }
    graded += 1;
    outcomes[row.outcome] += 1;
  }

  return {
    pairs: scored.length,
    graded,
    ungraded,
    failed,
    outcomes,
    deterministic: { passed, rejected },
    violationsByCategory,
    coverage: { eligibleBaselineRows, paired: scored.length, missing: missing.length },
    phase1,
  };
}

/**
 * Turn the evidence into A / B / C — or say why it cannot.
 *
 *   A — keep the production UI
 *   B — experimental / hidden
 *   C — disable
 *
 * `criteria` has no default, and that is the point. Where the bar sits is a
 * product decision; a threshold invented here would be this harness quietly
 * choosing one and then reporting its own choice back as a measurement.
 * Without criteria the evidence is returned and no verdict is claimed.
 */
function releaseVerdict(summary, criteria) {
  const caveats = [];
  if (summary.phase1 && summary.phase1.usableRows < summary.phase1.totalRows) caveats.push('phase-1-partial');
  if (summary.ungraded > 0) caveats.push('ungraded-pairs');
  if (summary.failed > 0) caveats.push('failed-candidates');
  if (summary.coverage?.missing > 0) caveats.push('missing-candidates');

  const answer = (verdict, reason) => ({ verdict, reason, caveats, evidence: summary });
  if (!summary.graded) return answer(null, 'no graded pairs — a deterministic pass is not a quality judgement');
  if (!criteria) return answer(null, 'no release criteria supplied — the bar is not this harness to choose');

  const improved = summary.outcomes.improved / summary.graded;
  const regression = summary.outcomes.regression / summary.graded;
  if (regression > criteria.regressionAtMost) return answer('C', `regression ${regression.toFixed(3)} over the bar`);
  if (improved >= criteria.improvedAtLeast) return answer('A', `improved ${improved.toFixed(3)} at or over the bar`);
  return answer('B', `improved ${improved.toFixed(3)} under the bar, regressions within it`);
}

module.exports = {
  REFINEMENT_SCHEMA_VERSION,
  CANDIDATE_KIND,
  GRADE_ORDER,
  loadShippedValidator,
  indexRows,
  isEligibleBaseline,
  pairRows,
  scorePair,
  summarizeExperiment,
  releaseVerdict,
};
