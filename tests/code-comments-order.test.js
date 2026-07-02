/**
 * @jest-environment jsdom
 *
 * Regression for src/content/code-comments.js splice ordering.
 *
 * `_translateOneCodeBlock` collects comment matches line-matches-first, then
 * block-matches — NOT in source order — and then rewrites innerHTML in place.
 * For the JS/C-family pattern (the only one with BOTH a line and a block regex),
 * a block comment that appears BEFORE a line comment used to be spliced first,
 * shifting every later match.index and corrupting the code the learner reads and
 * copies. The fix sorts the pending splices by descending match.index. This test
 * drives the real IIFE end-to-end via `sb.translateCodeComments` and asserts the
 * code survives intact.
 */

/* global describe, test, expect, beforeEach, window, document, global */

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'code-comments.js'), 'utf8');

// The real production JS/C-family pattern (constants.js CODE_COMMENT_PATTERNS).
const CODE_COMMENT_PATTERNS = [
  { line: /\/\/\s*(.+)$/gm, block: /\/\*\s*([\s\S]*?)\s*\*\//g },
  { line: /#\s*(.+)$/gm, block: null },
  { line: null, block: /<!--\s*([\s\S]*?)\s*-->/g },
];

describe('code-comments splice ordering (block comment before line comment)', () => {
  // Deterministic stub translations, both a DIFFERENT length than their source
  // so any stale-index splice would visibly clobber the surrounding code.
  const TRANSLATIONS = {
    'Alpha block comment': '블록',
    'Beta line comment': '라인',
    'See https://example.com docs': 'URL블록',
  };

  beforeEach(() => {
    global.CODE_COMMENT_PATTERNS = CODE_COMMENT_PATTERNS;

    window._protectedTerms = {
      buildProtectedTermsMap: () => {},
      restoreProtectedTerms: (t) => t,
    };

    window._sb = {
      originalComments: new Map(),
      translationScope: null,
      isLikelyEnglish: () => true,
      escapeHtml: (s) =>
        String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
      translator: {
        translate: async (text) => {
          const t = TRANSLATIONS[text.trim()];
          return t ? { text: t, source: 'gt' } : { text, source: 'original' };
        },
      },
    };

    document.body.innerHTML = '<pre><code class="language-js"></code></pre>';
    // Block comment at source index 0, line comment later — the corrupting order.
    document.querySelector('code').textContent = '/* Alpha block comment */\ndoStuff(); // Beta line comment';

    (0, eval)(src);
  });

  test('translates both comments and leaves the code (doStuff();) intact', async () => {
    await window._sb.translateCodeComments('ko');

    const html = document.querySelector('code').innerHTML;

    // Both comments translated, delimiters preserved...
    expect(html).toContain('/* 블록 */');
    expect(html).toContain('// 라인');
    // ...the executable code is untouched (the pre-fix bug spliced the line
    // comment at a stale offset and clobbered this token)...
    expect(html).toContain('doStuff();');
    // ...and no English comment text leaked through.
    expect(html).not.toContain('Alpha block comment');
    expect(html).not.toContain('Beta line comment');
    // Exact shape — the one correct result.
    expect(html).toBe('/* 블록 */\ndoStuff(); // 라인');
  });

  test('a URL (//) inside a block comment does not corrupt the code that follows', async () => {
    // The `//` in `https://` makes the line regex spuriously match INSIDE the
    // block comment, producing overlapping line+block matches. Splicing both
    // (even sorted) would clobber the code; the overlap filter must drop the
    // inner match and translate only the block, leaving `run();` intact.
    document.querySelector('code').textContent = '/* See https://example.com docs */\nrun();';

    await window._sb.translateCodeComments('ko');

    const html = document.querySelector('code').innerHTML;
    expect(html).toBe('/* URL블록 */\nrun();');
    expect(html).toContain('run();');
    // No stray delimiters / duplicated fragments from an overlapping splice.
    expect(html).not.toContain('*/*/');
    expect(html).not.toMatch(/\*\/\)/);
  });
});
