/**
 * Quiz/exam safety observation for academy.claude.com.
 *
 * The question is not "which CSS class holds an answer choice". It is whether
 * SkillBridge's existing safety contract — never translate, transmit, or
 * cache answer-choice text, and put the tutor in exam-safe mode — could be
 * IMPLEMENTED on this DOM at all. A single obfuscated class name would not
 * be an answer to that, so every signal here is scored by how many
 * independent things point the same way.
 *
 * Pure functions only: a rendered snapshot goes in, an observation comes out.
 * Nothing here launches a browser, and nothing here stores question text,
 * choice text, or answers — the shape is what the contract needs, and the
 * content is somebody's assessment material.
 */

/** How complete a reconnaissance run is. */
const STATUS = Object.freeze({
  COMPLETE: 'complete',
  PARTIAL: 'partial',
  UNKNOWN: 'unknown',
});

/** What is blocking a partial run from completing. */
const BLOCKER = Object.freeze({
  AUTH_REQUIRED: 'authentication-required',
  NO_QUIZ_CONTENT: 'quiz-content-not-rendered',
});

/** How confidently a page kind was identified. */
const PAGE_KIND = Object.freeze({
  QUIZ: 'quiz',
  LESSON: 'lesson',
  UNKNOWN: 'unknown',
});

/**
 * Identify the page kind from independent signals.
 *
 * Deliberately multi-signal. The exam contract is the one place where being
 * wrong ships a cheating tool, so a single class name — obfuscated or not —
 * must never be the whole basis. A URL that says quiz and a heading that says
 * quiz are two witnesses; either alone is a guess, which is why one signal
 * yields `unknown` rather than `quiz`.
 *
 * @param {{path?: string, heading?: string, hasChoiceControls?: boolean}} snapshot
 * @returns {{kind: string, signals: string[], confident: boolean}}
 */
function classifyPageKind(snapshot) {
  const s = snapshot || {};
  const signals = [];
  // Matches anywhere in the segment, not just at its start: the live course
  // uses `final-assessment` as well as `quiz-on-...`, and anchoring to the
  // segment start silently misses the one that matters most.
  if (typeof s.path === 'string' && /(quiz|exam|assessment)/i.test(s.path)) signals.push('path');
  if (typeof s.heading === 'string' && /\b(quiz|exam|assessment|final)\b/i.test(s.heading)) signals.push('heading');
  if (s.hasChoiceControls) signals.push('choice-controls');

  if (signals.length >= 2) return { kind: PAGE_KIND.QUIZ, signals, confident: true };
  if (signals.length === 1) return { kind: PAGE_KIND.UNKNOWN, signals, confident: false };
  return { kind: PAGE_KIND.LESSON, signals, confident: true };
}

/**
 * Can answer choices be isolated well enough to exclude them?
 *
 * Counts INDEPENDENT signals — a native control, an accessibility role, a
 * form/label association, a stable data attribute. One is not enough to gate
 * production on: class names churn, and the failure mode is silently
 * translating exam answers.
 *
 * @param {object} choices — observed shape, never content
 * @returns {{excludable: boolean, signals: string[], reason?: string}}
 */
function assessChoiceExcludability(choices) {
  const c = choices || {};
  const signals = [];
  if (c.inputType === 'radio' || c.inputType === 'checkbox') signals.push('native-input');
  if (c.role === 'radio' || c.role === 'checkbox' || c.role === 'option') signals.push('aria-role');
  if (c.labelAssociated) signals.push('label-association');
  if (Array.isArray(c.stableAttrs) && c.stableAttrs.length) signals.push('data-attribute');
  if (c.withinForm) signals.push('form-scope');

  if (!c.count) return { excludable: false, signals, reason: 'no choice elements observed' };
  if (signals.length >= 2) return { excludable: true, signals };
  return {
    excludable: false,
    signals,
    reason:
      signals.length === 1
        ? `only one signal (${signals[0]}) — a single hook is not enough to gate exam safety on`
        : 'no stable signal for isolating answer choices',
  };
}

/**
 * Build the reconnaissance record for one page.
 *
 * Fails toward `partial`. An anonymous run cannot see post-submit state, and
 * calling that `complete` would mean the exam contract was signed off against
 * evidence nobody collected.
 *
 * @param {object} snapshot
 * @returns {object}
 */
