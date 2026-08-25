/**
 * Curriculum observation for academy.claude.com.
 *
 * Observation only. No canonical ids, no Skilljar counterpart, no migration
 * judgement — mixing those in is how a record of what a site shows turns into
 * a record of what we decided about it, and the two age differently.
 *
 * MEASURED STRUCTURE (2026-08-25, the API course). Units are grouped into
 * per-section lists — sizes 9/7/6/13/7/9/11/4/8/1/1 — which is a clean
 * grouping signal. Section HEADINGS are a different story: the page renders 7
 * `h3`s in an "Inside the course" summary block that appears BEFORE the lists
 * and does not interleave with them, and 7 does not match the 11 groups
 * (the "Prompt evaluation" section has no heading of its own, and neither the
 * final assessment nor the completion badge is a section at all).
 *
 * So group membership is observable and section titles are not reliably
 * attributable. Rather than pair them by ordinal and produce confident wrong
 * answers, a group whose title cannot be established records `title: null`.
 * A later identity layer can do better with more evidence; an extractor
 * should not guess.
 */

/** What a unit is, as far as the DOM can say. */
const UNIT_KIND = Object.freeze({
  LESSON: 'lesson',
  QUIZ: 'quiz',
  ASSESSMENT: 'assessment',
  UNKNOWN: 'unknown',
});

/**
 * Classify a unit from its slug.
 *
 * `final-assessment` is called out separately because #328 established it as
 * a real assessment route that a `quiz-*` prefix rule misses — and missing an
 * assessment is the expensive direction to be wrong in.
 *
 * @param {{slug?: string, title?: string}} unit
 * @returns {string} one of UNIT_KIND
 */
function classifyUnitKind(unit) {
  const slug = String((unit && unit.slug) || '');
  if (!slug) return UNIT_KIND.UNKNOWN;
  if (/(^|-)final-assessment(-|$)|(^|-)assessment(-|$)/i.test(slug)) return UNIT_KIND.ASSESSMENT;
  if (/(^|-)quiz(-|$)|^quiz-on-/i.test(slug)) return UNIT_KIND.QUIZ;
  // The completion badge is a course artifact, not a teaching unit, and
  // calling it a lesson would inflate every lesson count downstream.
  if (/^badge$/i.test(slug)) return UNIT_KIND.UNKNOWN;
  return UNIT_KIND.LESSON;
}

const slugOf = (p) => {
  const parts = String(p || '')
    .split('?')[0]
    .split('#')[0]
    .replace(/\/+$/, '')
    .split('/');
  return parts[parts.length - 1] || '';
};

/**
 * Turn observed unit groups into the curriculum record for one course.
 *
 * @param {{coursePath: string, courseTitle: string, groups: Array<{title: string|null, unitPaths: string[], unitTitles: string[]}>}} observed
 * @returns {object}
 */
function buildCurriculum(observed) {
  const o = observed || {};
  const groups = Array.isArray(o.groups) ? o.groups : [];
  let order = 0;
  const sections = groups.map((group, gi) => {
    const paths = Array.isArray(group.unitPaths) ? group.unitPaths : [];
    const titles = Array.isArray(group.unitTitles) ? group.unitTitles : [];
    return {
      // null, not a guessed heading — see the module note.
      title: typeof group.title === 'string' && group.title.trim() ? group.title.trim() : null,
      order: gi + 1,
      units: paths.map((p, ui) => {
        order += 1;
        const slug = slugOf(p);
        return {
          // Dense across the whole course, so a unit's position survives a
          // regrouping of sections.
          order,
          kind: classifyUnitKind({ slug }),
          slug,
          path: p,
          title: typeof titles[ui] === 'string' ? titles[ui] : '',
        };
      }),
    };
  });

  return {
    slug: slugOf(o.coursePath),
    path: o.coursePath || '',
    title: o.courseTitle || '',
    sections,
    // Derived from the unit arrays, never from a card. Stored for convenience;
    // validation recomputes it rather than trusting it.
    unitCount: sections.reduce((n, s) => n + s.units.length, 0),
  };
}

/**
 * Validate one course observation. Every failure here is meant to abort the
 * whole capture — a snapshot that silently omits a course is worse than no
 * snapshot, because it looks complete.
 *
 * @param {object} course
 * @returns {{ok: boolean, errors: string[]}}
 */
function validateCurriculum(course) {
  const errors = [];
  const c = course || {};
  if (!c.slug) errors.push('course slug is missing');
  if (!c.path) errors.push('course path is missing');
  if (!c.title || !String(c.title).trim()) errors.push(`course ${c.slug || '?'} has no title`);

  const sections = Array.isArray(c.sections) ? c.sections : [];
  const units = sections.flatMap((s) => (Array.isArray(s.units) ? s.units : []));
  if (!units.length) errors.push(`course ${c.slug || '?'} has no units`);

  const seen = new Set();
  for (const u of units) {
    if (!u.path) errors.push(`course ${c.slug}: a unit has no path`);
    if (!u.slug) errors.push(`course ${c.slug}: a unit has no slug`);
    if (u.path && seen.has(u.path)) errors.push(`course ${c.slug}: duplicate unit path ${u.path}`);
    seen.add(u.path);
    if (!Object.values(UNIT_KIND).includes(u.kind)) errors.push(`course ${c.slug}: unit ${u.slug} has an unknown kind`);
  }

  // The unit arrays are the source of truth. A stored count that disagrees
  // with them is a bug in this module, not an observation.
  const recomputed = units.length;
  if (typeof c.unitCount === 'number' && c.unitCount !== recomputed) {
    errors.push(`course ${c.slug}: unitCount ${c.unitCount} disagrees with ${recomputed} observed units`);
  }

  const orders = units.map((u) => u.order);
  const dense = orders.every((n, i) => n === i + 1);
  if (!dense) errors.push(`course ${c.slug}: unit order is not a dense 1..N sequence`);

  return { ok: errors.length === 0, errors };
}

/**
 * Validate a whole snapshot, including cross-course invariants.
 * @param {object} snapshot
 * @returns {{ok: boolean, errors: string[]}}
 */
function validateSnapshot(snapshot) {
  const errors = [];
  const courses = Array.isArray(snapshot && snapshot.courses) ? snapshot.courses : [];
  if (!courses.length) errors.push('no courses captured — refusing to publish');

  const slugs = new Set();
  for (const course of courses) {
    if (slugs.has(course.slug)) errors.push(`duplicate course slug ${course.slug}`);
    slugs.add(course.slug);
    errors.push(...validateCurriculum(course).errors);
  }
  return { ok: errors.length === 0, errors };
}

module.exports = { UNIT_KIND, classifyUnitKind, buildCurriculum, validateCurriculum, validateSnapshot };
