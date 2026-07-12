/**
 * SkillBridge — Platform detection
 *
 * The extension currently only ships selectors for Skilljar (the LMS that
 * hosts the free AI courses at anthropic.skilljar.com — confirmed as the
 * sole platform target at v3.5.4). This module is the single point
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
  // claude.com/resources/tutorials/* — Anthropic's native (Webflow) tutorial
  // pages. A translation-only host: scoped lesson translation + reading aid,
  // but no AI-tutor bridge/sidebar (see getHostCapabilities below).
  CLAUDE_TUTORIALS: 'claude-tutorials',
  // Future ids — registered here so call sites can branch on them today
  // even though the selector maps are not yet provided.
  ANTHROPIC_DOCS: 'anthropic-docs',
  COURSERA: 'coursera',
  EDX: 'edx',
  UNKNOWN: 'unknown',
});

const PLATFORM_PATTERNS = [
  { id: PLATFORM_IDS.SKILLJAR, hostPattern: /(^|\.)skilljar\.com$/ },
  // Exact apex host only — platform.claude.com (docs) and code.claude.com are
  // different surfaces and must NOT match.
  { id: PLATFORM_IDS.CLAUDE_TUTORIALS, hostPattern: /^claude\.com$/ },
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
  return id === PLATFORM_IDS.SKILLJAR || id === PLATFORM_IDS.CLAUDE_TUTORIALS;
}

// ────────────────────────────────────────────────────────────────────
// Per-host capability profile (v3.5.41)
//
// Adding claude.com tutorials as a second translatable surface means the
// content script now runs on a host with a completely different DOM and no
// AI-tutor bridge. Rather than scatter `host === 'x'` checks across ~10
// content scripts, every host-specific behaviour reads ONE frozen profile,
// threaded through as `window._sb.hostCaps`:
//   - contentScope        — CSS root(s) to confine translation + reading aid
//                           to (null = whole document, the Skilljar default)
//   - sidebar / fab                — local learning surface
//   - bridge                       — optional AI surface (trusted host + enabled build)
//   - headerControls / keyboardShortcuts / readingAid / examDetection /
//     youtubeSubtitles            — per-host feature toggles
//
// NOTE: this gates FEATURES, not translation *activation*. Whether a page
// translates at all still flows through detectAITrainingContent() — claude.com
// tutorials pass it naturally (saturated with Claude/Anthropic keywords).
// ────────────────────────────────────────────────────────────────────

// claude.com tutorials are a small lesson island in a large Webflow marketing
// shell; translation + reading aid scope to these two roots so the ~230-element
// shell (global nav, footer, related-tutorial cards) is never touched.
const CLAUDE_TUTORIAL_CONTENT_SCOPE = '.hero_tutorial_post_content, #tutorial_content';

const _CAPS_NONE = Object.freeze({
  platform: PLATFORM_IDS.UNKNOWN,
  trusted: false,
  contentScope: null,
  sidebar: false,
  fab: false,
  bridge: false,
  headerControls: false,
  keyboardShortcuts: false,
  readingAid: false,
  examDetection: false,
  youtubeSubtitles: false,
});
// anthropic.skilljar.com + the localhost/127.0.0.1 E2E fixture: full local
// feature set. The build flag independently decides whether the AI bridge is
// present (false in the Chrome Web Store artifact).
const _CAPS_FULL = Object.freeze({
  platform: PLATFORM_IDS.SKILLJAR,
  trusted: true,
  contentScope: null,
  sidebar: true,
  fab: true,
  bridge: globalThis.__SKILLBRIDGE_AI_GATEWAY_ENABLED__ !== false,
  headerControls: true,
  keyboardShortcuts: true,
  readingAid: true,
  examDetection: true,
  youtubeSubtitles: true,
});
// Other *.skilljar.com tenants (admitted only when detectAITrainingContent
// passes): translation + header controls + reading aid, but no tutor bridge/FAB.
const _CAPS_SKILLJAR_TENANT = Object.freeze({
  platform: PLATFORM_IDS.SKILLJAR,
  trusted: false,
  contentScope: null,
  sidebar: false,
  fab: false,
  bridge: false,
  headerControls: true,
  keyboardShortcuts: true,
  readingAid: true,
  examDetection: true,
  youtubeSubtitles: true,
});
// claude.com tutorials: scoped translation + reading aid + an on-page language
// control. The sidebar/FAB DO inject (for the language picker + bridge-free
// Tools menu), but bridge:false means the sidebar renders a language panel
// instead of the AI-tutor chat. Still no Skilljar header injection, no global
// keyboard listener, no Skilljar exam detection.
const _CAPS_CLAUDE_TUTORIALS = Object.freeze({
  platform: PLATFORM_IDS.CLAUDE_TUTORIALS,
  trusted: false,
  contentScope: CLAUDE_TUTORIAL_CONTENT_SCOPE,
  sidebar: true,
  fab: true,
  bridge: false,
  headerControls: false,
  keyboardShortcuts: false,
  readingAid: true,
  examDetection: false,
  youtubeSubtitles: false,
});

/**
 * Returns the frozen capability profile for a host — the single source of
 * truth for which features may run where. `host` defaults to location.hostname.
 * Normalizes a trailing dot (FQDN form) and a leading `www.`; browser-set
 * hostnames are already lowercased.
 * @param {string} [host]
 * @returns {Readonly<object>}
 */
