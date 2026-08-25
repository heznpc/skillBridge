/**
 * SkillBridge — is this selection safe to take off the page?
 *
 * Two features hand a learner's text selection somewhere else: Ask Tutor
 * prepends it to a model prompt, and the BYOA panel puts it on the clipboard
 * for a chat assistant the learner opens themselves. Both must refuse a
 * selection that touches an answer choice on an assessment page, and both must
 * refuse it the same way — a guard that exists in one of them is a guard the
 * other silently lacks.
 *
 * The selectors come from the caller rather than being imported, because the
 * one list that matters is EXAM_SKIP_SELECTORS in constants.js, which the
 * translation chokepoint reads too. Three consumers, one list: a choice that
 * stops being excluded stops being excluded everywhere at once, visibly,
 * rather than in whichever path someone forgot.
 *
 * Pure: a Range and a selector list go in, a verdict comes out.
 */

/**
 * True when `range` touches answer-choice text on an assessment page.
 *
 * Three positions are tested, not one.
 *
 * The endpoints catch a selection that starts or ends inside a choice. The
 * containment sweep catches the drag that swallows a whole radiogroup — both
 * endpoints outside it, every choice along for the ride in `sel.toString()` —
 * which is the case an endpoint-only check misses and the case a learner
 * produces by dragging from the prose above the choices to the prose below.
 *
 * @param {Range|null} range
 * @param {{ isExamPage?: boolean, selectors?: string[] }} [opts]
 * @returns {boolean}
 */
function selectionHitsExamChoice(range, opts = {}) {
  if (!opts.isExamPage || !range) return false;
  const list = opts.selectors || [];
  if (list.length === 0) return false;
  const selector = list.join(', ');
  const asElement = (node) => (node && node.nodeType === 3 ? node.parentElement : node);

  for (const node of [range.startContainer, range.endContainer, range.commonAncestorContainer]) {
    const el = asElement(node);
    if (el && typeof el.closest === 'function' && el.closest(selector)) return true;
  }

  const scope = asElement(range.commonAncestorContainer);
  if (scope && typeof scope.querySelectorAll === 'function' && typeof range.intersectsNode === 'function') {
    for (const el of scope.querySelectorAll(selector)) {
      if (range.intersectsNode(el)) return true;
    }
  }
  return false;
}

/**
 * The same verdict for a live Selection, which is what callers actually hold.
 *
 * A collapsed or absent selection is not a hit: there is nothing to withhold.
 *
 * @param {Selection|null} sel
 * @param {{ isExamPage?: boolean, selectors?: string[] }} [opts]
 * @returns {boolean}
 */
function selectionIsWithheld(sel, opts = {}) {
  if (!sel || !sel.rangeCount) return false;
  return selectionHitsExamChoice(sel.getRangeAt(0), opts);
}

if (typeof window !== 'undefined') {
  window._sbExamSelection = { selectionHitsExamChoice, selectionIsWithheld };
}

if (typeof globalThis !== 'undefined' && typeof globalThis.module !== 'undefined') {
  globalThis.module.exports = { selectionHitsExamChoice, selectionIsWithheld };
}
