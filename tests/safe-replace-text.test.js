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

  // INVARIANT: an interactive element's visible label is never blanked or
  // swallowed. A previous version of these tests asserted the flattening
  // behavior (link kept, label emptied) as correct — codifying the exact
  // breakage they should have caught.
  test('mixed block with an inline link is refused — label is never blanked', () => {
    const el = makeEl('<p>See <a href="https://x.test">the docs</a> now</p>');
    const applied = safeReplaceText(el, '지금 문서를 보세요');
    expect(applied).toBe(false);
    // Original stays fully intact: no empty anchor, no half-translated mix.
    expect(el.querySelector('a').textContent).toBe('the docs');
    expect(el.querySelector('a').getAttribute('href')).toBe('https://x.test');
    expect(el.textContent).not.toContain('지금 문서를 보세요');
  });

  test('leading link block is refused — label must not swallow the sentence', () => {
    const el = makeEl('<p><a href="/x">Read this</a> for background</p>');
    expect(safeReplaceText(el, '배경 설명은 이것을 읽으세요')).toBe(false);
    expect(el.querySelector('a').textContent).toBe('Read this');
  });

  test('link-only block still gets its label replaced', () => {
    const el = makeEl('<p><a href="/x">Read more</a></p>');
    expect(safeReplaceText(el, '더 읽기')).toBe(true);
    expect(el.querySelector('a').textContent).toBe('더 읽기');
    expect(el.querySelector('a').getAttribute('href')).toBe('/x');
  });

  test('button label is protected like a link', () => {
    const el = makeEl('<div>Press <button>Submit</button> to finish</div>');
    expect(safeReplaceText(el, '완료하려면 제출을 누르세요')).toBe(false);
    expect(el.querySelector('button').textContent).toBe('Submit');
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
