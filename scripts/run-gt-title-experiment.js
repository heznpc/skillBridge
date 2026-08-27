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
 *   node scripts/run-gt-title-experiment.js --resume snapshots/academy/gt-phase1-…json
 *
 * `--resume` re-requests only the rows an earlier run could not use. The rate
 * limit here opens in short, unpredictable windows — one run collected all 76
 * Korean titles and was throttled 29 rows into Japanese, leaving 123 usable
 * rows in hand — so re-requesting what is already there spends the window on
 * work that is already done.
 *
 * A carried row keeps its candidate and any grade a human gave it, because
 * neither can have changed: the row is never re-requested. Its deterministic
 * violations are recomputed against the pipeline THIS run loaded, so one
 * dataset never mixes two definitions of a lost protected term, and a
 * disagreement with the snapshot is recorded rather than resolved quietly.
 *
 * The output file is rewritten after every request, not once at the end. The
 * whole premise is a window that closes without warning, and a run that saves
 * only on success loses every row it paid for.
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
  // Not a translation outcome at all: the harness itself threw. Kept in the
  // same enum so a resume filters it by the same rule as everything else — it
  // is unusable, so it is re-requested.
  HARNESS_ERROR: 'harness-error',
});

/**
 * The record shape this harness writes. 1 is the shape the ko/ja rows in hand
 * were collected under; 2 adds per-row provenance and violations recomputed
 * against the current pipeline. `--resume` reads both, because refusing 1
 * would throw away the only usable rows the resume exists to carry.
 */
const SCHEMA_VERSION = 2;
const RESUMABLE_SCHEMA_VERSIONS = Object.freeze([1, 2]);

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

/**
 * Identity of one experiment row.
 *
 * Locale and source are joined on NUL because NUL cannot occur in either — a
 * printable separator would let a contrived pair collide, and a collision here
 * silently swaps one locale's translation for another's in a graded dataset.
 */
function rowKey(locale, source) {
  return `${locale}\u0000${source}`;
}

/**
 * The locales a `--locales` string actually names.
 *
 * Empty entries are dropped rather than requested: a trailing comma would
 * otherwise send `tl=` and record the answer as a translation.
 */
