/**
 * Canonical course/lesson identity across Skilljar and Claude Academy.
 *
 * The two platforms name the same lesson with disjoint key material:
 *
 *   Skilljar unit → numericId + title + order   (no slug)
 *   Academy unit  → slug + path + title + order (no numericId)
 *
 * So neither platform's key can BE the canonical id — a canonical id is
 * minted here and both platform keys hang off it as aliases. That keeps a
 * lesson identifiable when a platform renumbers, re-slugs, or drops away
 * entirely, and it means adding a third platform later touches aliases only.
 *
 * Section is deliberately NOT part of lesson identity. Every one of
 * Academy's 137 observed sections carries a null title, so keying a lesson
 * by its section would make every Academy lesson unresolvable. Sections are
 * presentation; the course is the identity scope.
 *
 * This module MATCHES and REPORTS. It does not migrate anything. Where the
 * evidence is thin it says so — an ambiguous match is returned as ambiguous
 * with its candidates attached, never silently resolved to the first hit.
 * Deciding what to do about a low-confidence match is a caller's job, and
 * that caller should be a human until the report says otherwise.
 *
 * Pure functions only: snapshots go in, a match report comes out.
 */

/** How much independent evidence backs a match. */
const CONFIDENCE = Object.freeze({
  /** Course slug and normalized title agree, and the title is unique. */
  HIGH: 'high',
  /** Titles agree but only after normalization did real work. */
  MEDIUM: 'medium',
  /** Position agrees but the title does not. Needs a human. */
  LOW: 'low',
  /** Nothing on the other platform corresponds. */
  NONE: 'none',
});

/** Why a match could not be made confidently. */
const AMBIGUITY = Object.freeze({
  /** Several candidates tie on the winning signal. */
  MULTIPLE_CANDIDATES: 'multiple-candidates',
  /** Two lessons in one course normalize to the same title. */
  DUPLICATE_TITLE: 'duplicate-title-within-course',
  /** Matched on order alone, with titles disagreeing. */
  POSITION_ONLY: 'position-only',
});

/**
 * Reduce a human title to a comparison key.
 *
 * Lowercase, strip punctuation and diacritics, collapse whitespace. This is
 * intentionally conservative: it must not merge two genuinely different
 * lessons, so it never stems, never drops stop words, and never truncates.
 * "Multi-Turn conversations" and "multi turn conversations" are the same
 * lesson; "Tool schemas" and "Tool functions" must stay different.
 */
