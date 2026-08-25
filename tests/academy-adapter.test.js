/**
 * @jest-environment jsdom
 */

/**
 * Claude Academy assessment safety, tested on synthetic pages.
 *
 * No real question or answer text is reproduced here. The fixtures copy the
 * SHAPE observed on the signed-in site — role="radiogroup" wrapping eight
 * role="radio" elements carrying aria-checked, no <form>, no input, no
 * label[for] — and the choice text is invented placeholder.
 *
 * These are behavioural: each one pins a decision the adapter has to make on
 * a page, not an implementation detail of how it makes it.
 */

/* global describe, test, expect, beforeEach */

const fs = require('fs');
const path = require('path');

/**
 * Both modules ship as bare content scripts and export through a `globalThis`
 * the caller supplies — the same harness tests/platform.test.js uses. Loading
 * them any other way silently yields an empty object.
 */
function load(file) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', file), 'utf8');
  const fake = { module: { exports: {} } };
  new Function('globalThis', src)(fake);
  return fake.module.exports;
}

const { ASSESSMENT_SIGNAL, detectAcademyAssessment, collectAcademyChoiceSubtrees, isWithinAcademyChoice } =
  load('academy-adapter.js');

const { detectPlatform, getHostCapabilities, isPlatformSupported, PLATFORM_IDS } = load('platform.js');

/** A location stand-in; jsdom's own is not freely assignable. */
const at = (pathname, search = '') => ({ pathname, search, href: `https://academy.claude.com${pathname}${search}` });

/**
 * Render an Academy-shaped page.
 *
 * `choices` builds the ARIA structure the live site uses. Passing zero
 * choices produces an ordinary lesson.
 */
