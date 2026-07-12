/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
const scripts = manifest.content_scripts[0].js;

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

  test('loads chat-message-dom after namespace/render setup and before sidebar-chat', () => {
    expect(indexOf('src/content/content.js')).toBeLessThan(indexOf('src/content/chat-message-dom.js'));
    expect(indexOf('src/content/chat-render.js')).toBeLessThan(indexOf('src/content/chat-message-dom.js'));
    expect(indexOf('src/content/chat-message-dom.js')).toBeLessThan(indexOf('src/content/sidebar-chat.js'));
  });
});