function getHostCapabilities(host) {
  const h = (host || (typeof location !== 'undefined' ? location.hostname : '') || '')
    .replace(/\.$/, '')
    .replace(/^www\./, '');
  if (h === 'anthropic.skilljar.com' || h === 'localhost' || h === '127.0.0.1') return _CAPS_FULL;
  if (h === 'claude.com') return _CAPS_CLAUDE_TUTORIALS;
  // Delegate Skilljar-host classification to detectPlatform so the host regex
  // lives in exactly one place (PLATFORM_PATTERNS).
  if (detectPlatform(h) === PLATFORM_IDS.SKILLJAR) return _CAPS_SKILLJAR_TENANT;
  return _CAPS_NONE;
}

// ────────────────────────────────────────────────────────────────────
// AI-content detection (v3.5.34, 2026-05-26)
//
// The CWS dashboard pull (2026-05-23) made clear two things:
//   (a) our install base is "general AI-curious learners", not
//       "Anthropic Academy loyalists" specifically — see install
//       data by language;
//   (b) the AI-education market is fragmenting across providers
//       (Anthropic Coursera, Microsoft Learn, …), so anchoring
//       strictly to anthropic.skilljar.com leaves us blind to
//       other Skilljar-hosted AI tenants that may emerge.
//
// Rather than expand the manifest host_permission (which would
// trigger a Chrome Web Store re-review and pull in non-AI Skilljar
// customers like Calendly Academy or Atlassian Academy), we keep
// `*.skilljar.com` and gate activation on AI-relevance at runtime:
//
//   - `anthropic.skilljar.com` always activates (status quo, fast path)
//   - any other Skilljar tenant activates ONLY if the page surfaces
//     two or more AI keywords in title / h1 / breadcrumb / first
//     500 chars of main content
//   - everything else short-circuits the sidebar + tutor + curated
//     terminology and shows a one-time toast explaining why
//
// This is the explicit non-goal carve-out: "Adding other Skilljar
// customers" is still rejected for *non-AI* tenants; AI-content
// detection is the mechanism that admits AI tenants without
// changing the manifest.
// ────────────────────────────────────────────────────────────────────

// Conservative keyword set — anchored to terms unlikely to appear
// in non-AI training contexts. Single-word matches like "model" or
// "agent" are too generic and excluded; multi-word phrases and
// brand names dominate.
//
// Short 3-char tokens (`mcp`, `llm`, `rag`) match via word boundary
// — see `_SHORT_KEYWORDS` below — so they do NOT false-positive on
// `McPherson`, `Hellman`, `drag`, `fragment`, `storage`, etc.
//
// Frozen so a future test or external script that does `.push` /
// `.splice` cannot silently mutate detector behavior mid-suite.
const _AI_KEYWORDS = Object.freeze([
  // Anthropic-specific anchors (case-insensitive)
  'anthropic',
  'claude',
  'mcp',
  'model context protocol',
  // General AI / ML field
  'large language model',
  'llm',
  'generative ai',
  'gen ai',
  'genai',
  'prompt engineering',
  'prompt design',
  'machine learning',
  'deep learning',
  'neural network',
  'transformer',
  'fine-tuning',
  'fine tuning',
  'foundation model',
  'rag',
  'retrieval-augmented',
  // Other major AI brands / models (so an AI-curriculum that
  // happens to compare vendors still trips the gate)
  'openai',
  'gpt-4',
  'gpt-5',
  'gemini',
  'mistral',
  // Agent / tools terminology common in 2026 curricula
  'agentic',
  'ai agent',
  'tool use',
  'function calling',
  'embeddings',
  'vector database',
]);

// Short tokens that would substring-match common English words if
// counted via `includes`. These get word-boundary checks below.
const _SHORT_KEYWORDS = Object.freeze(new Set(['mcp', 'llm', 'rag']));

