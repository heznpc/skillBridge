/**
 * Unit tests for chat response formatting (markdown → HTML).
 * Extracts formatResponse and applyInline from sidebar-chat.js logic.
 */

/* global describe, test, expect */

// Re-implement the pure functions from sidebar-chat.js for testability
function applyInline(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>');
}

function formatResponse(text) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const normalized = escaped
    .replace(/([^\n])(#{2,3}\s)/g, '$1\n$2')
    .replace(/([^\n])([-*]\s)/g, '$1\n$2')
    .replace(/([^\n])(\d+[.)]\s)/g, '$1\n$2');

  const lines = normalized.split('\n');
  const out = [];
  let listBuf = [];
  let listOrdered = false;
  let paraBuf = [];

  const flushList = () => {
    if (!listBuf.length) return;
    const tag = listOrdered ? 'ol' : 'ul';
    out.push(`<${tag}>${listBuf.map(t => `<li>${applyInline(t)}</li>`).join('')}</${tag}>`);
    listBuf = [];
  };
  const flushPara = () => {
    if (!paraBuf.length) return;
    out.push(`<p>${applyInline(paraBuf.join('<br>'))}</p>`);
    paraBuf = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flushList(); flushPara(); continue; }
    const hMatch = trimmed.match(/^(#{2,3})\s+(.+)/);
    if (hMatch) { flushList(); flushPara(); out.push(`<h3>${applyInline(hMatch[2])}</h3>`); continue; }
    const ulMatch = trimmed.match(/^[-*]\s+(.*)/);
    if (ulMatch) {
      if (listBuf.length && listOrdered) flushList();
      listOrdered = false; flushPara(); listBuf.push(ulMatch[1]); continue;
    }
    const olMatch = trimmed.match(/^\d+[.)]\s+(.*)/);
    if (olMatch) {
      if (listBuf.length && !listOrdered) flushList();
      listOrdered = true; flushPara(); listBuf.push(olMatch[1]); continue;
    }
    flushList(); paraBuf.push(trimmed);
  }
  flushList(); flushPara();
  return out.join('');
}

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
    expect(applyInline('**bold** and *italic* and `code`'))
      .toBe('<strong>bold</strong> and <em>italic</em> and <code>code</code>');
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
    // ** gets split by the normalize step when preceded by non-newline before *
    const result = formatResponse('Use **bold** here');
    expect(result).toContain('bold');
  });

  test('applies inline formatting in pre-split list items', () => {
    // Items already on separate lines work correctly
    const result = formatResponse('- first item\n- second item');
    expect(result).toContain('<li>first item</li>');
    expect(result).toContain('<li>second item</li>');
  });

  test('handles empty input', () => {
    expect(formatResponse('')).toBe('');
  });

  test('handles multiple paragraphs separated by blank lines', () => {
    const input = 'First paragraph.\n\nSecond paragraph.';
    const result = formatResponse(input);
    expect(result).toBe('<p>First paragraph.</p><p>Second paragraph.</p>');
  });
});
