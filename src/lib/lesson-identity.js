/**
 * SkillBridge — lesson identity for local study records.
 *
 * Notes, bookmarks and recent lessons were all keyed on `location.href`. That
 * was correct while there was one platform. Anthropic's courses now live on
 * academy.claude.com as well as anthropic.skilljar.com, and the same lesson
 * has two completely different URLs on them:
 *
 *   /claude-with-the-anthropic-api/287726
 *   /courses/building-with-the-claude-api/accessing-the-api
 *
 * A learner who took notes on Skilljar and opens the same lesson on Academy
 * gets a blank page and no explanation. Worse, the course slug itself changed
 * for two courses in the move, so even a same-platform heuristic on the slug
 * would miss 148 of the 308 matched lessons.
 *
 * This module gives a record a durable identity, and the whole design follows
 * from one rule: NEVER lose a record, and never merge two records that might
 * not be the same lesson.
 *
 *   - Only HIGH-confidence pairs link. The identity report classifies every
 *     lesson and 261 of them need a human; the shipped table (built by
 *     scripts/build-canonical-lookup.js) carries only the 308 that do not.
 *     Everything else keeps URL identity — exactly what it had before.
 *   - Migration ANNOTATES, it never merges or rewrites. A record gains an
 *     `id`, keeps its `url`, and gains a `legacyUrls` list and a `provenance`
 *     stamp. Nothing is dropped, so running it twice changes nothing the
 *     second time, and a half-finished run is just a run that annotated fewer
 *     records.
 *   - Because migration only annotates, it is exactly reversible. `rollback`
 *     is not a snapshot restore; it removes the fields migration added and
 *     returns the original records. That property is testable, and it is the
 *     reason there is no backup copy of every record sitting in storage.
 *
 * Pure functions: a URL and a table go in, an identity comes out. Nothing here
 * touches the DOM, storage, or the network.
 */

/** Bump when the record shape changes in a way a reader must notice. */
const IDENTITY_SCHEMA_VERSION = 1;

/** How a record came to have the identity it has. Carried in `provenance`. */
const IDENTITY_SOURCE = Object.freeze({
  /** Matched to a high-confidence cross-platform pair in the shipped table. */
  CANONICAL: 'canonical',
  /** No table entry. The record answers to its URL, as it always did. */
  URL: 'url',
});

/**
 * Recognise a lesson URL and reduce it to a platform-local key.
 *
 * Only the two shapes that actually exist are accepted. A catalog page, a
 * course landing page or a marketing route returns null, so it can never be
 * mistaken for a lesson and pick up a neighbour's identity.
 *
 * Academy prefixes non-English locales onto the path (`/es/courses/…`), and
 * the locale is NOT part of identity: the Spanish and English renderings of a
 * lesson are the same lesson, and a note written on one belongs on the other.
 *
 * @param {string|Location} urlOrLoc
 * @returns {{ platform: 'skilljar'|'academy', course: string, key: string, ref: string }|null}
 */
function parseLessonRef(urlOrLoc) {
  let rawHost;
  let pathname;
  try {
    if (urlOrLoc && typeof urlOrLoc === 'object' && urlOrLoc.pathname !== undefined) {
      rawHost = String(urlOrLoc.hostname || '');
      pathname = String(urlOrLoc.pathname || '');
    } else {
      const parsed = new URL(String(urlOrLoc || ''));
      rawHost = parsed.hostname;
      pathname = parsed.pathname;
    }
  } catch (_e) {
    return null;
  }
  const host = rawHost
    .replace(/\.$/, '')
    .replace(/^www\./, '')
    .toLowerCase();

  if (host === 'academy.claude.com') {
    // Strip a leading locale segment. `courses` is two-or-more characters too,
    // so the pattern requires exactly a language subtag, and the segment after
    // it must be `courses` for the strip to apply at all.
    const path = pathname.replace(/^\/[a-z]{2}(?:-[A-Za-z]{2,4})?(?=\/courses\/)/, '');
    const m = /^\/courses\/([^/]+)\/([^/]+)\/?$/.exec(path);
    if (!m) return null;
    return { platform: 'academy', course: m[1], key: m[2], ref: `${m[1]}/${m[2]}` };
  }

  // The Anthropic tenant only. Every other *.skilljar.com tenant is a
  // different organisation's catalogue that happens to share the LMS, and the
  // resolver key is `courseSlug/numericId` with no host in it — so admitting
  // them would let a partner course collide with an Anthropic lesson on a
  // numeric id neither party chose. Those tenants get translation, which is
  // all they ever had; they do not get cross-platform identity, because there
  // is no second platform for them to be carried to.
  if (host === 'anthropic.skilljar.com') {
    const m = /^\/([^/]+)\/(\d+)\/?$/.exec(pathname);
    if (!m) return null;
    return { platform: 'skilljar', course: m[1], key: m[2], ref: `${m[1]}/${m[2]}` };
  }

  return null;
}

