/**
 * @jest-environment jsdom
 *
 * Answer-choice text must not reach the Tutor through the selection quote.
 *
 * The exam guards that already existed cover the other two transmission paths
 * and stop short of this one. `getPageContext()` strips the lesson body on an
 * assessment page, and the GT chokepoint keeps choices out of the translation
 * queue and the IndexedDB cache — but "select text → Ask Tutor" prepends the
 * highlighted string to the prompt verbatim, and nothing in that path ever
 * looked at whether the highlight sat inside a choice.
 *
 * It matters more on Academy than it did on Skilljar: choices there carry ARIA
 * roles instead of class names, so the check has to be the shared
 * EXAM_SKIP_SELECTORS list rather than anything Skilljar-shaped, and PHASE C
 * turns the Tutor on for that host.
 *
 * The guard is extracted from the real source rather than re-implemented, so a
 * production change cannot leave this green.
 */
/* global describe, test, expect, beforeEach */

const fs = require('fs');
const path = require('path');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const { EXAM_SKIP_SELECTORS } = new Function(
  `${read('src', 'shared', 'runtime-constants.js')}
   ${read('src', 'lib', 'selectors.js')}
   ${read('src', 'lib', 'constants.js')}
   return { EXAM_SKIP_SELECTORS };`,
)();

const SELECTION_SRC = read('src', 'content', 'text-selection.js');

/** Pull one `  function name(...) { ... }` block out of an IIFE source file. */
function extractFunction(source, name) {
  const start = source.indexOf(`  function ${name}(`);
  if (start === -1) throw new Error(`Could not find ${name} — did the source shape change?`);
  const end = source.indexOf('\n  }\n', start);
  if (end === -1) throw new Error(`Could not find the end of ${name}`);
  return source.slice(start, end + 4);
}

/** The real guard, bound to a fake namespace and the real selector list. */
function buildGuard({ isExamPage }) {
  const sb = { isExamPage };
  return new Function(
    'sb',
    'EXAM_SKIP_SELECTORS',
    `${extractFunction(SELECTION_SRC, 'selectionHitsExamChoice')}
     return selectionHitsExamChoice;`,
  )(sb, EXAM_SKIP_SELECTORS);
}

/** A quiz as Academy renders it: ARIA roles, no <form>, no labelled inputs. */
function renderAcademyQuiz() {
  document.body.innerHTML = `
    <main>
      <h1 id="stem">Quiz on accessing Claude with the API</h1>
      <p id="prose">Read the question carefully before answering.</p>
      <div role="radiogroup" id="group">
        <div role="radio" aria-checked="false" id="c1"><span id="c1t">A base64-encoded API key</span></div>
        <div role="radio" aria-checked="false" id="c2"><span id="c2t">An OAuth bearer token</span></div>
      </div>
      <p id="after">Submit when you are ready.</p>
    </main>`;
}

/** A range covering the text inside one element, endpoints included. */
function rangeOver(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  return range;
}

/** A range that starts before and ends after `a`…`b`, swallowing whatever is between. */
function rangeSpanning(a, b) {
  const range = document.createRange();
  range.setStartBefore(a);
  range.setEndAfter(b);
  return range;
}

beforeEach(renderAcademyQuiz);

describe('selectionHitsExamChoice', () => {
  test('off an assessment page nothing is withheld', () => {
    const guard = buildGuard({ isExamPage: false });
    expect(guard(rangeOver(document.getElementById('c1t')))).toBe(false);
  });

  test('text inside a choice is withheld', () => {
    const guard = buildGuard({ isExamPage: true });
    expect(guard(rangeOver(document.getElementById('c1t')))).toBe(true);
  });

  test('the choice element itself is withheld', () => {
    const guard = buildGuard({ isExamPage: true });
    expect(guard(rangeOver(document.getElementById('c1')))).toBe(true);
  });

  test('the whole radiogroup is withheld', () => {
    const guard = buildGuard({ isExamPage: true });
    expect(guard(rangeOver(document.getElementById('group')))).toBe(true);
  });

  test('a drag that swallows the group is withheld even though both endpoints sit outside it', () => {
    // This is the case endpoint-only checks miss: the user drags from the
    // prose above the choices to the prose below, and every choice comes
    // along in `sel.toString()`.
    const guard = buildGuard({ isExamPage: true });
    const range = rangeSpanning(document.getElementById('prose'), document.getElementById('after'));
    expect(guard(range)).toBe(true);
  });

  test('a selection that starts in a choice and ends outside it is withheld', () => {
    const guard = buildGuard({ isExamPage: true });
    const range = rangeSpanning(document.getElementById('c2'), document.getElementById('after'));
    expect(guard(range)).toBe(true);
  });

  test('the question stem is still quotable — the guard is about answers, not the page', () => {
    const guard = buildGuard({ isExamPage: true });
    expect(guard(rangeOver(document.getElementById('stem')))).toBe(false);
  });

  test('prose that does not reach the choices is still quotable', () => {
    const guard = buildGuard({ isExamPage: true });
    expect(guard(rangeOver(document.getElementById('prose')))).toBe(false);
  });

  test('choices are still withheld when every class name is stripped', () => {
    // The whole point of addressing choices by ARIA role: a framework rebuild
    // churns class names and the guard must not go quiet.
    for (const el of document.querySelectorAll('*')) el.removeAttribute('class');
    const guard = buildGuard({ isExamPage: true });
    expect(guard(rangeOver(document.getElementById('c1t')))).toBe(true);
  });

  test('a missing range is not a hit, and does not throw', () => {
    const guard = buildGuard({ isExamPage: true });
    expect(guard(null)).toBe(false);
  });
});
