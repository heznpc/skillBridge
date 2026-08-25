#!/usr/bin/env node
/**
 * Build the RUNTIME lesson-identity lookup from the identity report.
 *
 *   node scripts/build-canonical-lookup.js            # write src/shared/canonical-lessons.json
 *   node scripts/build-canonical-lookup.js --check    # fail if the file is stale
 *
 * The report in `snapshots/identity/` is a findings document: it carries every
 * lesson, every confidence level, every ambiguity and its candidates, and it is
 * 11k lines because a human has to be able to settle the hard cases from it.
 * None of that belongs in a browser extension. What ships is the answer to one
 * question — "these two URLs are the same lesson" — and only where the evidence
 * was strong enough to act on without asking.
 *
 * So this filters to HIGH confidence AND present on both platforms.
 *
 *   - Below high, the report says so and a human has not settled it. Auto-
 *     linking a medium match would silently merge one lesson's notes into
 *     another's, and the reader would have no way to tell it happened.
 *   - Single-platform lessons have nothing to link. They keep URL identity,
 *     which is exactly what they had before, and lose nothing.
 *
 * The output is keyed by the PATH SHAPE each platform actually serves, because
 * that is what the runtime has: a location, not a catalog entry. Course slugs
 * differ across the two platforms for the courses that were re-slugged in the
 * move, so both sides carry their own.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// Deliberately NOT under src/data/. That directory is the locale-dictionary
// namespace: check-dicts, validate-translations, check-dict-coverage and the
// glossary gate all treat every .json in it as a dictionary, and a lookup
// table dropped there is read as a badly-formed thirteenth locale. It lives
// beside constants.json, which is the other shipped, web-accessible datum.
const OUT_PATH = path.join(ROOT, 'src', 'shared', 'canonical-lessons.json');

/** Pick the newest snapshot in a directory, so the table tracks the latest report. */
function latestSnapshot(dir, prefix) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f.startsWith(prefix))
    .sort();
  if (!files.length) throw new Error(`no ${prefix}*.json snapshot in ${dir}`);
  return path.join(dir, files[files.length - 1]);
}

/**
 * `/claude-with-the-anthropic-api/287726` → `{ course, key }`.
 * Returns null for anything that is not a lesson path, so a catalog or
 * marketing route cannot enter the table as if it were a lesson.
 */
function parseSkilljarPath(p) {
  const m = /^\/([^/]+)\/(\d+)\/?$/.exec(String(p || ''));
  return m ? { course: m[1], key: m[2] } : null;
}

/** `/courses/building-with-the-claude-api/making-a-request` → `{ course, key }`. */
function parseAcademyPath(p) {
  const m = /^\/courses\/([^/]+)\/([^/]+)\/?$/.exec(String(p || ''));
  return m ? { course: m[1], key: m[2] } : null;
}

/**
 * Turn the report into the shipping table.
 *
 * Paths, not the alias `course` + id fields, are the source of truth here:
 * a path is what the site serves and what a learner's stored URL will contain.
 * Anything whose path does not parse is dropped and counted, so a shape change
 * on either platform shows up as a number rather than as silence.
 */
function buildLookup(report) {
  const lessons = {};
  const stats = { considered: 0, included: 0, droppedUnparseablePath: 0, collisions: 0 };

  for (const course of report.courses || []) {
    for (const lesson of course.lessons || []) {
      stats.considered += 1;
      if (lesson.confidence !== 'high') continue;
      const s = lesson.aliases?.skilljar;
      const a = lesson.aliases?.academy;
      if (!s || !a) continue;

      const sRef = parseSkilljarPath(s.path);
      const aRef = parseAcademyPath(a.path);
      if (!sRef || !aRef) {
        stats.droppedUnparseablePath += 1;
        continue;
      }

      const canonical = `${course.slug}/${lesson.id}`;
      if (lessons[canonical]) {
        // Two report rows claiming one canonical id. The matcher reports
        // duplicate titles as ambiguous rather than resolving them, so this
        // should be unreachable — counted rather than assumed away.
        stats.collisions += 1;
        continue;
      }
      lessons[canonical] = {
        skilljar: `${sRef.course}/${sRef.key}`,
        academy: `${aRef.course}/${aRef.key}`,
      };
      stats.included += 1;
    }
  }

  return {
    schemaVersion: 1,
    // Named so a reader of the shipped file can find what produced it and what
    // was deliberately left out.
    note: 'High-confidence cross-platform lesson pairs only. Built by scripts/build-canonical-lookup.js from the identity report; anything below high confidence is absent on purpose and keeps URL identity.',
    source: report.sources || null,
    lessons,
    stats,
  };
}

function main() {
  const reportPath = latestSnapshot(path.join(ROOT, 'snapshots/identity'), 'canonical-');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const table = buildLookup(report);
  const serialized = `${JSON.stringify(table, null, 2)}\n`;

  const check = process.argv.includes('--check');
  const existing = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : null;

  if (check) {
    if (existing === serialized) {
      console.log(
        `[canonical-lookup] OK — ${table.stats.included} lesson pairs, in sync with ${path.basename(reportPath)}`,
      );
      return;
    }
    console.error('[canonical-lookup] STALE');
    console.error(`  src/shared/canonical-lessons.json does not match ${path.relative(ROOT, reportPath)}.`);
    console.error('  → run: node scripts/build-canonical-lookup.js');
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, serialized);
  console.log(
    `[canonical-lookup] wrote ${path.relative(ROOT, OUT_PATH)} — ${table.stats.included} of ${table.stats.considered} lessons ` +
      `(high confidence, both platforms), ${table.stats.droppedUnparseablePath} dropped for an unparseable path, ` +
      `${table.stats.collisions} collisions`,
  );
}

if (require.main === module) main();

module.exports = { buildLookup, parseSkilljarPath, parseAcademyPath };
