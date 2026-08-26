/**
 * Lesson identity across Skilljar and Claude Academy.
 *
 * The property under test is not "matching works". It is that a learner's
 * records survive: migration must be idempotent, must never merge or drop a
 * record, must refuse to link anything the identity report was not confident
 * about, and must be exactly reversible.
 *
 * That last one is why rollback is a real function rather than a stored backup
 * copy. Migration only ADDS fields, so removing them recovers the original —
 * and `rollback(migrate(x))` deep-equalling `x` is a property a test can hold
 * the implementation to, which a snapshot restore never could.
 *
 * The table used here is a hand-built miniature, not the shipped 308-pair file:
 * these tests are about the rules, and a fixture that names its own cases makes
 * a failure readable. `tests/canonical-lookup.test.js` covers the real table.
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

function load(file) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', file), 'utf8');
  const fake = { module: { exports: {} } };
  new Function('globalThis', src)(fake);
  return fake.module.exports;
}

const {
  IDENTITY_SCHEMA_VERSION,
  IDENTITY_SOURCE,
  parseLessonRef,
  refToUrl,
  createIdentityResolver,
  recordIdentity,
  locationIdentity,
  findRecord,
  matchingRecords,
  migrateRecords,
  rollbackRecords,
} = load('lesson-identity.js');

/**
 * Two courses' worth of pairs, including the re-slug that the real data has:
 * `claude-with-the-anthropic-api` on Skilljar became
 * `building-with-the-claude-api` on Academy, which is 148 of the 308 real
 * pairs and the case a slug-only heuristic would silently drop.
 */
const TABLE = {
  schemaVersion: 1,
  lessons: {
    'building-with-the-claude-api/accessing-the-api': {
      skilljar: 'claude-with-the-anthropic-api/287726',
      academy: 'building-with-the-claude-api/accessing-the-api',
    },
    'building-with-the-claude-api/making-a-request': {
      skilljar: 'claude-with-the-anthropic-api/287725',
      academy: 'building-with-the-claude-api/making-a-request',
    },
    'claude-101/what-is-claude': {
      skilljar: 'claude-101/383389',
      academy: 'claude-101/what-is-claude',
    },
  },
};

const SKILLJAR_URL = 'https://anthropic.skilljar.com/claude-with-the-anthropic-api/287726';
const ACADEMY_URL = 'https://academy.claude.com/courses/building-with-the-claude-api/accessing-the-api';
/** A real lesson URL that is deliberately NOT in the table — below high confidence. */
const UNMATCHED_URL = 'https://academy.claude.com/courses/claude-code-101/some-unmatched-lesson';

const resolver = createIdentityResolver(TABLE);

describe('parseLessonRef', () => {
  test('reads a Skilljar lesson path', () => {
    expect(parseLessonRef(SKILLJAR_URL)).toMatchObject({
      platform: 'skilljar',
      course: 'claude-with-the-anthropic-api',
      key: '287726',
    });
  });

  test('reads an Academy lesson path', () => {
    expect(parseLessonRef(ACADEMY_URL)).toMatchObject({
      platform: 'academy',
      course: 'building-with-the-claude-api',
      key: 'accessing-the-api',
    });
  });

  test('the Academy locale prefix is not part of identity', () => {
    // The Spanish and English renderings are the same lesson; a note written on
    // one belongs on the other.
    const es = parseLessonRef('https://academy.claude.com/es/courses/building-with-the-claude-api/accessing-the-api');
    expect(es.ref).toBe('building-with-the-claude-api/accessing-the-api');
    const zh = parseLessonRef(
      'https://academy.claude.com/zh-TW/courses/building-with-the-claude-api/accessing-the-api',
    );
    expect(zh.ref).toBe('building-with-the-claude-api/accessing-the-api');
  });

  test('a course page is not a lesson', () => {
    expect(parseLessonRef('https://academy.claude.com/courses/building-with-the-claude-api')).toBeNull();
    expect(parseLessonRef('https://anthropic.skilljar.com/claude-101')).toBeNull();
  });

  test('the catalog and marketing routes are not lessons', () => {
    expect(parseLessonRef('https://academy.claude.com/')).toBeNull();
    expect(parseLessonRef('https://anthropic.skilljar.com/page/catalog')).toBeNull();
  });

  test('an unrelated host is never a lesson', () => {
    expect(parseLessonRef('https://claude.com/resources/tutorials/anything')).toBeNull();
    expect(parseLessonRef('https://example.com/courses/x/y')).toBeNull();
  });

  test('garbage in is null out, not a throw', () => {
    expect(parseLessonRef('')).toBeNull();
    expect(parseLessonRef(null)).toBeNull();
    expect(parseLessonRef('not a url')).toBeNull();
  });

  test('accepts a Location object as well as a string', () => {
    const loc = { hostname: 'academy.claude.com', pathname: '/courses/claude-101/what-is-claude' };
    expect(parseLessonRef(loc).ref).toBe('claude-101/what-is-claude');
  });
});

