/**
 * SkillBridge — one lesson-identity service for every local study record.
 *
 * Notes, bookmarks and recent lessons each keep their own storage key and
 * their own panel, and each used to answer "is this record about the page I am
 * on?" with its own `record.url === location.href`. Three copies of a rule is
 * how they drift, and this is a rule that must not drift: get it wrong in one
 * of them and a learner's notes vanish on a page that looks like the right one.
 *
 * So the rule lives here once, over one shared resolver, and the modules ask.
 *
 * The lookup table is FETCHED rather than bundled. It is 59 KB of pairs, and
 * the content bundle is loaded on every course page — paying that on every
 * page load to answer a question that is only asked when a panel opens or a
 * visit is recorded would be the wrong trade. It is a web-accessible resource,
 * read once, cached for the life of the page.
 *
 * Every failure resolves to the same place: an empty table. A fetch that 404s,
 * a JSON parse that throws, a page that is not a lesson at all — all of them
 * mean "no canonical id", which means URL identity, which is exactly the
 * behaviour these three modules had before this file existed. Nothing degrades
 * into a wrong answer.
 */

(function () {
  'use strict';

  const sb = window._sb;
  if (!sb) {
    console.warn('[SkillBridge] lesson-store: _sb not ready');
    return;
  }
  const identity = window._sbLessonIdentity;
  if (!identity) {
    console.warn('[SkillBridge] lesson-store: _sbLessonIdentity missing (src/lib/lesson-identity.js not loaded?)');
    return;
  }

  const TABLE_PATH = 'src/shared/canonical-lessons.json';

  // Built from an empty table until the real one lands. Every call is safe
  // against it; it simply answers "no canonical id" for everything, which is
  // the pre-existing URL-keyed behaviour.
  let resolver = identity.createIdentityResolver(null);
  let loadPromise = null;

  /**
   * Load the table once. Resolves either way — a caller must never have to
   * decide what to do about a missing lookup table, because the answer is
   * always "carry on with URL identity".
   */
  function ready() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      try {
        const url = chrome.runtime.getURL(TABLE_PATH);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const table = await res.json();
        resolver = identity.createIdentityResolver(table);
      } catch (err) {
        // Warn rather than fail: cross-platform continuity stops working, and
        // that is worth saying out loud, but every record still resolves.
        console.warn('[SkillBridge] lesson identity table unavailable — records stay URL-keyed:', err?.message);
      }
    })();
    return loadPromise;
  }

  /**
   * Run migration over a freshly loaded list.
   *
   * Returns the records to use plus whether anything changed, and writes
   * nothing itself — persistence stays with the module that owns the storage
   * key and its write queue. `changed` is honest: an already-migrated list
   * returns the same objects and `false`, so a reload costs no write.
   *
   * A caller that fails to persist loses nothing. The annotation is
   * idempotent, so the cost of a failed write is one repeated migration on the
   * next load, and the in-memory list is correct in the meantime.
   *
   * @param {Array<object>} records
   * @returns {{records: Array<object>, changed: boolean, stats: object}}
   */
  function migrate(records) {
    return identity.migrateRecords(records, resolver);
  }

  sb.identity = {
    ready,
    /** `{ id, ref, platform }` for a URL or Location. */
    resolve: (urlOrLoc) => resolver.resolve(urlOrLoc),
    /** The identity string a live page asks with. */
    identityOf: (urlOrLoc) => identity.locationIdentity(resolver, urlOrLoc),
    /** The newest record answering to a page, or null. */
    find: (records, urlOrLoc) => identity.findRecord(records, resolver, urlOrLoc),
    /** Every record answering to a page — what a save replaces. */
    matching: (records, urlOrLoc) => identity.matchingRecords(records, resolver, urlOrLoc),
    /**
     * Stamp a NEW record with the identity of the page it is being written on.
     * A page with no canonical id gets no `id`, and stays URL-keyed.
     */
    stamp(record, urlOrLoc) {
      const resolved = resolver.resolve(urlOrLoc);
      if (!resolved.id) return record;
      return {
        ...record,
        id: resolved.id,
        provenance: {
          schemaVersion: identity.IDENTITY_SCHEMA_VERSION,
          matchedBy: identity.IDENTITY_SOURCE.CANONICAL,
          platform: resolved.platform,
          migratedAt: record.ts || Date.now(),
        },
      };
    },
    /**
     * Where a record should open from, given where the learner is now: the
     * same lesson on the platform they are actually browsing, when the table
     * knows it, and the record's own URL otherwise.
     */
    openUrlFor: (record, urlOrLoc) => resolver.preferredUrl(record, urlOrLoc),
    /** The identity string a stored record answers to. */
    recordIdentity: (record) => identity.recordIdentity(record),
    migrate,
  };

  // Start the fetch immediately; consumers await `ready()` before their first
  // read so nothing races on a half-built resolver.
  ready();

  sb.registerModule?.('lesson-store');
})();
