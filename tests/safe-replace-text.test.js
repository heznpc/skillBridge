/**
 * @jest-environment jsdom
 *
 * Unit tests for `safeReplaceText` (content.js) — the function that writes a
 * translated string back into a DOM element. Extracted via regex from the
 * IIFE source so production code stays the source of truth (same pattern as
 * gt-queue / content-helpers tests). `safeReplaceText` depends on
 * `getTextNodes`, so both are pulled in together.
 *
 * Regression focus: a block with a bold/linked lead-in such as
 * `<p><strong>Estimated time:</strong> 15 minutes</p>` used to render the
 * English original AND its translation side by side ("Estimated time:예상
 * 시간: 15분"), because only the trailing direct text node was rewritten and
 * the <strong> text was left untouched.
 */

/* global describe, test, expect, beforeEach */

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'content.js'), 'utf8');

const getTextNodesSrc = src.match(/function getTextNodes\(element\)\s*\{[\s\S]*?\n {2}\}/);
const safeReplaceSrc = src.match(/function safeReplaceText\(el, newText\)\s*\{[\s\S]*?\n {2}\}/);

if (!getTextNodesSrc || !safeReplaceSrc) {
  throw new Error('Could not extract safeReplaceText / getTextNodes from content.js — did the source shape change?');
}

// Established repo pattern for testing IIFE-internal functions against the
// real source (see gt-queue.test.js / content-helpers.test.js).
const safeReplaceText = new Function(`${getTextNodesSrc[0]}\n${safeReplaceSrc[0]}\nreturn safeReplaceText;`)();

function makeEl(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  return wrap.firstElementChild;
}

describe('safeReplaceText', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('leaf element with no children -> full replace', () => {
    const el = makeEl('<p>Hello world</p>');
    safeReplaceText(el, '안녕하세요');
    expect(el.textContent).toBe('안녕하세요');
  });

  test('bold lead-in does NOT duplicate (the reported bug)', () => {
    const el = makeEl('<p><strong>Estimated time:</strong> 15 minutes</p>');
    safeReplaceText(el, '예상 시간: 15분');
    expect(el.textContent).toBe('예상 시간: 15분');
    expect(el.textContent).not.toMatch(/Estimated time/);
    expect(el.querySelector('strong')).not.toBeNull();
  });

  test('inline link is preserved and not duplicated', () => {
    const el = makeEl('<p>See <a href="https://x.test">the docs</a> now</p>');
    safeReplaceText(el, '지금 문서를 보세요');
    expect(el.textContent.replace(/\s+/g, ' ').trim()).toBe('지금 문서를 보세요');
    const link = el.querySelector('a');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('https://x.test');
  });

  test('multiple inline children collapse to a single translation', () => {
    const el = makeEl('<p><b>A</b> middle <em>B</em> end</p>');
    safeReplaceText(el, '번역된 문장');
    expect(el.textContent.replace(/\s+/g, '')).toBe('번역된문장');
  });

  test('text inside <code> is left intact (never translated)', () => {
    const el = makeEl('<p>Run <code>npm test</code> to verify</p>');
    safeReplaceText(el, '확인하려면 실행하세요');
    expect(el.querySelector('code').textContent).toBe('npm test');
    expect(el.textContent).toContain('확인하려면 실행하세요');
    expect(el.textContent).toContain('npm test');
    expect(el.textContent).not.toMatch(/Run|to verify/);
  });
});
