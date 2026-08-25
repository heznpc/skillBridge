#!/usr/bin/env node
/**
 * Capture the curriculum structure academy.claude.com publishes.
 *
 * Observation only — what the site shows, as it shows it. No canonical ids,
 * no Skilljar counterpart, no migration judgement: those belong to a later
 * identity layer, and mixing them in turns a record of the site into a record
 * of our conclusions about it.
 *
 * Run manually:
 *   node scripts/capture-academy-curriculum.js
 *   node scripts/capture-academy-curriculum.js --limit 3 --out out.json
 *
 * Not a CI gate. The site is someone else's and its availability is not a
 * condition on this repository. A browser is required for the reason #326
 * measured: raw HTTP never carries the hydrated page.
 *
 * Nothing but structure is written. No page HTML is committed — the JSON
 * carries paths, slugs, titles, kinds and order, and regression tests use
 * synthetic fixtures.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { buildCurriculum, validateSnapshot } = require('./lib/academy-curriculum');

const ORIGIN = 'https://academy.claude.com';
const READY_TIMEOUT_MS = 25_000;

function argVal(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** Course paths, discovered from the live catalog rather than a hard-coded list. */
async function discoverAcademyCourses(page) {
  await page.goto(`${ORIGIN}/courses`, { waitUntil: 'domcontentloaded' });
  await page
    .waitForFunction(() => document.querySelectorAll('main a[href^="/courses/"]').length > 3, {
      timeout: READY_TIMEOUT_MS,
    })
    .catch(() => {});
  return page.evaluate(() => {
    const seen = new Set();
    for (const a of document.querySelectorAll('main a[href^="/courses/"]')) {
      const href = (a.getAttribute('href') || '').split('?')[0].replace(/\/+$/, '');
      // Course pages only: /courses/<slug>, never a unit beneath one.
      if (/^\/courses\/[a-z0-9-]+$/i.test(href)) seen.add(href);
    }
    return [...seen].sort();
  });
}

/**
 * Read one course page's curriculum.
 *
 * Units come from the per-section lists, which is the grouping the DOM
 * actually provides. Section titles are NOT paired with them: the page
 * renders its headings in a summary block that neither interleaves with the
 * lists nor matches their count, so attributing them by ordinal would produce
 * confident wrong answers.
 */
/* istanbul ignore next — executes in the browser, not under jest */
function readCurriculum(coursePath) {
  const clean = (s) =>
    String(s || '')
      .replace(/[-]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  const main = document.querySelector('main') || document.body;
  const unitSel = `a[href^="${coursePath}/"]`;

  const groups = [];
  const claimed = new Set();
  for (const list of main.querySelectorAll('ul, ol')) {
    const links = Array.from(list.querySelectorAll(unitSel));
    if (!links.length) continue;
    // A nested list would otherwise contribute its units twice.
    const fresh = links.filter((a) => !claimed.has(a));
    if (!fresh.length) continue;
    fresh.forEach((a) => claimed.add(a));
    groups.push({
      title: null,
      unitPaths: fresh.map((a) => (a.getAttribute('href') || '').split('?')[0].replace(/\/+$/, '')),
      unitTitles: fresh.map((a) => clean(a.textContent).replace(/\s*Quiz$/, '')),
    });
  }

  return {
    coursePath,
    courseTitle: clean((main.querySelector('h1') || {}).textContent),
    htmlLang: document.documentElement.lang || null,
    groups,
    // Recorded because it was observed, never used as an oracle: a catalog
    // card once claimed "66 lessons / 9 quizzes" for a course whose DOM held
    // 76 units.
    displayedStats: clean(main.innerText).match(/(\d+)\s+lessons?/i)
      ? { lessonsText: clean(main.innerText).match(/(\d+)\s+lessons?/i)[0] }
      : null,
  };
}

/** Write JSON only after it validates, and only as a single rename. */
function publishAtomically(outPath, payload) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const tmp = `${outPath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(tmp, outPath);
}

async function main() {
  const outPath = argVal(
    '--out',
    path.join('snapshots', 'academy', `curriculum-${new Date().toISOString().slice(0, 10)}.json`),
  );
  const limit = Number(argVal('--limit', 0));
  const browser = await chromium.launch();
  const courses = [];
  const failures = [];

  try {
    const context = await browser.newContext({ locale: 'en' });
    const page = await context.newPage();
    const discovered = await discoverAcademyCourses(page);
    if (!discovered.length) throw new Error('discovered zero courses — refusing to guess');
    const targets = limit ? discovered.slice(0, limit) : discovered;
    console.log(`discovered ${discovered.length} course(s); capturing ${targets.length}`);

    for (const coursePath of targets) {
      try {
        await page.goto(`${ORIGIN}${coursePath}`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(
          (p) => {
            const main = document.querySelector('main');
            if (!main) return false;
            const h1 = main.querySelector('h1');
            return !!(h1 && (h1.textContent || '').trim() && main.querySelector(`a[href^="${p}/"]`));
          },
          coursePath,
          { timeout: READY_TIMEOUT_MS },
        );
        const observed = await page.evaluate(readCurriculum, coursePath);

        // The locale is an observation, not the request. English is the
        // canonical capture, so anything else means this page is not what it
        // was asked for and its titles are the wrong language.
        if (observed.htmlLang !== 'en') {
          throw new Error(`expected an English render, observed html lang="${observed.htmlLang}"`);
        }
        const course = buildCurriculum(observed);
        courses.push(course);
        const kinds = course.sections
          .flatMap((s) => s.units)
          .reduce((acc, u) => ({ ...acc, [u.kind]: (acc[u.kind] || 0) + 1 }), {});
        console.log(
          `  ${course.slug}: ${course.sections.length} sections / ${course.unitCount} units ` +
            `(${Object.entries(kinds)
              .map(([k, n]) => `${k}:${n}`)
              .join(' ')})`,
        );
      } catch (err) {
        failures.push({ coursePath, error: String(err.message || err) });
        console.error(`  ${coursePath}: FAILED — ${err.message}`);
      }
    }
    await context.close();
  } finally {
    await browser.close();
  }

  // Any failure aborts. A snapshot that silently omits a course still reads
  // as complete to whoever opens it later, which is the worst outcome here.
  if (failures.length) {
    throw new Error(`${failures.length} course(s) failed: ${failures.map((f) => f.coursePath).join(', ')}`);
  }

  const snapshot = {
    schemaVersion: 1,
    platform: 'claude-academy',
    origin: ORIGIN,
    observedAt: new Date().toISOString(),
    courses,
  };
  const check = validateSnapshot(snapshot);
  if (!check.ok) throw new Error(`validation failed:\n  ${check.errors.join('\n  ')}`);

  publishAtomically(outPath, snapshot);
  const units = courses.reduce((n, c) => n + c.unitCount, 0);
  console.log(`\nwrote ${outPath}: ${courses.length} courses, ${units} units`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`curriculum capture failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { discoverAcademyCourses };
