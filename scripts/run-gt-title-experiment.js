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
 * One translation through the shipped shape: mask, POST `q` in the body,
 * unmask. Returns null exactly where the extension returns null — an unmask
 * failure means the user keeps English, and recording that as an empty
 * candidate rather than dropping the row keeps the failure visible.
 */
async function translateOnce(text, targetLang, pt) {
  const masked = pt.maskProtectedTerms(text.trim());
  const toSend = masked?.tokens.length ? masked.text : text.trim();
  const url = `${GT_ENDPOINT}?client=gtx&sl=en&tl=${targetLang}&dt=t`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ q: toSend }).toString(),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  const translated = (data?.[0] || []).map((seg) => seg?.[0] || '').join('');
  if (!translated) return null;
  if (!masked?.tokens.length) return translated;
  return pt.unmaskProtectedTerms(translated, masked) ?? null;
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
    for (const source of titles.slice(0, limit)) {
      let candidate = null;
      let error = null;
      try {
        candidate = await translateOnce(source, locale, pt);
      } catch (err) {
        error = String(err.message || err);
        failures += 1;
      }
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
        ...(error ? { error } : {}),
      });
      await sleep(REQUEST_GAP_MS);
    }
    const flagged = records.filter(
      (r) => r.locale === locale && (r.violations.protectedTerm || r.violations.numberOrUnit),
    );
    console.log(`  ${locale}: ${limit} titles, ${flagged.length} deterministic violations, ${failures} request errors`);
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

module.exports = { translateOnce, loadProtectedTerms };
