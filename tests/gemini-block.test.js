/**
 * @jest-environment jsdom
 *
 * Inline-tag detection and canonical HTML escaping helpers.
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

const fakeWindow = {};
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'gemini-block.js'), 'utf8');
new Function('window', src)(fakeWindow);

const { hasInlineTags, escapeHtml } = fakeWindow._geminiBlock;

describe('hasInlineTags', () => {
  test('returns true when element has mixed text and inline children', () => {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode('hello '));
    const strong = document.createElement('strong');
    strong.textContent = 'world';
    div.appendChild(strong);
    expect(hasInlineTags(div)).toBe(true);
  });

  test('returns false for pure-text content', () => {
    const div = document.createElement('div');
    div.textContent = 'just text';
    expect(hasInlineTags(div)).toBe(false);
  });

  test('returns false when there is no direct text node', () => {
    const div = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = 'only';
    div.appendChild(strong);
    expect(hasInlineTags(div)).toBe(false);
  });

  test('returns false for empty content', () => {
    expect(hasInlineTags(document.createElement('div'))).toBe(false);
  });
});

describe('escapeHtml', () => {
  test('escapes HTML-special characters', () => {
    expect(escapeHtml(`<script data-x="a&b">it's unsafe</script>`)).toBe(
      '&lt;script data-x=&quot;a&amp;b&quot;&gt;it&#39;s unsafe&lt;/script&gt;',
    );
  });

  test('coerces nullish values to an empty string', () => {
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(null)).toBe('');
  });
});
