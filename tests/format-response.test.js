/**
 * Unit tests for chat response formatting (markdown → HTML).
 * Extracts formatResponse and applyInline directly from sidebar-chat.js source.
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

// Normalize CRLF → LF so regex \n anchors work on Windows checkouts
// (core.autocrlf=true rewrites line endings on checkout).
const normalizeLF = (s) => s.replace(/\r\n/g, '\n');

// --- Extract escapeHtml from gemini-block.js (the canonical implementation) ---
const geminiBlockSrc = normalizeLF(fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'gemini-block.js'), 'utf8'));
const escapeHtmlBody = geminiBlockSrc.match(/function escapeHtml\(text\)\s*\{([\s\S]*?)\n {2}\}/);
const escapeHtml = new Function('text', escapeHtmlBody[1]);

// --- Extract formatResponse + applyInline from sidebar-chat.js ---
const sidebarSrc = normalizeLF(fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'sidebar-chat.js'), 'utf8'));
const fmtBlock = sidebarSrc.match(
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
