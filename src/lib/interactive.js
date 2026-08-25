/**
 * SkillBridge — what counts as an interactive element, in one place.
 *
 * Three parts of the translation pipeline need this answer, and they had three
 * answers:
 *
 *   gt-queue `_hasInteractiveEls`   a, button, summary, [role=button], [role=link]
 *   content  `safeReplaceText`      the same list again, as a second literal
 *   html-gt  `INTERACTIVE_TAGS`     A, BUTTON — and nothing else
 *
 * The first two agreed only because someone typed the same string twice. The
 * third is the one that mattered: `checkTagIntegrity` protects TAG NAMES, so a
 * control that is a `<div role="button">` was invisible to it. Google Translate
 * could drop or duplicate that control and the gate would pass, after which
 * reconciliation silently lost it.
 *
 * That is not hypothetical on Academy, which builds its controls from ARIA
 * roles on plain elements — `[role="radio"]`, `[role="button"]` — because its
 * framework generates class names and roles rather than semantic tags. And the
 * split was worse than a plain gap: `_hasInteractiveEls` DID recognise a
 * role-bearing control, so a block containing one was routed onto the
 * structure-preserving path, where the gate meant to protect it could not see
 * it. The safer route was the unprotected one.
 *
 * One definition, three consumers. A control that stops being recognised stops
 * being recognised everywhere at once, which is a visible failure rather than a
 * silent one.
 */

/** Tags that are interactive by virtue of being that tag. */
const INTERACTIVE_TAGS = Object.freeze(new Set(['A', 'BUTTON', 'SUMMARY']));

/**
 * ARIA roles that make any element a control.
 *
 * Deliberately the WIDGET roles a course page actually uses, not the whole
 * ARIA taxonomy. Each one names something a learner can operate, and losing or
 * blanking its label leaves a dead spot on the page — which is the failure this
 * list exists to prevent.
 */
const INTERACTIVE_ROLES = Object.freeze(
  new Set([
    'button',
    'link',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'tab',
    'checkbox',
    'radio',
    'option',
    'switch',
    'treeitem',
  ]),
);

/** The same set as a CSS selector, for callers that query rather than test. */
const INTERACTIVE_SELECTOR = [
  ...[...INTERACTIVE_TAGS].map((tag) => tag.toLowerCase()),
  ...[...INTERACTIVE_ROLES].map((role) => `[role="${role}"]`),
].join(', ');

/** The role an element declares, lowercased, or ''. */
function _roleOf(el) {
  const raw = el && typeof el.getAttribute === 'function' ? el.getAttribute('role') : '';
  return (raw || '').trim().toLowerCase();
}

/**
 * True when `el` is itself a control.
 *
 * Tag OR role — an `<a>` with `role="presentation"` is still a link as far as
 * this pipeline is concerned, because blanking its text still leaves a
 * clickable dead spot.
 */
function isInteractiveElement(el) {
  if (!el || !el.tagName) return false;
  return INTERACTIVE_TAGS.has(el.tagName) || INTERACTIVE_ROLES.has(_roleOf(el));
}

/**
 * A stable identity for matching a translated element back to its original.
 *
 * Tag, role, and href/src. The role is part of the key because it is part of
 * what the element IS: two sibling `<div>`s where one is a `role="button"` and
 * the other is a wrapper are not interchangeable, and a key that could not tell
 * them apart would let reconciliation move the wrapper's text into the control.
 *
 * Elements that share a key are not disambiguated by it — two `<a href="/x">`,
 * or every plain `<strong>`. Callers consume same-key originals in document
 * order and prefer an attribute-exact candidate, which is what keeps a
 * translation reorder from landing one element's attributes on another's text.
 */
function elementIdentity(el) {
  const tag = el.tagName || '';
  const role = _roleOf(el);
  const href =
    el && typeof el.getAttribute === 'function' ? el.getAttribute('href') || el.getAttribute('src') || '' : '';
  return `${tag}|${role}|${href}`;
}

if (typeof window !== 'undefined') {
  window._sbInteractive = {
    INTERACTIVE_TAGS,
    INTERACTIVE_ROLES,
    INTERACTIVE_SELECTOR,
    isInteractiveElement,
    elementIdentity,
  };
}

if (typeof globalThis !== 'undefined' && typeof globalThis.module !== 'undefined') {
  globalThis.module.exports = {
    INTERACTIVE_TAGS,
    INTERACTIVE_ROLES,
    INTERACTIVE_SELECTOR,
    isInteractiveElement,
    elementIdentity,
  };
}
