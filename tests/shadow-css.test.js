/**
 * Unit tests for the shadow stylesheet transform.
 *
 * Loads the real src/content/shadow-css.js IIFE (so production-code bugs can't
 * hide behind a re-implementation) and exercises transformForShadow, including
 * a completeness pass over the real content CSS partials.
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

const fakeWindow = {};
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'shadow-css.js'), 'utf8');
// Only `window` is touched at load time; fetch/chrome/CSSStyleSheet are
// referenced lazily inside loadShadowSheet (never called here).
new Function('window', src)(fakeWindow);
const { transformForShadow } = fakeWindow._sbShadowCss;

function readManifestContentCss() {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  return manifest.content_scripts[0].css
    .map((file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8'))
    .join('\n\n');
}

describe('shadow-css transformForShadow', () => {
  test('rewrites html.si18n-dark descendant selectors to :host(.si18n-dark)', () => {
    expect(transformForShadow('html.si18n-dark #skillbridge-fab { color: red; }')).toBe(
      ':host(.si18n-dark) #skillbridge-fab { color: red; }',
    );
  });

  test('rewrites the RTL :is() language prefix', () => {
    expect(transformForShadow('body:is(.si18n-lang-ar, .si18n-lang-he) #x { left: 0; }')).toBe(
      ':host(:is(.si18n-lang-ar, .si18n-lang-he)) #x { left: 0; }',
    );
  });

  test('rewrites a single language prefix, including hyphenated codes', () => {
    expect(transformForShadow('body.si18n-lang-ko .a {}')).toBe(':host(.si18n-lang-ko) .a {}');
    expect(transformForShadow('body.si18n-lang-zh-CN .a {}')).toBe(':host(.si18n-lang-zh-CN) .a {}');
  });

  test('transforms every occurrence in a comma-separated group', () => {
    expect(transformForShadow('html.si18n-dark #a,\nhtml.si18n-dark #b {}')).toBe(
      ':host(.si18n-dark) #a,\n:host(.si18n-dark) #b {}',
    );
  });

  test('leaves non-boundary selectors untouched (incl. the .si18n-dark-toggle-btn class)', () => {
    const css = '#skillbridge-fab { color: var(--si18n-accent); }\n.si18n-dark-toggle-btn svg { width: 16px; }';
    expect(transformForShadow(css)).toBe(css);
  });

  test('does not mangle a longer html.si18n-dark-xxx token (lookahead guard)', () => {
    expect(transformForShadow('html.si18n-dark-mode #x {}')).toBe('html.si18n-dark-mode #x {}');
  });

  test('non-string input returns empty string', () => {
    expect(transformForShadow(null)).toBe('');
    expect(transformForShadow(undefined)).toBe('');
  });

  test('real content CSS: no ancestor theme prefix survives, and :host forms appear', () => {
    const css = readManifestContentCss();
    const out = transformForShadow(css);
    // Every boundary-crossing selector must be rewritten — a leftover would
    // silently no-op inside the shadow root (dark/RTL theming would break).
    expect(out).not.toMatch(/html\.si18n-dark(?![\w-])/);
    expect(out).not.toMatch(/body:is\(\.si18n-lang/);
    expect(out).not.toMatch(/body\.si18n-lang-/);
    expect(out).toContain(':host(.si18n-dark)');
    expect(out).toContain(':host(:is(.si18n-lang-ar, .si18n-lang-he))');
  });
});
