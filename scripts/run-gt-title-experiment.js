#!/usr/bin/env node
/**
 * GT Phase 1 — does the shipped GT path handle Academy's English residue
 * without a per-title translation memory?
 *
 * Framing matters here. #326 measured that on ko/ja/zh-CN/zh-TW the official
 * localization already covers course and quiz titles while section titles,
 * lesson titles and bodies come back MIXED. The residue is what SkillBridge
 * would translate. This experiment asks whether GT + protected-term masking
 * is good enough for it — not whether these are the best possible
 * translations, and not whether Academy should be machine-translated wholesale.
 *
 * Run manually; it calls Google Translate:
 *
 *   node scripts/run-gt-title-experiment.js --locales ko,ja
 *   node scripts/run-gt-title-experiment.js --limit 10 --out run.json
 *
 * The candidates come from the SHIPPED code path — src/lib/protected-terms.js
 * is loaded as-is and the request is the same POST the service worker makes.
 * Re-implementing masking here would test a copy of the pipeline rather than
 * the pipeline.
 *
 * RATE LIMITING. The endpoint is the unauthenticated `client=gtx` one the
 * extension uses, and it throttles per source IP: a run from one machine can
 * earn HTTP 429 ("your computer or network may be sending automated
 * queries") after a handful of requests, at which point every later row is an
 * error rather than a translation. Errors are recorded, never dropped — a run
 * that silently omitted them would report a clean sheet. Check the printed
 * error count before reading any result, and re-run from a different network
 * or in small batches spread over time if it is non-zero.
 *
 * Output is ungraded. Grades and rationales are added afterwards, and every
 * record has to satisfy scripts/lib/gt-grading.js before it counts. es/fr are
 * INCLUDED: #326 reports them `unknown` because character-class detection
 * cannot measure official coverage for Latin-script targets, which says
 * nothing about whether GT translates them well. Their evaluator confidence
 * is recorded separately so they never silently join a coverage-weighted
 * conclusion.
 */

const fs = require('fs');
const path = require('path');
const { detectViolations } = require('./lib/gt-grading');

const GT_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const DEFAULT_LOCALES = ['ko', 'ja', 'zh-CN', 'zh-TW', 'es', 'fr', 'de', 'it', 'pt-BR', 'ru', 'vi', 'id'];
const REQUEST_GAP_MS = 400;

