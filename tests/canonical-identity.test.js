/**
 * Cross-platform lesson identity, tested on synthetic curricula.
 *
 * No real course content is reproduced here. Each fixture below is invented
 * to encode one thing the matcher has to get right or refuse to guess at —
 * the cases came from real snapshot disagreements, the material did not.
 */

/* global describe, test, expect */

const {
  CONFIDENCE,
  AMBIGUITY,
  normalizeTitle,
  pairCourses,
  matchCourseUnits,
  flattenUnits,
  buildIdentityReport,
} = require('../scripts/lib/canonical-identity');

/** An Academy-shaped course: units carry a slug, sections carry no title. */
const academyCourse = (slug, title, units) => ({
  slug,
  title,
  path: `/courses/${slug}`,
  sections: [
    {
      title: null,
      order: 1,
      units: units.map((u, i) => ({
        order: u.order ?? i + 1,
        kind: u.kind || 'lesson',
        slug: u.slug,
        path: `/courses/${slug}/${u.slug}`,
        title: u.title,
      })),
    },
  ],
});

/** A Skilljar-shaped course: units carry a numericId and no slug. */
const skilljarCourse = (slug, title, units) => ({
  slug,
  title,
  sections: [
    {
      title: 'Getting started',
      units: units.map((u, i) => ({
        order: u.order ?? i + 1,
        kind: u.kind || 'modular',
        numericId: u.numericId,
        path: `/${slug}/${u.numericId}`,
        title: u.title,
      })),
    },
  ],
});

describe('normalizeTitle', () => {
  test('treats punctuation and case differences as the same lesson', () => {
    expect(normalizeTitle('Multi-Turn conversations')).toBe(normalizeTitle('multi turn conversations'));
  });

  test('keeps genuinely different lessons apart', () => {
    expect(normalizeTitle('Tool schemas')).not.toBe(normalizeTitle('Tool functions'));
  });
});

describe('pairCourses', () => {
  test('joins on slug when both platforms agree', () => {
    const pairs = pairCourses([academyCourse('a', 'A', [])], [skilljarCourse('a', 'A', [])]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].joinedOn).toBe('slug');
  });

  test('recovers a re-slugged course through its unchanged title', () => {
    // The real case: claude-in-amazon-bedrock became claude-with-amazon-bedrock.
    const pairs = pairCourses(
      [academyCourse('claude-with-amazon-bedrock', 'Claude with Amazon Bedrock', [])],
      [skilljarCourse('claude-in-amazon-bedrock', 'Claude with Amazon Bedrock', [])],
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0].joinedOn).toBe('title');
  });

  test('leaves a course that was both re-slugged and renamed unpaired', () => {
    // Guessing this pairing from partial overlap is how two courses get fused.
    const pairs = pairCourses(
      [academyCourse('claude-with-google-cloud-s-vertex-ai', "Claude with Google Cloud's Vertex AI", [])],
      [skilljarCourse('claude-with-google-vertex', 'Claude on Google Cloud', [])],
    );
    expect(pairs).toHaveLength(2);
    expect(pairs.every((p) => p.joinedOn === null)).toBe(true);
  });
});