describe('resolve', () => {
  test('the same lesson resolves to one id from either platform', () => {
    const fromSkilljar = resolver.resolve(SKILLJAR_URL);
    const fromAcademy = resolver.resolve(ACADEMY_URL);
    expect(fromSkilljar.id).toBe('building-with-the-claude-api/accessing-the-api');
    expect(fromAcademy.id).toBe(fromSkilljar.id);
    expect(fromSkilljar.platform).toBe('skilljar');
    expect(fromAcademy.platform).toBe('academy');
  });

  test('a lesson the report was not confident about resolves to no id', () => {
    // Not an error and not a guess. It keeps URL identity, which is exactly
    // what it had before any of this existed.
    expect(resolver.resolve(UNMATCHED_URL).id).toBeNull();
  });

  test('an empty table resolves nothing, and does not throw', () => {
    const empty = createIdentityResolver(null);
    expect(empty.resolve(SKILLJAR_URL).id).toBeNull();
    expect(empty.size()).toBe(0);
  });
});

describe('urlFor / preferredUrl', () => {
  test('rebuilds the lesson URL on either platform', () => {
    const id = 'building-with-the-claude-api/accessing-the-api';
    expect(resolver.urlFor(id, 'academy')).toBe(ACADEMY_URL);
    expect(resolver.urlFor(id, 'skilljar')).toBe(SKILLJAR_URL);
  });

  test('a Skilljar-era record opens on Academy when that is where the learner is', () => {
    const record = { id: 'building-with-the-claude-api/accessing-the-api', url: SKILLJAR_URL };
    expect(resolver.preferredUrl(record, ACADEMY_URL)).toBe(ACADEMY_URL);
  });

  test('and still opens on Skilljar when that is where the learner is', () => {
    const record = { id: 'building-with-the-claude-api/accessing-the-api', url: ACADEMY_URL };
    expect(resolver.preferredUrl(record, SKILLJAR_URL)).toBe(SKILLJAR_URL);
  });

  test('an unmatched record keeps its own URL — the pre-existing behaviour', () => {
    const record = { url: UNMATCHED_URL };
    expect(resolver.preferredUrl(record, ACADEMY_URL)).toBe(UNMATCHED_URL);
  });

  test('off a lesson page there is nothing to prefer, so the record wins', () => {
    const record = { id: 'claude-101/what-is-claude', url: SKILLJAR_URL };
    expect(resolver.preferredUrl(record, 'https://academy.claude.com/')).toBe(SKILLJAR_URL);
  });

  test('an unknown platform rebuilds nothing rather than inventing an origin', () => {
    expect(refToUrl('coursera', 'a/b')).toBeNull();
  });
});