const _AI_KEYWORD_THRESHOLD = 2;
const _AI_INSPECT_BODY_CHARS = 500;
// Sentinel for the anthropic-host fast path. Finite (not Infinity) so
// the verdict object round-trips through JSON for logs / telemetry
// without becoming `null` and losing the meaning.
const _FAST_PATH_HITS = -1;

function _wordBoundaryHit(lower, kw) {
  // Match `kw` only when not adjacent to [a-z0-9]. Cheap manual scan —
  // avoids constructing a per-keyword regex on every detector call.
  let from = 0;
  while (from <= lower.length - kw.length) {
    const idx = lower.indexOf(kw, from);
    if (idx === -1) return false;
    const before = idx === 0 ? '' : lower[idx - 1];
    const after = idx + kw.length >= lower.length ? '' : lower[idx + kw.length];
    const beforeOk = !before || !/[a-z0-9]/.test(before);
    const afterOk = !after || !/[a-z0-9]/.test(after);
    if (beforeOk && afterOk) return true;
    from = idx + 1;
  }
  return false;
}

function _countKeywordMatches(text, keywords) {
  if (!text) return 0;
  const lower = String(text).toLowerCase();
  let hits = 0;
  for (const kw of keywords) {
    const matched = _SHORT_KEYWORDS.has(kw) ? _wordBoundaryHit(lower, kw) : lower.includes(kw);
    if (matched) hits++;
  }
  return hits;
}

/**
 * Decides whether the current page is AI-training content. Used by the
 * content script to gate sidebar / tutor / curated-dictionary activation
 * on non-anthropic Skilljar tenants.
 *
 * @param {Document} [doc=document]
 * @param {Location} [loc=location]
 * @returns {{ isAI: boolean, reason: string, hits: number }}
 */
function detectAITrainingContent(doc, loc) {
  doc = doc || (typeof document !== 'undefined' ? document : null);
  loc = loc || (typeof location !== 'undefined' ? location : null);
  if (!doc || !loc) return { isAI: false, reason: 'no-document', hits: 0 };

  // Fast path: anthropic.skilljar.com always qualifies — preserves
  // the v3.5.33 behavior verbatim for the primary audience.
  // Strip a trailing dot (FQDN form, occasionally emitted by intermediate
  // proxies) and a leading `www.` so common host variants don't drop to
  // the slow path. Browser-set `location.hostname` is already lowercased.
  const host = (loc.hostname || '').replace(/\.$/, '').replace(/^www\./, '');
  if (host === 'anthropic.skilljar.com') {
    return { isAI: true, reason: 'anthropic-host', hits: _FAST_PATH_HITS };
  }

  // Slow path: inspect title + h1 + breadcrumb + first chunk of body
  // text for keyword density. CSS attribute matchers are case-sensitive
  // by default; the `i` flag (CSS Selectors L4, supported in Chrome 88+,
  // far below the manifest's chrome 124 floor) matches `Breadcrumb`,
  // `BREADCRUMB`, etc. without the substring-trick that v1 relied on.
  const title = doc.title || '';
  const h1 = doc.querySelector('h1')?.textContent || '';
  const breadcrumb =
    doc.querySelector('.breadcrumb, [class*="breadcrumb" i], nav[aria-label*="breadcrumb" i]')?.textContent || '';
  const bodyHead = (doc.body?.textContent || '').slice(0, _AI_INSPECT_BODY_CHARS);

  const combined = `${title}\n${h1}\n${breadcrumb}\n${bodyHead}`;
  const hits = _countKeywordMatches(combined, _AI_KEYWORDS);

  if (hits >= _AI_KEYWORD_THRESHOLD) {
    return { isAI: true, reason: `keywords:${hits}`, hits };
  }
  return { isAI: false, reason: `keywords-below-threshold:${hits}`, hits };
}

if (typeof window !== 'undefined') {
  window._sbPlatform = {
    detectPlatform,
    isPlatformSupported,
    detectAITrainingContent,
    getHostCapabilities,
    PLATFORM_IDS,
  };
}

// CommonJS export for tests / scripts. Wrapped in `typeof` checks because
// the same file is loaded as a content script via manifest.json (no module
// system) and as a Node module from tests.
if (typeof globalThis !== 'undefined' && typeof globalThis.module !== 'undefined') {
  globalThis.module.exports = {
    detectPlatform,
    isPlatformSupported,
    detectAITrainingContent,
    getHostCapabilities,
    CLAUDE_TUTORIAL_CONTENT_SCOPE,
    PLATFORM_IDS,
    _AI_KEYWORDS,
    _SHORT_KEYWORDS,
    _AI_KEYWORD_THRESHOLD,
    _AI_INSPECT_BODY_CHARS,
    _FAST_PATH_HITS,
  };
}
