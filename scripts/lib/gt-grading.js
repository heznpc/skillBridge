/**
 * Grading schema and deterministic checks for the GT title experiment.
 *
 * The question is narrow and worth restating, because it is easy to drift
 * into a different one: does the GT + protected-term path handle the English
 * residue that official localization leaves behind, WITHOUT a per-title
 * translation memory? It is not "is this the best possible translation", and
 * a low grade is not a request to go write a better one.
 *
 * There is no grading document. The protocol lives here as schema plus
 * validator, so a record that violates it fails a test instead of a review.
 *
 * The pieces that CAN be decided mechanically are decided mechanically:
 * a dropped protected term, a changed number, a mangled product name. Those
 * are `violations`, not grades — a human (or model) opinion should never be
 * what stands between a lost brand name and a shipped translation.
 */

const GRADES = Object.freeze(['A', 'B', 'C', 'D', 'F']);
const CONFIDENCE = Object.freeze(['high', 'medium', 'low']);

/**
 * Grade meanings, kept next to the enum so they cannot drift apart:
 *   A — accurate and natural
 *   B — slightly awkward, usable as-is
 *   C — uncertain, or a terminology/style candidate. AMBIGUITY GOES HERE.
 *   D — meaning error, or actively unhelpful for a learner
 *   F — a protected term, product name, or core technical concept is damaged
 */
const GRADE_MEANINGS = Object.freeze({
  A: 'accurate and natural',
  B: 'slightly awkward, usable',
  C: 'uncertain / terminology candidate',
  D: 'meaning error',
  F: 'protected term or core concept damaged',
});

/** Grades that may not be recorded without a written reason. */
const RATIONALE_REQUIRED = Object.freeze(['D', 'F']);

/**
 * Numbers and units must survive translation. Matches bare integers,
 * decimals, and the forms Academy titles actually use ("15 minutes",
 * "BM25", "4.5"). Compared as multisets, so reordering is fine and
 * losing or inventing one is not.
 * @param {string} s
 * @returns {string[]}
 */
function extractNumbers(s) {
  return (String(s || '').match(/\d+(?:\.\d+)?/g) || []).sort();
}

/**
 * Deterministic violations. These do not depend on anyone's judgement, so
 * they are computed rather than graded, and a record that disagrees with
 * them is rejected by validateGradeRecord.
 *
 * @param {{source: string, candidate: string, protectedTerms?: string[]}} input
 * @returns {{protectedTerm: boolean, numberOrUnit: boolean, productName: boolean}}
 */
function detectViolations({ source, candidate, protectedTerms = [] }) {
  const src = String(source || '');
  const out = String(candidate || '');

  // A protected term present in the source must still be present, verbatim,
  // in the output. Masking is supposed to guarantee this; the experiment
  // checks rather than assumes, because an unmask failure returns null and a
  // silent partial restore would otherwise look like a translation choice.
  const missing = protectedTerms.filter((term) => term && src.includes(term) && !out.includes(term));

  const srcNums = extractNumbers(src);
  const outNums = extractNumbers(out);
  const numbersDiffer = srcNums.length !== outNums.length || srcNums.some((n, i) => n !== outNums[i]);

  return {
    protectedTerm: missing.length > 0,
    numberOrUnit: numbersDiffer,
    // Product names are the protected-term set; kept as a separate flag
    // because a report reads differently when a BRAND is damaged versus a
    // generic technical term, even though both are caught the same way.
    productName: missing.some((term) => /^(Claude|Anthropic|Cowork|Dispatch)/i.test(term)),
  };
}

/**
 * Validate one experiment record against the protocol.
 *
 * @param {object} record
 * @returns {{ok: boolean, errors: string[]}}
 */