function argVal(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** Load the shipped protected-terms module into this process. */
function loadProtectedTerms(locale) {
  global.window = global.window || {};
  delete require.cache[require.resolve('../src/lib/protected-terms.js')];
  require('../src/lib/protected-terms.js');
  const pt = global.window._protectedTerms;
  const dictPath = path.join(__dirname, '..', 'src', 'data', `${locale}.json`);
  const dict = fs.existsSync(dictPath) ? JSON.parse(fs.readFileSync(dictPath, 'utf8')) : {};
  pt.resetProtectedTerms?.();
  pt.buildProtectedTermsMap(locale, { getProtectedTerms: () => dict._protected || {} });
  return pt;
}

/**
 * Why a row has no candidate.
 *
 * Kept separate because these are not the same finding and must not be read
 * as one. A rate limit says nothing about translation quality; a malformed
 * response says the endpoint changed; a failed unmask says OUR pipeline lost
 * a protected term. Collapsing them — as an earlier version did by returning
 * a bare null for both an empty translation and a failed unmask — means a
 * re-run after the rate limit lifts still cannot tell a pipeline bug from a
 * quiet endpoint.
 */
const RESULT_KIND = Object.freeze({
  OK: 'ok',
  RATE_LIMITED: 'rate-limited',
  HTTP_ERROR: 'http-error',
  NETWORK: 'network',
  MALFORMED_RESPONSE: 'malformed-response',
  EMPTY_TRANSLATION: 'empty-translation',
  UNMASK_FAILED: 'unmask-failed',
});

/**
 * One translation through the shipped shape: mask, POST `q` in the body,
 * unmask.
 *
 * Returns `{ kind, text, detail }` rather than a string-or-null so the caller
 * can record WHY a row is unusable. Nothing here throws for an expected
 * failure; only a caller bug should.
 */
async function translateOnce(text, targetLang, pt) {
  const masked = pt.maskProtectedTerms(text.trim());
  const toSend = masked?.tokens.length ? masked.text : text.trim();
  const url = `${GT_ENDPOINT}?client=gtx&sl=en&tl=${targetLang}&dt=t`;

  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ q: toSend }).toString(),
    });
  } catch (err) {
    // DNS, TLS, offline — the request never got an answer at all.
    return { kind: RESULT_KIND.NETWORK, text: null, detail: String(err?.message || err) };
  }

  if (resp.status === 429) {
    // The endpoint is throttling this source IP. Called out by name because
    // it is the one failure that means "come back later" rather than
    // "something is wrong with the code".
    return { kind: RESULT_KIND.RATE_LIMITED, text: null, detail: 'HTTP 429' };
  }
  if (!resp.ok) return { kind: RESULT_KIND.HTTP_ERROR, text: null, detail: `HTTP ${resp.status}` };

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    // A 200 that is not the JSON shape this endpoint documents — an interstitial,
    // a consent wall, or a changed contract.
    return { kind: RESULT_KIND.MALFORMED_RESPONSE, text: null, detail: String(err?.message || err) };
  }

  // Valid JSON is not the same as the documented shape, and the difference
  // decides who is at fault. This endpoint answers `[[[translated, source,
  // …], …], …]`, so `{}`, `[]` and `[{}]` are all parseable and all wrong —
  // reading them with `(data?.[0] || []).map(…)` would score the first two as
  // an empty translation, blaming Google for a quiet response, and make the
  // third throw somewhere the harness would record as its own bug. Neither is
  // true: a wrong shape means the contract moved.
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    return {
      kind: RESULT_KIND.MALFORMED_RESPONSE,
      text: null,
      detail: `unexpected shape: ${Array.isArray(data) ? `array[0]=${typeof data[0]}` : typeof data}`,
    };
  }
  const segments = data[0];
  // The translated field has to BE a string, not merely present.
  //
  // Checking the segment is an array is not enough: `[[[{}, 'source']]]` and
  // `[[[42, 'source']]]` both survive that and then coerce, through
  // `seg[0] || ''`, into "[object Object]" and "42" — recorded as a perfectly
  // good translation. A contract drift that changes the field's TYPE is
  // exactly the kind this check exists to catch, and it is the one shape that
  // would otherwise enter the graded data as if it were real.
  //
  // An empty string stays legal: that is a well-formed response carrying no
  // translation, which the caller reports as EMPTY_TRANSLATION below.
  const badSegment = segments.findIndex((seg) => !Array.isArray(seg) || typeof seg[0] !== 'string');
  if (badSegment !== -1) {
    const seg = segments[badSegment];
    return {
      kind: RESULT_KIND.MALFORMED_RESPONSE,
      text: null,
      detail: Array.isArray(seg)
        ? `segment ${badSegment} translated field is ${seg[0] === null ? 'null' : typeof seg[0]}`
        : `segment ${badSegment} is not an array`,
    };
  }

  const translated = segments.map((seg) => seg[0]).join('');
  // Only now, with the shape confirmed, does an empty string mean Google
  // returned nothing to translate.
  if (!translated) return { kind: RESULT_KIND.EMPTY_TRANSLATION, text: null, detail: null };
  if (!masked?.tokens.length) return { kind: RESULT_KIND.OK, text: translated, detail: null };

  const unmasked = pt.unmaskProtectedTerms(translated, masked);
  if (unmasked === null || unmasked === undefined) {
    // OUR pipeline lost the round trip, not Google's. A quality run that
    // counted this as an empty translation would blame the wrong component.
    return { kind: RESULT_KIND.UNMASK_FAILED, text: null, detail: `${masked.tokens.length} tokens` };
  }
  return { kind: RESULT_KIND.OK, text: unmasked, detail: null };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const titlesPath = argVal('--titles', path.join('snapshots', 'academy', 'phase1-titles.json'));
  if (!fs.existsSync(titlesPath)) {
    throw new Error(`no title set at ${titlesPath} — generate it with --collect first`);
  }
  const titles = JSON.parse(fs.readFileSync(titlesPath, 'utf8'));
  const limit = Number(argVal('--limit', 0)) || titles.length;
  const locales = (argVal('--locales', '') || DEFAULT_LOCALES.join(',')).split(',').map((s) => s.trim());
  const outPath = argVal(
    '--out',
    path.join('snapshots', 'academy', `gt-phase1-${new Date().toISOString().slice(0, 10)}.json`),
  );

  const records = [];
  for (const locale of locales) {
    const pt = loadProtectedTerms(locale);
    const protectedTerms = pt.getProtectedTermList();
    let failures = 0;
    const kinds = Object.create(null);
    for (const source of titles.slice(0, limit)) {
      let result;
      try {
        result = await translateOnce(source, locale, pt);
      } catch (err) {
        // Only a bug in the harness itself reaches here.
        result = { kind: 'harness-error', text: null, detail: String(err?.message || err) };
      }
      const candidate = result.text;
      const error =
        result.kind === RESULT_KIND.OK ? null : `${result.kind}${result.detail ? `: ${result.detail}` : ''}`;
      kinds[result.kind] = (kinds[result.kind] || 0) + 1;
      if (result.kind !== RESULT_KIND.OK) failures += 1;
      // A request error is not a translation quality signal, and pretending
      // otherwise poisons the experiment: an empty candidate trivially
      // "loses" every protected term. Violations are only meaningful when
      // there is a candidate to inspect.
      const measurable = typeof candidate === 'string' && candidate.length > 0;
      records.push({
        source,
        locale,
        gtCandidate: candidate ?? '',
        // Computed, never graded: a lost brand name should not depend on
        // anyone noticing it.
        violations: measurable
          ? { ...detectViolations({ source, candidate, protectedTerms }), meaning: false }
          : { protectedTerm: false, numberOrUnit: false, productName: false, meaning: false },
        measurable,
        // Filled in during grading; the schema rejects a D/F without one.
        grade: null,
        evaluatorConfidence: null,
        rationale: null,
        // Recorded on every row, so a re-run can be filtered by cause without
        // re-deriving it from a message string.
        resultKind: result.kind,
        ...(error ? { error } : {}),
      });
      await sleep(REQUEST_GAP_MS);
    }
    const flagged = records.filter(
      (r) => r.locale === locale && (r.violations.protectedTerm || r.violations.numberOrUnit),
    );
    const breakdown = Object.entries(kinds)
      .map(([k, n]) => `${k}=${n}`)
      .join(' ');
    console.log(`  ${locale}: ${limit} titles, ${flagged.length} deterministic violations, ${failures} unusable`);
    console.log(`    ${breakdown}`);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), titleCount: limit, records }, null, 2)}\n`,
  );
  console.log(`\nwrote ${outPath}: ${records.length} ungraded records`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`experiment failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { translateOnce, loadProtectedTerms, RESULT_KIND };
