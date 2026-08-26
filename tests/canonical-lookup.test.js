/**
 * The SHIPPED lesson-identity table.
 *
 * tests/lesson-identity.test.js covers the rules against a hand-built
 * miniature. This covers the real file: that it is in sync with the identity
 * report, that it carries only what the report was confident about, and that
 * every pair in it survives a round trip through the runtime resolver.
 *
 * The last one is the check with teeth. The table is built from the report's
 * `path` fields and read by `parseLessonRef`, and those are two separate
 * parsers of the same URL shapes. If either drifts, every affected lesson
 * silently stops linking — no error, no failing request, just a learner whose
 * notes are missing. So each entry is resolved back through the runtime, from
 * a reconstructed URL, and must land on the id it was filed under.
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { buildLookup } = require('../scripts/build-canonical-lookup');

function load(file) {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'lib', file), 'utf8');
  const fake = { module: { exports: {} } };
  new Function('globalThis', src)(fake);
  return fake.module.exports;
}
const { createIdentityResolver, parseLessonRef, refToUrl } = load('lesson-identity.js');

const TABLE_PATH = path.join(ROOT, 'src', 'shared', 'canonical-lessons.json');
const table = JSON.parse(fs.readFileSync(TABLE_PATH, 'utf8'));

/** The newest identity report, which the table must agree with. */
function latestReport() {
  const dir = path.join(ROOT, 'snapshots', 'identity');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('canonical-') && f.endsWith('.json'))
    .sort();
  return JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), 'utf8'));
}

describe('the shipped table', () => {
  test('is exactly what the builder produces from the current report', () => {
    // The same comparison `npm run check:canonical` makes, so a stale table
    // fails in the unit suite rather than only at release time.
    //
    // The shipped table is passed back in as `previous` because it IS the
    // identity registry: rebuilding without it would mint fresh ids, which is
    // the exact behaviour the registry exists to prevent.
    const rebuilt = buildLookup(latestReport(), table);
    expect(JSON.parse(JSON.stringify(table))).toEqual(rebuilt);
  });

  test('carries every high-confidence cross-platform pair, and nothing else', () => {
    const report = latestReport();
    let expected = 0;
    for (const course of report.courses) {
      for (const lesson of course.lessons) {
        if (lesson.confidence === 'high' && lesson.aliases?.skilljar && lesson.aliases?.academy) expected += 1;
      }
    }
    expect(Object.keys(table.lessons)).toHaveLength(expected);
    expect(expected).toBeGreaterThan(0);
  });

  test('excludes every lesson the report flagged for a human', () => {
    // 261 of the report's lessons need review. Auto-linking any of them would
    // merge one lesson's records into another's with no way for the learner to
    // notice, so absence here is the feature.
    const report = latestReport();
    const reviewed = new Set();
    for (const course of report.courses) {
      for (const lesson of course.lessons) {
        if (lesson.confidence !== 'high') reviewed.add(`${course.slug}/${lesson.id}`);
      }
    }
    expect(reviewed.size).toBeGreaterThan(0);
    for (const id of reviewed) expect(table.lessons[id]).toBeUndefined();
  });

  test('a single-platform lesson is absent — there is nothing to link', () => {
    const report = latestReport();
    const oneSided = [];
    for (const course of report.courses) {
      for (const lesson of course.lessons) {
        if (!lesson.aliases?.skilljar || !lesson.aliases?.academy) oneSided.push(`${course.slug}/${lesson.id}`);
      }
    }
    expect(oneSided.length).toBeGreaterThan(0);
    for (const id of oneSided) expect(table.lessons[id]).toBeUndefined();
  });
});

