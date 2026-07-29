/**
 * @jest-environment jsdom
 */

/* global describe, test, expect, beforeAll, beforeEach */

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'content-surface.js'), 'utf8');

beforeAll(() => {
  new Function('window', source)(window);
});

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('content surface teardown helpers', () => {
  test('keeps certification and non-AI-content selector scopes distinct', () => {
    const { CERTIFICATION_SURFACE_SELECTORS, NON_AI_CONTENT_SURFACE_SELECTORS } = window._sbContentSurface;

    expect(CERTIFICATION_SURFACE_SELECTORS).toContain('#si18n-header-lang');
    expect(CERTIFICATION_SURFACE_SELECTORS).not.toContain('#si18n-toc-toggle');
    expect(NON_AI_CONTENT_SURFACE_SELECTORS).toEqual(
      expect.arrayContaining([...CERTIFICATION_SURFACE_SELECTORS, '#si18n-toc-toggle', '#si18n-toc-panel']),
    );
  });

  test('certification teardown removes the UI host but preserves TOC and unrelated DOM', () => {
    document.body.innerHTML = `
      <div id="skillbridge-root"></div>
      <div id="si18n-header-lang"></div>
      <button class="si18n-ask-tutor-btn"></button>
      <button id="si18n-toc-toggle"></button>
      <main id="lesson-content"></main>
    `;
    const sb = { _uiHost: {} };

    window._sbContentSurface.removeContentSurfaces(
      document,
      sb,
      window._sbContentSurface.CERTIFICATION_SURFACE_SELECTORS,
    );

    expect(document.getElementById('skillbridge-root')).toBeNull();
    expect(document.getElementById('si18n-header-lang')).toBeNull();
    expect(document.querySelector('.si18n-ask-tutor-btn')).toBeNull();
    expect(document.getElementById('si18n-toc-toggle')).not.toBeNull();
    expect(document.getElementById('lesson-content')).not.toBeNull();
    expect(sb._uiHost).toBeNull();
  });

  test('non-AI-content teardown additionally removes TOC surfaces', () => {
    document.body.innerHTML = `
      <div id="skillbridge-root"></div>
      <button id="si18n-toc-toggle"></button>
      <aside id="si18n-toc-panel"></aside>
      <main id="lesson-content"></main>
    `;

    window._sbContentSurface.removeContentSurfaces(
      document,
      { _uiHost: {} },
      window._sbContentSurface.NON_AI_CONTENT_SURFACE_SELECTORS,
    );

    expect(document.getElementById('si18n-toc-toggle')).toBeNull();
    expect(document.getElementById('si18n-toc-panel')).toBeNull();
    expect(document.getElementById('lesson-content')).not.toBeNull();
  });
});
