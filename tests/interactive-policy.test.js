/**
 * @jest-environment jsdom
 *
 * One definition of "interactive", and an integrity gate that can see it.
 *
 * Three parts of the translation pipeline need the same answer, and they gave
 * three: gt-queue's routing check and safeReplaceText's last-line guard each
 * held the same list as a separate literal, and html-gt's integrity gate held a
 * narrower one — `A` and `BUTTON`, matched by TAG NAME.
 *
 * The narrow one is where it bites. Academy builds its controls out of ARIA
 * roles on plain elements, because its framework generates roles and hashed
 * class names rather than semantic tags. `<div role="button">` is a control to
 * the routing check — so a block containing one is sent down the
 * structure-preserving path — and was NOT a control to the gate that path
 * relies on. Google Translate could drop it and the gate would pass. The safer
 * route was the unprotected one.
 *
 * These tests are against the real html-gt with the real shared definition
 * installed, so a regression to a tag-only gate fails here.
 */

/* global describe, test, expect, beforeEach */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

function loadLib(file) {
  const fake = { module: { exports: {} } };
  new Function('globalThis', read('src', 'lib', file))(fake);
  return fake.module.exports;
}
const interactive = loadLib('interactive.js');

/** html-gt, with the shared definition present — the shipped arrangement. */
function loadHtmlGt({ withSharedDefinition = true } = {}) {
  const fakeWindow = withSharedDefinition ? { _sbInteractive: interactive } : {};
  const holder = { module: { exports: {} } };
  new Function('window', 'globalThis', 'document', read('src', 'content', 'html-gt.js'))(fakeWindow, holder, document);
  return holder.module.exports;
}

