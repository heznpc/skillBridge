/**
 * @jest-environment jsdom
 *
 * SkillBridge — popup accessibility static checks.
 *
 * The popup's language `<select>` is populated and labelled at runtime by
 * popup.js, but the label↔control association is structural: without
 * `for="lang-select"` on the label, a screen reader never ties the label text
 * to the select, so the control announces with no accessible name. This is a
 * one-attribute invariant that's easy to drop, so we pin it from the static
 * markup.
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

const POPUP_HTML = fs.readFileSync(path.join(__dirname, '..', 'src', 'popup', 'popup.html'), 'utf8');
const POPUP_JS = fs.readFileSync(path.join(__dirname, '..', 'src', 'popup', 'popup.js'), 'utf8');

describe('popup.html accessibility', () => {
  /** @returns {Document} */
  function parse() {
    return new DOMParser().parseFromString(POPUP_HTML, 'text/html');
  }

  test('language select has a label associated via for=', () => {
    const doc = parse();
    const select = doc.getElementById('lang-select');
    // expected a #lang-select control
    expect(select).toBeTruthy();
    expect(select.tagName.toLowerCase()).toBe('select');

    // A <label for="lang-select"> must associate the label with the select.
    const label = doc.querySelector('label[for="lang-select"]');
    expect(label).toBeTruthy();
    // The associating label is the one carrying the language-picker text.
    expect(label.id).toBe('lang-label');
  });
});

describe('popup supported page gate', () => {
  const helperStart = POPUP_JS.indexOf('function isSkilljarHost');
  const helperEnd = POPUP_JS.indexOf('\n\ndocument.addEventListener', helperStart);
  if (helperStart === -1 || helperEnd === -1) {
    throw new Error('Could not extract popup supported-page helpers');
  }
  const { isSupportedPage } = new Function(`${POPUP_JS.slice(helperStart, helperEnd)}\nreturn { isSupportedPage };`)();

  test('supports Anthropic Skilljar course pages', () => {
    expect(isSupportedPage('https://anthropic.skilljar.com/claude-101')).toBe(true);
  });

  test('supports Claude tutorial pages', () => {
    expect(isSupportedPage('https://claude.com/resources/tutorials/build-with-claude')).toBe(true);
  });

  test('rejects lookalike Skilljar hostnames', () => {
    expect(isSupportedPage('https://skilljar.com.attacker.example/claude-101')).toBe(false);
  });
});