function renderPage({ heading = 'A Lesson', choices = 0 } = {}) {
  const main = document.createElement('main');
  const h1 = document.createElement('h1');
  h1.textContent = heading;
  main.appendChild(h1);

  const prose = document.createElement('p');
  prose.textContent = 'Body copy that should still be translated.';
  main.appendChild(prose);

  if (choices > 0) {
    const group = document.createElement('div');
    group.setAttribute('role', 'radiogroup');
    for (let i = 0; i < choices; i += 1) {
      const choice = document.createElement('div');
      choice.setAttribute('role', 'radio');
      choice.setAttribute('aria-checked', 'false');
      choice.setAttribute('data-unchecked', '');
      // Choice text is a descendant, exactly as the live page nests it.
      const label = document.createElement('span');
      label.textContent = `Placeholder choice ${i + 1}`;
      choice.appendChild(label);
      group.appendChild(choice);
    }
    main.appendChild(group);
  }

  document.body.innerHTML = '';
  document.body.appendChild(main);
  return main;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('platform registration', () => {
  test('academy.claude.com is its own platform, not the claude.com tutorials profile', () => {
    expect(detectPlatform('academy.claude.com')).toBe(PLATFORM_IDS.CLAUDE_ACADEMY);
    expect(detectPlatform('claude.com')).toBe(PLATFORM_IDS.CLAUDE_TUTORIALS);
  });

  test('the host is supported and has exam detection enabled', () => {
    const caps = getHostCapabilities('academy.claude.com');
    expect(isPlatformSupported(caps.platform)).toBe(true);
    expect(caps.examDetection).toBe(true);
  });

  test('the tutor bridge stays off until exam-safe switching is verified here', () => {
    expect(getHostCapabilities('academy.claude.com').bridge).toBe(false);
  });
});

describe('assessment detection reads the live page', () => {
  test('a lesson with no choices is not an assessment', () => {
    renderPage({ heading: 'Making a request' });
    const verdict = detectAcademyAssessment(document, at('/courses/c/making-a-request'));
    expect(verdict.isAssessment).toBe(false);
    expect(verdict.choiceCount).toBe(0);
  });

  test('the real quiz route is detected, which the Skilljar patterns miss', () => {
    // EXAM_URL_PATTERNS anchors /quiz to the end of a segment, so
    // "quiz-on-…" falls straight through it.
    renderPage({ heading: 'Quiz on accessing Claude with the API', choices: 8 });
    const verdict = detectAcademyAssessment(document, at('/courses/c/quiz-on-accessing-claude-with-the-api'));
    expect(verdict.isAssessment).toBe(true);
    expect(verdict.signals).toContain(ASSESSMENT_SIGNAL.ROUTE);
    expect(verdict.choiceCount).toBe(8);
  });

  test('final-assessment is detected, which the Skilljar patterns also miss', () => {
    renderPage({ heading: 'Final assessment', choices: 8 });
    const verdict = detectAcademyAssessment(document, at('/courses/c/final-assessment'));
    expect(verdict.signals).toContain(ASSESSMENT_SIGNAL.ROUTE);
  });

  test('a single signal is enough to protect the page', () => {
    // A route that says nothing, but the DOM is plainly a question.
    renderPage({ heading: 'Check your understanding', choices: 4 });
    const verdict = detectAcademyAssessment(document, at('/courses/c/check-your-understanding'));
    expect(verdict.isAssessment).toBe(true);
    expect(verdict.signals).toEqual(
      expect.arrayContaining([ASSESSMENT_SIGNAL.RADIOGROUP, ASSESSMENT_SIGNAL.CHOICE_ROLES]),
    );
  });

  test('a localized heading still names an assessment', () => {
    renderPage({ heading: '프롬프트 엔지니어링 퀴즈', choices: 5 });
    const verdict = detectAcademyAssessment(document, at('/courses/c/some-unit'));
    expect(verdict.signals).toContain(ASSESSMENT_SIGNAL.HEADING);
  });

  test('detection needs nothing that only exists after submitting', () => {
    // Nothing is selected and nothing has been graded — the state a learner
    // is in while reading the question, which is when the tutor must already
    // be safe.
    const main = renderPage({ heading: 'Quiz on prompt engineering', choices: 8 });
    expect(main.querySelectorAll('[aria-checked="true"]')).toHaveLength(0);
    expect(detectAcademyAssessment(document, at('/courses/c/quiz-on-prompt-engineering')).isAssessment).toBe(true);
  });
});

describe('catalog kind must never decide this', () => {
  test('a quiz the catalog calls a lesson is still protected', () => {
    // Not hypothetical. In ai-fluency-framework-foundations the curriculum
    // snapshot labels the course quiz `lesson` on Academy and `modular` on
    // Skilljar. Trusting either would leave this page unguarded.
    const catalogKind = 'lesson';
    renderPage({ heading: 'Course quiz', choices: 8 });
    const verdict = detectAcademyAssessment(document, at('/courses/c/course-quiz'));

    expect(catalogKind).toBe('lesson');
    expect(verdict.isAssessment).toBe(true);
    expect(collectAcademyChoiceSubtrees(document).length).toBeGreaterThan(0);
  });

  test('a lesson the catalog calls a quiz is not forced into exam mode', () => {
    // The mislabelling runs both ways, and a false positive here would
    // silently stop translating an ordinary lesson.
    const catalogKind = 'quiz';
    renderPage({ heading: 'Making a request' });
    expect(catalogKind).toBe('quiz');
    expect(detectAcademyAssessment(document, at('/courses/c/making-a-request')).isAssessment).toBe(false);
  });
});

describe('answer-choice exclusion', () => {
  test('every choice subtree is collected, not just the node with the role', () => {
    renderPage({ heading: 'Course quiz', choices: 8 });
    const excluded = collectAcademyChoiceSubtrees(document);
    // The group plus its eight choices; the text lives inside them.
    expect(excluded.length).toBeGreaterThanOrEqual(9);
  });

  test('choice text is recognized as excluded, prose is not', () => {
    const main = renderPage({ heading: 'Course quiz', choices: 3 });
    const choiceText = main.querySelector('[role="radio"] span').firstChild;
    const prose = main.querySelector('p').firstChild;

    expect(isWithinAcademyChoice(choiceText)).toBe(true);
    expect(isWithinAcademyChoice(prose)).toBe(false);
  });

  test('the question stem stays translatable while the choices do not', () => {
    // Translating the question is the product; translating the options is
    // the thing the contract forbids.
    const main = renderPage({ heading: 'Quiz on tool use', choices: 4 });
    expect(isWithinAcademyChoice(main.querySelector('h1'))).toBe(false);
    expect(isWithinAcademyChoice(main.querySelector('[role="radio"]'))).toBe(true);
  });

  test('exclusion does not depend on class names', () => {
    // The live markup is framework-generated; a class-based guard would stop
    // working on the next rebuild without anything failing loudly.
    renderPage({ heading: 'Course quiz', choices: 2 });
    for (const el of document.querySelectorAll('*')) el.removeAttribute('class');
    expect(collectAcademyChoiceSubtrees(document).length).toBeGreaterThan(0);
  });
});