function normalizeTitle(title) {
  return String(title || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Flatten a platform snapshot's courses into comparable lesson rows.
 *
 * Sections are walked to reach units and then discarded — see the module
 * note on why section cannot be part of identity.
 */
function flattenUnits(course) {
  const rows = [];
  for (const section of course.sections || []) {
    for (const unit of section.units || []) {
      rows.push({
        courseSlug: course.slug,
        order: unit.order,
        kind: unit.kind,
        title: unit.title,
        normalized: normalizeTitle(unit.title),
        slug: unit.slug || null,
        path: unit.path || null,
        numericId: unit.numericId || null,
      });
    }
  }
  return rows;
}

/**
 * Unit "kind" is NOT used to match, and must not be used to detect a quiz.
 *
 * It looked like a cheap guard against fusing a quiz to a lesson. The
 * snapshots say otherwise — the field disagrees with itself across platforms
 * and within them:
 *
 *   "Course quiz"                 Academy quiz       Skilljar modular
 *   "Assessment on MCP concepts"  Academy assessment Skilljar quiz
 *   "Course quiz" (framework)     Academy lesson     Skilljar modular
 *
 * Gating on it rejected three correct title matches and caught no wrong
 * ones, so it is worse than nothing for identity and it is removed.
 *
 * The consequence reaches past this module: SkillBridge must never decide a
 * page is an assessment by reading a catalog kind. A course quiz labelled
 * "lesson" would walk straight through such a check with the exam-safe
 * switch still off. That decision belongs to the live page signals the
 * safety reconnaissance confirmed — route, heading, and role="radiogroup" —
 * which are present before a question is answered, which is when the tutor
 * has to be protected.
 */

/** Index rows by normalized title, so duplicates are visible rather than lost. */
function indexByTitle(rows) {
  const index = new Map();
  for (const row of rows) {
    if (!index.has(row.normalized)) index.set(row.normalized, []);
    index.get(row.normalized).push(row);
  }
  return index;
}

/**
 * Match one course's lessons across the two platforms.
 *
 * Signals, strongest first: unique normalized title, then position. A title
 * that appears twice in the same course is reported as ambiguous rather than
 * resolved by position, because position is exactly what a duplicated title
 * makes unreliable.
 */
function matchCourseUnits(academyUnits, skilljarUnits) {
  const skilljarByTitle = indexByTitle(skilljarUnits);
  const academyByTitle = indexByTitle(academyUnits);
  const matches = [];
  const usedSkilljar = new Set();

  for (const unit of academyUnits) {
    const candidates = skilljarByTitle.get(unit.normalized) || [];
    const selfDuplicated = (academyByTitle.get(unit.normalized) || []).length > 1;

    if (candidates.length === 1 && !selfDuplicated) {
      const peer = candidates[0];
      usedSkilljar.add(peer);
      matches.push({
        academy: unit,
        skilljar: peer,
        // Exact string equality means normalization never had to intervene.
        confidence: unit.title === peer.title ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM,
        ambiguity: null,
        candidates: null,
      });
      continue;
    }

    if (candidates.length > 1 || selfDuplicated) {
      matches.push({
        academy: unit,
        skilljar: null,
        confidence: CONFIDENCE.LOW,
        ambiguity: selfDuplicated ? AMBIGUITY.DUPLICATE_TITLE : AMBIGUITY.MULTIPLE_CANDIDATES,
        candidates: candidates.map((c) => ({ numericId: c.numericId, title: c.title, order: c.order })),
      });
      continue;
    }

    matches.push({
      academy: unit,
      skilljar: null,
      confidence: CONFIDENCE.NONE,
      ambiguity: null,
      candidates: null,
    });
  }

  // Second pass: position, but only between two confirmed anchors.
  //
  // Academy disambiguates generic titles that Skilljar repeats verbatim —
  // four lessons literally called "Try it out" line up against "Try It Out:
  // Knowledge", "Try It Out: Steerability", and so on. Raw order alone is not
  // enough to claim that: Academy also ADDS lessons (a completion badge at
  // the end of most courses), so the two orderings drift apart and a
  // same-order pairing further down would be a coincidence dressed as
  // evidence.
  //
  // So a gap is filled only when the lessons on either side of it already
  // matched by title, and the candidate falls strictly between THEIR peers.
  // That brackets the unknown between two known points instead of trusting a
  // bare index. Even then it is LOW/POSITION_ONLY — matched, reported, and
  // never trusted enough to migrate without a human looking at it.
  const unclaimedByOrder = new Map();
  for (const unit of skilljarUnits) {
    if (!usedSkilljar.has(unit)) unclaimedByOrder.set(unit.order, unit);
  }
  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    if (match.skilljar || match.confidence !== CONFIDENCE.NONE) continue;
    const before = matches[i - 1]?.skilljar;
    const after = matches[i + 1]?.skilljar;
    if (!before || !after) continue;
    const peer = [...unclaimedByOrder.values()].filter((u) => u.order > before.order && u.order < after.order);
    // Exactly one candidate in the gap, or the gap does not identify anything.
    if (peer.length !== 1) continue;
    usedSkilljar.add(peer[0]);
    unclaimedByOrder.delete(peer[0].order);
    match.skilljar = peer[0];
    match.confidence = CONFIDENCE.LOW;
    match.ambiguity = AMBIGUITY.POSITION_ONLY;
    match.candidates = [{ numericId: peer[0].numericId, title: peer[0].title, order: peer[0].order }];
  }

  const unmatchedSkilljar = skilljarUnits.filter((u) => !usedSkilljar.has(u));
  return { matches, unmatchedSkilljar };
}

/**
 * Mint the canonical record for one matched lesson.
 *
 * The canonical id prefers the Academy slug: it is stable, human-readable,
 * and already unique within its course. A Skilljar-only lesson falls back to
 * its normalized title, which is the only durable thing Skilljar gives us —
 * numericId is a tenant-local database key and would not survive a migration.
 */
function toCanonicalRecord(courseSlug, academyUnit, skilljarUnit) {
  const id = academyUnit?.slug || normalizeTitle(skilljarUnit?.title).replace(/ /g, '-');
  const aliases = {};
  if (skilljarUnit) {
    aliases.skilljar = {
      course: courseSlug,
      numericId: skilljarUnit.numericId,
      path: skilljarUnit.path,
      order: skilljarUnit.order,
    };
  }
  if (academyUnit) {
    aliases.academy = {
      course: courseSlug,
      slug: academyUnit.slug,
      path: academyUnit.path,
      order: academyUnit.order,
    };
  }
  return {
    id,
    title: academyUnit?.title || skilljarUnit?.title,
    kind: academyUnit?.kind || skilljarUnit?.kind,
    aliases,
  };
}

/**
 * Pair up courses across platforms.
 *
 * Slug alone is not enough. Three courses were re-slugged in the move to
 * Academy while keeping their exact title — claude-in-amazon-bedrock became
 * claude-with-amazon-bedrock, claude-with-the-anthropic-api became
 * building-with-the-claude-api — so a slug-only join would report six
 * phantom single-platform courses and orphan every lesson inside them.
 *
 * Title is the fallback, and only an exact normalized-title hit counts. The
 * Vertex course was renamed as well as re-slugged ("Claude on Google Cloud"
 * to "Claude with Google Cloud's Vertex AI"), and guessing at that pairing
 * from partial word overlap is how a matcher fuses two unrelated courses.
 * It stays unpaired and shows up as a finding for a human to settle.
 */
function pairCourses(academyCourses, skilljarCourses) {
  const pairs = [];
  const claimedSkilljar = new Set();

  for (const a of academyCourses) {
    const bySlug = skilljarCourses.find((s) => s.slug === a.slug);
    if (bySlug) {
      claimedSkilljar.add(bySlug);
      pairs.push({ academy: a, skilljar: bySlug, joinedOn: 'slug' });
      continue;
    }
    const titleKey = normalizeTitle(a.title);
    const byTitle = skilljarCourses.filter((s) => !claimedSkilljar.has(s) && normalizeTitle(s.title) === titleKey);
    if (byTitle.length === 1) {
      claimedSkilljar.add(byTitle[0]);
      pairs.push({ academy: a, skilljar: byTitle[0], joinedOn: 'title' });
      continue;
    }
    pairs.push({ academy: a, skilljar: null, joinedOn: null });
  }

  for (const s of skilljarCourses) {
    if (!claimedSkilljar.has(s)) pairs.push({ academy: null, skilljar: s, joinedOn: null });
  }
  return pairs;
}

/**
 * Build the full cross-platform identity report.
 *
 * A course present on only one platform is reported, not dropped — an
 * unmatched course is a finding, not noise.
 */
function buildIdentityReport(academySnapshot, skilljarSnapshot) {
  const pairs = pairCourses(academySnapshot.courses || [], skilljarSnapshot.courses || []);

  const courses = [];
  const tally = { high: 0, medium: 0, low: 0, none: 0, skilljarOnly: 0 };

  for (const { academy: a, skilljar: s, joinedOn } of pairs) {
    // The canonical scope keeps the Academy slug where there is one: Academy
    // is the platform going forward, and Skilljar's slug is the legacy alias.
    const slug = a?.slug || s.slug;
    const academyUnits = a ? flattenUnits(a) : [];
    const skilljarUnits = s ? flattenUnits(s) : [];
    const { matches, unmatchedSkilljar } = matchCourseUnits(academyUnits, skilljarUnits);

    const lessons = [];
    for (const m of matches) {
      tally[m.confidence] += 1;
      lessons.push({
        ...toCanonicalRecord(slug, m.academy, m.skilljar),
        confidence: m.confidence,
        ambiguity: m.ambiguity,
        candidates: m.candidates,
      });
    }
    for (const u of unmatchedSkilljar) {
      tally.skilljarOnly += 1;
      lessons.push({
        ...toCanonicalRecord(slug, null, u),
        confidence: CONFIDENCE.NONE,
        ambiguity: null,
        candidates: null,
      });
    }

    courses.push({
      slug,
      title: a?.title || s?.title,
      presentOn: [a && 'academy', s && 'skilljar'].filter(Boolean),
      joinedOn,
      // Kept so a re-slug stays traceable rather than silently absorbed.
      skilljarSlug: s?.slug !== slug ? s?.slug || null : null,
      lessonCount: lessons.length,
      lessons,
    });
  }
  courses.sort((x, y) => x.slug.localeCompare(y.slug));

  return {
    schemaVersion: 1,
    courses,
    summary: {
      courseCount: courses.length,
      onBothPlatforms: courses.filter((c) => c.presentOn.length === 2).length,
      academyOnly: courses.filter((c) => c.presentOn.join() === 'academy').length,
      skilljarOnly: courses.filter((c) => c.presentOn.join() === 'skilljar').length,
      joinedOnTitle: courses.filter((c) => c.joinedOn === 'title').length,
      lessons: tally,
      // Anything below high needs eyes before it can drive a migration.
      needsReview: tally.medium + tally.low + tally.none + tally.skilljarOnly,
    },
  };
}

module.exports = {
  CONFIDENCE,
  AMBIGUITY,
  normalizeTitle,
  flattenUnits,
  pairCourses,
  matchCourseUnits,
  toCanonicalRecord,
  buildIdentityReport,
};