describe('record matching', () => {
  const linked = { id: 'claude-101/what-is-claude', url: 'https://anthropic.skilljar.com/claude-101/383389' };
  const unlinked = { url: UNMATCHED_URL };

  test('a linked record answers to its canonical id from either platform', () => {
    expect(recordIdentity(linked)).toBe('id:claude-101/what-is-claude');
    expect(locationIdentity(resolver, 'https://academy.claude.com/courses/claude-101/what-is-claude')).toBe(
      'id:claude-101/what-is-claude',
    );
  });

  test('an unlinked record answers to its URL, and only to that URL', () => {
    expect(recordIdentity(unlinked)).toBe(`url:${UNMATCHED_URL}`);
    expect(locationIdentity(resolver, UNMATCHED_URL)).toBe(`url:${UNMATCHED_URL}`);
    expect(locationIdentity(resolver, `${UNMATCHED_URL}-other`)).not.toBe(recordIdentity(unlinked));
  });

  test('findRecord returns the newest when a lesson has more than one record', () => {
    // A learner who wrote a note on each platform before this shipped. Merging
    // them would mean choosing which one to destroy, so both are kept and the
    // newest is what a compose box preloads.
    const older = { ...linked, ts: 1, text: 'from Skilljar' };
    const newer = { ...linked, ts: 2, text: 'from Academy' };
    const academyTwin = 'https://academy.claude.com/courses/claude-101/what-is-claude';
    const found = findRecord([older, newer], resolver, academyTwin);
    expect(found.text).toBe('from Academy');
    expect(matchingRecords([older, newer], resolver, 'https://anthropic.skilljar.com/claude-101/383389')).toHaveLength(
      2,
    );
  });

  test('a record for a different lesson never matches', () => {
    expect(findRecord([linked], resolver, ACADEMY_URL)).toBeNull();
  });
});

describe('migrateRecords', () => {
  const legacy = [
    { url: SKILLJAR_URL, title: 'Accessing the API', text: 'my note', ts: 100 },
    { url: UNMATCHED_URL, title: 'Unmatched lesson', text: 'another note', ts: 200 },
    { url: 'https://anthropic.skilljar.com/page/catalog', title: 'Catalog', text: 'stray', ts: 300 },
  ];

  test('links what the report was confident about, and stamps provenance', () => {
    const { records, changed, stats } = migrateRecords(legacy, resolver, { now: 999 });
    expect(changed).toBe(true);
    expect(stats.linked).toBe(1);
    expect(records[0].id).toBe('building-with-the-claude-api/accessing-the-api');
    expect(records[0].provenance).toEqual({
      schemaVersion: IDENTITY_SCHEMA_VERSION,
      matchedBy: IDENTITY_SOURCE.CANONICAL,
      platform: 'skilljar',
      migratedAt: 999,
    });
    expect(records[0].legacyUrls).toEqual([SKILLJAR_URL]);
  });

  test('leaves an unmatched lesson unlinked, without discarding it', () => {
    const { records, stats } = migrateRecords(legacy, resolver);
    expect(stats.unresolved).toBe(2);
    expect(records[1].id).toBeUndefined();
    expect(records[1].text).toBe('another note');
    // No provenance at all: an unresolved record carries no completion stamp,
    // so a later, better lookup table can still claim it. Stamping here would
    // freeze today's provisional table into a permanent verdict.
    expect(records[1].provenance).toBeUndefined();
  });

  test('a record that is not a lesson at all is kept, and counted', () => {
    const { records, stats } = migrateRecords(legacy, resolver);
    expect(stats.notALesson).toBe(1);
    expect(records[2].text).toBe('stray');
    expect(records[2].id).toBeUndefined();
  });

  test('nothing is dropped, merged, or reordered', () => {
    const { records } = migrateRecords(legacy, resolver);
    expect(records).toHaveLength(legacy.length);
    expect(records.map((r) => r.url)).toEqual(legacy.map((r) => r.url));
    expect(records.map((r) => r.text)).toEqual(legacy.map((r) => r.text));
  });

  test('the input array is not mutated', () => {
    const snapshot = JSON.parse(JSON.stringify(legacy));
    migrateRecords(legacy, resolver);
    expect(legacy).toEqual(snapshot);
  });

  test('running it again changes nothing and asks for no write', () => {
    const first = migrateRecords(legacy, resolver, { now: 1 });
    const second = migrateRecords(first.records, resolver, { now: 2 });
    expect(second.changed).toBe(false);
    expect(second.records).toBe(first.records);
    // Only the records that actually linked carry a completion stamp. The
    // unresolved ones are re-examined on every load ON PURPOSE, so a better
    // table later can still claim them — that re-check is a map lookup per
    // record and asks for no write.
    expect(second.stats.alreadyMigrated).toBe(1);
    expect(second.stats.unresolved).toBe(legacy.length - 1);
    // And the timestamps are the FIRST run's — a re-run must not restamp.
    expect(second.records[0].provenance.migratedAt).toBe(1);
  });

  test('a run interrupted after the write still converges on the next load', () => {
    // Model the failure: the first pass produced records but the storage write
    // was lost, so the next load sees the ORIGINAL list again.
    const attempt = migrateRecords(legacy, resolver, { now: 1 });
    expect(attempt.changed).toBe(true);
    const retry = migrateRecords(legacy, resolver, { now: 2 });
    expect(retry.records[0].id).toBe(attempt.records[0].id);
    expect(retry.records.map((r) => r.text)).toEqual(legacy.map((r) => r.text));
  });

  test('a half-written list — some records migrated, some not — completes cleanly', () => {
    const first = migrateRecords(legacy, resolver, { now: 1 });
    const halfWritten = [first.records[0], legacy[1], legacy[2]];
    const { records, changed, stats } = migrateRecords(halfWritten, resolver, { now: 2 });
    // Nothing new links on this pass — record 0 is already stamped and the
    // other two remain unresolved — so there is nothing to write.
    expect(changed).toBe(false);
    expect(stats.alreadyMigrated).toBe(1);
    expect(records).toHaveLength(3);
    expect(records[0].provenance.migratedAt).toBe(1);
    // The unresolved ones stay bare, ready for a later table to claim them.
    expect(records[1].provenance).toBeUndefined();
    expect(records[2].provenance).toBeUndefined();
  });

  test('a record unresolved today is claimed once the table improves', () => {
    // The whole reason unresolved records go unstamped. The first pass cannot
    // place this lesson; a later table can, and the record must still be
    // eligible rather than marked "already considered".
    const { records: pass1 } = migrateRecords(legacy, resolver, { now: 1 });
    expect(pass1[1].id).toBeUndefined();

    const betterResolver = {
      resolve: (url) => (url === legacy[1].url ? { id: 'later/match' } : resolver.resolve(url)),
    };
    const { records: pass2, changed } = migrateRecords(pass1, betterResolver, { now: 2 });
    expect(changed).toBe(true);
    expect(pass2[1].id).toBe('later/match');
    expect(pass2[1].legacyUrls).toContain(legacy[1].url);
  });

  test('an empty or absent list is not an error', () => {
    expect(migrateRecords([], resolver).records).toEqual([]);
    expect(migrateRecords(undefined, resolver).records).toEqual([]);
  });

  test('with no lookup table nothing links, and nothing is lost', () => {
    const empty = createIdentityResolver(null);
    const { records, stats } = migrateRecords(legacy, empty);
    expect(stats.linked).toBe(0);
    expect(records.map((r) => r.text)).toEqual(legacy.map((r) => r.text));
    expect(records.every((r) => r.id === undefined)).toBe(true);
  });

  test('a resolver that throws does not take the records with it', () => {
    const hostile = {
      resolve() {
        throw new Error('table corrupted');
      },
    };
    expect(() => migrateRecords(legacy, hostile)).toThrow();
    // The input survives regardless — migration builds a new array and never
    // writes through to the original.
    expect(legacy[0].text).toBe('my note');
    expect(legacy[0].id).toBeUndefined();
  });
});

