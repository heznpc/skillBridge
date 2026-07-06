#!/usr/bin/env node
/**
 * Dictionary Freshness Check — flags language dictionaries whose
 * _meta.lastUpdated is older than 90 days.
 *
 * Usage:
 *   node scripts/check-dicts.js
 *
 * In CI (CI=true), writes a report to dict-check-report.txt and exits
 * non-zero if any review-complete dictionary is stale. Dictionaries still
 * marked nativeReview=recruiting are explicit review debt, not a fake
 * "reviewed" state, so they warn without blocking unrelated dependency PRs.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.SB_DICT_FRESHNESS_DIR || path.join(__dirname, '..', 'src', 'data');
const STALE_THRESHOLD_DAYS = 90;

function writeCiReport(results) {
  if (!process.env.CI) return;

  const stale = results.filter((r) => r.status === 'STALE');
  const reviewNeeded = results.filter((r) => r.status === 'REVIEW_NEEDED');
  const report = [
    '### Blocking stale dictionaries\n',
    ...(stale.length
      ? stale.map(
          (r) =>
            `- **${r.file}** (\`${r.lang}\`): last updated ${r.lastUpdated} (${r.daysSince} days ago), nativeReview=${r.nativeReview} — STALE`,
        )
      : ['- None']),
    '',
    '### Native review recruiting\n',
    ...(reviewNeeded.length
      ? reviewNeeded.map(
          (r) =>
            `- **${r.file}** (\`${r.lang}\`): last updated ${r.lastUpdated} (${r.daysSince} days ago), nativeReview=${r.nativeReview} — REVIEW_NEEDED`,
        )
      : ['- None']),
    '',
    '### All dictionaries\n',
    '| File | Language | Last Updated | Days Ago | Native Review | Status |',
    '|------|----------|-------------|----------|---------------|--------|',
    ...results
      .filter((r) => r.lastUpdated)
      .map((r) => `| ${r.file} | ${r.lang} | ${r.lastUpdated} | ${r.daysSince} | ${r.nativeReview} | ${r.status} |`),
  ].join('\n');
  fs.writeFileSync('dict-check-report.txt', report);
}

function main() {
  console.log('Dictionary Freshness Check');
  console.log(`Data dir: ${DATA_DIR}`);
  console.log(`Stale threshold: ${STALE_THRESHOLD_DAYS} days\n`);

  let files;
  try {
    files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
  } catch (err) {
    console.error(`Cannot read data directory: ${err.message}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.log('No dictionary files found.');
    process.exit(0);
  }

  const now = new Date();
  const results = [];
  let hasBlockingStale = false;

  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.error(`  [ERROR] ${file}: ${err.message}`);
      results.push({ file, status: 'ERROR', detail: err.message });
      continue;
    }

    const lastUpdated = data?._meta?.lastUpdated;
    if (!lastUpdated) {
      console.log(`  [WARN]  ${file}: missing _meta.lastUpdated`);
      results.push({ file, status: 'NO_DATE', detail: 'missing _meta.lastUpdated' });
      continue;
    }

    const updatedDate = new Date(lastUpdated);
    if (isNaN(updatedDate.getTime())) {
      console.log(`  [WARN]  ${file}: invalid date "${lastUpdated}"`);
      results.push({ file, status: 'BAD_DATE', detail: `invalid date: ${lastUpdated}` });
      continue;
    }

    const daysSince = Math.floor((now - updatedDate) / (1000 * 60 * 60 * 24));
    const lang = data._meta.lang || file.replace('.json', '');
    const nativeReview = data._meta.nativeReview || 'unknown';
    const reviewRecruiting = nativeReview === 'recruiting';

    if (daysSince > STALE_THRESHOLD_DAYS) {
      const status = reviewRecruiting ? 'REVIEW_NEEDED' : 'STALE';
      const label = reviewRecruiting ? 'REVIEW' : 'STALE';
      console.log(
        `  [${label}] ${file} (${lang}): last updated ${lastUpdated} — ${daysSince} days ago; nativeReview=${nativeReview}`,
      );
      results.push({ file, lang, status, lastUpdated, daysSince, nativeReview });
      if (!reviewRecruiting) hasBlockingStale = true;
    } else {
      console.log(
        `  [OK]    ${file} (${lang}): last updated ${lastUpdated} — ${daysSince} days ago; nativeReview=${nativeReview}`,
      );
      results.push({ file, lang, status: 'OK', lastUpdated, daysSince, nativeReview });
    }
  }

  console.log('');

  const reviewNeeded = results.filter((r) => r.status === 'REVIEW_NEEDED');
  if (reviewNeeded.length > 0) {
    console.log(
      `${reviewNeeded.length} dictionary/dictionaries need native review refresh but are marked nativeReview=recruiting.`,
    );
  }

  if (!hasBlockingStale) {
    writeCiReport(results);
    if (reviewNeeded.length === 0) console.log('All dictionaries are fresh.');
    else console.log('No review-complete dictionaries are stale.');
    return;
  }

  const stale = results.filter((r) => r.status === 'STALE');
  console.log(`${stale.length} review-complete dictionary/dictionaries are stale (>${STALE_THRESHOLD_DAYS} days old).`);
  writeCiReport(results);

  process.exit(1);
}

main();