/**
 * Where each platform serves its lessons.
 *
 * Hard-coded, and deliberately not read from the stored record: the point of
 * rebuilding a URL is to move a learner to the SAME lesson on the platform
 * they are currently browsing, so the origin has to come from the platform, not
 * from wherever the record happened to be written. Skilljar's origin is the
 * Anthropic tenant, which is the only Skilljar tenant the identity report
 * covers — a lesson on another tenant is not in the table and never rebuilds.
 */
const PLATFORM_ORIGINS = Object.freeze({
  skilljar: 'https://anthropic.skilljar.com',
  academy: 'https://academy.claude.com',
});

/** `('academy', 'course/slug')` → the full lesson URL, or null for an unknown platform. */
function refToUrl(platform, ref) {
  const origin = PLATFORM_ORIGINS[platform];
  if (!origin || !ref) return null;
  return platform === 'academy' ? `${origin}/courses/${ref}` : `${origin}/${ref}`;
}

/**
 * Build a resolver over a shipped lookup table.
 *
 * The table is keyed by canonical id with both platform refs as values, which
 * is the shape a human reads. The runtime needs the reverse, so the indexes are
 * inverted once here rather than scanned per lookup.
 *
 * @param {{lessons?: Record<string, {skilljar?: string, academy?: string}>}} [table]
 */
function createIdentityResolver(table) {
  const bySkilljar = new Map();
  const byAcademy = new Map();
  // Validated, not merely parsed. A table is only useful if every alias points
  // at exactly one lesson: a duplicate means two learning objects would share
  // an identity, and the notes written on them would be merged into one and
  // then partly deleted on the next save. That is unrecoverable from the
  // user's side, so a table that fails these checks is rejected WHOLE and the
  // resolver answers "no canonical id" for everything — which is the
  // pre-existing URL-keyed behaviour and loses nothing.
  //
  // A schema bump means the shape changed; refusing an unknown version is what
  // stops an older build from reading a newer table by guessing.
  let lessons = {};
  const rejected = [];
  if (table && table.schemaVersion !== IDENTITY_SCHEMA_VERSION) {
    rejected.push(`schemaVersion ${table.schemaVersion} != ${IDENTITY_SCHEMA_VERSION}`);
  } else if (table && table.lessons && typeof table.lessons === 'object') {
    const seenSkilljar = new Map();
    const seenAcademy = new Map();
    for (const [canonical, refs] of Object.entries(table.lessons)) {
      if (!refs || typeof refs !== 'object') {
        rejected.push(`${canonical}: not an object`);
        continue;
      }
      if (refs.skilljar && seenSkilljar.has(refs.skilljar)) {
        rejected.push(`skilljar ref ${refs.skilljar} claimed by ${seenSkilljar.get(refs.skilljar)} and ${canonical}`);
      }
      if (refs.academy && seenAcademy.has(refs.academy)) {
        rejected.push(`academy ref ${refs.academy} claimed by ${seenAcademy.get(refs.academy)} and ${canonical}`);
      }
      if (refs.skilljar) seenSkilljar.set(refs.skilljar, canonical);
      if (refs.academy) seenAcademy.set(refs.academy, canonical);
    }
    if (rejected.length === 0) lessons = table.lessons;
  }

  for (const [canonical, refs] of Object.entries(lessons)) {
    if (refs?.skilljar) bySkilljar.set(refs.skilljar, canonical);
    if (refs?.academy) byAcademy.set(refs.academy, canonical);
  }

  /**
   * The identity a URL answers to.
   *
   * A URL that parses but is not in the table returns `{ id: null }` rather
   * than a guess — that is the "below high confidence, or single-platform"
   * case, and it keeps URL identity.
   *
   * @param {string|Location} urlOrLoc
   * @returns {{ id: string|null, ref: string|null, platform: string|null }}
   */
  function resolve(urlOrLoc) {
    const parsed = parseLessonRef(urlOrLoc);
    if (!parsed) return { id: null, ref: null, platform: null };
    const index = parsed.platform === 'skilljar' ? bySkilljar : byAcademy;
    return { id: index.get(parsed.ref) || null, ref: parsed.ref, platform: parsed.platform };
  }

  /**
   * The URL for a canonical lesson on a given platform, or null.
   *
   * This is what makes a Skilljar-era bookmark openable from Academy: the
   * record still names the URL it was written at, and that URL still works,
   * but sending a learner back to the platform they left is not continuity.
   */
  /** Why the table was refused, if it was. Empty when the table is in use. */
  function validationErrors() {
    return rejected.slice();
  }

  function urlFor(canonicalId, platform) {
    const refs = lessons[canonicalId];
    return refs ? refToUrl(platform, refs[platform]) : null;
  }

  /**
   * Where a record should open from, given where the learner is now.
   *
   * Falls back to the record's own URL for everything the table does not
   * cover, which is every record that was not high-confidence matched. That
   * fallback is the pre-existing behaviour, unchanged.
   */
  function preferredUrl(record, urlOrLoc) {
    const here = parseLessonRef(urlOrLoc);
    if (!record?.id || !here) return record?.url || null;
    return urlFor(record.id, here.platform) || record.url || null;
  }

  return {
    resolve,
    validationErrors,
    urlFor,
    preferredUrl,
    /** How many pairs the table carries. Surfaced for diagnostics, not logic. */
    size: () => bySkilljar.size,
  };
}

