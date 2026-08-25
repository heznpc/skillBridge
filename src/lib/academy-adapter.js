/**
 * SkillBridge — Claude Academy (academy.claude.com) assessment safety.
 *
 * Academy is a different application from Skilljar, and every signal the
 * Skilljar exam path relies on is absent here. Measured against the live,
 * signed-in DOM:
 *
 *   Skilljar                        Academy
 *   ────────────────────────────    ────────────────────────────────
 *   <form class="quiz-form">        no <form> element at all
 *   input[type=radio] + <label>     [role="radio"], no input, no label[for]
 *   .answer-option / .quiz-option   framework-generated class names
 *   /quiz, /assessment path ends    /quiz-on-…, /final-assessment
 *
 * The URL patterns miss too, and not marginally: EXAM_URL_PATTERNS matches
 * `/quiz` only when the segment ENDS there, so `/quiz-on-accessing-claude-
 * with-the-api` and `/final-assessment` both fall through. Running the
 * Skilljar path against Academy therefore does not degrade — it detects
 * nothing, leaves exam-safe off, and lets answer choices be translated and
 * sent to the tutor. This module exists to close that.
 *
 * Two rules shape everything below.
 *
 * 1. Detection reads the LIVE page, never a catalog. The curriculum snapshots
 *    carry a per-unit `kind`, and it is wrong often enough to be unusable:
 *    "Course quiz" is `quiz` on Academy and `modular` on Skilljar, and in
 *    ai-fluency-framework-foundations Academy itself labels its course quiz
 *    `lesson`. A page trusted as a lesson on that basis would render its
 *    assessment with the tutor unguarded, so `kind` is never consulted here.
 *
 * 2. Detection must fire BEFORE a question is answered. Everything used below
 *    — route, heading, radiogroup, choice roles — is present on first paint.
 *    Nothing here waits for a submission, a result, or a correctness signal;
 *    the tutor has to be safe while the learner is still reading.
 */

/** The only host this adapter speaks for. */
const ACADEMY_HOST = 'academy.claude.com';

/**
 * Route shapes that name an assessment.
 *
 * Anchored to a path SEGMENT, not to the end of the path, because Academy
 * names quizzes after their subject — `quiz-on-prompt-engineering`,
 * `final-assessment`, `assessment-on-mcp-concepts`. A trailing-boundary
 * pattern is exactly what fails on this site.
 */
