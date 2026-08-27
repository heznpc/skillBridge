/**
 * @jest-environment jsdom
 */

/**
 * What happens to exam-safe state when a quiz turns into its result.
 *
 * Submitting is the one assessment transition SkillBridge cannot rehearse: it
 * needs a signed-in account and an answered quiz, and running one would put a
 * real submission on a real record. So the live post-submit DOM is unknown,
 * and this file does not pretend otherwise.
 *
 * What it does instead is close the part that does NOT depend on that shape.
 * A submission is a same-URL event — the learner is still on
 * `/quiz-on-…` when the result renders — and `detectAcademyAssessment` reads
 * the route as one of its signals. That makes the whole family of same-URL
 * post-submit DOMs safe by construction rather than by luck: whatever the
 * result looks like, whatever it does to the radiogroup, the URL still names
 * an assessment and protection cannot release. These pin that, across every
 * result shape worth naming, and then state exactly where the guarantee stops.
 *
 * The recon that exists agrees on the premise it rests on: in
 * snapshots/academy/safety-recon-2026-08-25.json both assessment URLs are
 * identified from `path` and `heading` alone, with zero choice elements
 * visible, because the run was signed out.
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

const { createAssessmentLifecycle } = load('assessment-lifecycle.js');
const {
  detectAcademyAssessment,
  ACADEMY_ASSESSMENT_PATH_PATTERNS,
  collectAcademyChoiceSubtrees,
  isWithinAcademyChoice,
} = load('academy-adapter.js');
const { selectionHitsExamChoice } = load('exam-selection.js');

// The list the translation chokepoint actually reads — loaded the way the
// content scripts load it, so this measures the path that writes the cache
// rather than the adapter's own helpers.
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const { EXAM_SKIP_SELECTORS } = new Function(
  `${read('src', 'shared', 'runtime-constants.js')}
   ${read('src', 'lib', 'selectors.js')}
   ${read('src', 'lib', 'constants.js')}
   return { EXAM_SKIP_SELECTORS };`,
)();
const { ACADEMY_EXAM_SKIP_SELECTORS } = load('academy-adapter.js');

const at = (pathname) => ({ pathname, search: '', href: `https://academy.claude.com${pathname}` });

const QUIZ = '/courses/building-with-the-claude-api/quiz-on-accessing-claude-with-the-api';
const LESSON = '/courses/building-with-the-claude-api/making-a-request';

/** The quiz as the learner reads it, before answering. */
function renderQuiz() {
  document.body.innerHTML = `
    <main>
      <h1>Quiz on accessing Claude with the API</h1>
      <p id="stem">Which header carries the credential?</p>
      <div role="radiogroup" aria-labelledby="stem">
        <div role="radio" aria-checked="false"><span>Zebra-cipher-alpha</span></div>
        <div role="radio" aria-checked="false"><span>Marmalade-vector-bravo</span></div>
      </div>
    </main>`;
}

/**
 * Result shapes. Named for what they take away, because what they take away is
 * what the guard would otherwise have been relying on.
 */
const RESULTS = {
  /** Choices gone, heading still names the quiz. */
  scoreOnly: `
    <main>
      <h1>Quiz on accessing Claude with the API — results</h1>
      <p>You scored 4 out of 5.</p>
    </main>`,
  /** Choices gone AND the heading no longer names an assessment. */
  scoreOnlyRenamed: `
    <main>
      <h1>How you did</h1>
      <p>You scored 4 out of 5.</p>
    </main>`,
  /** The answers come back, marked — the shape with something to leak. */
  answersRevealed: `
    <main>
      <h1>How you did</h1>
      <p id="stem">Which header carries the credential?</p>
      <div role="radiogroup" aria-labelledby="stem">
        <div role="radio" aria-checked="true"><span>Zebra-cipher-alpha</span><span>Correct</span></div>
        <div role="radio" aria-checked="false"><span>Marmalade-vector-bravo</span><span>Incorrect</span></div>
      </div>
    </main>`,
  /** Everything replaced by an empty shell, mid-render. */
  emptyShell: '<main></main>',
};