describe('rollbackRecords', () => {
  const legacy = [
    { url: SKILLJAR_URL, title: 'Accessing the API', text: 'my note', ts: 100 },
    { url: UNMATCHED_URL, title: 'Unmatched lesson', text: 'another note', ts: 200 },
  ];

  test('rollback(migrate(x)) is exactly x', () => {
    // The property the whole design rests on. Migration only adds fields, so
    // removing them recovers the original — which is why there is no backup
    // copy of every record sitting in storage.
    const { records } = migrateRecords(legacy, resolver, { now: 42 });
    expect(rollbackRecords(records)).toEqual(legacy);
  });

  test('rollback survives a double migration', () => {
    const once = migrateRecords(legacy, resolver, { now: 1 }).records;
    const twice = migrateRecords(once, resolver, { now: 2 }).records;
    expect(rollbackRecords(twice)).toEqual(legacy);
  });

  test('rollback is idempotent', () => {
    const { records } = migrateRecords(legacy, resolver);
    const once = rollbackRecords(records);
    expect(rollbackRecords(once)).toEqual(once);
  });

  test('rollback leaves never-migrated records alone', () => {
    expect(rollbackRecords(legacy)).toEqual(legacy);
  });

  test('a legacy URL the learner actually accumulated is kept, not treated as bookkeeping', () => {
    // Migration contributes exactly one entry: the record's own url. Anything
    // beyond that came from real use, and dropping it would be the data loss
    // this module exists to prevent.
    const { records } = migrateRecords(legacy, resolver);
    const withHistory = [{ ...records[0], legacyUrls: [...records[0].legacyUrls, ACADEMY_URL] }];
    const rolled = rollbackRecords(withHistory);
    expect(rolled[0].legacyUrls).toEqual([ACADEMY_URL]);
    expect(rolled[0].id).toBeUndefined();
    expect(rolled[0].provenance).toBeUndefined();
  });
});