describe('matchCourseUnits', () => {
  const match = (academyUnits, skilljarUnits) =>
    matchCourseUnits(
      flattenUnits(academyCourse('c', 'C', academyUnits)),
      flattenUnits(skilljarCourse('c', 'C', skilljarUnits)),
    );

  test('an exact unique title match is high confidence', () => {
    const { matches } = match([{ slug: 'knowledge', title: 'Knowledge' }], [{ numericId: '1', title: 'Knowledge' }]);
    expect(matches[0].confidence).toBe(CONFIDENCE.HIGH);
    expect(matches[0].skilljar.numericId).toBe('1');
  });

  test('a match that needed normalization is only medium confidence', () => {
    const { matches } = match(
      [{ slug: 'course-quiz', title: 'Course Quiz' }],
      [{ numericId: '1', title: 'Course quiz' }],
    );
    expect(matches[0].confidence).toBe(CONFIDENCE.MEDIUM);
  });

  test('a title duplicated within a course is reported, not resolved', () => {
    const { matches } = match(
      [
        { slug: 'try-1', title: 'Try it out' },
        { slug: 'try-2', title: 'Try it out' },
      ],
      [
        { numericId: '1', title: 'Try it out' },
        { numericId: '2', title: 'Try it out' },
      ],
    );
    expect(matches.every((m) => m.ambiguity === AMBIGUITY.DUPLICATE_TITLE)).toBe(true);
    expect(matches.every((m) => m.skilljar === null)).toBe(true);
  });

  test('fills a gap between two anchors and marks it position-only', () => {
    // Academy disambiguates a generic Skilljar title; the neighbours anchor it.
    const { matches } = match(
      [
        { slug: 'ntp', title: 'Next Token Prediction' },
        { slug: 'try-ntp', title: 'Try It Out: Next Token Prediction' },
        { slug: 'knowledge', title: 'Knowledge' },
      ],
      [
        { numericId: '1', title: 'Next Token Prediction' },
        { numericId: '2', title: 'Try it out' },
        { numericId: '3', title: 'Knowledge' },
      ],
    );
    expect(matches[1].confidence).toBe(CONFIDENCE.LOW);
    expect(matches[1].ambiguity).toBe(AMBIGUITY.POSITION_ONLY);
    expect(matches[1].skilljar.numericId).toBe('2');
  });

  test('refuses to fill a gap that is not bracketed by matched neighbours', () => {
    const { matches } = match(
      [{ slug: 'unmatched', title: 'Only On Academy' }],
      [{ numericId: '1', title: 'Only On Skilljar' }],
    );
    expect(matches[0].confidence).toBe(CONFIDENCE.NONE);
    expect(matches[0].skilljar).toBeNull();
  });

  test('position never steals a peer already claimed by title', () => {
    const { matches, unmatchedSkilljar } = match(
      [
        { slug: 'a', title: 'A' },
        { slug: 'gap', title: 'Academy Only' },
        { slug: 'b', title: 'B' },
      ],
      [
        { numericId: '1', title: 'A' },
        { numericId: '2', title: 'B', order: 2 },
        { numericId: '3', title: 'B', order: 3 },
      ],
    );
    // "B" is duplicated on Skilljar, so it stays unresolved and unclaimed,
    // and the gap must not quietly consume one of the two candidates.
    expect(matches[2].ambiguity).toBe(AMBIGUITY.MULTIPLE_CANDIDATES);
    expect(unmatchedSkilljar.length).toBeGreaterThan(0);
  });
});

describe('buildIdentityReport', () => {
  const report = () =>
    buildIdentityReport(
      {
        courses: [
          academyCourse('shared', 'Shared', [{ slug: 'intro', title: 'Intro' }]),
          academyCourse('academy-only', 'Academy Only', [{ slug: 'x', title: 'X' }]),
        ],
      },
      {
        courses: [
          skilljarCourse('shared', 'Shared', [{ numericId: '10', title: 'Intro' }]),
          skilljarCourse('skilljar-only', 'Skilljar Only', [{ numericId: '20', title: 'Y' }]),
        ],
      },
    );

  test('keeps both platform keys as aliases under one canonical id', () => {
    const lesson = report().courses.find((c) => c.slug === 'shared').lessons[0];
    expect(lesson.id).toBe('intro');
    expect(lesson.aliases.academy.slug).toBe('intro');
    expect(lesson.aliases.skilljar.numericId).toBe('10');
  });

  test('reports single-platform courses rather than dropping them', () => {
    const { summary } = report();
    expect(summary.academyOnly).toBe(1);
    expect(summary.skilljarOnly).toBe(1);
  });

  test('counts everything below high confidence as needing review', () => {
    const { summary } = report();
    expect(summary.needsReview).toBe(
      summary.lessons.medium + summary.lessons.low + summary.lessons.none + summary.lessons.skilljarOnly,
    );
  });

  test('section titles never gate a match, since Academy publishes none', () => {
    // Every observed Academy section carries a null title; keying identity on
    // section would make every Academy lesson unresolvable.
    const lesson = report().courses.find((c) => c.slug === 'shared').lessons[0];
    expect(lesson.aliases.academy).not.toHaveProperty('section');
    expect(lesson.confidence).toBe(CONFIDENCE.HIGH);
  });
});