const render = (html) => {
  document.body.innerHTML = html;
};

/** A lifecycle wired the way content.js wires it on Academy. */
const makeLifecycle = (onChange) =>
  createAssessmentLifecycle({
    routeIsAssessment: (loc) => ACADEMY_ASSESSMENT_PATH_PATTERNS.some((p) => p.test(loc.pathname)),
    domIsAssessment: (doc, loc) => detectAcademyAssessment(doc, loc).isAssessment,
    onChange,
  });

/** Sit on the quiz with protection established, as a learner about to submit. */
function onQuiz(onChange) {
  renderQuiz();
  const lc = makeLifecycle(onChange);
  lc.init(document, at(QUIZ));
  expect(lc.isAssessment()).toBe(true);
  return lc;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('a result rendered at the assessment URL', () => {
  for (const [name, html] of Object.entries(RESULTS)) {
    test(`${name} keeps protection on`, () => {
      const lc = onQuiz();
      render(html);
      lc.onDomSettled(document, at(QUIZ));
      expect(lc.isAssessment()).toBe(true);
    });
  }

  test('the route alone is enough, with no heading and no choices left', () => {
    // The claim the whole family rests on, stated on its own: submission is a
    // same-URL event, so the signal that cannot be taken away by a re-render
    // is the one that does not come from the DOM.
    render(RESULTS.scoreOnlyRenamed);
    const verdict = detectAcademyAssessment(document, at(QUIZ));
    expect(verdict.isAssessment).toBe(true);
    expect(verdict.signals).toEqual(['route']);
    expect(verdict.choiceCount).toBe(0);
  });

  test('a mid-render empty DOM cannot release it either', () => {
    // The window between submit and result, where a DOM-only detector sees
    // nothing at all and would read that as "not an assessment".
    render(RESULTS.emptyShell);
    expect(detectAcademyAssessment(document, at(QUIZ)).isAssessment).toBe(true);
  });

  test('the observer re-running on the result does not flip anything', () => {
    // The result arrives as mutations, so onDomSettled runs repeatedly. A flip
    // per mutation would be a protection that blinks.
    const changes = [];
    const lc = onQuiz((state) => changes.push(state));
    expect(changes).toEqual([{ isAssessment: true, trigger: 'init' }]);
    render(RESULTS.answersRevealed);
    for (let i = 0; i < 5; i += 1) lc.onDomSettled(document, at(QUIZ));
    expect(lc.isAssessment()).toBe(true);
    expect(changes).toHaveLength(1);
  });
});

describe('what the result page may not hand over', () => {
  test('revealed answers are still excluded subtrees, marks and all', () => {
    render(RESULTS.answersRevealed);
    const excluded = collectAcademyChoiceSubtrees(document);
    expect(excluded.length).toBeGreaterThan(0);
    const text = excluded.map((el) => el.textContent).join(' ');
    expect(text).toContain('Zebra-cipher-alpha');
    // The correctness marker sits inside the choice, so it is withheld with it
    // — which matters more after submission than before it.
    expect(text).toContain('Correct');
  });

  test('the correctness marker is inside the excluded subtree, not beside it', () => {
    render(RESULTS.answersRevealed);
    const marker = Array.from(document.querySelectorAll('span')).find((el) => el.textContent === 'Correct');
    expect(isWithinAcademyChoice(marker)).toBe(true);
  });

  test('the question stem is still translatable, so exclusion has not widened to the page', () => {
    render(RESULTS.answersRevealed);
    expect(isWithinAcademyChoice(document.getElementById('stem'))).toBe(false);
  });

  test('a selection dragged across the revealed answers is withheld', () => {
    render(RESULTS.answersRevealed);
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('main'));
    expect(selectionHitsExamChoice(range, { isExamPage: true, selectors: [...ACADEMY_EXAM_SKIP_SELECTORS] })).toBe(
      true,
    );
  });

  test('a checked answer is not state SkillBridge keeps', () => {
    // `aria-checked` appears in this codebase only as something to skip. There
    // is no record of which answer the learner picked, so there is no stale
    // selection to clean up after a submission — and this fails if that ever
    // stops being true.
    const root = path.join(__dirname, '..', 'src');
    const hits = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.js') && fs.readFileSync(full, 'utf8').includes('aria-checked')) hits.push(full);
      }
    };
    walk(root);
    expect(hits.map((f) => path.relative(root, f)).sort()).toEqual(['lib/academy-adapter.js', 'lib/constants.js']);
  });
});

