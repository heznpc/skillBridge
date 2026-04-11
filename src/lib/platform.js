/**
 * SkillBridge — Platform detection
 *
 * The extension currently only ships selectors for Skilljar (the host of
 * Anthropic Academy at the time of v3.5.4). This module is the single point
 * where new LMSes get registered, so the rest of the codebase can call
 * `detectPlatform()` and switch on the result instead of grepping for
 * skilljar.com host_permissions in 12 different files when we add support
 * for Coursera, edX, Khan, etc.
 *
 * Adding a new platform involves:
 *   1. Add the host permission entry in manifest.json
 *   2. Add a new id below
 *   3. Add a new selectors map in src/lib/selectors.js (or a sibling file)
 *      keyed by the same id
 *   4. Verify scripts/check-selectors.js can monitor the new selectors
 */

const PLATFORM_IDS = Object.freeze({
  SKILLJAR: 'skilljar',
  // Future ids — registered here so call sites can branch on them today
  // even though the selector maps are not yet provided.
  ANTHROPIC_DOCS: 'anthropic-docs',
  COURSERA: 'coursera',
  EDX: 'edx',
  UNKNOWN: 'unknown',
});

const PLATFORM_PATTERNS = [
  { id: PLATFORM_IDS.SKILLJAR, hostPattern: /(^|\.)skilljar\.com$/ },
  // Anthropic docs / academy may eventually self-host the courses; the
  // selector layer for this id is intentionally not implemented yet.
  { id: PLATFORM_IDS.ANTHROPIC_DOCS, hostPattern: /(^|\.)anthropic\.com$/ },
  { id: PLATFORM_IDS.COURSERA, hostPattern: /(^|\.)coursera\.org$/ },
  { id: PLATFORM_IDS.EDX, hostPattern: /(^|\.)edx\.org$/ },
];

/**
 * Returns the platform id for the current document, or `unknown` if no
 * registered platform matches the host. Safe to call from content scripts
 * (uses location.hostname) — callers in the background worker should pass
 * the host explicitly.
 */
function detectPlatform(host) {
  const h = host || (typeof location !== 'undefined' ? location.hostname : '');
  if (!h) return PLATFORM_IDS.UNKNOWN;
  for (const { id, hostPattern } of PLATFORM_PATTERNS) {
    if (hostPattern.test(h)) return id;
  }
  return PLATFORM_IDS.UNKNOWN;
}

/**
 * True if the platform has a working selector map. Today only Skilljar
 * qualifies, so the rest of the content script bails early when this returns
 * false instead of running against an unknown DOM and creating noise.
 */
function isPlatformSupported(id) {
  return id === PLATFORM_IDS.SKILLJAR;
}

if (typeof window !== 'undefined') {
  window._sbPlatform = { detectPlatform, isPlatformSupported, PLATFORM_IDS };
}

// CommonJS export for tests / scripts. Wrapped in `typeof` checks because
// the same file is loaded as a content script via manifest.json (no module
// system) and as a Node module from tests.
if (typeof globalThis !== 'undefined' && typeof globalThis.module !== 'undefined') {
  globalThis.module.exports = { detectPlatform, isPlatformSupported, PLATFORM_IDS };
}
