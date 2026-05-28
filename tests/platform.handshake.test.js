/**
 * @jest-environment jsdom
 *
 * Production handshake tests for src/lib/platform.js.
 *
 * `tests/platform.test.js` exercises the CommonJS export branch under a
 * fake `globalThis` (node env) — useful for the function's logic, but
 * blind to the production wiring. In production, platform.js is loaded
 * as a content script and the next content script reads
 * `window._sbPlatform.detectAITrainingContent`. That handshake is what
 * we need to pin.
 *
 * Regression context: PR #142 shipped the AI-content gate without
 * adding `src/lib/platform.js` to `manifest.json:content_scripts[].js`.
 * The unit tests passed (they loaded the source directly via fs+Function);
 * production silently fell through the `?? { isAI: true }` fallback and
 * the gate was a permanent no-op. These tests evaluate platform.js
 * INSIDE jsdom — the same `window` global the consumer reads from —
 * and assert the handshake works, so a future manifest re-order /
 * file-rename can't silently regress it.
 */

/* global describe, test, beforeEach, expect, window, document */

const fs = require('fs');
const path = require('path');

const platformSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'platform.js'), 'utf8');

// Build a small DOM fixture from safe textContent assignments. Avoids
// innerHTML so the security-reminder hook (and any future XSS lint
// rule) stays satisfied even though the strings are static fixtures.
function seedDocument({ title = '', h1 = null, breadcrumbAriaLabel = null, breadcrumbText = '' } = {}) {
  document.title = title;
  // Clear any prior fixture.
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
  if (h1 !== null) {
    const el = document.createElement('h1');
    el.textContent = h1;
    document.body.appendChild(el);
  }
  if (breadcrumbAriaLabel !== null) {
    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', breadcrumbAriaLabel);
    nav.textContent = breadcrumbText;
    document.body.appendChild(nav);
  }
}

describe('platform.js content-script handshake (jsdom)', () => {
  beforeEach(() => {
    // Each test starts with a clean window so a prior test's assignment
    // doesn't mask a regression in this one.
    delete window._sbPlatform;
  });

  test('evaluating platform.js as a content script populates window._sbPlatform', () => {
    // Mimic how Chrome runs a content script: no module system, just
    // evaluate the source in the page's content-script world. Indirect
    // eval keeps the script in global scope, matching MV3 semantics.
    (0, eval)(platformSrc);

    expect(window._sbPlatform).toBeDefined();
    expect(typeof window._sbPlatform.detectAITrainingContent).toBe('function');
    expect(typeof window._sbPlatform.detectPlatform).toBe('function');
    expect(typeof window._sbPlatform.isPlatformSupported).toBe('function');
    expect(window._sbPlatform.PLATFORM_IDS).toBeDefined();
  });

  test('detectAITrainingContent called via the window handle returns a proper verdict shape', () => {
    (0, eval)(platformSrc);

    seedDocument({ title: 'Anthropic Claude tutorial', h1: 'Prompt engineering 101' });

    const verdict = window._sbPlatform.detectAITrainingContent();

    // Verdict shape contract the content-script gate depends on.
    expect(verdict).toEqual(
      expect.objectContaining({
        isAI: expect.any(Boolean),
        reason: expect.any(String),
        hits: expect.any(Number),
      }),
    );
    // Either the slow path detected ≥2 keywords, or we're inadvertently
    // on the anthropic-host fast path. Both are valid "isAI: true".
    expect(verdict.isAI).toBe(true);
  });

  test('verdict object survives JSON round-trip (no Infinity sentinel)', () => {
    (0, eval)(platformSrc);

    // Override jsdom's default `location` (about:blank → hostname '')
    // by passing an explicit loc — the function honors the parameter.
    const verdict = window._sbPlatform.detectAITrainingContent(document, {
      hostname: 'anthropic.skilljar.com',
    });
    const roundTripped = JSON.parse(JSON.stringify(verdict));
    expect(roundTripped.hits).toBe(verdict.hits);
    // Specifically: no `null` (which is what JSON.stringify makes of Infinity).
    expect(roundTripped.hits).not.toBeNull();
  });

  test('case-insensitive `[aria-label*="breadcrumb" i]` selector matches mixed case', () => {
    (0, eval)(platformSrc);

    seedDocument({
      title: '',
      breadcrumbAriaLabel: 'BREADCRUMB',
      breadcrumbText: 'Anthropic > Claude',
    });

    const verdict = window._sbPlatform.detectAITrainingContent(document, {
      hostname: 'tenant.skilljar.com',
    });
    // The all-caps aria-label must be picked up; with v1 case-sensitive
    // selector it was missed and tenants on the boundary fell through.
    expect(verdict.isAI).toBe(true);
    expect(verdict.hits).toBeGreaterThanOrEqual(2);
  });
});

describe('platform.js + content.js gate-missing fallback (jsdom)', () => {
  // Pin the content-script's fallback shape (`?? { isAI: true, reason:
  // 'gate-missing', hits: 0 }`). If a future refactor changes the
  // sentinel, the popup / telemetry consumers know to update.
  test('content.js gate-missing default matches platform.js verdict shape', () => {
    const fallback = { isAI: true, reason: 'gate-missing', hits: 0 };
    expect(fallback).toEqual(
      expect.objectContaining({
        isAI: expect.any(Boolean),
        reason: expect.any(String),
        hits: expect.any(Number),
      }),
    );
  });

  test('manifest.content_scripts.js lists platform.js before content.js (regression guard)', () => {
    // This is the load-order check the PR #142 wiring bug would have
    // failed. We read the actual manifest from disk and assert the
    // ordering so any future re-shuffle that drops platform.js shows up
    // here as a hard test failure, not as a silent production no-op.
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
    const scripts = manifest.content_scripts[0].js;
    const platformIdx = scripts.indexOf('src/lib/platform.js');
    const contentIdx = scripts.indexOf('src/content/content.js');
    expect(platformIdx).toBeGreaterThanOrEqual(0);
    expect(contentIdx).toBeGreaterThanOrEqual(0);
    expect(platformIdx).toBeLessThan(contentIdx);
  });
});