describe('where the same-URL guarantee stops', () => {
  test('leaving the assessment URL is the only way protection releases', () => {
    const lc = onQuiz();
    render(RESULTS.scoreOnlyRenamed);
    lc.onRouteChange(at(LESSON));
    // Still held: the route change alone releases nothing, because the result
    // DOM is still what is on screen.
    expect(lc.isAssessment()).toBe(true);
    lc.onDomSettled(document, at(LESSON));
    expect(lc.isAssessment()).toBe(false);
  });

  test('a result served off the assessment URL with no ARIA choices is NOT protected', () => {
    // Recorded as a fact, not as an accident. If Academy navigates away from
    // the quiz URL on submit AND renders the answers as plain text with no
    // choice roles AND gives the page a heading that names no assessment, none
    // of the four signals fires. Nothing in the repo says whether it does any
    // of that — establishing it needs a real submission on a real account,
    // which is the one thing this suite will not do. A detector invented for a
    // DOM nobody has seen would be a guess wearing a test.
    document.body.innerHTML = `
      <main>
        <h1>How you did</h1>
        <p>You scored 4 out of 5.</p>
        <p>The correct answer was: Zebra-cipher-alpha</p>
      </main>`;
    const verdict = detectAcademyAssessment(document, at('/courses/building-with-the-claude-api/summary'));
    expect(verdict.isAssessment).toBe(false);
    expect(verdict.signals).toEqual([]);
  });

  test('an assessment-naming heading would still catch that page', () => {
    // The second line of defence, and the reason the gap above is narrow: the
    // heading patterns cover all seven locales Academy ships, so a result page
    // titled anything like "Quiz results" is protected wherever it is served.
    document.body.innerHTML = '<main><h1>Quiz results</h1><p>You scored 4 out of 5.</p></main>';
    expect(detectAcademyAssessment(document, at('/courses/c/summary')).signals).toEqual(['heading']);
    document.body.innerHTML = '<main><h1>퀴즈 결과</h1></main>';
    expect(detectAcademyAssessment(document, at('/courses/c/summary')).isAssessment).toBe(true);
  });
});

describe('the translation chokepoint on a result page', () => {
  /** Stand-in for the exam gate in processOneElement(). */
  const isExcluded = (el) => el.matches(EXAM_SKIP_SELECTORS.join(', ')) || !!el.closest(EXAM_SKIP_SELECTORS.join(', '));

  test('no revealed answer text reaches a translation lookup', () => {
    // Nothing choice-shaped may be walked, so nothing choice-shaped is sent to
    // Google Translate or written to the cache under its source text. This is
    // the chokepoint, not the adapter, because the adapter being right is not
    // the same as the cache staying clean.
    render(RESULTS.answersRevealed);
    const survivors = Array.from(document.querySelectorAll('main *')).filter((el) => !isExcluded(el));
    const leaked = survivors.filter((el) => /Zebra-cipher-alpha|Correct|Incorrect/.test(el.textContent || ''));
    expect(leaked).toEqual([]);
  });

  test('the marked-correct answer is excluded exactly like an unanswered one', () => {
    // aria-checked flips to true on submission. If the skip list keyed off the
    // unanswered state, every answer the learner actually picked would become
    // translatable at the moment it became worth withholding.
    render(RESULTS.answersRevealed);
    const checked = document.querySelector('[role="radio"][aria-checked="true"]');
    expect(isExcluded(checked)).toBe(true);
  });
});