describe('table validation', () => {
  const good = { schemaVersion: 1, lessons: { 'a/b': { skilljar: 'c/1', academy: 'x/y' } } };

  test('a valid table resolves and reports no errors', () => {
    const r = createIdentityResolver(good);
    expect(r.validationErrors()).toEqual([]);
    expect(r.resolve('https://anthropic.skilljar.com/c/1').id).toBe('a/b');
  });

  test('a duplicate alias rejects the WHOLE table, not just the clash', () => {
    // Two lessons claiming one ref would merge their notes and then lose part
    // of them on the next save. Nothing in the table is trusted after that.
    const dup = {
      schemaVersion: 1,
      lessons: { 'a/b': { skilljar: 'c/1' }, 'a/c': { skilljar: 'c/1' }, 'd/e': { academy: 'x/y' } },
    };
    const r = createIdentityResolver(dup);
    expect(r.validationErrors().length).toBeGreaterThan(0);
    expect(r.resolve('https://academy.claude.com/courses/x/y').id).toBeNull();
  });

  test('an unknown schema version is refused rather than guessed at', () => {
    const r = createIdentityResolver({ ...good, schemaVersion: 99 });
    expect(r.validationErrors().length).toBeGreaterThan(0);
    expect(r.resolve('https://anthropic.skilljar.com/c/1').id).toBeNull();
  });

  test('a rejected table writes nothing during migration', () => {
    const r = createIdentityResolver({ ...good, schemaVersion: 99 });
    const records = [{ url: 'https://anthropic.skilljar.com/c/1', text: 'note' }];
    const { changed, records: out } = migrateRecords(records, r);
    expect(changed).toBe(false);
    expect(out[0].provenance).toBeUndefined();
  });
});

describe('partner Skilljar tenants', () => {
  const table = { schemaVersion: 1, lessons: { 'a/b': { skilljar: 'course/123' } } };

  test('the Anthropic tenant canonicalizes', () => {
    const r = createIdentityResolver(table);
    expect(r.resolve('https://anthropic.skilljar.com/course/123').id).toBe('a/b');
  });

  test('another tenant with the same path never borrows that identity', () => {
    // The resolver key is courseSlug/numericId with no host in it, so a
    // partner course could otherwise collide on ids neither party chose.
    const r = createIdentityResolver(table);
    expect(r.resolve('https://partner.skilljar.com/course/123').id).toBeNull();
    expect(parseLessonRef('https://partner.skilljar.com/course/123')).toBeNull();
  });
});

