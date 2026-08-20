/**
 * Shared deadlines for "wait until the extension has settled" polls.
 *
 * These specs drive a real Chromium with a real MV3 service worker, so every
 * observable outcome is the far end of an async chain: content script boot →
 * dictionary load → GT round trip through the SW → DOM rewrite. Locally that
 * completes in well under a second, which is how a spread of 5s/8s/10s
 * deadlines accumulated. On a loaded CI runner the same chain intermittently
 * takes longer, and each of those deadlines becomes an independent flake — five
 * different specs failed this way in one afternoon (#303).
 *
 * A longer deadline costs nothing when the assertion passes: these are polls
 * that exit as soon as the condition holds, so raising the ceiling only changes
 * how long a genuine failure takes to report.
 *
 * Use SETTLE_MS for "wait for the expected outcome". Do NOT use it for a
 * deadline that is part of the assertion — a test proving something does NOT
 * happen within a window needs its own, deliberately short, number.
 */

const SETTLE_MS = 15_000;

module.exports = { SETTLE_MS };