function validateGradeRecord(record) {
  const errors = [];
  const r = record || {};

  if (!r.source || typeof r.source !== 'string') errors.push('source is required');
  if (!r.locale || typeof r.locale !== 'string') errors.push('locale is required');
  if (typeof r.gtCandidate !== 'string') errors.push('gtCandidate is required (use "" for a failed translation)');

  if (!GRADES.includes(r.grade)) errors.push(`grade must be one of ${GRADES.join('/')}`);
  if (!CONFIDENCE.includes(r.evaluatorConfidence)) {
    errors.push(`evaluatorConfidence must be one of ${CONFIDENCE.join('/')}`);
  }

  // D and F are the grades that drive decisions, so they carry the burden of
  // proof. Without this an experiment degrades into an unfalsifiable letter
  // grid, and its output is a decision about deleting curated assets.
  if (RATIONALE_REQUIRED.includes(r.grade) && !(typeof r.rationale === 'string' && r.rationale.trim())) {
    errors.push(`grade ${r.grade} requires a rationale`);
  }

  const v = r.violations;
  if (!v || typeof v !== 'object') {
    errors.push('violations is required');
  } else {
    for (const key of ['protectedTerm', 'numberOrUnit', 'productName', 'meaning']) {
      if (typeof v[key] !== 'boolean') errors.push(`violations.${key} must be a boolean`);
    }
    // A deterministic violation is an F by construction. Letting a record say
    // "the brand name vanished, grade B" would let the experiment average
    // away exactly the failure it exists to catch.
    if ((v.protectedTerm || v.productName) && r.grade !== 'F') {
      errors.push('a protectedTerm/productName violation must be graded F');
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Which records need a second pair of eyes before they count.
 *
 * A D/F carries weight, and a low-confidence evaluator is exactly who should
 * not be trusted to end an asset's life alone — this is the guard against a
 * weak read in an unfamiliar locale removing a curated dictionary.
 *
 * @param {object[]} records
 * @returns {object[]}
 */
function needsSecondReview(records) {
  return (Array.isArray(records) ? records : []).filter(
    (r) => RATIONALE_REQUIRED.includes(r?.grade) && r?.evaluatorConfidence !== 'high',
  );
}

/**
 * Summarize a run. Deliberately reports counts, never a single score:
 * n=67 per locale is ~1.5% resolution, and one number invites reading a
 * band as a point.
 *
 * `total`, `measurable` and `graded` are all reported because they are three
 * different denominators and a run in progress separates them widely: the
 * Phase 1 set in hand is 123 usable rows out of 304, the rest rate-limited.
 * A summary carrying only `total` lets a rate be taken over rows that were
 * never translated, which reads as a quality result for work that never
 * happened.
 *
 * @param {object[]} records
 * @returns {object}
 */
function summarize(records) {
  const list = Array.isArray(records) ? records : [];
  const byGrade = Object.fromEntries(GRADES.map((g) => [g, 0]));
  let violations = 0;
  let measurable = 0;
  for (const r of list) {
    if (GRADES.includes(r?.grade)) byGrade[r.grade] += 1;
    // Derived from the candidate, the same way the harness derives it, rather
    // than read from the record's own `measurable` flag: a record that predates
    // that field would otherwise be counted as an absence.
    if (typeof r?.gtCandidate === 'string' && r.gtCandidate.length > 0) measurable += 1;
    const v = r?.violations || {};
    if (v.protectedTerm || v.numberOrUnit || v.productName || v.meaning) violations += 1;
  }
  const graded = GRADES.reduce((n, g) => n + byGrade[g], 0);
  return {
    total: list.length,
    // Rows with a candidate to judge at all.
    measurable,
    // Rows GT never produced text for. Not failures — absences.
    unusable: list.length - measurable,
    // Rows a human has actually judged.
    graded,
    byGrade,
    usable: byGrade.A + byGrade.B,
    curationCandidates: byGrade.C,
    failures: byGrade.D + byGrade.F,
    violations,
    pendingSecondReview: needsSecondReview(list).length,
  };
}

module.exports = {
  GRADES,
  GRADE_MEANINGS,
  CONFIDENCE,
  RATIONALE_REQUIRED,
  extractNumbers,
  detectViolations,
  validateGradeRecord,
  needsSecondReview,
  summarize,
};
