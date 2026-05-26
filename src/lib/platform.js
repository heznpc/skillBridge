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
const _AI_KEYWORDS = [
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
];

const _AI_KEYWORD_THRESHOLD = 2;
const _AI_INSPECT_BODY_CHARS = 500;

function _countKeywordMatches(text, keywords) {
  if (!text) return 0;
  const lower = String(text).toLowerCase();
  let hits = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) hits++;
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
  const host = loc.hostname || '';
  if (host === 'anthropic.skilljar.com') {
    return { isAI: true, reason: 'anthropic-host', hits: Infinity };
  }

  // Slow path: inspect title + h1 + breadcrumb + first chunk of body
  // text for keyword density.
  const title = doc.title || '';
  const h1 = doc.querySelector('h1')?.textContent || '';
  // Breadcrumb selectors vary across Skilljar tenants; check a few.
  const breadcrumb =
    doc.querySelector('.breadcrumb, [class*="breadcrumb"], nav[aria-label*="readcrumb"]')?.textContent || '';
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
    PLATFORM_IDS,
    _AI_KEYWORDS,
    _AI_KEYWORD_THRESHOLD,
  };
}
