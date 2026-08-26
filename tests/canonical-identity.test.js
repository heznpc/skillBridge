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
    // Punctuation, not case: case is a house style applied uniformly and is
    // promoted to high on its own (see the case-only suite below), while a
    // hyphen coming or going can be a genuine retitle.
    const { matches } = match(
      [{ slug: 'multi-turn', title: 'Multi-Turn conversations' }],
      [{ numericId: '1', title: 'Multi turn conversations' }],
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

describe('course pairing by shared unit titles', () => {
  // Written before the rule existed. What matters is not how many courses it
  // pairs but that it refuses every pairing the evidence does not force.
  const course = (slug, title, unitTitles, platform) =>
    platform === 'academy'
      ? academyCourse(
          slug,
          title,
          unitTitles.map((t, i) => ({ slug: `u${i}`, title: t })),
        )
      : skilljarCourse(
          slug,
          title,
          unitTitles.map((t, i) => ({ numericId: String(100 + i), title: t })),
        );

  const SHARED = [
    'Getting started',
    'Setting up access',
    'Making a request',
    'Handling errors',
    'Streaming',
    'Wrapping up',
  ];

  test('a re-slugged AND renamed course is paired when its units say so', () => {
    // The real case: "Claude on Google Cloud" became "Claude with Google
    // Cloud's Vertex AI" under a different slug. Neither the slug nor the
    // title survives, but 75 unit titles do.
    const pairs = pairCourses(
      [course('claude-with-google-cloud-s-vertex-ai', "Claude with Google Cloud's Vertex AI", SHARED, 'academy')],
      [course('claude-with-google-vertex', 'Claude on Google Cloud', SHARED, 'skilljar')],
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0].joinedOn).toBe('units');
  });

  test('two unrelated courses sharing a couple of generic titles are NOT paired', () => {
    // "The 4D Framework" and "Explore!" appear across several AI-fluency
    // courses. A handful of shared generic titles is not evidence of identity.
    const pairs = pairCourses(
      [
        course(
          'ai-fluency-for-k-12-educators',
          'AI Fluency for pK–12 Educators',
          ['The 4D Framework', 'Explore!', 'Teaching with AI', 'Classroom policy'],
          'academy',
        ),
      ],
      [
        course(
          'ai-fluency-for-creative-work',
          'AI Fluency for Creative Work',
          ['The 4D Framework', 'Explore!', 'The production lens', 'The creative value lens'],
          'skilljar',
        ),
      ],
    );
    expect(pairs).toHaveLength(2);
    expect(pairs.every((p) => p.joinedOn === null)).toBe(true);
  });

  test('a course is not pulled away from an exact slug match', () => {
    const pairs = pairCourses(
      [course('shared', 'Shared', SHARED, 'academy')],
      [course('shared', 'Shared', SHARED, 'skilljar'), course('decoy', 'Decoy', SHARED, 'skilljar')],
    );
    const matched = pairs.find((p) => p.academy && p.skilljar);
    expect(matched.joinedOn).toBe('slug');
    expect(matched.skilljar.slug).toBe('shared');
  });

  test('two candidates with comparable overlap leave the course unpaired', () => {
    // Ambiguity is not resolved by picking the larger number.
    const pairs = pairCourses(
      [course('a', 'A', SHARED, 'academy')],
      [course('b', 'B', SHARED, 'skilljar'), course('c', 'C', SHARED, 'skilljar')],
    );
    expect(pairs.every((p) => p.joinedOn !== 'units')).toBe(true);
  });

  test('a tiny course cannot be paired on overlap alone', () => {
    // Two units in common out of two is a perfect ratio and no evidence.
    const pairs = pairCourses(
      [course('a', 'A', ['Welcome', 'Wrapping up'], 'academy')],
      [course('b', 'B', ['Welcome', 'Wrapping up'], 'skilljar')],
    );
    expect(pairs.every((p) => p.joinedOn !== 'units')).toBe(true);
  });
});

describe('case-only title differences', () => {
  const match = (academyUnits, skilljarUnits) =>
    matchCourseUnits(
      flattenUnits(academyCourse('c', 'C', academyUnits)),
      flattenUnits(skilljarCourse('c', 'C', skilljarUnits)),
    );

  test('a house-style recasing is high confidence, not medium', () => {
    // Academy recased a whole course to sentence case: "A CLAUDE.md That
    // Follows" became "A CLAUDE.md that follows". Same words, same order, same
    // punctuation — the only difference is a systematic convention.
    const { matches } = match(
      [{ slug: 'a', title: 'A CLAUDE.md that follows' }],
      [{ numericId: '1', title: 'A CLAUDE.md That Follows' }],
    );
    expect(matches[0].confidence).toBe(CONFIDENCE.HIGH);
  });

  test('a difference beyond case stays medium', () => {
    // Punctuation or spacing changes are a rename until something corroborates
    // them; only case-folding equality is promoted.
    const { matches } = match(
      [{ slug: 'a', title: 'Multi-Turn conversations' }],
      [{ numericId: '1', title: 'Multi turn conversations' }],
    );
    expect(matches[0].confidence).toBe(CONFIDENCE.MEDIUM);
  });

  test('a recased title that is duplicated is still ambiguous', () => {
    const { matches } = match(
      [
        { slug: 'a', title: 'Try it out' },
        { slug: 'b', title: 'Try It Out' },
      ],
      [
        { numericId: '1', title: 'Try It Out' },
        { numericId: '2', title: 'Try it out' },
      ],
    );
    expect(matches.every((m) => m.confidence === CONFIDENCE.LOW)).toBe(true);
    expect(matches.every((m) => m.skilljar === null)).toBe(true);
  });
});
