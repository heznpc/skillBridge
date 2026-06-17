/**
 * @jest-environment jsdom
 *
 * Security lock-in for `xmlToHtml` (the sanitizer that runs over every
 * Gemini-translated DOM fragment before innerHTML insertion) plus the
 * inline-tag detector. The sanitizer is the trust boundary between
 * Gemini's free-form text output and the live page — bugs here turn
 * into stored XSS on every translated lesson.
 *
 * Loaded via the same `new Function('window', src)` pattern as the
 * other tests, but under jest's jsdom environment so the production
 * code's DOMParser / document / Node references resolve to a real DOM.
 * `_xmlToHtml` is exposed on `_geminiBlock` specifically for this file.
 */

/* global describe, test, expect, beforeAll, jest */

const fs = require('fs');
const path = require('path');

const fakeWindow = {};
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'gemini-block.js'), 'utf8');
new Function('window', 'SKILLBRIDGE_MODELS', src)(fakeWindow, { GEMINI: 'gemini-test' });

const { _xmlToHtml: xmlToHtml, hasInlineTags, escapeHtml, queueGeminiBlockTranslation } = fakeWindow._geminiBlock;

// jsdom's document.baseURI defaults to about:blank — fine for our absolute
// URL checks (http: / https: / mailto: still get a parseable result).

describe('xmlToHtml — placeholder restoration', () => {
  test('restores <xN> wrap tags from tagInfo', () => {
    const tagInfo = { x1: { tag: 'strong', attrs: '' } };
    const out = xmlToHtml('hello <x1>world</x1>', tagInfo);
    expect(out).toBe('hello <strong>world</strong>');
  });

  test('restores <cN/> self-closing tags from tagInfo.original', () => {
    const tagInfo = { c1: { tag: 'code', original: '<code>npm install</code>' } };
    const out = xmlToHtml('use <c1/> first', tagInfo);
    expect(out).toBe('use <code>npm install</code> first');
  });

  test('drops unmatched placeholder tags rather than rendering them literally', () => {
    // Gemini occasionally drops a closing tag or invents a new <xN> id —
    // we must not let those leak through into the DOM.
    const out = xmlToHtml('hello <x7>world</x7> and <x9/>', {});
    expect(out).not.toMatch(/<x\d/);
    expect(out).toContain('hello');
    expect(out).toContain('world');
  });
});

describe('xmlToHtml — tag allowlist (SAFE_TAGS)', () => {
  test('strips the <script> element (its text body becomes a harmless text node)', () => {
    // The whole point: a Gemini refusal-prompt-injection that produces
    // `<script>alert(1)</script>` must not execute. The sanitizer's
    // contract is "drop the element, preserve child text nodes" — so
    // `alert(1)` survives as plain text (cannot execute) but the
    // `<script>` wrapper is gone.
    const out = xmlToHtml('<x1>hi</x1><script>alert(1)</script>', {
      x1: { tag: 'strong', attrs: '' },
    });
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/<\/script/i);
    // Sanity: the safe `<x1>` placeholder still resolved.
    expect(out).toContain('<strong>hi</strong>');
  });

  test('strips <iframe>', () => {
    const out = xmlToHtml('text <iframe src="https://evil.example">x</iframe>', {});
    expect(out).not.toContain('<iframe');
  });

  test('strips <img> (not in SAFE_TAGS — would enable tracking pixels)', () => {
    const out = xmlToHtml('<img src="https://tracker.example/p.gif">', {});
    expect(out).not.toContain('<img');
  });

  test('strips <object> / <embed>', () => {
    const out = xmlToHtml('<object data="x.swf"></object><embed src="x">', {});
    expect(out).not.toContain('<object');
    expect(out).not.toContain('<embed');
  });

  test('keeps the SAFE_TAGS inline set', () => {
    const tagInfo = {
      x1: { tag: 'strong', attrs: '' },
      x2: { tag: 'em', attrs: '' },
      x3: { tag: 'a', attrs: ' href="https://example.com"' },
    };
    const out = xmlToHtml('<x1>a</x1> <x2>b</x2> <x3>c</x3>', tagInfo);
    expect(out).toContain('<strong>a</strong>');
    expect(out).toContain('<em>b</em>');
    expect(out).toContain('<a');
  });
});

