/**
 * Quiz/exam safety observation, tested on synthetic shapes.
 *
 * No real Academy markup is reproduced here, and no question, choice, or
 * answer text: the contract needs the SHAPE, and the content is somebody
 * else's assessment material. Every fixture below is invented to encode one
 * failure mode.
 *
 * The invariant under discussion is the one that, if it silently breaks,
 * turns SkillBridge into a cheating tool. So these lean hard toward failing
 * closed — an observation that cannot prove safety is implementable must not
 * report that it is.
 */

/* global describe, test, expect */

const {
  STATUS,
  BLOCKER,
  PAGE_KIND,
  classifyPageKind,
  assessChoiceExcludability,
  buildSafetyRecord,
  evaluateSafetyContract,
} = require('../scripts/lib/academy-safety');

describe('classifyPageKind', () => {
  test('two independent signals identify a quiz', () => {
    const out = classifyPageKind({ path: '/courses/c/quiz-on-x', heading: 'Quiz on X' });
    expect(out).toMatchObject({ kind: PAGE_KIND.QUIZ, confident: true });
    expect(out.signals).toEqual(['path', 'heading']);
  });

  test('one signal is not enough — it reports unknown, never quiz', () => {
    // Being wrong here ships a cheating tool. A lesson merely titled
    // "Quiz design patterns" must not be treated as an exam, and a quiz whose
    // URL alone hints at it must not be treated as a lesson either.
    expect(classifyPageKind({ path: '/courses/c/quiz-on-x', heading: 'Making a request' })).toMatchObject({
      kind: PAGE_KIND.UNKNOWN,
      confident: false,
    });
    expect(classifyPageKind({ path: '/courses/c/lesson', heading: 'Quiz design patterns' })).toMatchObject({
      kind: PAGE_KIND.UNKNOWN,
    });
  });

  test('choice controls count as their own signal', () => {
    expect(classifyPageKind({ path: '/courses/c/final-assessment', hasChoiceControls: true }).kind).toBe(
      PAGE_KIND.QUIZ,
    );
  });

  test('no signals means an ordinary lesson', () => {
    expect(classifyPageKind({ path: '/courses/c/making-a-request', heading: 'Making a request' })).toMatchObject({
      kind: PAGE_KIND.LESSON,
      confident: true,
    });
  });
});

describe('assessChoiceExcludability', () => {
  test('two independent signals make choices excludable', () => {
    const out = assessChoiceExcludability({ count: 4, inputType: 'radio', labelAssociated: true });
    expect(out.excludable).toBe(true);
    expect(out.signals).toEqual(expect.arrayContaining(['native-input', 'label-association']));
  });

  test('a lone hook is refused, with the reason recorded', () => {
    // Class names churn. Gating the exam contract on one of them means a
    // redeploy can silently start translating answers.
    const out = assessChoiceExcludability({ count: 4, stableAttrs: ['data-choice'] });
    expect(out.excludable).toBe(false);
    expect(out.reason).toMatch(/only one signal/);
  });

  test('zero observed choices is never excludable', () => {
    const out = assessChoiceExcludability({ count: 0, inputType: 'radio', labelAssociated: true });
    expect(out.excludable).toBe(false);
    expect(out.reason).toMatch(/no choice elements/);
  });

  test('missing input is handled without throwing', () => {
    expect(assessChoiceExcludability(null).excludable).toBe(false);
    expect(assessChoiceExcludability({}).excludable).toBe(false);
  });
});