describe('a record left unresolved is promoted when the table improves', () => {
  // The reason unresolved records are never stamped as migrated. These two
  // pairs did not exist in the shipped table until the matcher learned to pair
  // courses on their unit titles and to treat a recasing as an exact match.
  const RESLUGGED = {
    skilljar: 'https://anthropic.skilljar.com/claude-with-google-vertex/289151',
    academy: 'https://academy.claude.com/courses/claude-with-google-cloud-s-vertex-ai/accessing-the-api',
    id: 'claude-with-google-cloud-s-vertex-ai/accessing-the-api',
  };
  const RECASED = {
    skilljar: 'https://anthropic.skilljar.com/claude-code-in-action/486901',
    academy: 'https://academy.claude.com/courses/claude-code-in-action/steering-long-sessions',
    id: 'claude-code-in-action/steering-long-sessions',
  };

  /** The table as it was before this change: neither pair present. */
  const oldTable = { schemaVersion: 1, lessons: { 'other/lesson': { skilljar: 'other/1', academy: 'other/lesson' } } };
  const newTable = {
    schemaVersion: 1,
    lessons: {
      'other/lesson': { skilljar: 'other/1', academy: 'other/lesson' },
      [RESLUGGED.id]: {
        skilljar: 'claude-with-google-vertex/289151',
        academy: 'claude-with-google-cloud-s-vertex-ai/accessing-the-api',
      },
      [RECASED.id]: {
        skilljar: 'claude-code-in-action/486901',
        academy: 'claude-code-in-action/steering-long-sessions',
      },
    },
  };

  const legacyNotes = () => [
    { url: RESLUGGED.skilljar, title: 'Accessing the API', text: 'a note from the Skilljar era', ts: 10 },
    { url: RECASED.skilljar, title: 'Steering Long Sessions', text: 'another note', ts: 20 },
    { url: 'https://anthropic.skilljar.com/other/1', title: 'Other', text: 'already linked', ts: 30 },
  ];

  test('the old table leaves them alone, with no completion stamp', () => {
    const { records, changed } = migrateRecords(legacyNotes(), createIdentityResolver(oldTable), { now: 1 });
    expect(records[0].id).toBeUndefined();
    expect(records[0].provenance).toBeUndefined();
    expect(records[1].id).toBeUndefined();
    expect(changed).toBe(true); // the third one does link
  });

  test('the new table promotes them on the next load', () => {
    const pass1 = migrateRecords(legacyNotes(), createIdentityResolver(oldTable), { now: 1 });
    const pass2 = migrateRecords(pass1.records, createIdentityResolver(newTable), { now: 2 });

    expect(pass2.changed).toBe(true);
    expect(pass2.records[0].id).toBe(RESLUGGED.id);
    expect(pass2.records[1].id).toBe(RECASED.id);
  });

  test('nothing is lost in the promotion', () => {
    const before = legacyNotes();
    const pass1 = migrateRecords(before, createIdentityResolver(oldTable), { now: 1 });
    const { records } = migrateRecords(pass1.records, createIdentityResolver(newTable), { now: 2 });

    expect(records).toHaveLength(before.length);
    records.forEach((r, i) => {
      expect(r.text).toBe(before[i].text);
      expect(r.title).toBe(before[i].title);
      expect(r.url).toBe(before[i].url);
    });
    // The URL it was written at is kept as history, not replaced.
    expect(records[0].legacyUrls).toContain(RESLUGGED.skilljar);
  });

  test('promotion does not merge two records into one', () => {
    // Migration links; it never collapses. Two notes on the same lesson stay
    // two notes, and only an explicit save replaces one of them.
    const twin = [
      { url: RESLUGGED.skilljar, title: 'Accessing the API', text: 'from Skilljar', ts: 10 },
      { url: RESLUGGED.academy, title: 'Accessing the API', text: 'from Academy', ts: 20 },
    ];
    const { records } = migrateRecords(twin, createIdentityResolver(newTable), { now: 1 });
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.text)).toEqual(['from Skilljar', 'from Academy']);
    expect(records.every((r) => r.id === RESLUGGED.id)).toBe(true);
  });

  test('the same lesson now resolves from either platform', () => {
    const resolver = createIdentityResolver(newTable);
    expect(resolver.resolve(RESLUGGED.skilljar).id).toBe(RESLUGGED.id);
    expect(resolver.resolve(RESLUGGED.academy).id).toBe(RESLUGGED.id);
    expect(resolver.resolve(RECASED.skilljar).id).toBe(RECASED.id);
    expect(resolver.resolve(RECASED.academy).id).toBe(RECASED.id);
  });

  test('the shipped table really does carry these pairs', () => {
    // Guards the fixtures above against drifting away from what ships.
    const shippedTable = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'src', 'shared', 'canonical-lessons.json'), 'utf8'),
    );
    const shipped = createIdentityResolver(shippedTable);
    expect(shipped.validationErrors()).toEqual([]);
    expect(shipped.resolve(RESLUGGED.skilljar).id).toBe(RESLUGGED.id);
    expect(shipped.resolve(RECASED.skilljar).id).toBe(RECASED.id);
  });
});
