/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
const scripts = manifest.content_scripts[0].js;
const contentSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'content.js'), 'utf8');
const termReportsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'term-reports.js'), 'utf8');

function indexOf(script) {
  const index = scripts.indexOf(script);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

describe('content module load order', () => {
  test('loads content-surface after its lifecycle inputs and before content.js', () => {
    expect(indexOf('src/content/content-term-preview.js')).toBeLessThan(indexOf('src/content/content-surface.js'));
    expect(indexOf('src/content/content-surface.js')).toBeLessThan(indexOf('src/content/content.js'));
  });

  test('loads the translation-feedback contract before content state and queue modules', () => {
    expect(indexOf('src/lib/translation-feedback.js')).toBeLessThan(indexOf('src/content/content.js'));
    expect(indexOf('src/lib/translation-feedback.js')).toBeLessThan(indexOf('src/content/gt-queue.js'));
  });

  test('loads chat-message-dom after namespace/render setup and before sidebar-chat', () => {
    expect(indexOf('src/content/content.js')).toBeLessThan(indexOf('src/content/chat-message-dom.js'));
    expect(indexOf('src/content/chat-render.js')).toBeLessThan(indexOf('src/content/chat-message-dom.js'));
    expect(indexOf('src/content/chat-message-dom.js')).toBeLessThan(indexOf('src/content/sidebar-chat.js'));
  });

  test('loads the Tutor conversation model before the history UI', () => {
    expect(indexOf('src/lib/tutor-conversations.js')).toBeLessThan(indexOf('src/content/chat-history.js'));
  });

  test('loads reports and selection actions after their dependencies and before sidebar initialization', () => {
    expect(indexOf('src/content/chat-subpanels.js')).toBeLessThan(indexOf('src/content/term-reports.js'));
    expect(indexOf('src/content/lesson-store.js')).toBeLessThan(indexOf('src/content/term-reports.js'));
    expect(indexOf('src/content/term-reports.js')).toBeLessThan(indexOf('src/content/text-selection.js'));
    expect(indexOf('src/content/text-selection.js')).toBeLessThan(indexOf('src/content/sidebar-chat.js'));
  });
});

describe('content module runtime contract', () => {
  test('requires the term-reports module that the manifest loads', () => {
    const requiredBlock = contentSource.match(/const REQUIRED_CONTENT_MODULES = \[([\s\S]*?)\];/);
    expect(requiredBlock).not.toBeNull();
    const required = Array.from(requiredBlock[1].matchAll(/'([^']+)'/g), (match) => match[1]);

    expect(required).toContain('term-reports');
    expect(termReportsSource).toContain("sb.registerModule?.('term-reports')");
  });
});
