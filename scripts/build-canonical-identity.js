#!/usr/bin/env node
/**
 * Build the cross-platform lesson identity report from committed snapshots.
 *
 *   node scripts/build-canonical-identity.js
 *   node scripts/build-canonical-identity.js --out snapshots/identity/<name>.json
 *
 * Reads only what is already in the repo — no network, no browser, no
 * account. It reports; it does not migrate. Every lesson below high
 * confidence is carried in the output with its candidates attached so a
 * human can settle it before anything downstream depends on the pairing.
 */

const fs = require('fs');
const path = require('path');
const { buildIdentityReport } = require('./lib/canonical-identity');

const argVal = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

/** Pick the newest snapshot in a directory, so the report tracks the latest capture. */
function latestSnapshot(dir, prefix) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f.startsWith(prefix))
    .sort();
  if (!files.length) throw new Error(`no ${prefix}*.json snapshot in ${dir}`);
  return path.join(dir, files[files.length - 1]);
}

function main() {
  const root = path.join(__dirname, '..');
  const academyPath = argVal('--academy', latestSnapshot(path.join(root, 'snapshots/academy'), 'curriculum-'));
  const skilljarPath = argVal('--skilljar', latestSnapshot(path.join(root, 'snapshots/skilljar'), 'anthropic.'));

  const academy = JSON.parse(fs.readFileSync(academyPath, 'utf8'));
  const skilljar = JSON.parse(fs.readFileSync(skilljarPath, 'utf8'));
  const report = buildIdentityReport(academy, skilljar);

  report.sources = {
    academy: { path: path.relative(root, academyPath), observedAt: academy.observedAt },
    skilljar: { path: path.relative(root, skilljarPath), fetchedAt: skilljar.fetchedAt },
  };

  const s = report.summary;
  console.log(
    `courses: ${s.courseCount} (both ${s.onBothPlatforms}, academy-only ${s.academyOnly}, skilljar-only ${s.skilljarOnly})`,
  );
  console.log(`  re-slugged, recovered by title: ${s.joinedOnTitle}`);
  console.log(
    `lessons: high ${s.lessons.high}, medium ${s.lessons.medium}, low ${s.lessons.low}, unmatched ${s.lessons.none}, skilljar-only ${s.lessons.skilljarOnly}`,
  );
  console.log(`needs human review before any migration: ${s.needsReview}`);

  const out = argVal('--out', null);
  if (out) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`wrote ${out}`);
  }
}

main();
