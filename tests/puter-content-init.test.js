/**
 * The environment the Puter SDK is given before it evaluates.
 *
 * These pin a defect that live validation found and no automated test could:
 * a content script's ISOLATED world has NO custom-element registry —
 * `customElements` is null there while `HTMLElement` is still a function. The
 * SDK registers a `puter-dialog` element guarded only on the prototype:
 *
 *     cn.__proto__ === globalThis.HTMLElement && customElements.define(…)
 *
 * so the guard passed, the call threw, and the rest of the SDK's init IIFE —
 * including its auth-state wiring — never ran. The Tutor answered "Sorry, an
 * error occurred" with nothing on the wire, on every supported host. The E2E
 * suite stubs the transport and never evaluates the real SDK, so it stayed
 * green throughout.
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'bridge', 'puter-content-init.js'), 'utf8');

/**
 * Evaluate the init script against a stand-in for the isolated world.
 *
 * `customElements: null` is the real shape Chrome hands a content script, not
 * an invented one — a probe extension reported exactly that alongside a
 * working HTMLElement.
 */
function runInit({ customElements = null } = {}) {
  const globalThisStub = {
    customElements,
    HTMLElement: function HTMLElement() {},
    location: { search: '' },
    localStorage: {
      length: 0,
      key: () => null,
      removeItem: () => {},
      getItem: () => null,
      setItem: () => {},
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  new Function('globalThis', SRC)(globalThisStub);
  return globalThisStub;
}

describe('the isolated world the Puter SDK evaluates in', () => {
  test('a null customElements is replaced with a usable registry', () => {
    const world = runInit({ customElements: null });
    expect(world.customElements).not.toBeNull();
    expect(typeof world.customElements.define).toBe('function');
  });

  test('the SDK registration that used to throw now succeeds', () => {
    // The exact shape of the SDK line, reduced to its two moving parts.
    const world = runInit({ customElements: null });
    class PuterDialog extends world.HTMLElement {}
    Object.setPrototypeOf(PuterDialog, world.HTMLElement);
    expect(PuterDialog.__proto__ === world.HTMLElement).toBe(true);
    expect(() => world.customElements.define('puter-dialog', PuterDialog)).not.toThrow();
    expect(world.customElements.get('puter-dialog')).toBe(PuterDialog);
  });

  test('the registry answers the rest of the standard surface', () => {
    // A shim that only has define() would throw somewhere else instead.
    const world = runInit({ customElements: null });
    class Thing {}
    world.customElements.define('a-thing', Thing);
    expect(world.customElements.getName(Thing)).toBe('a-thing');
    expect(world.customElements.get('missing')).toBeUndefined();
    expect(() => world.customElements.upgrade({})).not.toThrow();
    return expect(world.customElements.whenDefined('a-thing')).resolves.toBe(Thing);
  });

  test('a real registry is left alone', () => {
    // In any world that HAS one, the page's registry must keep working; the
    // shim is a fallback, not a replacement.
    const real = { define: () => {}, get: () => undefined, native: true };
    const world = runInit({ customElements: real });
    expect(world.customElements).toBe(real);
  });

  test('the shim is installed before the storage facade, so an early throw cannot skip it', () => {
    // Ordering matters: everything after the first throw in this IIFE is lost,
    // which is how one failed registration disabled the whole transport.
    const ceIndex = SRC.indexOf("'customElements'");
    const storageIndex = SRC.indexOf("'localStorage'");
    expect(ceIndex).toBeGreaterThan(-1);
    expect(storageIndex).toBeGreaterThan(-1);
    expect(ceIndex).toBeLessThan(storageIndex);
  });
});
