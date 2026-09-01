/**
 * @jest-environment jsdom
 */

/**
 * Answer choices must not be translated, transmitted, or cached.
 *
 * The adapter existing is not the same as choices being protected — the guard
 * only counts where translation actually happens. EXAM_SKIP_SELECTORS is the
 * chokepoint both paths funnel through: the static scan in
 * getTranslatableElements(), and processOneElement(), which the mutation and
 * lazy-viewport paths call directly.
 *
 * So these tests exercise the selector list against Academy markup rather than
 * the adapter's own helpers, and assert the negative that matters: zero choice
 * text reaches a translation lookup, a GT request, or the cache.
 */

/* global describe, test, expect, beforeEach, jest */

const fs = require('fs');
const path = require('path');
const { loadGtQueue } = require('./helpers/gt-queue-harness');

// Same load order the content scripts use, and the same one tests/constants.js
// relies on: runtime constants, then selectors (constants.js references
// SKILLJAR_SELECTORS), then constants.
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const { EXAM_SKIP_SELECTORS } = new Function(
  `${read('src', 'shared', 'runtime-constants.js')}
   ${read('src', 'lib', 'selectors.js')}
   ${read('src', 'lib', 'constants.js')}
   return { EXAM_SKIP_SELECTORS };`,
)();
/** The question stem, some prose, and an ARIA choice group, as Academy renders it. */
function renderAcademyQuiz() {
  document.body.innerHTML = '';
  const main = document.createElement('main');

  const stem = document.createElement('h1');
  stem.textContent = 'Quiz question stem';
  main.appendChild(stem);

  const prose = document.createElement('p');
  prose.textContent = 'Explanatory prose that should still be translated.';
  main.appendChild(prose);

  const group = document.createElement('div');
  group.setAttribute('role', 'radiogroup');
  for (let i = 0; i < 8; i += 1) {
    const choice = document.createElement('div');
    choice.setAttribute('role', 'radio');
    choice.setAttribute('aria-checked', 'false');
    const label = document.createElement('span');
    label.textContent = `Placeholder choice ${i + 1}`;
    choice.appendChild(label);
    group.appendChild(choice);
  }
  main.appendChild(group);
  document.body.appendChild(main);
  return main;
}

let gate;
let staticLookup;

beforeEach(() => {
  document.body.innerHTML = '';
  staticLookup = jest.fn(() => null);
  gate = loadGtQueue({ examSkipSelectors: EXAM_SKIP_SELECTORS, staticLookup });
});

describe('Academy choices at the translation chokepoint', () => {
  test('every choice element is excluded', () => {
    const main = renderAcademyQuiz();
    const choices = Array.from(main.querySelectorAll('[role="radio"]'));
    expect(choices).toHaveLength(8);
    expect(choices.map((el) => gate.processOneElement(el, 'ko'))).toEqual(Array(8).fill(null));
    expect(staticLookup).not.toHaveBeenCalled();
  });

  test('the text node holder inside a choice is excluded too', () => {
    // Choice text is a descendant span; excluding only the role-bearing node
    // would exclude nothing that actually gets read.
    const main = renderAcademyQuiz();
    const labels = Array.from(main.querySelectorAll('[role="radio"] span'));
    expect(labels).toHaveLength(8);
    expect(labels.map((el) => gate.processOneElement(el, 'ko'))).toEqual(Array(8).fill(null));
    expect(staticLookup).not.toHaveBeenCalled();
  });

  test('the question stem and prose stay translatable', () => {
    const main = renderAcademyQuiz();
    expect(gate.processOneElement(main.querySelector('h1'), 'ko')).toBe('gt');
    expect(gate.processOneElement(main.querySelector('p'), 'ko')).toBe('gt');
    expect(staticLookup).toHaveBeenCalledWith('Quiz question stem');
    expect(staticLookup).toHaveBeenCalledWith('Explanatory prose that should still be translated.');
  });

  test('no choice text survives a walk of translatable elements', () => {
    // The negative the contract is actually about: nothing carrying choice
    // text is left in the set that would be looked up, queued, or cached.
    const main = renderAcademyQuiz();
    const candidates = Array.from(main.querySelectorAll('[role="radio"], [role="radio"] span'));
    for (const el of candidates) expect(gate.processOneElement(el, 'ko')).toBeNull();
    expect(staticLookup.mock.calls.flat()).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/Placeholder choice/)]),
    );
    for (const el of candidates) expect(gate.sb.originalTexts.has(el)).toBe(false);
  });

  test('exclusion holds when every class name is stripped', () => {
    // Academy's class names are framework-generated. A class-based guard would
    // stop excluding choices on the next rebuild without failing loudly.
    const main = renderAcademyQuiz();
    for (const el of main.querySelectorAll('*')) el.removeAttribute('class');
    for (const el of main.querySelectorAll('[role="radio"]')) {
      expect(gate.processOneElement(el, 'ko')).toBeNull();
    }
    expect(staticLookup).not.toHaveBeenCalled();
  });

  test('a choice rendered after the initial pass is still excluded', () => {
    // Academy hydrates late; this is the mutation path, not the static scan.
    const main = renderAcademyQuiz();
    const late = document.createElement('div');
    late.setAttribute('role', 'radio');
    late.setAttribute('aria-checked', 'false');
    late.textContent = 'Placeholder choice 9';
    main.querySelector('[role="radiogroup"]').appendChild(late);
    expect(gate.processOneElement(late, 'ko')).toBeNull();
    expect(staticLookup).not.toHaveBeenCalled();
  });

  test('the Skilljar entries still match Skilljar markup', () => {
    // The ARIA entries were added alongside, not in place of.
    document.body.innerHTML = '';
    const form = document.createElement('form');
    form.className = 'quiz-form';
    const label = document.createElement('label');
    label.className = 'answer-option';
    label.textContent = 'Placeholder choice';
    form.appendChild(label);
    document.body.appendChild(form);
    expect(gate.processOneElement(label, 'ko')).toBeNull();
    expect(staticLookup).not.toHaveBeenCalled();
  });
});