describe('buildSafetyRecord', () => {
  test('a quiz route with no rendered assessment reports an auth wall', () => {
    // Measured anonymously on the live site: the quiz route renders its
    // heading and course nav, and zero radios, checkboxes, labels or forms.
    // The page exists; the assessment does not.
    const out = buildSafetyRecord({
      path: '/courses/c/quiz-on-x',
      heading: 'Quiz on X',
      question: { count: 0 },
      choices: { count: 0 },
      signedIn: false,
    });
    expect(out.status).toBe(STATUS.PARTIAL);
    expect(out.blocker).toBe(BLOCKER.AUTH_REQUIRED);
    expect(out.postSubmit).toBeNull();
  });

  test('a signed-in run that still shows nothing is a different problem', () => {
    const out = buildSafetyRecord({
      path: '/courses/c/quiz-on-x',
      heading: 'Quiz on X',
      choices: { count: 0 },
      signedIn: true,
    });
    expect(out.blocker).toBe(BLOCKER.NO_QUIZ_CONTENT);
  });

  test('even a fully observed quiz stays partial until post-submit is seen', () => {
    // correct/incorrect, explanations and retry only exist after submitting
    // as a signed-in user. Calling this complete would sign off the exam
    // contract against evidence nobody collected.
    const out = buildSafetyRecord({
      path: '/courses/c/quiz-on-x',
      heading: 'Quiz on X',
      question: { count: 1 },
      choices: { count: 4, inputType: 'radio', labelAssociated: true },
      controls: { submitPresent: true, submitRole: 'button' },
    });
    expect(out.status).toBe(STATUS.PARTIAL);
    expect(out.choices.excludable).toBe(true);
    expect(out.postSubmit).toBeNull();
  });

  test('the record carries shape, never content', () => {
    const out = buildSafetyRecord({
      path: '/courses/c/quiz-on-x',
      heading: 'Quiz on X',
      question: { count: 1, text: 'What does max_tokens do?' },
      choices: { count: 4, inputType: 'radio', labels: ['A limit', 'A target'] },
    });
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain('max_tokens');
    expect(serialized).not.toContain('A limit');
    expect(out.question).toEqual({ count: 1, role: null });
  });
});

describe('auth-wall detection', () => {
  test('the page saying so beats inferring it from a header link', () => {
    // "Sign in" sits in the site header of every page, signed in or not.
    // Inferring the wall from that is how a lesson gets marked auth-walled.
    const walled = buildSafetyRecord({
      path: '/courses/c/quiz-on-x',
      heading: 'Quiz on X',
      choices: { count: 0 },
      authWallCopy: true,
    });
    expect(walled.blocker).toBe(BLOCKER.AUTH_REQUIRED);

    const notWalled = buildSafetyRecord({
      path: '/courses/c/quiz-on-x',
      heading: 'Quiz on X',
      choices: { count: 0 },
      authWallCopy: false,
    });
    expect(notWalled.blocker).toBe(BLOCKER.NO_QUIZ_CONTENT);
  });

  test('falls back to the signed-in flag when the copy was not captured', () => {
    const out = buildSafetyRecord({
      path: '/courses/c/quiz-on-x',
      heading: 'Quiz on X',
      choices: { count: 0 },
      signedIn: false,
    });
    expect(out.blocker).toBe(BLOCKER.AUTH_REQUIRED);
  });
});

describe('evaluateSafetyContract', () => {
  test('answers each question separately, and never claims more than partial', () => {
    const records = [
      buildSafetyRecord({
        path: '/courses/c/quiz-on-x',
        heading: 'Quiz on X',
        question: { count: 1 },
        choices: { count: 4, inputType: 'radio', labelAssociated: true },
      }),
      buildSafetyRecord({ path: '/courses/c/making-a-request', heading: 'Making a request' }),
    ];
    const out = evaluateSafetyContract(records);
    expect(out).toMatchObject({
      quizDistinguishableFromLesson: true,
      choicesIdentifiable: true,
      choicesExcludable: true,
      verdict: STATUS.PARTIAL,
    });
    // Neither of these is observable without signing in and navigating.
    expect(out.tutorExamSignalAvailable).toBe(STATUS.UNKNOWN);
    expect(out.survivesSpaNavigation).toBe(STATUS.UNKNOWN);
  });

  test('an auth-walled run cannot claim choices are identifiable', () => {
    // The state actually measured today: without this, a run that saw
    // nothing would report a clean bill of health.
    const records = [
      buildSafetyRecord({ path: '/courses/c/quiz-on-x', heading: 'Quiz on X', choices: { count: 0 } }),
      buildSafetyRecord({ path: '/courses/c/making-a-request', heading: 'Making a request' }),
    ];
    const out = evaluateSafetyContract(records);
    expect(out.choicesIdentifiable).toBe(false);
    expect(out.choicesExcludable).toBe(false);
  });

  test('no records means nothing is established', () => {
    const out = evaluateSafetyContract([]);
    expect(out.quizDistinguishableFromLesson).toBe(false);
    expect(out.choicesIdentifiable).toBe(false);
  });
});