/**
 * The key a record answers to, and the key a live URL asks with.
 *
 * A record with a canonical id answers to it. Everything else answers to its
 * URL, which is what every record did before this module existed. Keeping both
 * in one function is the point: no call site gets to invent its own rule about
 * when a record matches.
 */
function recordIdentity(record) {
  if (record && record.id) return `id:${record.id}`;
  return `url:${record?.url || ''}`;
}

/** The identity a live location asks with, given a resolver. */
function locationIdentity(resolver, urlOrLoc) {
  const url = typeof urlOrLoc === 'string' ? urlOrLoc : urlOrLoc?.href || '';
  const resolved = resolver?.resolve?.(urlOrLoc);
  return resolved?.id ? `id:${resolved.id}` : `url:${url}`;
}

/**
 * Find the record for a location, preferring the newest when several match.
 *
 * Several CAN match. A learner who wrote a note on Skilljar and another on
 * Academy before this shipped ends up with two records carrying one canonical
 * id, and merging them would mean choosing which note to destroy. Both are
 * kept; the newest is what a compose box preloads, and saving over it is the
 * learner's own decision rather than ours.
 */
function findRecord(records, resolver, urlOrLoc) {
  const wanted = locationIdentity(resolver, urlOrLoc);
  let best = null;
  for (const record of records || []) {
    if (recordIdentity(record) !== wanted) continue;
    if (!best || (record.ts || 0) > (best.ts || 0)) best = record;
  }
  return best;
}

/** Every record answering to a location — used when replacing one. */
function matchingRecords(records, resolver, urlOrLoc) {
  const wanted = locationIdentity(resolver, urlOrLoc);
  return (records || []).filter((record) => recordIdentity(record) === wanted);
}

/**
 * Annotate stored records with canonical identity.
 *
 * Idempotent by construction: a record that already carries `provenance` at
 * this schema version is returned untouched, and a record whose URL resolves to
 * nothing is left exactly as it was rather than being stamped with a null id.
 * The returned array is new, and every unchanged record is the SAME OBJECT —
 * so `changed` is honest and a caller can skip the storage write entirely.
 *
 * Nothing is merged, reordered, or dropped. The only writes are `id`,
 * `legacyUrls` and `provenance`.
 *
 * @param {Array<object>} records
 * @param {{resolve: Function}} resolver
 * @param {{now?: number}} [opts]
 * @returns {{records: Array<object>, changed: boolean, stats: object}}
 */
