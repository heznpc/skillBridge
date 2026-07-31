/**
 * @jest-environment jsdom
 *
 * Unit tests for dom-safe.js `sanitizeChatHtml` — the allowlist that saved
 * conversations pass through on their way back to the screen
 * (chat-history.js renders `sanitizeHtml(... formatResponse(conv.answer) ...)`).
 *
 * The live streaming bubble assigns formatResponse output directly
 * (chat-message-dom.js), so the sanitizer is the ONLY place where a tag the
 * renderer emits can be silently dropped. `pre` is the case that matters:
 * the unknown-tag branch removes the element *and its subtree*, so a missing
 * `pre` entry does not degrade a code sample — it deletes it, and only in the
 * history view, which is exactly the kind of asymmetry nobody notices.
 */
/* global describe, test, expect, window */

require('../src/lib/dom-safe.js');
const { sanitizeChatHtml } = window._sbDomSafe || {};

describe('sanitizeChatHtml', () => {
  test('_sbDomSafe is loaded for this check', () => {
    expect(typeof sanitizeChatHtml).toBe('function');
  });

  test('passes a fenced code block through unchanged', () => {
    // Byte-for-byte what formatResponse emits for ```\nconst a = 1;\n```
    const rendered = '<pre><code>const a = 1;</code></pre>';
    expect(sanitizeChatHtml(rendered)).toBe(rendered);
  });

  test('keeps multi-line code intact', () => {
    const rendered = '<pre><code>def f():\n    return 1</code></pre>';
    expect(sanitizeChatHtml(rendered)).toBe(rendered);
  });

  test('keeps a full answer with prose, list and code in order', () => {
    const rendered =
      '<p>Try this:</p><ul><li>install</li></ul><pre><code>npm i</code></pre><p>Then <strong>reload</strong>.</p>';
    expect(sanitizeChatHtml(rendered)).toBe(rendered);
  });

  test('still removes a tag that is not on the allowlist, with its subtree', () => {
    const out = sanitizeChatHtml('<p>before</p><table><tr><td>cell</td></tr></table><p>after</p>');
    expect(out).not.toContain('<table');
    expect(out).not.toContain('cell');
    expect(out).toContain('<p>before</p>');
    expect(out).toContain('<p>after</p>');
  });

  test('strips event handlers and style inside a code block', () => {
    const out = sanitizeChatHtml('<pre onclick="steal()" style="position:fixed"><code>x</code></pre>');
    expect(out).toContain('<code>x</code>');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('style');
  });

  test('drops script even when nested inside allowed markup', () => {
    const out = sanitizeChatHtml('<p>hi<script>alert(1)</script></p>');
    expect(out).not.toContain('script');
    expect(out).toContain('hi');
  });
});