describe('xmlToHtml — attribute allowlist + on* strip', () => {
  test('strips on* event handlers from any tag', () => {
    // Gemini-output attribute injection: pre-sanitize input could carry
    // onclick / onmouseover and the per-tag allowlist must reject them.
    const out = xmlToHtml('<x1>click</x1>', {
      x1: { tag: 'strong', attrs: ' onclick="alert(1)" onmouseover="x()"' },
    });
    expect(out).not.toMatch(/onclick|onmouseover/);
  });

  test('strips formaction / srcdoc / is= on <a> (not in per-tag allowlist)', () => {
    // The v3.5.11 switch from blocklist → per-tag allowlist exists to kill
    // exactly this class of attribute carry-over.
    const out = xmlToHtml('<x1>link</x1>', {
      x1: { tag: 'a', attrs: ' href="https://example.com" formaction="https://evil" srcdoc="x" is="x-elem"' },
    });
    expect(out).not.toMatch(/formaction|srcdoc|\bis=/);
    expect(out).toContain('href="https://example.com');
  });

  test('keeps href / title / target on <a>', () => {
    const out = xmlToHtml('<x1>link</x1>', {
      x1: { tag: 'a', attrs: ' href="https://example.com" title="hi" target="_self"' },
    });
    expect(out).toMatch(/href="https:\/\/example\.com/);
    expect(out).toContain('title="hi"');
    expect(out).toContain('target="_self"');
  });

  test('keeps datetime on <time> via per-tag allowlist', () => {
    // <time> isn't in SAFE_TAGS, so this confirms unsafe-tag stripping fires
    // before the allowlist matters.
    const out = xmlToHtml('<time datetime="2026-05-13">May 13</time>', {});
    expect(out).not.toContain('<time');
    expect(out).toContain('May 13');
  });
});

describe('xmlToHtml — javascript: / data: URL rejection on <a href>', () => {
  test('rejects javascript: href', () => {
    const out = xmlToHtml('<x1>x</x1>', {
      x1: { tag: 'a', attrs: ' href="javascript:alert(1)"' },
    });
    expect(out).not.toMatch(/javascript:/i);
  });

  test('rejects javascript: with mixed case + tabs (control char strip)', () => {
    // The sanitizer strips ASCII control chars before protocol check.
    // `\tjavascript:` and `JaVaScRiPt:` should both be rejected.
    const out1 = xmlToHtml('<x1>x</x1>', {
      x1: { tag: 'a', attrs: ' href="\tjavascript:alert(1)"' },
    });
    const out2 = xmlToHtml('<x1>x</x1>', {
      x1: { tag: 'a', attrs: ' href="JaVaScRiPt:alert(1)"' },
    });
    expect(out1).not.toMatch(/javascript:/i);
    expect(out2).not.toMatch(/javascript:/i);
  });

  test('rejects data: href (image-style data URLs in <a> can be exfil vectors)', () => {
    const out = xmlToHtml('<x1>x</x1>', {
      x1: { tag: 'a', attrs: ' href="data:text/html,<script>alert(1)</script>"' },
    });
    expect(out).not.toMatch(/data:/);
  });

  test('preserves fragment-only href ("#section")', () => {
    const out = xmlToHtml('<x1>x</x1>', {
      x1: { tag: 'a', attrs: ' href="#section-1"' },
    });
    expect(out).toContain('href="#section-1"');
  });

  test('preserves https:// href', () => {
    const out = xmlToHtml('<x1>x</x1>', {
      x1: { tag: 'a', attrs: ' href="https://docs.anthropic.com/foo"' },
    });
    expect(out).toMatch(/href="https:\/\/docs\.anthropic\.com\/foo/);
  });
});

describe('xmlToHtml — reverse tabnabbing (target=_blank → rel=noopener noreferrer)', () => {
  test('adds rel="noopener noreferrer" when target="_blank" is present', () => {
    // Without this an attacker-controlled link could use window.opener
    // to navigate the lesson page. v3.5.11 added the forced rel.
    const out = xmlToHtml('<x1>link</x1>', {
      x1: { tag: 'a', attrs: ' href="https://example.com" target="_blank"' },
    });
    expect(out).toMatch(/rel="noopener noreferrer"/);
  });

  test('does NOT add rel on target="_self"', () => {
    const out = xmlToHtml('<x1>link</x1>', {
      x1: { tag: 'a', attrs: ' href="https://example.com" target="_self"' },
    });
    expect(out).not.toMatch(/rel=/);
  });
});

describe('hasInlineTags', () => {
  test('returns true when element has mixed text + inline children', () => {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode('hello '));
    const strong = document.createElement('strong');
    strong.textContent = 'world';
    div.appendChild(strong);
    expect(hasInlineTags(div)).toBe(true);
  });

  test('returns false for pure-text element', () => {
    const div = document.createElement('div');
    div.textContent = 'just text';
    expect(hasInlineTags(div)).toBe(false);
  });

  test('returns false for element with only inline children (no text node)', () => {
    // Block-translation path is meant for *mixed* content; pure-children
    // elements are handled by the per-element static/GT path instead.
    const div = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = 'only';
    div.appendChild(strong);
    expect(hasInlineTags(div)).toBe(false);
  });

  test('returns false for empty element', () => {
    const div = document.createElement('div');
    expect(hasInlineTags(div)).toBe(false);
  });
});

describe('queueGeminiBlockTranslation — protected terms', () => {
  test('restores protected terms before writing Gemini block HTML', async () => {
    fakeWindow._protectedTerms = {
      getKeepEnglishTerms: () => 'Claude, Anthropic',
      restoreProtectedTerms: (text) => text.replaceAll('클로드', 'Claude'),
    };

    const el = document.createElement('p');
    el.innerHTML = 'Use <strong>Claude</strong> in protected examples.';
    document.body.appendChild(el);

    const translator = {
      supportedLanguages: { ko: 'Korean' },
      _sendRequest: jest.fn().mockResolvedValue('보호된 예시에서 <x1>클로드</x1>를 사용하세요.'),
      _cacheTranslation: jest.fn(),
    };

    queueGeminiBlockTranslation(el, 'ko', {
      translator,
      originalTexts: new Map(),
      isLikelyEnglish: () => true,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(el.innerHTML).toContain('<strong>Claude</strong>');
    expect(el.innerHTML).not.toContain('클로드');
    expect(translator._cacheTranslation).toHaveBeenCalledWith(
      'Use Claude in protected examples.',
      '보호된 예시에서 Claude를 사용하세요.',
      'ko',
    );
  });
});

describe('escapeHtml (direct, complementing tests/content-helpers.test.js)', () => {
  beforeAll(() => {
    // The companion test in content-helpers covers ampersands/quotes; we add
    // the cases that matter for sanitizer-adjacent edge inputs.
  });

  test('does not double-escape an already-escaped string', () => {
    // Idempotence under double-encoding is what lets the sanitizer be
    // composed with the static-translation path without surprise.
    expect(escapeHtml(escapeHtml('a & b'))).toBe('a &amp;amp; b');
  });

  test('coerces undefined to empty string', () => {
    expect(escapeHtml(undefined)).toBe('');
  });
});