function migrateRecords(records, resolver, opts = {}) {
  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  const stats = { total: 0, linked: 0, alreadyMigrated: 0, unresolved: 0, notALesson: 0 };
  let changed = false;

  const out = (records || []).map((record) => {
    stats.total += 1;
    if (!record || typeof record !== 'object') return record;
    if (record.provenance && record.provenance.schemaVersion === IDENTITY_SCHEMA_VERSION) {
      stats.alreadyMigrated += 1;
      return record;
    }

    const parsed = parseLessonRef(record.url);
    const resolved = resolver?.resolve?.(record.url);
    if (!parsed) stats.notALesson += 1;

    if (!resolved || !resolved.id) {
      // Left exactly as it was, with no completion stamp.
      //
      // Stamping here would be recording a permanent verdict from a table that
      // is explicitly provisional: 261 lessons are unresolved today and the
      // matcher is expected to improve. A record marked "already considered at
      // schema v1" is never re-examined, so a lesson that becomes matchable
      // next month would stay on URL identity forever — and if the lookup
      // table failed to load, EVERY record would be stamped that way in one
      // pass. Re-checking a few dozen records against an in-memory map on each
      // load costs nothing next to that.
      stats.unresolved += 1;
      return record;
    }

    stats.linked += 1;
    changed = true;
    return {
      ...record,
      id: resolved.id,
      // The URL this record was written at, kept as history rather than
      // replaced. It is what a rollback restores from, and what tells a reader
      // which platform a note was actually taken on.
      legacyUrls: dedupeUrls([...(record.legacyUrls || []), record.url]),
      provenance: {
        schemaVersion: IDENTITY_SCHEMA_VERSION,
        matchedBy: IDENTITY_SOURCE.CANONICAL,
        platform: resolved.platform,
        migratedAt: now,
      },
    };
  });

  return { records: changed ? out : records || [], changed, stats };
}

/** Preserve order, drop blanks and repeats. */
function dedupeUrls(urls) {
  const seen = new Set();
  const out = [];
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/**
 * Undo a migration, exactly.
 *
 * Possible only because migration adds fields and never removes or rewrites
 * one. This strips `id`, `provenance`, and the `legacyUrls` entries migration
 * introduced, and hands back records equal to the originals — which is a
 * property a test can assert rather than a claim in a comment.
 *
 * A `legacyUrls` list that survives (because a later write added URLs of its
 * own) is kept: it is data the learner's own use produced, not migration
 * bookkeeping, and dropping it would be the loss this whole module exists to
 * avoid.
 */
function rollbackRecords(records) {
  return (records || []).map((record) => {
    if (!record || typeof record !== 'object' || !record.provenance) return record;
    const { id: _id, provenance, legacyUrls, ...rest } = record;
    const remaining = dedupeUrls((legacyUrls || []).filter((url) => url !== record.url));
    if (provenance.matchedBy === IDENTITY_SOURCE.CANONICAL && remaining.length > 0) {
      return { ...rest, legacyUrls: remaining };
    }
    return rest;
  });
}

if (typeof window !== 'undefined') {
  window._sbLessonIdentity = {
    IDENTITY_SCHEMA_VERSION,
    IDENTITY_SOURCE,
    PLATFORM_ORIGINS,
    parseLessonRef,
    refToUrl,
    createIdentityResolver,
    recordIdentity,
    locationIdentity,
    findRecord,
    matchingRecords,
    migrateRecords,
    rollbackRecords,
  };
}

if (typeof globalThis !== 'undefined' && typeof globalThis.module !== 'undefined') {
  globalThis.module.exports = {
    IDENTITY_SCHEMA_VERSION,
    IDENTITY_SOURCE,
    PLATFORM_ORIGINS,
    parseLessonRef,
    refToUrl,
    createIdentityResolver,
    recordIdentity,
    locationIdentity,
    findRecord,
    matchingRecords,
    migrateRecords,
    rollbackRecords,
    dedupeUrls,
  };
}