const ACADEMY_ASSESSMENT_PATH_PATTERNS = Object.freeze([
  /\/quiz(?:-[a-z0-9-]*)?(?:\/|\?|#|$)/i,
  /\/[a-z0-9-]*assessment(?:-[a-z0-9-]*)?(?:\/|\?|#|$)/i,
  /\/[a-z0-9-]*exam(?:-[a-z0-9-]*)?(?:\/|\?|#|$)/i,
]);

/** Heading text that names an assessment, in the seven locales Academy ships. */
const ACADEMY_ASSESSMENT_HEADING_PATTERNS = Object.freeze([
  /\bquiz\b/i,
  /\bassessment\b/i,
  /\bexam\b/i,
  /퀴즈|평가|시험/,
  /クイズ|評価|試験/,
  /测验|测试|考试/,
  /測驗|評量|考試/,
  /\bcuestionario\b|\bevaluaci/i,
  /\bquestionnaire\b|\bévaluation\b/i,
  /\bPrüfung\b|\bBewertung\b|\bQuiz\b/i,
]);

/**
 * Answer-choice subtrees, addressed by ARIA rather than by class name.
 *
 * The signed-in page exposes `role="radio"` with `aria-checked` inside a
 * `role="radiogroup"`. That is the accessibility contract, which is the part
 * of a framework's output least likely to churn — a class-name selector here
 * would silently stop excluding choices the next time the site rebuilds, and
 * silence is the dangerous failure for this particular guard.
 */
const ACADEMY_EXAM_SKIP_SELECTORS = Object.freeze([
  '[role="radiogroup"]',
  '[role="radio"]',
  '[role="checkbox"]',
  '[role="option"]',
  '[role="listbox"]',
  '[aria-checked]',
]);

/** What made a page look like an assessment. Order is not significance. */
const ASSESSMENT_SIGNAL = Object.freeze({
  ROUTE: 'route',
  HEADING: 'heading',
  RADIOGROUP: 'radiogroup',
  CHOICE_ROLES: 'choice-roles',
});

/** Read a trimmed heading without tripping over a missing element. */
function _headingText(root) {
  const h = root.querySelector('h1, [role="heading"][aria-level="1"]');
  return (h && h.textContent ? h.textContent : '').replace(/\s+/g, ' ').trim();
}

/**
 * Decide whether the current page is an assessment.
 *
 * Multi-signal on purpose, and deliberately lopsided: a single signal is
 * enough to switch protection ON. The two errors are not symmetric — a false
 * positive leaves a lesson's choices untranslated, which is a visible
 * annoyance, while a false negative feeds live exam content to a translator
 * and a tutor. Being wrong in the cautious direction is the cheaper mistake,
 * so this does not require corroboration before protecting the page.
 *
 * @param {Document} [doc=document]
 * @param {Location} [loc=location]
 * @returns {{ isAssessment: boolean, signals: string[], choiceCount: number }}
 */
function detectAcademyAssessment(doc, loc) {
  doc = doc || (typeof document !== 'undefined' ? document : null);
  loc = loc || (typeof location !== 'undefined' ? location : null);
  if (!doc || !loc) return { isAssessment: false, signals: [], choiceCount: 0 };

  const root = doc.querySelector('main') || doc.body;
  if (!root) return { isAssessment: false, signals: [], choiceCount: 0 };

  const signals = [];
  const path = `${loc.pathname || ''}${loc.search || ''}`;
  if (ACADEMY_ASSESSMENT_PATH_PATTERNS.some((p) => p.test(path))) signals.push(ASSESSMENT_SIGNAL.ROUTE);

  const heading = _headingText(root);
  if (heading && ACADEMY_ASSESSMENT_HEADING_PATTERNS.some((p) => p.test(heading))) {
    signals.push(ASSESSMENT_SIGNAL.HEADING);
  }

  if (root.querySelector('[role="radiogroup"], [role="listbox"]')) signals.push(ASSESSMENT_SIGNAL.RADIOGROUP);

  const choices = root.querySelectorAll('[role="radio"], [role="checkbox"], [role="option"]');
  if (choices.length > 0) signals.push(ASSESSMENT_SIGNAL.CHOICE_ROLES);

  return { isAssessment: signals.length > 0, signals, choiceCount: choices.length };
}

/**
 * Collect the elements whose text must not leave the page.
 *
 * Returned as whole subtrees, not as the matched nodes' own text. Choice text
 * is nested inside the element that carries the role, so excluding only the
 * node with the attribute would exclude nothing that is actually rendered.
 *
 * @param {Document|Element} [root=document]
 * @returns {Element[]}
 */
function collectAcademyChoiceSubtrees(root) {
  const scope = root || (typeof document !== 'undefined' ? document : null);
  if (!scope) return [];
  return Array.from(scope.querySelectorAll(ACADEMY_EXAM_SKIP_SELECTORS.join(', ')));
}

/**
 * True when `node` sits inside an answer choice, and so must not be
 * translated, transmitted, or cached.
 *
 * Walks up from the node rather than testing the node itself: the text that
 * would be sent is a descendant of the element carrying the role.
 *
 * @param {Node} node
 * @returns {boolean}
 */
function isWithinAcademyChoice(node) {
  const el = node && node.nodeType === 3 ? node.parentElement : node;
  if (!el || typeof el.closest !== 'function') return false;
  return el.closest(ACADEMY_EXAM_SKIP_SELECTORS.join(', ')) !== null;
}

if (typeof window !== 'undefined') {
  window._sbAcademy = {
    ACADEMY_HOST,
    ACADEMY_EXAM_SKIP_SELECTORS,
    ASSESSMENT_SIGNAL,
    detectAcademyAssessment,
    collectAcademyChoiceSubtrees,
    isWithinAcademyChoice,
  };
}

// Same shape as platform.js: this loads as a bare content script, and the
// tests evaluate it with a fake `globalThis` that carries the export target.
if (typeof globalThis !== 'undefined' && typeof globalThis.module !== 'undefined') {
  globalThis.module.exports = {
    ACADEMY_HOST,
    ACADEMY_ASSESSMENT_PATH_PATTERNS,
    ACADEMY_ASSESSMENT_HEADING_PATTERNS,
    ACADEMY_EXAM_SKIP_SELECTORS,
    ASSESSMENT_SIGNAL,
    detectAcademyAssessment,
    collectAcademyChoiceSubtrees,
    isWithinAcademyChoice,
  };
}
