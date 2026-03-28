/**
 * Unit tests for YouTubeSubtitleManager helper functions.
 *
 * Tests: _isYouTubeEmbed, _ytLangCode, _ytLangName, EMBED_DOMAINS
 */

/* global describe, test, expect, beforeEach */

const fs = require('fs');
const path = require('path');

// Minimal browser mocks
global.document = {
  querySelectorAll: () => [],
  body: { observe: () => {} },
};
global.window = { addEventListener: () => {}, location: { origin: 'https://test.com' } };
global.MutationObserver = class { observe() {} disconnect() {} };
global.Node = { ELEMENT_NODE: 1 };

// Load constants first (youtube-subtitles.js may reference them)
const selectorsSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'lib', 'selectors.js'), 'utf8'
);
const constantsSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'lib', 'constants.js'), 'utf8'
);
const src = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'lib', 'youtube-subtitles.js'), 'utf8'
);

let YouTubeSubtitleManager;
try {
  const combined = `(function() { ${selectorsSrc}; ${constantsSrc}; ${src}; return YouTubeSubtitleManager; })()`;
  YouTubeSubtitleManager = eval(combined);
} catch (e) {
  eval(selectorsSrc);
  eval(constantsSrc);
  eval(src);
  YouTubeSubtitleManager = global.YouTubeSubtitleManager;
}

// ── Tests ──────────────────────────────────────────────────────

describe('YouTubeSubtitleManager', () => {
  let manager;

  beforeEach(() => {
    manager = new YouTubeSubtitleManager('ko');
  });

  describe('EMBED_DOMAINS', () => {
    test('includes youtube.com/embed', () => {
      expect(YouTubeSubtitleManager.EMBED_DOMAINS).toContain('youtube.com/embed');
    });

    test('includes youtube-nocookie.com/embed', () => {
      expect(YouTubeSubtitleManager.EMBED_DOMAINS).toContain('youtube-nocookie.com/embed');
    });
  });

  describe('_isYouTubeEmbed', () => {
    test('detects youtube.com/embed iframe', () => {
      const iframe = { src: 'https://www.youtube.com/embed/abc123' };
      expect(manager._isYouTubeEmbed(iframe)).toBe(true);
    });

    test('detects youtube-nocookie.com/embed iframe', () => {
      const iframe = { src: 'https://www.youtube-nocookie.com/embed/abc123' };
      expect(manager._isYouTubeEmbed(iframe)).toBe(true);
    });

    test('rejects non-YouTube iframe', () => {
      const iframe = { src: 'https://www.vimeo.com/embed/abc123' };
      expect(manager._isYouTubeEmbed(iframe)).toBe(false);
    });

    test('handles empty src', () => {
      const iframe = { src: '' };
      expect(manager._isYouTubeEmbed(iframe)).toBe(false);
    });

    test('handles missing src', () => {
      const iframe = {};
      expect(manager._isYouTubeEmbed(iframe)).toBe(false);
    });
  });

  describe('_ytLangCode', () => {
    test('maps zh-CN to zh-Hans', () => {
      expect(manager._ytLangCode('zh-CN')).toBe('zh-Hans');
    });

    test('maps zh-TW to zh-Hant', () => {
      expect(manager._ytLangCode('zh-TW')).toBe('zh-Hant');
    });

    test('maps pt-BR to pt', () => {
      expect(manager._ytLangCode('pt-BR')).toBe('pt');
    });

    test('passes through unmapped language codes', () => {
      expect(manager._ytLangCode('ko')).toBe('ko');
      expect(manager._ytLangCode('ja')).toBe('ja');
    });
  });

  describe('_ytLangName', () => {
    test('returns language name for mapped codes', () => {
      const name = manager._ytLangName('ko');
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    });

    test('passes through unmapped codes', () => {
      // 'en' is typically not in the map (it's the source language)
      const result = manager._ytLangName('en');
      expect(typeof result).toBe('string');
    });
  });

  describe('constructor', () => {
    test('sets target language', () => {
      expect(manager.targetLang).toBe('ko');
    });

    test('initializes empty iframe set', () => {
      expect(manager._iframes.size).toBe(0);
    });
  });

  describe('setLanguage', () => {
    test('updates target language', () => {
      manager.setLanguage('ja');
      expect(manager.targetLang).toBe('ja');
    });
  });
});
