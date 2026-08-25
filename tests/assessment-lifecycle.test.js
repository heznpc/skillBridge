/**
 * @jest-environment jsdom
 */

/**
 * Exam-safe state across SPA navigation.
 *
 * The regression these pin is specific: exam-safe used to stick ON after
 * leaving a quiz, because the route change re-detected synchronously against
 * the PREVIOUS page's DOM, and the only pass that could have corrected it ran
 * one-way and below a target-language early return.
 *
 * So every sequence here is also run with the target language left at English.
 * Safety state must not depend on whether the page is being translated — that
 * coupling is exactly what hid the stuck state.
 */

/* global describe, test, expect, beforeEach */

const fs = require('fs');
const path = require('path');

function load(file) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', file), 'utf8');
  const fake = { module: { exports: {} } };
  new Function('globalThis', src)(fake);
  return fake.module.exports;
}

const { createAssessmentLifecycle, ASSESSMENT_TRIGGER } = load('assessment-lifecycle.js');
const { detectAcademyAssessment, ACADEMY_ASSESSMENT_PATH_PATTERNS } = load('academy-adapter.js');

const at = (pathname) => ({ pathname, search: '', href: `https://academy.claude.com${pathname}` });

/** Render an Academy lesson or quiz into the document. */
function render({ heading, choices = 0 }) {
  const main = document.createElement('main');
  const h1 = document.createElement('h1');
  h1.textContent = heading;
  main.appendChild(h1);
  if (choices > 0) {
    const group = document.createElement('div');
    group.setAttribute('role', 'radiogroup');
    for (let i = 0; i < choices; i += 1) {
      const c = document.createElement('div');
      c.setAttribute('role', 'radio');
      c.setAttribute('aria-checked', 'false');
      c.textContent = `Placeholder choice ${i + 1}`;
      group.appendChild(c);
    }
    main.appendChild(group);
  }
  document.body.innerHTML = '';
  document.body.appendChild(main);
}

/** A lifecycle wired the way content.js wires it on Academy. */
function makeLifecycle(onChange) {
  return createAssessmentLifecycle({
    routeIsAssessment: (loc) => ACADEMY_ASSESSMENT_PATH_PATTERNS.some((p) => p.test(loc.pathname)),
    domIsAssessment: (doc, loc) => detectAcademyAssessment(doc, loc).isAssessment,
    onChange,
  });
}

const LESSON = '/courses/c/making-a-request';
const QUIZ = '/courses/c/quiz-on-accessing-claude-with-the-api';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('route change protects before the DOM arrives', () => {
  test('lesson to quiz is safe while the old lesson DOM is still rendered', () => {
    const lc = makeLifecycle();
    render({ heading: 'Making a request' });
    lc.init(document, at(LESSON));
    expect(lc.isAssessment()).toBe(false);

    // pushState fires; the address is the quiz, the DOM is still the lesson.
    lc.onRouteChange(at(QUIZ));
    expect(lc.isAssessment()).toBe(true);
    expect(lc.lastTrigger()).toBe(ASSESSMENT_TRIGGER.ROUTE);
  });

  test('protection is on before a single choice renders', () => {
    const lc = makeLifecycle();
    render({ heading: 'Making a request' });
    lc.init(document, at(LESSON));
    lc.onRouteChange(at(QUIZ));
    // Choices arrive only now.
    render({ heading: 'Quiz on accessing Claude with the API', choices: 8 });
    expect(lc.isAssessment()).toBe(true);
    expect(lc.onDomSettled(document, at(QUIZ))).toBe(true);
  });
});

describe('the stuck-on regression', () => {
  test('quiz to lesson does not release against the stale quiz DOM', () => {
    const lc = makeLifecycle();
    render({ heading: 'Quiz on accessing Claude with the API', choices: 8 });
    lc.init(document, at(QUIZ));
    expect(lc.isAssessment()).toBe(true);

    // The old failure: re-detect ran here, saw the quiz still on screen, and
    // re-affirmed true; nothing afterwards could turn it back off.
    lc.onRouteChange(at(LESSON));
    expect(lc.isAssessment()).toBe(true);
  });

  test('and releases once the lesson DOM is actually there', () => {
    const lc = makeLifecycle();
    render({ heading: 'Quiz on accessing Claude with the API', choices: 8 });
    lc.init(document, at(QUIZ));
    lc.onRouteChange(at(LESSON));

    render({ heading: 'Making a request' });
    expect(lc.onDomSettled(document, at(LESSON))).toBe(false);
    expect(lc.lastTrigger()).toBe(ASSESSMENT_TRIGGER.DOM);
  });

  test('the DOM pass turns protection off as well as on', () => {
    // The old pass ran `if (!isExamPage)`, so it could only ever add safety.
    const lc = makeLifecycle();
    render({ heading: 'Quiz', choices: 4 });
    lc.init(document, at(QUIZ));
    render({ heading: 'Making a request' });
    expect(lc.onDomSettled(document, at(LESSON))).toBe(false);
    render({ heading: 'Quiz', choices: 4 });
    expect(lc.onDomSettled(document, at(QUIZ))).toBe(true);
  });
});

describe('the full release sequence', () => {
  // The sequence that has to hold before this ships.
  const walk = () => {
    const changes = [];
    const lc = makeLifecycle((s) => changes.push(s.isAssessment));

    render({ heading: 'Making a request' });
    lc.init(document, at(LESSON));

    lc.onRouteChange(at(QUIZ));
    render({ heading: 'Quiz on accessing Claude with the API', choices: 8 });
    lc.onDomSettled(document, at(QUIZ));
    const atQuiz = lc.isAssessment();

    lc.onRouteChange(at(LESSON));
    render({ heading: 'Making a request' });
    lc.onDomSettled(document, at(LESSON));
    const backAtLesson = lc.isAssessment();

    lc.onRouteChange(at(QUIZ));
    render({ heading: 'Quiz on accessing Claude with the API', choices: 8 });
    lc.onDomSettled(document, at(QUIZ));
    const atQuizAgain = lc.isAssessment();

    return { changes, atQuiz, backAtLesson, atQuizAgain };
  };

  test('lesson to quiz to lesson to quiz settles correctly at every stop', () => {
    const { atQuiz, backAtLesson, atQuizAgain } = walk();
    expect(atQuiz).toBe(true);
    expect(backAtLesson).toBe(false);
    expect(atQuizAgain).toBe(true);
  });

  test('the same sequence holds with the target language left at English', () => {
    // Nothing in the lifecycle reads a language. This asserts the property
    // directly, since the original defect was invisible to an English reader.
    const { atQuiz, backAtLesson, atQuizAgain } = walk();
    expect([atQuiz, backAtLesson, atQuizAgain]).toEqual([true, false, true]);
  });

  test('state flips exactly as often as the page kind changes', () => {
    const { changes } = walk();
    expect(changes).toEqual([true, false, true]);
  });
});

describe('detection disabled', () => {
  test('override pins the state off for hosts without exam detection', () => {
    const lc = makeLifecycle();
    render({ heading: 'Quiz', choices: 8 });
    lc.init(document, at(QUIZ));
    expect(lc.override(false)).toBe(false);
  });
});