describe('every shipped pair round-trips through the runtime resolver', () => {
  const resolver = createIdentityResolver(table);
  const entries = Object.entries(table.lessons);

  test('there is something to check', () => {
    expect(entries.length).toBeGreaterThan(100);
  });

  test('both platform URLs resolve to the id they are filed under', () => {
    const broken = [];
    for (const [canonical, refs] of entries) {
      for (const platform of ['skilljar', 'academy']) {
        const url = refToUrl(platform, refs[platform]);
        const resolved = resolver.resolve(url);
        if (resolved.id !== canonical) broken.push({ canonical, platform, url, got: resolved.id });
      }
    }
    expect(broken).toEqual([]);
  });

  test('every stored ref parses as a lesson, on the platform it claims', () => {
    const broken = [];
    for (const [canonical, refs] of entries) {
      for (const platform of ['skilljar', 'academy']) {
        const parsed = parseLessonRef(refToUrl(platform, refs[platform]));
        if (!parsed || parsed.platform !== platform || parsed.ref !== refs[platform]) {
          broken.push({ canonical, platform, ref: refs[platform], parsed });
        }
      }
    }
    expect(broken).toEqual([]);
  });

  test('no two lessons share a platform ref', () => {
    // A duplicate would mean one URL resolving to two ids depending on index
    // order — the kind of ambiguity the report reports rather than resolves.
    for (const platform of ['skilljar', 'academy']) {
      const seen = new Map();
      const dupes = [];
      for (const [canonical, refs] of entries) {
        const ref = refs[platform];
        if (seen.has(ref)) dupes.push({ ref, a: seen.get(ref), b: canonical });
        seen.set(ref, canonical);
      }
      expect(dupes).toEqual([]);
    }
  });

  test('the re-slugged courses are present, with both slugs intact', () => {
    // claude-with-the-anthropic-api → building-with-the-claude-api, and
    // claude-in-amazon-bedrock → claude-with-amazon-bedrock. Together they are
    // roughly half the table, and a slug-only join would have dropped all of
    // them while reporting phantom single-platform courses instead.
    const reslugged = entries.filter(([, refs]) => refs.skilljar.split('/')[0] !== refs.academy.split('/')[0]);
    expect(reslugged.length).toBeGreaterThan(100);
    for (const [, refs] of reslugged) {
      expect(refs.skilljar.split('/')[0]).toMatch(/^[a-z0-9-]+$/);
      expect(refs.academy.split('/')[0]).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe('canonical ids are issued once and never reissued', () => {
  // reusedId/mintedId/retired live on a non-enumerable `buildStats`, not in
  // the serialized table: they describe the RUN, and persisting them would
  // make an unchanged registry serialize differently on every rebuild.
  const report = (academyPath) => ({
    courses: [
      {
        slug: 'a-course',
        lessons: [
          {
            id: 'accessing-the-api',
            confidence: 'high',
            aliases: {
              skilljar: { path: '/a-course/287726' },
              academy: { path: academyPath },
            },
          },
        ],
      },
    ],
  });

  test('a re-slugged Academy lesson keeps the id it was first issued', () => {
    // The failure this prevents: Academy renames the route, the generator
    // mints a new id, and every note already stored under the old one points
    // at a lesson the table no longer contains.
    const first = buildLookup(report('/courses/a-course/accessing-the-api'), null);
    const originalId = Object.keys(first.lessons)[0];
    expect(first.buildStats.mintedId).toBe(1);

    const second = buildLookup(report('/courses/a-course/api-access'), first);
    expect(Object.keys(second.lessons)).toEqual([originalId]);
    expect(second.buildStats.reusedId).toBe(1);
    expect(second.buildStats.mintedId).toBe(0);
    // The alias moved to the new route; the identity did not.
    expect(second.lessons[originalId].academy).toBe('a-course/api-access');
  });

  test('a genuinely new lesson still mints a new id', () => {
    const first = buildLookup(report('/courses/a-course/accessing-the-api'), null);
    const withExtra = report('/courses/a-course/accessing-the-api');
    withExtra.courses[0].lessons.push({
      id: 'brand-new',
      confidence: 'high',
      aliases: { skilljar: { path: '/a-course/999999' }, academy: { path: '/courses/a-course/brand-new' } },
    });
    const second = buildLookup(withExtra, first);
    expect(second.buildStats.mintedId).toBe(1);
    expect(second.buildStats.reusedId).toBe(1);
  });

  test('an id the new report no longer covers is kept, not orphaned', () => {
    // A learner may already have notes under it, and its aliases are still the
    // URLs those notes were written at.
    const first = buildLookup(report('/courses/a-course/accessing-the-api'), null);
    const originalId = Object.keys(first.lessons)[0];
    const second = buildLookup({ courses: [] }, first);
    expect(second.lessons[originalId]).toEqual(first.lessons[originalId]);
    expect(second.buildStats.retired).toBe(1);
  });

  test('rebuilding from the same report is a fixed point', () => {
    const first = buildLookup(report('/courses/a-course/accessing-the-api'), null);
    const second = buildLookup(report('/courses/a-course/accessing-the-api'), first);
    expect(second.lessons).toEqual(first.lessons);
  });
});
