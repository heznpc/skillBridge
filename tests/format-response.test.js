/**
 * Unit tests for chat response formatting (markdown → HTML).
 * Extracts formatResponse and applyInline from chat-render.js (where the
 * functions live since the v3.5.13 sidebar-chat.js split). The test follows
 * the production code to its new home rather than re-implementing it, so
 * production bugs can't pass green.
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

// --- Extract escapeHtml from gemini-block.js (the canonical implementation) ---
const geminiBlockSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'gemini-block.js'), 'utf8');
const escapeHtmlBody = geminiBlockSrc.match(/function escapeHtml\(text\)\s*\{([\s\S]*?)\n {2}\}/);
const escapeHtml = new Function('text', escapeHtmlBody[1]);

// --- Extract formatResponse + applyInline from chat-render.js ---
const renderSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'chat-render.js'), 'utf8');
const fmtBlock = renderSrc.match(
  /function formatResponse\(text\)\s*\{[\s\S]*?\n {2}\}\n\n {2}function applyInline[\s\S]*?\n {2}\}/,
);
const { formatResponse, applyInline } = new Function('sb', `${fmtBlock[0]}\n  return { formatResponse, applyInline };`)(
  { escapeHtml },
);

describe('applyInline', () => {
  test('converts bold markdown', () => {
    expect(applyInline('this is **bold** text')).toBe('this is <strong>bold</strong> text');
  });

  test('converts italic markdown', () => {
    expect(applyInline('this is *italic* text')).toBe('this is <em>italic</em> text');
  });

  test('converts inline code', () => {
    expect(applyInline('use `console.log`')).toBe('use <code>console.log</code>');
  });

  test('handles multiple inline styles', () => {
    expect(applyInline('**bold** and *italic* and `code`')).toBe(
      '<strong>bold</strong> and <em>italic</em> and <code>code</code>',
    );
  });

  test('leaves plain text unchanged', () => {
    expect(applyInline('plain text')).toBe('plain text');
  });
});

describe('formatResponse', () => {
  test('wraps plain text in paragraph', () => {
    expect(formatResponse('Hello world')).toBe('<p>Hello world</p>');
  });

  test('converts headings', () => {
    expect(formatResponse('## My Heading')).toBe('<h3>My Heading</h3>');
  });

  test('converts unordered list', () => {
    const input = '- item one\n- item two\n- item three';
    const result = formatResponse(input);
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>item one</li>');
    expect(result).toContain('<li>item two</li>');
    expect(result).toContain('<li>item three</li>');
    expect(result).toContain('</ul>');
  });

  test('converts ordered list', () => {
    const input = '1. first\n2. second\n3. third';
    const result = formatResponse(input);
    expect(result).toContain('<ol>');
    expect(result).toContain('<li>first</li>');
    expect(result).toContain('<li>third</li>');
    expect(result).toContain('</ol>');
  });

  test('handles mixed content', () => {
    const input = '## Title\n\nSome text here.\n\n- bullet one\n- bullet two';
    const result = formatResponse(input);
    expect(result).toContain('<h3>Title</h3>');
    expect(result).toContain('<p>Some text here.</p>');
    expect(result).toContain('<ul>');
  });

  test('escapes HTML in input', () => {
    const result = formatResponse('<script>alert("xss")</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  test('applies inline formatting within paragraphs', () => {
    const result = formatResponse('Use **bold** here');
    expect(result).toContain('<strong>bold</strong>');
  });

  test('applies inline formatting in list items', () => {
    const result = formatResponse('- **bold** item\n- *italic* item');
    expect(result).toContain('<li><strong>bold</strong> item</li>');
    expect(result).toContain('<li><em>italic</em> item</li>');
  });

  test('converts ### headings to h3', () => {
    expect(formatResponse('### Sub Heading')).toBe('<h3>Sub Heading</h3>');
  });

  test('converts ordered list with ) delimiter', () => {
    const result = formatResponse('1) first\n2) second');
    expect(result).toContain('<ol>');
    expect(result).toContain('<li>first</li>');
    expect(result).toContain('<li>second</li>');
  });

  test('switches from unordered to ordered list', () => {
    const result = formatResponse('- bullet\n\n1. numbered');
    expect(result).toContain('<ul><li>bullet</li></ul>');
    expect(result).toContain('<ol><li>numbered</li></ol>');
  });

  test('handles empty input', () => {
    expect(formatResponse('')).toBe('');
  });

  test('handles multiple paragraphs separated by blank lines', () => {
    const input = 'First paragraph.\n\nSecond paragraph.';
    const result = formatResponse(input);
    expect(result).toBe('<p>First paragraph.</p><p>Second paragraph.</p>');
  });

  test('does not double-escape HTML entities in bold', () => {
    const result = formatResponse('**A & B**');
    expect(result).toBe('<p><strong>A &amp; B</strong></p>');
    expect(result).not.toContain('&amp;amp;');
  });

  test('does not double-escape HTML entities in italic', () => {
    const result = formatResponse('*x < y*');
    expect(result).toBe('<p><em>x &lt; y</em></p>');
    expect(result).not.toContain('&amp;lt;');
  });

  test('does not double-escape HTML entities in inline code', () => {
    const result = formatResponse('use `a<b && c>d`');
    expect(result).toContain('<code>a&lt;b &amp;&amp; c&gt;d</code>');
    expect(result).not.toContain('&amp;amp;');
  });

  test('does not double-escape quotes in bold', () => {
    const result = formatResponse('**say "hello"**');
    expect(result).toBe('<p><strong>say &quot;hello&quot;</strong></p>');
    expect(result).not.toContain('&amp;quot;');
  });
});

// ── Fenced code blocks ─────────────────────────────────────────
// The tutor answers questions about API / prompt-engineering courses, so
// ```-fenced code is its normal output, not an edge case. Before this was
// handled, three things went wrong at once: the block-normalization regexes
// injected newlines at `- ` / `1. ` inside source code, the fence markers
// survived into a <p>, and applyInline's `` `(.*?)` `` rule turned ```` ```python ````
// into an empty <code></code> plus a stray backtick.
describe('formatResponse — fenced code blocks', () => {
  test('renders a fenced block as pre > code', () => {
    const result = formatResponse('```\nconst a = 1;\n```');
    expect(result).toBe('<pre><code>const a = 1;</code></pre>');
  });

  test('drops the info string instead of rendering it or turning it into a class', () => {
    const result = formatResponse('```python\nprint("hi")\n```');
    expect(result).toBe('<pre><code>print(&quot;hi&quot;)</code></pre>');
    expect(result).not.toContain('python');
    expect(result).not.toContain('class=');
  });

  test('leaves `- ` inside code alone — no injected newline, no list', () => {
    const result = formatResponse('```\nrun --flag - value\n```');
    expect(result).toBe('<pre><code>run --flag - value</code></pre>');
    expect(result).not.toContain('<ul>');
    expect(result).not.toContain('<li>');
  });

  test('leaves an ordered-list-shaped code line alone', () => {
    const result = formatResponse('```\n1. not a list item\n```');
    expect(result).toBe('<pre><code>1. not a list item</code></pre>');
    expect(result).not.toContain('<ol>');
  });

  test('does not run inline markdown inside code', () => {
    const result = formatResponse('```\nweight = a * b * c\nname = **kwargs\n```');
    expect(result).toBe('<pre><code>weight = a * b * c\nname = **kwargs</code></pre>');
    expect(result).not.toContain('<em>');
    expect(result).not.toContain('<strong>');
  });

  test('does not leave a stray backtick or empty code element', () => {
    const result = formatResponse('```js\nlet x = 1;\n```');
    expect(result).not.toContain('`');
    expect(result).not.toContain('<code></code>');
  });

  test('preserves indentation and blank lines inside the block', () => {
    const result = formatResponse('```\ndef f():\n    return 1\n\ndef g():\n    return 2\n```');
    expect(result).toBe('<pre><code>def f():\n    return 1\n\ndef g():\n    return 2</code></pre>');
  });

  test('escapes HTML inside code without double-escaping', () => {
    const result = formatResponse('```\n<script>alert("x")</script>\n```');
    expect(result).toContain('&lt;script&gt;');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('&amp;lt;');
  });

  test('keeps surrounding prose and code in document order', () => {
    const result = formatResponse('Try this:\n\n```\nnpm i\n```\n\nThen reload.');
    expect(result).toBe('<p>Try this:</p><pre><code>npm i</code></pre><p>Then reload.</p>');
  });

  test('flushes an open list before the code block', () => {
    const result = formatResponse('- step one\n```\nnpm i\n```');
    expect(result).toBe('<ul><li>step one</li></ul><pre><code>npm i</code></pre>');
  });

  // chatStream calls formatResponse on the ACCUMULATED text after every chunk,
  // so a half-arrived block is the common case during streaming. It must render
  // as code, not leak the ``` marker into a paragraph.
  test('an unterminated fence still renders as code (mid-stream state)', () => {
    const result = formatResponse('Here:\n\n```python\nimport os');
    expect(result).toBe('<p>Here:</p><pre><code>import os</code></pre>');
    expect(result).not.toContain('`');
  });

  test('a fence that has only just opened renders an empty code area', () => {
    expect(formatResponse('```')).toBe('<pre><code></code></pre>');
  });

  test('handles two separate blocks', () => {
    const result = formatResponse('```\nfirst\n```\n\ntext\n\n```\nsecond\n```');
    expect(result).toBe('<pre><code>first</code></pre><p>text</p><pre><code>second</code></pre>');
  });

  test('indented fence markers are still recognized', () => {
    const result = formatResponse('  ```\n  code\n  ```');
    expect(result).toBe('<pre><code>  code</code></pre>');
  });

  test('inline code outside a fence is untouched', () => {
    const result = formatResponse('Call `init()` first.\n\n```\ninit()\n```');
    expect(result).toBe('<p>Call <code>init()</code> first.</p><pre><code>init()</code></pre>');
  });
});
