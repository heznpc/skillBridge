/**
 * SkillBridge — Assessment (exam-safe) state across SPA navigation.
 *
 * Exam-safe state used to be recomputed inline at three unrelated points,
 * and the combination let it stick ON after leaving a quiz:
 *
 *   1. pushState/replaceState called the re-detect SYNCHRONOUSLY, so the URL
 *      was already the new lesson while the DOM was still the old quiz. A
 *      detector that protects on any choice-role signal — which the Academy
 *      one deliberately does — saw the stale radiogroup and stayed ON.
 *   2. The mutation-observer pass that would have corrected it ran only
 *      `if (!isExamPage)`, so it could turn protection ON but never OFF.
 *   3. That same pass sat below a `currentLang === 'en'` early return, so with
 *      an untranslated page it never ran at all.
 *
 * The fix is to stop deriving safety state from whatever happened to run. It
 * lives here, it is driven by two explicit events, and it is deliberately
 * asymmetric about when it trusts them:
 *
 *   route change  — an assessment URL turns protection ON immediately, before
 *                   any DOM arrives. A non-assessment URL turns nothing OFF;
 *                   the old DOM is still on screen and is not evidence about
 *                   the new page.
 *   DOM settled   — authoritative, and the only thing that may turn
 *                   protection OFF, because by then the page being judged is
 *                   the page being shown.
 *
 * So lesson→quiz is protected before a single choice renders, and quiz→lesson
 * releases only once the lesson DOM is actually there.
 *
 * Nothing here reads a translation language. Safety state must not depend on
 * whether the page is being translated — that coupling is what hid the stuck
 * state from anyone browsing in English.
 *
 * Pure and injectable: the detectors are parameters, so this is testable
 * without a browser and reusable for any platform that navigates client-side.
 */

/** Why the state last changed. Carried to callers for logging and tests. */
const ASSESSMENT_TRIGGER = Object.freeze({
  INIT: 'init',
  ROUTE: 'route',
  DOM: 'dom',
});

/**
 * Create an assessment-state controller.
 *
 * @param {object} opts
 * @param {(loc: Location) => boolean} opts.routeIsAssessment
 *   Decides from a URL alone. Runs before the new DOM exists, so it must not
 *   read the document.
 * @param {(doc: Document, loc: Location) => boolean} opts.domIsAssessment
 *   Decides from the settled DOM. Authoritative in both directions.
 * @param {(state: {isAssessment: boolean, trigger: string}) => void} [opts.onChange]
 *   Called only when the value actually flips.
 */
function createAssessmentLifecycle({ routeIsAssessment, domIsAssessment, onChange } = {}) {
  let isAssessment = false;
  let trigger = ASSESSMENT_TRIGGER.INIT;

  function set(next, why) {
    trigger = why;
    if (next === isAssessment) return isAssessment;
    isAssessment = next;
    if (typeof onChange === 'function') onChange({ isAssessment, trigger: why });
    return isAssessment;
  }

  return {
    /** Current state. Safe to read from anywhere; never recomputes. */
    isAssessment: () => isAssessment,
    /** What last drove the state, for diagnostics. */
    lastTrigger: () => trigger,

    /**
     * Seed the state on first load, where URL and DOM already agree.
     */
    init(doc, loc) {
      const byRoute = !!routeIsAssessment?.(loc);
      const byDom = !!domIsAssessment?.(doc, loc);
      return set(byRoute || byDom, ASSESSMENT_TRIGGER.INIT);
    },

    /**
     * A client-side navigation happened. The DOM has NOT caught up yet.
     *
     * Only ever turns protection on. Releasing here would mean trusting the
     * previous page's markup to describe the next one.
     */
    onRouteChange(loc) {
      if (routeIsAssessment?.(loc)) return set(true, ASSESSMENT_TRIGGER.ROUTE);
      // Provisional hold: keep whatever we had until the DOM can speak.
      trigger = ASSESSMENT_TRIGGER.ROUTE;
      return isAssessment;
    },

    /**
     * The DOM for the current route has settled or mutated.
     *
     * Authoritative both ways. Must be called regardless of target language.
     */
    onDomSettled(doc, loc) {
      return set(!!domIsAssessment?.(doc, loc), ASSESSMENT_TRIGGER.DOM);
    },

    /** Force a value — for tests and for host profiles with detection off. */
    override(next) {
      return set(!!next, ASSESSMENT_TRIGGER.INIT);
    },
  };
}

if (typeof window !== 'undefined') {
  window._sbAssessmentLifecycle = { createAssessmentLifecycle, ASSESSMENT_TRIGGER };
}

if (typeof globalThis !== 'undefined' && typeof globalThis.module !== 'undefined') {
  globalThis.module.exports = { createAssessmentLifecycle, ASSESSMENT_TRIGGER };
}