function usableLocales(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Entries that appear more than once.
 *
 * Used for both halves of a row's identity — the title set and the locale
 * list — because a repeat in either emits the same row twice and counts it
 * twice in every denominator derived from the run.
 */
function duplicateEntries(entries) {
  const seen = new Set();
  const dupes = new Set();
  for (const entry of entries) (seen.has(entry) ? dupes : seen).add(entry);
  return [...dupes];
}

/**
 * Rows an earlier run got that this one may carry instead of re-requesting.
 *
 * Only `ok` is carried. Every other kind is re-requested — including
 * `unmask-failed`, which is OUR pipeline losing a protected term: carrying it
 * would freeze that bug into the dataset rather than retrying it under
 * whatever the pipeline does now.
 *
 * The schema version is checked rather than assumed. A run written by a
 * future record shape would otherwise be read field-by-field as if it were
 * this one, and the rows that survived would be silently wrong.
 */
function carryableRows(prior) {
  if (!prior || typeof prior !== 'object') throw new Error('resume file is not a run');
  if (prior.records !== undefined && !Array.isArray(prior.records)) {
    throw new Error(`resume file records is ${typeof prior.records}, not an array of rows`);
  }
  if (!RESUMABLE_SCHEMA_VERSIONS.includes(prior.schemaVersion)) {
    throw new Error(
      `resume file schemaVersion ${JSON.stringify(prior.schemaVersion)} is not one this harness can read ` +
        `(${RESUMABLE_SCHEMA_VERSIONS.join(', ')})`,
    );
  }
  const carried = new Map();
  for (const r of prior.records || []) {
    if (r?.resultKind === RESULT_KIND.OK) carried.set(rowKey(r.locale, r.source), r);
  }
  return carried;
}

/**
 * Read a run to resume, keeping enough about it to diagnose the result later.
 *
 * A resumed output is a blend of two collections. Without recording which
 * snapshot the older half came from, a surprising row in the final dataset
 * cannot be traced back to the run that produced it.
 */
function readResumeRun(resumePath) {
  if (!fs.existsSync(resumePath)) throw new Error(`no run to resume at ${resumePath}`);
  const prior = JSON.parse(fs.readFileSync(resumePath, 'utf8'));
  const carried = carryableRows(prior);
  return {
    carried,
    provenance: {
      path: path.resolve(resumePath),
      schemaVersion: prior.schemaVersion,
      generatedAt: prior.generatedAt ?? null,
      recordCount: (prior.records || []).length,
      carriedRows: carried.size,
    },
  };
}

/**
 * A carried row, re-derived under the pipeline THIS run is using.
 *
 * The candidate text is evidence and is carried verbatim; the deterministic
 * violations are not. They are a function of the current protected-term
 * dictionary and the current detector, so inheriting them would let one
 * dataset mix two definitions of "a protected term was lost" — and the half
 * computed under the older definition is exactly the half nobody would think
 * to re-check.
 *
 * `meaning` is the one violation a human decides, so it is carried, never
 * recomputed. A grade survives too: the candidate it was given for is
 * unchanged by definition, since a carried row is never re-requested.
 *
 * A disagreement between the snapshot and the recomputation is recorded
 * rather than quietly resolved — it means the pipeline moved under the
 * dataset, which is a finding, not a detail.
 */
function recheckCarriedRow(row, protectedTerms) {
  const violations = {
    ...detectViolations({ source: row.source, candidate: row.gtCandidate, protectedTerms }),
    meaning: row.violations?.meaning === true,
  };
  const before = row.violations || {};
  const drifted = ['protectedTerm', 'numberOrUnit', 'productName'].some((k) => before[k] !== violations[k]);
  return {
    ...row,
    violations,
    measurable: typeof row.gtCandidate === 'string' && row.gtCandidate.length > 0,
    provenance: 'carried',
    ...(drifted ? { violationsDrifted: true, carriedViolations: before } : {}),
  };
}

/**
 * Carried rows the current input does not ask for.
 *
 * Narrowing `--locales` or `--titles` on a resume would otherwise write an
 * output file missing every row outside the narrowed set — spending a rate
 * limit window and losing the rows the resume existed to protect.
 */
function droppedCarriedKeys(carried, { titles, locales }) {
  const wanted = new Set();
  for (const locale of locales) for (const source of titles) wanted.add(rowKey(locale, source));
  return [...carried.keys()].filter((k) => !wanted.has(k));
}

/** One output row for a freshly requested title. */
function buildRecord({ source, locale, result, protectedTerms }) {
  const candidate = result.text;
  // A request error is not a translation quality signal, and pretending
  // otherwise poisons the experiment: an empty candidate trivially "loses"
  // every protected term. Violations are only meaningful when there is a
  // candidate to inspect.
  const measurable = typeof candidate === 'string' && candidate.length > 0;
  const error = result.kind === RESULT_KIND.OK ? null : `${result.kind}${result.detail ? `: ${result.detail}` : ''}`;
  return {
    source,
    locale,
    gtCandidate: candidate ?? '',
    // Computed, never graded: a lost brand name should not depend on anyone
    // noticing it.
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
    // Which collection this row came from. A resumed output is a blend, and a
    // reader who cannot tell the halves apart cannot tell a locale that was
    // collected from one that was merely carried.
    provenance: 'fetched',
    ...(error ? { error } : {}),
  };
}

/**
 * The experiment loop, with its outside world injected.
 *
 * Separated from `main` so the rules that decide what is carried, requested
 * and persisted can be exercised as themselves. A test that stubs `fetch` and
 * then re-implements the selection rule proves only that the copy agrees with
 * itself.
 */
async function runExperiment({
  titles,
  locales,
  carried = new Map(),
  protectedTermsFor,
  translate,
  persist = async () => {},
  sleep: pause = sleep,
  log = () => {},
}) {
  const records = [];
  const tallies = [];
  for (const locale of locales) {
    const { pt, protectedTerms } = protectedTermsFor(locale);
    const tally = {
      locale,
      titles: titles.length,
      carried: 0,
      fetched: 0,
      unusable: 0,
      kinds: Object.create(null),
    };
    for (const source of titles) {
      const already = carried.get(rowKey(locale, source));
      if (already) {
        records.push(recheckCarriedRow(already, protectedTerms));
        tally.carried += 1;
        continue;
      }
      let result;
      try {
        result = await translate(source, locale, pt);
      } catch (err) {
        // Only a bug in the harness itself reaches here.
        result = { kind: RESULT_KIND.HARNESS_ERROR, text: null, detail: String(err?.message || err) };
      }
      records.push(buildRecord({ source, locale, result, protectedTerms }));
      tally.fetched += 1;
      tally.kinds[result.kind] = (tally.kinds[result.kind] || 0) + 1;
      if (result.kind !== RESULT_KIND.OK) tally.unusable += 1;
      // Persisted before the next request, not once at the end of the run. The
      // premise of `--resume` is that the window closes without warning, so a
      // run that only writes once pays for rows it then loses. A write that
      // fails stops the run: there is nothing to salvage by collecting more
      // into memory that will not survive the process.
      await persist(records);
      await pause(REQUEST_GAP_MS);
    }
    tally.violations = records.filter(
      (r) => r.locale === locale && (r.violations.protectedTerm || r.violations.numberOrUnit),
    ).length;
    tallies.push(tally);
    const kinds = Object.entries(tally.kinds)
      .map(([k, n]) => `${k}=${n}`)
      .join(' ');
    log(
      `  ${locale}: ${tally.titles} titles — ${tally.carried} carried, ${tally.fetched} requested ` +
        `(${tally.unusable} unusable), ${tally.violations} deterministic violations`,
    );
    if (kinds) log(`    ${kinds}`);
  }
  return { records, tallies };
}

/** Write a run so an interrupted write cannot truncate the previous one. */
function writeRun(outPath, payload) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const tmp = `${outPath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(tmp, outPath);
}

async function main() {
  const titlesPath = argVal('--titles', path.join('snapshots', 'academy', 'phase1-titles.json'));
  if (!fs.existsSync(titlesPath)) {
    throw new Error(`no title set at ${titlesPath} — generate it with --collect first`);
  }
  const allTitles = JSON.parse(fs.readFileSync(titlesPath, 'utf8'));
  const limit = Number(argVal('--limit', 0)) || allTitles.length;
  const titles = allTitles.slice(0, limit);
  const locales = usableLocales(argVal('--locales', '') || DEFAULT_LOCALES.join(','));
  const repeatedLocales = duplicateEntries(locales);
  if (repeatedLocales.length) {
    throw new Error(`--locales repeats ${repeatedLocales.join(', ')}, which would emit every row twice`);
  }
  if (!locales.length) throw new Error('--locales named no locale');
  const outPath = argVal(
    '--out',
    path.join('snapshots', 'academy', `gt-phase1-${new Date().toISOString().slice(0, 10)}.json`),
  );

  // A repeated title would produce two identical output rows and count twice
  // in every denominator derived from the run.
  const dupes = duplicateEntries(titles);
  if (dupes.length) {
    throw new Error(`${titlesPath} repeats ${dupes.length} title(s): ${dupes.slice(0, 3).join(', ')}`);
  }

  // Everything that can refuse this run does so before the first request. A
  // rate limit window is short and unpredictable; discovering a bad invocation
  // halfway through spends it for nothing.
  const resumePath = argVal('--resume', null);
  let carried = new Map();
  let resumedFrom = null;
  if (resumePath) {
    if (path.resolve(resumePath) === path.resolve(outPath)) {
      throw new Error(
        `--out would overwrite the run being resumed (${resumePath}). ` +
          'Write to a new file so the rows already in hand survive this run.',
      );
    }
    ({ carried, provenance: resumedFrom } = readResumeRun(resumePath));
    const dropped = droppedCarriedKeys(carried, { titles, locales });
    if (dropped.length) {
      const shown = dropped
        .slice(0, 3)
        .map((k) => k.replace('\u0000', '/'))
        .join(', ');
      throw new Error(
        `${dropped.length} usable row(s) from ${resumePath} fall outside this run's titles/locales ` +
          `(${shown}${dropped.length > 3 ? ', and more' : ''}). They would be missing from ${outPath}. ` +
          'Widen --locales/--titles to cover them, or resume from a run that matches this input.',
      );
    }
    console.log(`resuming ${resumePath}: ${carried.size} usable rows carried, the rest re-requested`);
  }

  const meta = () => ({
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    titleCount: limit,
    resumedFrom,
  });
  const { records, tallies } = await runExperiment({
    titles,
    locales,
    carried,
    protectedTermsFor: (locale) => {
      const pt = loadProtectedTerms(locale);
      return { pt, protectedTerms: pt.getProtectedTermList() };
    },
    translate: (source, locale, pt) => translateOnce(source, locale, pt),
    persist: async (partial) => writeRun(outPath, { ...meta(), partial: true, records: partial }),
    log: (line) => console.log(line),
  });

  writeRun(outPath, { ...meta(), partial: false, records });
  const carriedTotal = tallies.reduce((n, t) => n + t.carried, 0);
  const drifted = records.filter((r) => r.violationsDrifted).length;
  console.log(`\nwrote ${outPath}: ${records.length} ungraded records (${carriedTotal} carried)`);
  if (drifted) {
    console.log(`  ${drifted} carried row(s) score differently under the current pipeline (violationsDrifted)`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`experiment failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  translateOnce,
  loadProtectedTerms,
  RESULT_KIND,
  SCHEMA_VERSION,
  RESUMABLE_SCHEMA_VERSIONS,
  rowKey,
  duplicateEntries,
  usableLocales,
  carryableRows,
  readResumeRun,
  recheckCarriedRow,
  droppedCarriedKeys,
  buildRecord,
  runExperiment,
  writeRun,
};