function buildSafetyRecord(snapshot) {
  const s = snapshot || {};
  const page = classifyPageKind(s);
  const choices = assessChoiceExcludability(s.choices);

  const record = {
    observedAt: s.observedAt || null,
    path: s.path || null,
    pageKind: page.kind,
    pageKindSignals: page.signals,
    question: s.question ? { count: s.question.count || 0, role: s.question.role || null } : { count: 0, role: null },
    choices: {
      count: (s.choices && s.choices.count) || 0,
      inputType: (s.choices && s.choices.inputType) || null,
      role: (s.choices && s.choices.role) || null,
      stableAttrs: (s.choices && s.choices.stableAttrs) || [],
      excludable: choices.excludable,
      excludabilitySignals: choices.signals,
      ...(choices.reason ? { excludabilityReason: choices.reason } : {}),
    },
    controls: {
      submitPresent: !!(s.controls && s.controls.submitPresent),
      submitRole: (s.controls && s.controls.submitRole) || null,
    },
    state: 'pre-submit',
    postSubmit: null,
  };

  // A quiz route that renders no question and no choices is the shape an
  // auth wall produces: the page exists, the assessment does not. Prefer the
  // page's own statement of the wall over inferring one — a generic "Sign in"
  // link sits in the header of every page, signed in or not.
  const quizContentMissing = page.signals.includes('path') && !record.choices.count && !record.question.count;
  if (quizContentMissing) {
    const walled = s.authWallCopy === true || (s.authWallCopy === undefined && s.signedIn === false);
    return {
      ...record,
      status: STATUS.PARTIAL,
      blocker: walled ? BLOCKER.AUTH_REQUIRED : BLOCKER.NO_QUIZ_CONTENT,
    };
  }
  // Even with choices in hand, post-submit state (correct/incorrect,
  // explanations, retry) is only reachable by submitting as a signed-in user.
  return { ...record, status: STATUS.PARTIAL, blocker: BLOCKER.AUTH_REQUIRED };
}

/**
 * Fold an authenticated post-submit observation into a record.
 *
 * Promotion to `complete` is the ONLY path, and it requires the things that
 * only exist after submitting as a signed-in user. Everything else stays
 * `partial`, because signing off the exam contract against evidence nobody
 * collected is the failure this whole module is shaped to prevent.
 *
 * @param {object} record — a pre-submit record from buildSafetyRecord
 * @param {object|null} postSubmit — observed shape, never content
 * @returns {object}
 */
function withPostSubmit(record, postSubmit) {
  const r = record || {};
  if (!postSubmit || typeof postSubmit !== 'object') return { ...r, postSubmit: null };

  const ps = {
    resultStatePresent: !!postSubmit.resultStatePresent,
    correctnessSignals: Array.isArray(postSubmit.correctnessSignals) ? postSubmit.correctnessSignals : [],
    explanationPresent: !!postSubmit.explanationPresent,
    retryPresent: !!postSubmit.retryPresent,
  };

  // A submitted quiz whose choices were never identifiable tells us nothing
  // about whether they can be excluded, so it cannot complete either.
  const preSubmitUsable = r.choices && r.choices.count > 0 && r.choices.excludable;
  const postSubmitUsable = ps.resultStatePresent && ps.correctnessSignals.length > 0;

  if (preSubmitUsable && postSubmitUsable) {
    const promoted = { ...r, postSubmit: ps, state: 'post-submit', status: STATUS.COMPLETE };
    delete promoted.blocker;
    return promoted;
  }
  return {
    ...r,
    postSubmit: ps,
    status: STATUS.PARTIAL,
    blocker: preSubmitUsable ? BLOCKER.NO_QUIZ_CONTENT : r.blocker || BLOCKER.AUTH_REQUIRED,
  };
}

/**
 * Can the existing safety contract be implemented on what was observed?
 *
 * Returns the five questions as explicit verdicts instead of a single
 * boolean, because they fail for different reasons and a caller deciding
 * whether to support this platform needs to know which one.
 *
 * @param {object[]} records
 * @returns {object}
 */
function evaluateSafetyContract(records) {
  const list = Array.isArray(records) ? records : [];
  const quizzes = list.filter((r) => r && r.pageKind === PAGE_KIND.QUIZ);
  const lessons = list.filter((r) => r && r.pageKind === PAGE_KIND.LESSON);

  return {
    quizDistinguishableFromLesson: quizzes.length > 0 && lessons.length > 0,
    choicesIdentifiable: quizzes.length > 0 && quizzes.every((r) => r.choices.count > 0),
    choicesExcludable: quizzes.length > 0 && quizzes.every((r) => r.choices.excludable),
    // A stable exam signal needs a quiz that was identified by more than one
    // signal; a single hook is not something to switch the tutor on.
    // Identifying a quiz page is necessary but not sufficient: the tutor
    // switch also has to hold once the assessment is on screen, which is only
    // observable with a submitted, signed-in quiz. Anonymous evidence never
    // answers this — claiming `true` from a URL and a heading is exactly the
    // overclaim this module exists to prevent.
    tutorExamSignalAvailable:
      quizzes.length > 0 && quizzes.every((r) => r.status === STATUS.COMPLETE && (r.pageKindSignals || []).length >= 2)
        ? true
        : STATUS.UNKNOWN,
    // Only an observation that actually navigated can speak to this.
    survivesSpaNavigation: list.some((r) => r && r.spaNavigationChecked)
      ? list.every((r) => !r || r.spaNavigationHeld !== false)
      : STATUS.UNKNOWN,
    verdict:
      quizzes.length > 0 && quizzes.every((r) => r.status === STATUS.COMPLETE) ? STATUS.COMPLETE : STATUS.PARTIAL,
  };
}

module.exports = {
  STATUS,
  BLOCKER,
  PAGE_KIND,
  classifyPageKind,
  assessChoiceExcludability,
  buildSafetyRecord,
  withPostSubmit,
  evaluateSafetyContract,
};
