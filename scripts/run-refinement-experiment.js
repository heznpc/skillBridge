#!/usr/bin/env node
/**
 * GT Phase 2 — does the optional refinement pass improve the Phase 1 rows?
 *
 * Reads a Phase 1 run and a refinement candidate file, joins them, scores each
 * pair with the SHIPPED validator, and prints the evidence a release decision
 * would be read off:
 *
 *   node scripts/run-refinement-experiment.js \
 *     --baseline snapshots/academy/gt-phase1-2026-08-27.json \
 *     --candidates snapshots/academy/refinement-candidates-….json \
 *     --criteria snapshots/academy/refinement-criteria.json
 *
 * Calls nothing. Producing the candidates is a separate job with its own
 * consent and engine settings; this only measures what came back, so it can be
 * run and re-run on the same files without spending a model call.
 *
 * The candidate file:
 *
 *   {
 *     "schemaVersion": 1,
 *     "engine": "cloud",           // which refinement engine produced these
 *     "model": "claude-haiku-4-5",
 *     "records": [
 *       {
 *         "source":   "Making a request",   // the English title
 *         "locale":   "ko",
 *         "baseline": "요청하기",            // the GT text the model was given
 *         "refined":  "요청 보내기",         // what came back
 *         "resultKind": "ok",               // ok | model-error | empty | harness-error
 *         "grade": null,                    // A–F, filled in during grading
 *         "rationale": null
 *       }
 *     ]
 *   }
 *
 * `baseline` is required on every record and is checked against the Phase 1
 * run. A candidate produced from text the baseline run does not contain is
 * refused rather than scored: joining it anyway is the most convincing way to
 * get a wrong answer out of this.
 *
 * The criteria file is `{ "improvedAtLeast": 0.5, "regressionAtMost": 0.15 }`.
 * There is no default. Where the bar sits is a product decision, and a
 * threshold invented here would be this harness choosing one and then
 * reporting its own choice back as a measurement — so without a criteria file
 * the evidence is printed and no verdict is claimed.
 */

const fs = require('fs');
const path = require('path');
const { loadProtectedTerms } = require('./run-gt-title-experiment');
const {
  loadShippedValidator,
  pairRows,
  scorePair,
  summarizeExperiment,
  releaseVerdict,
} = require('./lib/refinement-experiment');

function argVal(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const readJson = (file, label) => {
  if (!fs.existsSync(file)) throw new Error(`no ${label} at ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};

function main() {
  const baselinePath = argVal('--baseline', null);
  const candidatesPath = argVal('--candidates', null);
  if (!baselinePath || !candidatesPath) {
    throw new Error('--baseline <phase1 run.json> and --candidates <candidates.json> are both required');
  }
  const baseline = readJson(baselinePath, 'Phase 1 run');
  const candidates = readJson(candidatesPath, 'candidate file');
  const criteriaPath = argVal('--criteria', null);
  const criteria = criteriaPath ? readJson(criteriaPath, 'criteria file') : null;

  const { pairs, orphaned, stale, missing, eligible } = pairRows({ baseline, candidates });
  const { validateRefinement } = loadShippedValidator();
  const termsByLocale = new Map();
  const termsFor = (locale) => {
    if (!termsByLocale.has(locale)) termsByLocale.set(locale, loadProtectedTerms(locale).getProtectedTermList());
    return termsByLocale.get(locale);
  };
  const scored = pairs.map((pair) =>
    scorePair(pair, { protectedTerms: termsFor(pair.locale), validate: validateRefinement }),
  );

  const records = baseline.records || [];
  const summary = summarizeExperiment(scored, {
    eligibleBaselineRows: eligible,
    missing,
    phase1: { totalRows: records.length, usableRows: records.filter((r) => r.resultKind === 'ok').length },
  });
  const decision = releaseVerdict(summary, criteria);

  console.log(`Phase 1: ${summary.phase1.usableRows}/${summary.phase1.totalRows} rows usable`);
  console.log(`pairs: ${summary.pairs} of ${eligible} eligible (${missing.length} missing a candidate)`);
  if (orphaned.length) console.log(`  orphaned candidates: ${orphaned.length}`);
  // Called out on its own line because it is the one rejection that means the
  // two files disagree about what was measured, rather than that a row is
  // simply absent.
  if (stale.length) console.log(`  REFUSED — candidate baseline does not match the run: ${stale.length}`);
  console.log(`deterministic: ${summary.deterministic.passed} passed, ${summary.deterministic.rejected} rejected`);
  for (const [category, n] of Object.entries(summary.violationsByCategory)) console.log(`    ${category}: ${n}`);
  console.log(
    `graded: ${summary.graded} (improved ${summary.outcomes.improved}, neutral ${summary.outcomes.neutral}, ` +
      `regression ${summary.outcomes.regression}); ungraded ${summary.ungraded}; failed ${summary.failed}`,
  );
  console.log(`\nverdict: ${decision.verdict ?? 'none'} — ${decision.reason}`);
  if (decision.caveats.length) console.log(`caveats: ${decision.caveats.join(', ')}`);

  const outPath = argVal('--out', null);
  if (outPath) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(
      outPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          baseline: { path: path.resolve(baselinePath), generatedAt: baseline.generatedAt ?? null },
          candidates: {
            path: path.resolve(candidatesPath),
            engine: candidates.engine ?? null,
            model: candidates.model ?? null,
          },
          criteria,
          decision,
          orphaned,
          stale,
          missing,
          rows: scored,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`\nwrote ${outPath}`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`refinement experiment failed: ${err.message}`);
    process.exit(1);
  }
}
