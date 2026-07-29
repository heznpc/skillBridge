/**
 * Tests for src/lib/platform.js — platform detection + AI-content gate.
 *
 * The AI-content gate (added v3.5.34) is the chokepoint that admits
 * other Skilljar-hosted AI courses while keeping non-AI tenants
 * (Calendly Academy, Atlassian Academy, the generic Skilljar B2B
 * customer base) out — without expanding manifest host_permission.
 * The "fast path" for anthropic.skilljar.com preserves the v3.5.33
 * behavior verbatim so Anthropic Academy users see zero change.
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'platform.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));

// platform.js loads as a content-script IIFE. Run it via Function with
// our own `globalThis` so the CommonJS export branch fires. The window
// branch is harmless (we don't read window._sbPlatform here).
const _fakeGlobal = { module: { exports: {} } };
new Function('globalThis', src)(_fakeGlobal);
const {
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
} = _fakeGlobal.module.exports;

describe('detectPlatform', () => {
  test('matches skilljar.com and subdomains', () => {
    expect(detectPlatform('skilljar.com')).toBe(PLATFORM_IDS.SKILLJAR);
    expect(detectPlatform('anthropic.skilljar.com')).toBe(PLATFORM_IDS.SKILLJAR);
    expect(detectPlatform('any.tenant.skilljar.com')).toBe(PLATFORM_IDS.SKILLJAR);
  });

  test('matches anthropic.com but tracks it as a distinct id', () => {
    expect(detectPlatform('docs.anthropic.com')).toBe(PLATFORM_IDS.ANTHROPIC_DOCS);
    expect(detectPlatform('anthropic.com')).toBe(PLATFORM_IDS.ANTHROPIC_DOCS);
  });

  test('returns unknown for unrelated hosts', () => {
    expect(detectPlatform('example.com')).toBe(PLATFORM_IDS.UNKNOWN);
    expect(detectPlatform('skilljar-clone.example')).toBe(PLATFORM_IDS.UNKNOWN);
  });
});

describe('isPlatformSupported', () => {
  test('only Skilljar is supported today', () => {
    expect(isPlatformSupported(PLATFORM_IDS.SKILLJAR)).toBe(true);
    expect(isPlatformSupported(PLATFORM_IDS.ANTHROPIC_DOCS)).toBe(false);
    expect(isPlatformSupported(PLATFORM_IDS.COURSERA)).toBe(false);
    expect(isPlatformSupported(PLATFORM_IDS.UNKNOWN)).toBe(false);
  });
});

describe('manifest host scoping', () => {
  test('loads content scripts only on Claude tutorial pages', () => {
    expect(manifest.content_scripts[0].matches).toContain('https://claude.com/resources/tutorials/*');
  });

  test('keeps Claude web-accessible resources on Chrome-valid origin scope', () => {
    const claudeWar = manifest.web_accessible_resources.find((entry) => entry.matches.includes('https://claude.com/*'));
    expect(claudeWar).toBeTruthy();
    expect(claudeWar.matches).not.toContain('https://claude.com/resources/tutorials/*');
  });
});

// ── AI-content gate ───────────────────────────────────────────

function mockDocument({ title = '', h1 = '', breadcrumb = '', body = '' } = {}) {
  return {
    title,
    body: { textContent: body },
    querySelector(sel) {
      if (sel === 'h1') return { textContent: h1 };
      // Match any breadcrumb-y selector
      if (sel.includes('readcrumb') || sel.includes('breadcrumb')) {
        return breadcrumb ? { textContent: breadcrumb } : null;
      }
      return null;
    },
  };
}

describe('detectAITrainingContent — fast path', () => {
  test('anthropic.skilljar.com unconditionally activates (no content inspection)', () => {
    const doc = mockDocument({ title: 'Welcome to Big Box Retail', body: 'nothing AI here' });
    const loc = { hostname: 'anthropic.skilljar.com' };
    const v = detectAITrainingContent(doc, loc);
    expect(v.isAI).toBe(true);
    expect(v.reason).toBe('anthropic-host');
    // Hits sentinel must be finite (was Infinity in v1, which became
    // null on JSON round-trip and lost the meaning).
    expect(v.hits).toBe(_FAST_PATH_HITS);
    expect(Number.isFinite(v.hits)).toBe(true);
    expect(JSON.parse(JSON.stringify(v)).hits).toBe(_FAST_PATH_HITS);
    // Sanity: the v3.5.33 audience must never be gated out even if
    // their lesson body is unusually short / off-topic.
  });

  test('strips trailing dot from FQDN-form anthropic host', () => {
    const v = detectAITrainingContent(mockDocument({ title: '', body: '' }), { hostname: 'anthropic.skilljar.com.' });
    expect(v.isAI).toBe(true);
    expect(v.reason).toBe('anthropic-host');
  });

  test('strips leading www. from anthropic host alias', () => {
    const v = detectAITrainingContent(mockDocument({ title: '', body: '' }), {
      hostname: 'www.anthropic.skilljar.com',
    });
    expect(v.isAI).toBe(true);
    expect(v.reason).toBe('anthropic-host');
  });
});

describe('detectAITrainingContent — keyword path', () => {
  test('rejects a non-AI Skilljar tenant (Calendly Academy style)', () => {
    const doc = mockDocument({
      title: 'Calendly Academy — Scheduling Best Practices',
      h1: 'Calendar setup',
      body: 'Welcome to Calendly Academy. Learn how to schedule meetings, embed widgets, and manage availability across your team.',
    });
    const loc = { hostname: 'calendly.skilljar.com' };
    const v = detectAITrainingContent(doc, loc);
    expect(v.isAI).toBe(false);
    expect(v.reason).toMatch(/keywords-below-threshold/);
  });

  test('admits a hypothetical AI-curriculum Skilljar tenant', () => {
    const doc = mockDocument({
      title: 'OpenAI Academy — Prompt Engineering 101',
      h1: 'Working with large language models',
      body: 'This course covers prompt engineering, function calling, and embeddings with OpenAI APIs.',
    });
    const loc = { hostname: 'openai.skilljar.com' }; // hypothetical
    const v = detectAITrainingContent(doc, loc);
    expect(v.isAI).toBe(true);
    expect(v.reason).toMatch(/keywords:/);
    expect(v.hits).toBeGreaterThanOrEqual(_AI_KEYWORD_THRESHOLD);
  });

  test('admits a page with 2 AI keywords even on an unknown tenant', () => {
    // Threshold is exactly 2 — verify the boundary holds.
    const doc = mockDocument({
      title: 'Claude vs Gemini comparison',
      h1: 'Side-by-side',
      body: 'A neutral overview.',
    });
    const v = detectAITrainingContent(doc, { hostname: 'tenant.skilljar.com' });
    expect(v.isAI).toBe(true);
    expect(v.hits).toBeGreaterThanOrEqual(2);
  });

  test('rejects a page with exactly 1 AI keyword (below threshold)', () => {
    const doc = mockDocument({
      title: 'Onboarding',
      h1: 'Getting started',
      body: 'We use Claude internally for some workflows but this course is about HR processes.',
    });
    const v = detectAITrainingContent(doc, { hostname: 'hr.skilljar.com' });
    // 'claude' appears once → below threshold → reject
    expect(v.isAI).toBe(false);
  });

  test('keyword match is case-insensitive', () => {
    const doc = mockDocument({
      title: 'ANTHROPIC TUTORIAL: prompt engineering',
      body: '',
    });
    const v = detectAITrainingContent(doc, { hostname: 'random.skilljar.com' });
    expect(v.isAI).toBe(true);
  });

  test('only inspects first N body chars where N === _AI_INSPECT_BODY_CHARS', () => {
    // Keywords beyond the inspection bound should not count. Padding
    // sized to the exported constant + 100 so the test stays correct
    // if the bound is later raised (the assertion name stays accurate).
    const padding = 'x'.repeat(_AI_INSPECT_BODY_CHARS + 100);
    const doc = mockDocument({
      title: 'Random course',
      body: padding + 'claude anthropic openai gemini',
    });
    const v = detectAITrainingContent(doc, { hostname: 'tenant.skilljar.com' });
    expect(v.isAI).toBe(false);
  });

  // ── Short-keyword word-boundary regression tests ──────────────
  // The v1 detector used String.includes for everything; `rag` matched
  // inside `drag` / `fragment` / `storage`, `mcp` matched inside
  // `McPherson`, `llm` matched inside `Hellman` / `Stallman` / `Pullman`.
  // These tests pin the fixed behavior so a future refactor can't
  // accidentally re-introduce the regression.

  test('short keyword `rag` does NOT match inside `drag` / `fragment` / `storage`', () => {
    const doc = mockDocument({
      title: 'Drag-and-drop scheduling',
      h1: 'Storage and migration',
      body: 'Drag your booking link into any paragraph. Storage settings include fragment editing and outrage handling.',
    });
    const v = detectAITrainingContent(doc, { hostname: 'calendly.skilljar.com' });
    expect(v.isAI).toBe(false);
    expect(v.hits).toBe(0);
  });

  test('short keyword `mcp` does NOT match inside `McPherson`', () => {
    const doc = mockDocument({
      title: 'Sales training with instructor McPherson',
      body: 'Course taught by McPherson; covers customer success workflows.',
    });
    const v = detectAITrainingContent(doc, { hostname: 'sales.skilljar.com' });
    expect(v.isAI).toBe(false);
  });

  test('short keyword `llm` does NOT match inside `Hellman` / `Pullman` / `Stallman`', () => {
    const doc = mockDocument({
      title: 'Hospitality training — Pullman & Hellman protocols',
      body: 'Pullman porters, Hellman service standards, Stallman archive protocols.',
    });
    const v = detectAITrainingContent(doc, { hostname: 'hosp.skilljar.com' });
    expect(v.isAI).toBe(false);
  });

  test('short keyword still matches when surrounded by punctuation / whitespace', () => {
    // Word boundary should accept the actual AI usage of the short tokens.
    const doc = mockDocument({
      title: 'LLM intro: MCP and RAG fundamentals',
      body: 'This is about LLM, MCP, and RAG.',
    });
    const v = detectAITrainingContent(doc, { hostname: 'tenant.skilljar.com' });
    expect(v.isAI).toBe(true);
    expect(v.hits).toBeGreaterThanOrEqual(3);
  });
});

describe('detectAITrainingContent — defensive shape', () => {
  test('returns isAI:false (not throw) when document/location are missing', () => {
    const v = detectAITrainingContent(null, null);
    expect(v.isAI).toBe(false);
    expect(v.reason).toBe('no-document');
  });

  test('handles missing h1/breadcrumb gracefully', () => {
    const doc = mockDocument({ title: 'Introduction to MCP and Claude', body: '' });
    // No h1, no breadcrumb — should still trip if title has enough keywords.
    const v = detectAITrainingContent(doc, { hostname: 'tenant.skilljar.com' });
    expect(v.isAI).toBe(true);
  });
});

describe('AI keyword list invariants', () => {
  test('does not include single generic words that would over-match', () => {
    // 'agent', 'model', 'tool', 'training' are too generic and
    // intentionally excluded — they appear on Calendly Academy,
    // sales-training pages, etc. without indicating AI content.
    expect(_AI_KEYWORDS).not.toContain('agent');
    expect(_AI_KEYWORDS).not.toContain('model');
    expect(_AI_KEYWORDS).not.toContain('training');
    expect(_AI_KEYWORDS).not.toContain('tool');
  });

  test('includes Anthropic-specific anchors', () => {
    expect(_AI_KEYWORDS).toContain('anthropic');
    expect(_AI_KEYWORDS).toContain('claude');
    expect(_AI_KEYWORDS).toContain('mcp');
  });

  test('threshold is 2 (anchored constant)', () => {
    expect(_AI_KEYWORD_THRESHOLD).toBe(2);
  });

  test('keyword list is frozen — cross-test pollution cannot mutate it', () => {
    // strict-mode push on a frozen array throws TypeError.
    expect(() => _AI_KEYWORDS.push('contaminated')).toThrow(TypeError);
    expect(Object.isFrozen(_AI_KEYWORDS)).toBe(true);
  });

  test('short-keyword set covers the 3-char ambiguous tokens', () => {
    // These are the tokens that would substring-match common English
    // words if not word-boundary-checked. Pin the membership so a
    // future "add llm-like keyword" PR explicitly considers whether
    // word boundaries are needed.
    expect(_SHORT_KEYWORDS.has('mcp')).toBe(true);
    expect(_SHORT_KEYWORDS.has('llm')).toBe(true);
    expect(_SHORT_KEYWORDS.has('rag')).toBe(true);
  });
});

describe('getHostCapabilities', () => {
  test('anthropic.skilljar.com is a full-feature trusted host (bridge + document-wide)', () => {
    const c = getHostCapabilities('anthropic.skilljar.com');
    expect(c.trusted).toBe(true);
    expect(c.bridge).toBe(true);
    expect(c.sidebar).toBe(true);
    expect(c.contentScope).toBeNull();
    expect(c.readingAid).toBe(true);
  });

  test('localhost / 127.0.0.1 (E2E fixture) get the full profile too', () => {
    expect(getHostCapabilities('localhost').bridge).toBe(true);
    expect(getHostCapabilities('127.0.0.1').sidebar).toBe(true);
    expect(getHostCapabilities('localhost').contentScope).toBeNull();
  });

  test('CWS build gate disables only the full-profile AI bridge', () => {
    const gatedGlobal = {
      module: { exports: {} },
      __SKILLBRIDGE_AI_GATEWAY_ENABLED__: false,
    };
    new Function('globalThis', src)(gatedGlobal);
    const gatedCaps = gatedGlobal.module.exports.getHostCapabilities('anthropic.skilljar.com');
    expect(gatedCaps).toMatchObject({
      trusted: true,
      bridge: false,
      sidebar: true,
      fab: true,
      readingAid: true,
      youtubeSubtitles: true,
    });
  });

  test('claude.com: scoped translation + reading aid + sidebar/FAB for the language picker, but NO bridge/header/keyboard/exam', () => {
    const c = getHostCapabilities('claude.com');
    expect(c.platform).toBe(PLATFORM_IDS.CLAUDE_TUTORIALS);
    expect(c.contentScope).toBe(CLAUDE_TUTORIAL_CONTENT_SCOPE);
    expect(c.readingAid).toBe(true);
    // Sidebar + FAB inject so the user can pick a language on-page; the sidebar
    // renders a language panel (not the AI-tutor chat) because bridge is false.
    expect(c.sidebar).toBe(true);
    expect(c.fab).toBe(true);
    expect(c.bridge).toBe(false);
    expect(c.headerControls).toBe(false);
    expect(c.keyboardShortcuts).toBe(false);
    expect(c.examDetection).toBe(false);
    expect(c.youtubeSubtitles).toBe(false);
  });

  test('www. and trailing-dot variants of claude.com resolve identically', () => {
    expect(getHostCapabilities('www.claude.com').contentScope).toBe(CLAUDE_TUTORIAL_CONTENT_SCOPE);
    expect(getHostCapabilities('claude.com.').contentScope).toBe(CLAUDE_TUTORIAL_CONTENT_SCOPE);
  });

  test('claude.com subdomains are NOT claude-tutorials — docs/code are different surfaces', () => {
    expect(getHostCapabilities('platform.claude.com').platform).toBe(PLATFORM_IDS.UNKNOWN);
    expect(getHostCapabilities('code.claude.com').contentScope).toBeNull();
  });

  test('other *.skilljar.com tenants: header + reading aid, but no bridge/sidebar', () => {
    const c = getHostCapabilities('acme.skilljar.com');
    expect(c.platform).toBe(PLATFORM_IDS.SKILLJAR);
    expect(c.trusted).toBe(false);
    expect(c.bridge).toBe(false);
    expect(c.sidebar).toBe(false);
    expect(c.headerControls).toBe(true);
    expect(c.readingAid).toBe(true);
    expect(c.contentScope).toBeNull();
  });

  test('unknown hosts get no capabilities', () => {
    const c = getHostCapabilities('example.com');
    expect(c.platform).toBe(PLATFORM_IDS.UNKNOWN);
    expect(c.readingAid).toBe(false);
    expect(c.contentScope).toBeNull();
    expect(c.bridge).toBe(false);
  });

  test('profiles are frozen so a caller cannot mutate them', () => {
    expect(Object.isFrozen(getHostCapabilities('claude.com'))).toBe(true);
    expect(Object.isFrozen(getHostCapabilities('anthropic.skilljar.com'))).toBe(true);
  });
});