/** Parse a markup string into a container element of `tagName`. */
function parse(html, tagName = 'P') {
  const el = document.createElement(tagName);
  el.innerHTML = html;
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('the shared definition', () => {
  test('recognises controls by tag', () => {
    for (const html of ['<a href="/x">x</a>', '<button>x</button>', '<summary>x</summary>']) {
      expect(interactive.isInteractiveElement(parse(html).firstElementChild)).toBe(true);
    }
  });

  test('recognises controls by ARIA role, which is how Academy builds them', () => {
    for (const role of ['button', 'link', 'radio', 'checkbox', 'option', 'tab', 'switch']) {
      const el = parse(`<div role="${role}">x</div>`).firstElementChild;
      expect(interactive.isInteractiveElement(el)).toBe(true);
    }
  });

  test('a role is matched case- and whitespace-insensitively', () => {
    expect(interactive.isInteractiveElement(parse('<div role=" Button ">x</div>').firstElementChild)).toBe(true);
  });

  test('an ordinary element is not a control', () => {
    for (const html of ['<span>x</span>', '<strong>x</strong>', '<div role="presentation">x</div>']) {
      expect(interactive.isInteractiveElement(parse(html).firstElementChild)).toBe(false);
    }
  });

  test('the selector and the predicate agree', () => {
    // A selector that drifted from the predicate would route one way and guard
    // another, which is the exact failure this file is about.
    const host = parse(
      '<a href="/a">a</a><button>b</button><summary>c</summary><div role="radio">d</div><span>e</span>',
    );
    const matched = new Set(host.querySelectorAll(interactive.INTERACTIVE_SELECTOR));
    for (const el of host.children) {
      expect(matched.has(el)).toBe(interactive.isInteractiveElement(el));
    }
  });

  test('identity separates a control from a wrapper that shares its tag', () => {
    // Two sibling <div>s are not interchangeable when one is a control; a key
    // that could not tell them apart would let reconciliation move the
    // wrapper's text into the control.
    const host = parse('<div role="button">press</div><div>just a wrapper</div>', 'DIV');
    const [control, wrapper] = host.children;
    expect(interactive.elementIdentity(control)).not.toBe(interactive.elementIdentity(wrapper));
  });

  test('identity still separates links by href', () => {
    const host = parse('<a href="/a">x</a><a href="/b">y</a>');
    const [a, b] = host.children;
    expect(interactive.elementIdentity(a)).not.toBe(interactive.elementIdentity(b));
  });
});

describe('the integrity gate protects ARIA controls', () => {
  const htmlGt = loadHtmlGt();

  test('a dropped role="button" fails the gate', () => {
    const original = parse('Press <div role="button" id="go">Go</div> to continue.');
    const translated = parse('계속하려면 누르세요.');
    expect(htmlGt.checkTagIntegrity(original, translated)).toBe(false);
  });

  test('a duplicated role="button" fails the gate', () => {
    const original = parse('Press <div role="button">Go</div>.');
    const translated = parse('<div role="button">이동</div><div role="button">이동</div> 누르세요.');
    expect(htmlGt.checkTagIntegrity(original, translated)).toBe(false);
  });

  test('a control whose role was rewritten fails the gate', () => {
    const original = parse('<div role="button">Go</div>');
    const translated = parse('<div role="link">이동</div>');
    expect(htmlGt.checkTagIntegrity(original, translated)).toBe(false);
  });

  test('a preserved control passes', () => {
    const original = parse('Press <div role="button">Go</div> to continue.');
    const translated = parse('계속하려면 <div role="button">이동</div>을 누르세요.');
    expect(htmlGt.checkTagIntegrity(original, translated)).toBe(true);
  });

  test('a plain <a> is still protected — nothing regressed', () => {
    const original = parse('Read <a href="/docs">the docs</a>.');
    expect(htmlGt.checkTagIntegrity(original, parse('문서를 읽으세요.'))).toBe(false);
    expect(htmlGt.checkTagIntegrity(original, parse('<a href="/docs">문서</a>를 읽으세요.'))).toBe(true);
  });

  test('a rewritten href still fails', () => {
    const original = parse('<a href="/docs">docs</a>');
    expect(htmlGt.checkTagIntegrity(original, parse('<a href="/evil">문서</a>'))).toBe(false);
  });

  test('WITHOUT the shared definition the gate is blind to the ARIA control', () => {
    // The pre-fix behaviour, pinned so the fallback is understood rather than
    // mistaken for equivalent. This is what shipped: gate passes, control lost.
    const tagOnly = loadHtmlGt({ withSharedDefinition: false });
    const original = parse('Press <div role="button">Go</div> to continue.');
    const translated = parse('계속하려면 누르세요.');
    expect(tagOnly.checkTagIntegrity(original, translated)).toBe(true);
  });
});

describe('reconciliation keeps the control node itself', () => {
  const htmlGt = loadHtmlGt();

  test('the original ARIA control element is moved, not cloned', () => {
    // Node identity is what keeps a framework's event listeners attached. A
    // shallow clone renders identically and does nothing when clicked.
    const original = parse('Press <div role="button" id="go">Go</div> to continue.');
    document.body.appendChild(original);
    const control = document.getElementById('go');

    const translated = parse('계속하려면 <div role="button" id="go">이동</div>을 누르세요.');
    expect(htmlGt.checkTagIntegrity(original, translated)).toBe(true);
    expect(htmlGt.reconcileHtml(original, translated)).toBe(true);

    expect(original.querySelector('[role="button"]')).toBe(control);
    expect(control.textContent).toBe('이동');
  });

  test('a link keeps its node and its href', () => {
    const original = parse('Read <a href="/docs" id="d">the docs</a>.');
    document.body.appendChild(original);
    const link = document.getElementById('d');
    const translated = parse('<a href="/docs" id="d">문서</a>를 읽으세요.');
    expect(htmlGt.reconcileHtml(original, translated)).toBe(true);
    expect(original.querySelector('a')).toBe(link);
    expect(link.getAttribute('href')).toBe('/docs');
  });
});
