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

// platform.js loads as a content-script IIFE. Run it via Function with
// our own `globalThis` so the CommonJS export branch fires. The window
// branch is harmless (we don't read window._sbPlatform here).
const _fakeGlobal = { module: { exports: {} } };
new Function('globalThis', src)(_fakeGlobal);
const {
  detectPlatform,
  isPlatformSupported,
  detectAITrainingContent,
  PLATFORM_IDS,
  _AI_KEYWORDS,
  _AI_KEYWORD_THRESHOLD,
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
    // Sanity: the v3.5.33 audience must never be gated out even if
    // their lesson body is unusually short / off-topic.
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

  test('only inspects first 500 chars of body to bound work', () => {
    // Keywords beyond char 500 should not count.
    const padding = 'x'.repeat(600);
    const doc = mockDocument({
      title: 'Random course',
      body: padding + 'claude anthropic mcp openai gemini', // pushed past 500
    });
    const v = detectAITrainingContent(doc, { hostname: 'tenant.skilljar.com' });
    expect(v.isAI).toBe(false);
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
});
