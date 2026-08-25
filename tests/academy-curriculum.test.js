/**
 * Curriculum observation, tested on synthetic structures.
 *
 * No real Academy markup or content is reproduced here — the shapes below are
 * invented, each to encode one failure mode. The extractor's job is to record
 * what a site shows; these pin that it records it accurately and refuses to
 * publish when it cannot.
 */

/* global describe, test, expect */

const {
  UNIT_KIND,
  classifyUnitKind,
  buildCurriculum,
  validateCurriculum,
  validateSnapshot,
} = require('../scripts/lib/academy-curriculum');

/** Build an observation for a course with the given groups. */
const observe = (groups, over = {}) => ({
  coursePath: '/courses/course-a',
  courseTitle: 'Course A',
  groups,
  ...over,
});

const group = (titles, prefix = '/courses/course-a') => ({
  title: null,
  unitPaths: titles.map((t) => `${prefix}/${t}`),
  unitTitles: titles.map((t) => t.replace(/-/g, ' ')),
});

describe('classifyUnitKind', () => {
  test('a final assessment is an assessment, not a lesson', () => {
    // #328 established final-assessment as a real assessment route. A
    // `quiz-*` prefix rule misses it, and missing an assessment is the
    // expensive direction to be wrong in.
    expect(classifyUnitKind({ slug: 'final-assessment' })).toBe(UNIT_KIND.ASSESSMENT);
  });

  test('quizzes are recognised in the shapes the site uses', () => {
    expect(classifyUnitKind({ slug: 'quiz-on-model-context-protocol' })).toBe(UNIT_KIND.QUIZ);
    expect(classifyUnitKind({ slug: 'section-quiz' })).toBe(UNIT_KIND.QUIZ);
  });

  test('an ordinary lesson is a lesson', () => {
    expect(classifyUnitKind({ slug: 'making-a-request' })).toBe(UNIT_KIND.LESSON);
  });

  test('a completion badge is not a teaching unit', () => {
    // Counting it as a lesson inflates every lesson total downstream.
    expect(classifyUnitKind({ slug: 'badge' })).toBe(UNIT_KIND.UNKNOWN);
  });

  test('no slug means unknown, never lesson', () => {
    expect(classifyUnitKind({})).toBe(UNIT_KIND.UNKNOWN);
    expect(classifyUnitKind(null)).toBe(UNIT_KIND.UNKNOWN);
  });
});

describe('buildCurriculum', () => {
  test('preserves grouping, paths, slugs and a dense global order', () => {
    const out = buildCurriculum(observe([group(['a', 'b']), group(['c'])]));
    expect(out.sections).toHaveLength(2);
    expect(out.sections[0].units.map((u) => u.slug)).toEqual(['a', 'b']);
    // Dense across the whole course, so a unit's position survives a
    // regrouping of sections.
    expect(out.sections.flatMap((s) => s.units).map((u) => u.order)).toEqual([1, 2, 3]);
    expect(out.unitCount).toBe(3);
  });

  test('an unattributable section title is null, not a guess', () => {
    // Measured: the page renders 7 section headings in a summary block that
    // does not interleave with the 11 unit groups. Pairing them by ordinal
    // would produce confident wrong answers, so the extractor declines.
    const out = buildCurriculum(observe([group(['a']), group(['b'])]));
    expect(out.sections.map((s) => s.title)).toEqual([null, null]);
  });

  test('a title that WAS observed is kept', () => {
    const g = { ...group(['a']), title: '  Accessing the API  ' };
    expect(buildCurriculum(observe([g])).sections[0].title).toBe('Accessing the API');
  });

  test('courses are not assumed to share a structure', () => {
    // The API and Vertex courses differ; an extractor that hard-codes one
    // shape reports the other one wrong.
    const flat = buildCurriculum(observe([group(['only-one'])]));
    const deep = buildCurriculum(observe([group(['a']), group(['b']), group(['c', 'd', 'e'])]));
    expect(flat.sections).toHaveLength(1);
    expect(deep.sections).toHaveLength(3);
    expect(deep.unitCount).toBe(5);
  });

  test('unitCount comes from the unit arrays, never from a card', () => {
    // A catalog card once said "66 lessons / 9 quizzes" while the DOM held
    // 76 units. The arrays are the source of truth.
    const out = buildCurriculum(observe([group(['a', 'b', 'c'])], { displayedStats: { lessons: 66 } }));
    expect(out.unitCount).toBe(3);
    expect(out).not.toHaveProperty('displayedStats');
  });

  test('decorative or empty groups do not invent units', () => {
    const out = buildCurriculum(observe([{ title: null, unitPaths: [], unitTitles: [] }]));
    expect(out.unitCount).toBe(0);
  });
});

describe('validateCurriculum', () => {
  const good = () => buildCurriculum(observe([group(['a', 'b'])]));

  test('accepts a well-formed course', () => {
    expect(validateCurriculum(good())).toEqual({ ok: true, errors: [] });
  });

  test('rejects a duplicate unit path', () => {
    const dup = buildCurriculum(observe([group(['a']), group(['a'])]));
    const out = validateCurriculum(dup);
    expect(out.ok).toBe(false);
    expect(out.errors.join(' ')).toMatch(/duplicate unit path/);
  });

  test('rejects a course with no units', () => {
    expect(validateCurriculum(buildCurriculum(observe([]))).ok).toBe(false);
  });

  test('rejects a missing title or path', () => {
    expect(validateCurriculum({ ...good(), title: '' }).ok).toBe(false);
    expect(validateCurriculum({ ...good(), path: '' }).ok).toBe(false);
  });

  test('rejects a stored count that disagrees with the units', () => {
    // Catches a bug in this module rather than trusting its own output.
    expect(validateCurriculum({ ...good(), unitCount: 99 }).ok).toBe(false);
  });

  test('rejects a non-dense order', () => {
    const broken = good();
    broken.sections[0].units[1].order = 7;
    expect(validateCurriculum(broken).errors.join(' ')).toMatch(/dense/);
  });
});

describe('validateSnapshot', () => {
  test('refuses to publish an empty capture', () => {
    // The failure mode that matters: a snapshot missing courses still looks
    // complete to whoever reads it later.
    expect(validateSnapshot({ courses: [] }).ok).toBe(false);
    expect(validateSnapshot({}).errors.join(' ')).toMatch(/no courses/);
  });

  test('rejects a duplicate course slug', () => {
    const c = buildCurriculum(observe([group(['a'])]));
    const out = validateSnapshot({ courses: [c, { ...c }] });
    expect(out.ok).toBe(false);
    expect(out.errors.join(' ')).toMatch(/duplicate course slug/);
  });

  test('one bad course fails the whole snapshot', () => {
    const ok = buildCurriculum(observe([group(['a'])]));
    const bad = { ...buildCurriculum(observe([group(['b'])], { coursePath: '/courses/course-b' })), title: '' };
    expect(validateSnapshot({ courses: [ok, bad] }).ok).toBe(false);
  });
});
