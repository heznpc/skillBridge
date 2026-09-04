/**
 * Unit tests for SkilljarTranslator core logic.
 *
 * These tests cover pure functions that don't depend on Chrome APIs
 * or IndexedDB. We extract the class from the source file and mock
 * browser globals just enough to instantiate it.
 */

/* global describe, test, expect, beforeEach, afterEach, jest */

// ── Minimal browser mocks ──────────────────────────────────────
global.chrome = { runtime: { getURL: (p) => p } };
global.indexedDB = { open: () => ({ onupgradeneeded: null, onsuccess: null, onerror: null }) };
global.window = { addEventListener: () => {} };

// Load the class by evaluating the source (it assigns to global scope via IIFE pattern)
const fs = require('fs');
const path = require('path');
const { readProductionSource } = require('./helpers/production-source');

// Load runtime constants + selectors + constants first (manifest order)
const sharedSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'shared', 'runtime-constants.js'), 'utf8');
const selectorsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'selectors.js'), 'utf8');
const constantsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'constants.js'), 'utf8');
const src = readProductionSource('src', 'lib', 'translator.js');

// Combine shared constants + selectors + constants + translator in one eval so all are in scope.
let SkilljarTranslator;
try {
  const combined = `(function() { ${sharedSrc}; ${selectorsSrc}; ${constantsSrc}; ${src}; return SkilljarTranslator; })()`;
  SkilljarTranslator = eval(combined);
} catch (_e) {
  eval(sharedSrc);
  eval(selectorsSrc);
  eval(constantsSrc);
  eval(src);
  SkilljarTranslator = global.SkilljarTranslator;
}

// ── Tests ──────────────────────────────────────────────────────

describe('SkilljarTranslator', () => {
  let translator;

  beforeEach(() => {
    translator = new SkilljarTranslator();
  });

  describe('constructor', () => {
    test('initializes with empty staticDict', () => {
      expect(translator.staticDict).toEqual({});
    });

    test('has premiumLanguages defined', () => {
      expect(translator.premiumLanguages).toContain('ko');
      expect(translator.premiumLanguages).toContain('ja');
      expect(translator.premiumLanguages).toContain('zh-CN');
    });

    test('has all 13 premium languages after the Dutch promotion', () => {
      expect(translator.premiumLanguages).toHaveLength(13);
      expect(translator.premiumLanguages).toContain('it');
      expect(translator.premiumLanguages).toContain('id');
      expect(translator.premiumLanguages).toContain('nl');
    });

    test('supportedLanguages includes 30+ languages', () => {
      expect(Object.keys(translator.supportedLanguages).length).toBeGreaterThanOrEqual(30);
    });

    test('accepts an AI-disabled CWS configuration', () => {
      expect(new SkilljarTranslator({ aiEnabled: false }).aiEnabled).toBe(false);
      expect(new SkilljarTranslator().aiEnabled).toBe(true);
    });
  });

  describe('initialize', () => {
    test('memoizes cache startup across concurrent callers and full initialization', async () => {
      const t = new SkilljarTranslator();
      let releaseOpen;
      t._openDB = jest.fn(
        () =>
          new Promise((resolve) => {
            releaseOpen = resolve;
          }),
      );
      t._cleanupExpiredCache = jest.fn().mockResolvedValue(undefined);
      t._checkStorageQuota = jest.fn().mockResolvedValue(undefined);
      t._ensureCloudBroker = jest.fn().mockResolvedValue(undefined);

      const first = t.initializeCache();
      const second = t.initializeCache();
      const full = t.initialize();

      expect(second).toBe(first);
      expect(t._openDB).toHaveBeenCalledTimes(1);
      releaseOpen(true);
      await expect(Promise.all([first, second, full])).resolves.toEqual([true, true, true]);
      expect(t._openDB).toHaveBeenCalledTimes(1);
      expect(t._cleanupExpiredCache).toHaveBeenCalledTimes(1);
      expect(t._checkStorageQuota).toHaveBeenCalledTimes(1);
      expect(t._ensureCloudBroker).toHaveBeenCalledTimes(1);
    });

    test('contains a cache startup failure but still attempts Tutor startup', async () => {
      const t = new SkilljarTranslator();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      t._openDB = jest.fn().mockResolvedValue(true);
      t._cleanupExpiredCache = jest.fn().mockRejectedValue(new Error('cache transaction failed'));
      t._checkStorageQuota = jest.fn().mockResolvedValue(undefined);
      t._ensureCloudBroker = jest.fn().mockResolvedValue(undefined);

      try {
        const cacheInit = t.initializeCache();
        await expect(cacheInit).resolves.toBe(false);
        await expect(t.initialize()).resolves.toBe(false);
        expect(t.initializeCache()).toBe(cacheInit);
        expect(t._openDB).toHaveBeenCalledTimes(1);
        expect(t._cleanupExpiredCache).toHaveBeenCalledTimes(1);
        expect(t._checkStorageQuota).not.toHaveBeenCalled();
        expect(t._ensureCloudBroker).toHaveBeenCalledTimes(1);
      } finally {
        errorSpy.mockRestore();
      }
    });

    test('treats an unavailable database as cache failure without blocking Tutor', async () => {
      const t = new SkilljarTranslator();
      t._openDB = jest.fn().mockResolvedValue(false);
      t._cleanupExpiredCache = jest.fn().mockResolvedValue(undefined);
      t._checkStorageQuota = jest.fn().mockResolvedValue(undefined);
      t._ensureCloudBroker = jest.fn().mockResolvedValue(undefined);

      await expect(t.initialize()).resolves.toBe(false);
      expect(t._cleanupExpiredCache).not.toHaveBeenCalled();
      expect(t._checkStorageQuota).not.toHaveBeenCalled();
      expect(t._ensureCloudBroker).toHaveBeenCalledTimes(1);
    });

    test('opens the local cache but skips bridge setup when AI is disabled', async () => {
      const localOnly = new SkilljarTranslator({ aiEnabled: false });
      localOnly._openDB = jest.fn().mockResolvedValue(true);
      localOnly._cleanupExpiredCache = jest.fn().mockResolvedValue(undefined);
      localOnly._checkStorageQuota = jest.fn().mockResolvedValue(undefined);
      localOnly._connectCloudBrokerWithRetry = jest.fn();

      await expect(localOnly.initialize()).resolves.toBe(true);
      expect(localOnly._openDB).toHaveBeenCalledTimes(1);
      expect(localOnly._connectCloudBrokerWithRetry).not.toHaveBeenCalled();
    });
  });

  describe('Google Translate availability events', () => {
    let originalDocument;
    let originalCustomEvent;
    let originalProtectedTerms;
    let events;

    beforeEach(() => {
      originalDocument = global.document;
      originalCustomEvent = global.CustomEvent;
      originalProtectedTerms = global.window._protectedTerms;
      events = [];
      global.CustomEvent = class CustomEvent {
        constructor(type, init = {}) {
          this.type = type;
          this.detail = init.detail;
        }
      };
      global.document = { dispatchEvent: (event) => events.push(event) };
      global.chrome.runtime.sendMessage = jest.fn();
    });

    afterEach(() => {
      if (originalDocument === undefined) delete global.document;
      else global.document = originalDocument;
      if (originalCustomEvent === undefined) delete global.CustomEvent;
      else global.CustomEvent = originalCustomEvent;
      if (originalProtectedTerms === undefined) delete global.window._protectedTerms;
      else global.window._protectedTerms = originalProtectedTerms;
      delete global.chrome.runtime.sendMessage;
    });

    test('reports a failed single request once and clears it after recovery', async () => {
      global.chrome.runtime.sendMessage
        .mockResolvedValueOnce({ ok: false, error: 'offline' })
        .mockRejectedValueOnce(new Error('still offline'))
        .mockResolvedValueOnce({ ok: true, translated: '안녕하세요' });

      await expect(translator.googleTranslate('Hello', 'ko')).resolves.toBeNull();
      await expect(translator.googleTranslate('Hello again', 'ko')).resolves.toBeNull();
      await expect(translator.googleTranslate('Hello', 'ko')).resolves.toBe('안녕하세요');

      expect(events.map(({ type, detail }) => ({ type, detail }))).toEqual([
        { type: 'skillbridge:translationunavailable', detail: { kind: 'single' } },
        { type: 'skillbridge:translationavailable', detail: { kind: 'single' } },
      ]);
    });

    test('reports malformed batch payloads and preserves the original fallback', async () => {
      global.chrome.runtime.sendMessage
        .mockResolvedValueOnce({ ok: true, translations: { unexpected: true } })
        .mockResolvedValueOnce({ ok: true, translations: ['only one'] });

      const originals = ['Hello', 'World'];
      await expect(translator.googleTranslateBatch(originals, 'ko')).resolves.toEqual(originals);
      await expect(translator.googleTranslateBatch(originals, 'ko')).resolves.toEqual(originals);
      expect(events.map(({ type, detail }) => ({ type, detail }))).toEqual([
        { type: 'skillbridge:translationunavailable', detail: { kind: 'batch' } },
      ]);
    });

    test('reports a well-shaped batch as available', async () => {
      global.chrome.runtime.sendMessage.mockResolvedValue({ ok: true, translations: ['안녕하세요', '세계'] });

      await expect(translator.googleTranslateBatch(['Hello', 'World'], 'ko')).resolves.toEqual(['안녕하세요', '세계']);
      expect(events.map(({ type, detail }) => ({ type, detail }))).toEqual([
        { type: 'skillbridge:translationavailable', detail: { kind: 'batch' } },
      ]);
    });

    test('does not report transport failure when protected-term unmasking fails', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      global.window._protectedTerms = {
        maskProtectedTerms: () => ({ text: '⟦0⟧ prompt', tokens: ['Claude'] }),
        unmaskProtectedTerms: () => {
          throw new Error('placeholder integrity failed');
        },
      };
      global.chrome.runtime.sendMessage.mockResolvedValue({ ok: true, translated: '⟦0⟧ 프롬프트' });

      try {
        await expect(translator.googleTranslate('Claude prompt', 'ko')).resolves.toBeNull();
        expect(events.map(({ type, detail }) => ({ type, detail }))).toEqual([
          { type: 'skillbridge:translationavailable', detail: { kind: 'single' } },
        ]);
      } finally {
        warnSpy.mockRestore();
      }
    });

    test('masks protected terms before a single request and restores them in the reply', async () => {
      const mask = { text: '⟦0⟧ prompt', tokens: ['Claude'], foreign: { open: 0, close: 0 } };
      global.window._protectedTerms = {
        maskProtectedTerms: jest.fn(() => mask),
        unmaskProtectedTerms: jest.fn(() => 'Claude 프롬프트'),
      };
      global.chrome.runtime.sendMessage.mockResolvedValue({ ok: true, translated: '⟦0⟧ 프롬프트' });

      await expect(translator.googleTranslate('  Claude prompt  ', 'ko')).resolves.toBe('Claude 프롬프트');
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'GOOGLE_TRANSLATE',
        text: '⟦0⟧ prompt',
        targetLang: 'ko',
        sourceLang: 'en',
      });
      expect(global.window._protectedTerms.unmaskProtectedTerms).toHaveBeenCalledWith('⟦0⟧ 프롬프트', mask);
    });

    test('masks batch entries independently and unmasks the matching response position', async () => {
      const masks = {
        'Claude API': { text: '⟦0⟧ API', tokens: ['Claude'] },
        'Plain text': { text: 'Plain text', tokens: [] },
      };
      global.window._protectedTerms = {
        maskProtectedTerms: jest.fn((text) => masks[text]),
        unmaskProtectedTerms: jest.fn(() => 'Claude API 번역'),
      };
      global.chrome.runtime.sendMessage.mockResolvedValue({
        ok: true,
        translations: ['⟦0⟧ API 번역', '일반 텍스트'],
      });

      await expect(translator.googleTranslateBatch([' Claude API ', 'Plain text'], 'ko')).resolves.toEqual([
        'Claude API 번역',
        '일반 텍스트',
      ]);
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'GOOGLE_TRANSLATE_BATCH',
        texts: ['⟦0⟧ API', 'Plain text'],
        targetLang: 'ko',
        sourceLang: 'en',
      });
      expect(global.window._protectedTerms.unmaskProtectedTerms).toHaveBeenCalledWith(
        '⟦0⟧ API 번역',
        masks['Claude API'],
      );
    });

    test('falls back positionally to each batch source when unmasking returns null or throws', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      global.window._protectedTerms = {
        maskProtectedTerms: jest.fn((text) => ({ text: `masked:${text}`, tokens: [text] })),
        unmaskProtectedTerms: jest
          .fn()
          .mockReturnValueOnce(null)
          .mockImplementationOnce(() => {
            throw new Error('bad placeholder');
          }),
      };
      global.chrome.runtime.sendMessage.mockResolvedValue({ ok: true, translations: ['first', 'second'] });

      try {
        await expect(translator.googleTranslateBatch(['Claude one', 'Anthropic two'], 'ko')).resolves.toEqual([
          'Claude one',
          'Anthropic two',
        ]);
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('_normalizeTypography', () => {
    test('converts curly single quotes to straight', () => {
      expect(translator._normalizeTypography('\u2018hello\u2019')).toBe("'hello'");
    });

    test('converts curly double quotes to straight', () => {
      expect(translator._normalizeTypography('\u201Chello\u201D')).toBe('"hello"');
    });

    test('converts em/en dashes to hyphens', () => {
      expect(translator._normalizeTypography('a\u2013b\u2014c')).toBe('a-b-c');
    });

    test('converts ellipsis to three dots', () => {
      expect(translator._normalizeTypography('wait\u2026')).toBe('wait...');
    });

    test('converts non-breaking space to regular space', () => {
      expect(translator._normalizeTypography('a\u00A0b')).toBe('a b');
    });

    test('leaves normal text unchanged', () => {
      expect(translator._normalizeTypography('hello world')).toBe('hello world');
    });
  });

  describe('staticLookup', () => {
    beforeEach(() => {
      translator.staticDict = {
        Hello: '안녕하세요',
        'prompt engineering': '프롬프트 엔지니어링',
        'Claude is an AI assistant': 'Claude는 AI 어시스턴트입니다',
      };
      translator._lowerDict = {};
      for (const [k, v] of Object.entries(translator.staticDict)) {
        translator._lowerDict[k.toLowerCase()] = v;
      }
    });

    test('returns null for empty input', () => {
      expect(translator.staticLookup('')).toBeNull();
      expect(translator.staticLookup(null)).toBeNull();
      expect(translator.staticLookup(undefined)).toBeNull();
    });

    test('returns null for whitespace-only input', () => {
      expect(translator.staticLookup('   ')).toBeNull();
    });

    test('exact match works', () => {
      expect(translator.staticLookup('Hello')).toBe('안녕하세요');
    });

    test('trims whitespace before lookup', () => {
      expect(translator.staticLookup('  Hello  ')).toBe('안녕하세요');
    });

    test('case-insensitive fallback works', () => {
      expect(translator.staticLookup('hello')).toBe('안녕하세요');
      expect(translator.staticLookup('HELLO')).toBe('안녕하세요');
    });

    test('strips trailing punctuation', () => {
      expect(translator.staticLookup('Hello.')).toBe('안녕하세요');
      expect(translator.staticLookup('Hello!')).toBe('안녕하세요');
      expect(translator.staticLookup('Hello?')).toBe('안녕하세요');
    });

    test('normalizes typography before lookup', () => {
      // Curly quotes version of a dict key
      expect(translator.staticLookup('prompt engineering')).toBe('프롬프트 엔지니어링');
    });

    test('returns null for non-existent keys', () => {
      expect(translator.staticLookup('does not exist')).toBeNull();
    });

    test('handles multi-word sentences', () => {
      expect(translator.staticLookup('Claude is an AI assistant')).toBe('Claude는 AI 어시스턴트입니다');
    });
  });

  describe('loadStaticTranslations', () => {
    let originalFetch;
    let originalGetURL;
    let warnSpy;

    beforeEach(() => {
      originalFetch = global.fetch;
      originalGetURL = global.chrome.runtime.getURL;
      translator.staticDict = { Hello: '안녕하세요' };
      translator._lowerDict = { hello: '안녕하세요' };
      translator._protectedTerms = { Claude: ['클로드'] };
    });

    afterEach(() => {
      global.fetch = originalFetch;
      global.chrome.runtime.getURL = originalGetURL;
      warnSpy?.mockRestore();
      warnSpy = null;
    });

    test('loads the packaged Dutch premium dictionary', async () => {
      global.chrome.runtime.getURL = jest.fn((assetPath) => `/${assetPath}`);
      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({ core: { Hello: 'Hallo' } }),
      }));

      await translator.loadStaticTranslations('nl');

      expect(global.chrome.runtime.getURL).toHaveBeenCalledWith('src/data/nl.json');
      expect(global.fetch).toHaveBeenCalledWith('/src/data/nl.json');
      expect(translator.staticLookup('Hello')).toBe('Hallo');
    });

    test('clears all static dictionary state when a language file is missing', async () => {
      global.fetch = jest.fn(async () => ({ ok: false }));

      await translator.loadStaticTranslations('nl');

      expect(translator.staticDict).toEqual({});
      expect(translator._lowerDict).toEqual({});
      expect(translator.getProtectedTerms()).toEqual({});
      expect(translator.staticLookup('HELLO')).toBeNull();
    });

    test('clears all static dictionary state when loading throws', async () => {
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      global.fetch = jest.fn(async () => {
        throw new Error('network down');
      });

      await translator.loadStaticTranslations('nl');

      expect(translator.staticDict).toEqual({});
      expect(translator._lowerDict).toEqual({});
      expect(translator.getProtectedTerms()).toEqual({});
      expect(translator.staticLookup('HELLO')).toBeNull();
    });
  });

  describe('getProtectedTerms', () => {
    test('returns empty object by default', () => {
      expect(translator.getProtectedTerms()).toEqual({});
    });

    test('returns stored protected terms', () => {
      translator._protectedTerms = {
        Claude: ['클로드'],
        skill: ['스킬', '기술'],
      };
      const terms = translator.getProtectedTerms();
      expect(terms['Claude']).toEqual(['클로드']);
      expect(terms['skill']).toEqual(['스킬', '기술']);
    });
  });

  describe('_restoreProtectedTerms', () => {
    afterEach(() => {
      delete global.window._protectedTerms;
    });

    test('delegates to the protected-terms runtime when available', () => {
      global.window._protectedTerms = {
        restoreProtectedTerms: (text) => text.replaceAll('클로드', 'Claude'),
      };

      expect(translator._restoreProtectedTerms('클로드를 사용하세요')).toBe('Claude를 사용하세요');
    });

    test('returns the original text if the runtime hook is missing', () => {
      expect(translator._restoreProtectedTerms('클로드를 사용하세요')).toBe('클로드를 사용하세요');
    });
  });

  describe('translate protected-term restoration', () => {
    beforeEach(() => {
      global.window._protectedTerms = {
        restoreProtectedTerms: (text) => text.replaceAll('클로드', 'Claude'),
      };
    });

    afterEach(() => {
      delete global.window._protectedTerms;
    });

    test('restores protected terms on static dictionary hits', async () => {
      translator.staticDict = {
        'This is a Claude prompt example': '클로드 프롬프트 예시',
      };
      translator._lowerDict = {
        'this is a claude prompt example': '클로드 프롬프트 예시',
      };

      const result = await translator.translate('This is a Claude prompt example', 'ko');

      expect(result).toEqual({ text: 'Claude 프롬프트 예시', source: 'static' });
    });

    test('restores protected terms and caches immediate Google results without an AI review request', async () => {
      translator.cachedLookup = jest.fn(async () => null);
      translator.googleTranslate = jest.fn(async () => '클로드 프롬프트 예시');
      translator._cacheTranslation = jest.fn(async () => undefined);

      const result = await translator.translate('This is a Claude prompt example', 'ko');

      expect(result).toEqual({ text: 'Claude 프롬프트 예시', source: 'google' });
      expect(translator._cacheTranslation).toHaveBeenCalledWith(
        'This is a Claude prompt example',
        'Claude 프롬프트 예시',
        'ko',
      );
      expect(translator.queueGeminiVerify).toBeUndefined();
    });
  });

  describe('premium language configuration', () => {
    test('premium membership includes Dutch and excludes a Standard language', () => {
      expect(translator.premiumLanguages.includes('ko')).toBe(true);
      expect(translator.premiumLanguages.includes('pt-BR')).toBe(true);
      expect(translator.premiumLanguages.includes('it')).toBe(true);
      expect(translator.premiumLanguages.includes('nl')).toBe(true);
      // Sanity: a still-Standard language should remain non-premium
      expect(translator.premiumLanguages.includes('pl')).toBe(false);
    });
  });
});

describe('Language JSON files', () => {
  const dataDir = path.join(__dirname, '..', 'src', 'data');

  let files;
  try {
    files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));
  } catch {
    files = [];
  }

  test('at least one language file exists', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  const languageFiles = files.map((file) => {
    try {
      return { file, data: JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8')), error: null };
    } catch (error) {
      return { file, data: null, error: error.message };
    }
  });

  test('all language files contain valid JSON objects', () => {
    const invalid = languageFiles
      .filter(({ data, error }) => error || !data || typeof data !== 'object' || Array.isArray(data))
      .map(({ file, error }) => ({ file, error: error || 'top-level value must be an object' }));

    expect(invalid).toEqual([]);
  });

  test('all language files identify their locale in _meta', () => {
    const invalid = languageFiles
      .filter(({ data }) => data)
      .filter(({ data }) => !data._meta || typeof data._meta.lang !== 'string' || !data._meta.lang.trim())
      .map(({ file }) => file);

    expect(invalid).toEqual([]);
  });

  test('all language files have non-empty, array-shaped protected terms', () => {
    const invalid = languageFiles
      .filter(({ data }) => data)
      .flatMap(({ file, data }) => {
        if (!data._protected || typeof data._protected !== 'object' || Array.isArray(data._protected)) {
          return [{ file, term: null, reason: '_protected must be an object' }];
        }
        if (Object.keys(data._protected).length === 0) {
          return [{ file, term: null, reason: '_protected must not be empty' }];
        }
        return Object.entries(data._protected)
          .filter(([_term, forms]) => !Array.isArray(forms) || forms.length === 0)
          .map(([term]) => ({ file, term, reason: 'forms must be a non-empty array' }));
      });

    expect(invalid).toEqual([]);
  });

  test('all dictionary entries contain non-empty strings', () => {
    const invalid = [];
    const check = (file, obj, prefix = '') => {
      for (const [key, value] of Object.entries(obj)) {
        if (key === '_meta' || key === '_protected') continue;
        const entry = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'string' && value.trim() === '') invalid.push({ file, entry });
        else if (typeof value === 'object' && value !== null && !Array.isArray(value)) check(file, value, entry);
      }
    };

    for (const { file, data } of languageFiles) {
      if (data) check(file, data);
    }
    expect(invalid).toEqual([]);
  });

  // ── _isValidTranslation (cache-poisoning guard, added in v3.5.7) ──
  // Lock in the exact rejection rules so a future tweak to the regex /
  // ratio doesn't silently let garbage back into the 30-day IDB cache.
  describe('_isValidTranslation', () => {
    let t;
    beforeEach(() => {
      t = new SkilljarTranslator();
    });

    test('rejects null / non-string', () => {
      expect(t._isValidTranslation(null, 'hello', 'ko')).toBe(false);
      expect(t._isValidTranslation(undefined, 'hello', 'ko')).toBe(false);
      expect(t._isValidTranslation(42, 'hello', 'ko')).toBe(false);
    });

    test('rejects HTML-shaped strings (proxy / error pages)', () => {
      expect(t._isValidTranslation('<html><body>Error</body></html>', 'hello', 'ko')).toBe(false);
      expect(t._isValidTranslation('<!DOCTYPE html><p>Forbidden</p>', 'hello', 'ko')).toBe(false);
      expect(t._isValidTranslation('  <div>ratelimited</div>', 'hi', 'ko')).toBe(false);
    });

    test('rejects translations more than 10× the original length', () => {
      const original = 'hi';
      const huge = 'a'.repeat(original.length * 10 + 1);
      expect(t._isValidTranslation(huge, original, 'ko')).toBe(false);
    });

    test('accepts plausible non-Latin translations', () => {
      expect(t._isValidTranslation('안녕하세요 클로드입니다', 'Hello, I am Claude', 'ko')).toBe(true);
      expect(t._isValidTranslation('こんにちは、クロードです', 'Hello, I am Claude', 'ja')).toBe(true);
      expect(t._isValidTranslation('你好，我是克劳德', 'Hello, I am Claude', 'zh-CN')).toBe(true);
    });

    test('rejects mostly-ASCII output for non-Latin target (refusal/error string)', () => {
      // Long enough to trip the non-Latin guard, but contains <5% non-ASCII.
      const refusal = 'I cannot translate this content. Please contact support.';
      expect(t._isValidTranslation(refusal, 'hello world', 'ko')).toBe(false);
      expect(t._isValidTranslation(refusal, 'hello world', 'ja')).toBe(false);
      expect(t._isValidTranslation(refusal, 'hello world', 'ru')).toBe(false);
    });

    test('does not apply non-Latin guard to short strings', () => {
      // Short (≤20 chars) — Latin-script proper nouns or codes are fine.
      expect(t._isValidTranslation('Claude', 'Claude', 'ko')).toBe(true);
      expect(t._isValidTranslation('OK', 'OK', 'ja')).toBe(true);
    });

    test('does not apply non-Latin guard to Latin-script targets', () => {
      // English source → English/French/Spanish output is mostly-ASCII; that's correct.
      expect(t._isValidTranslation('Hola, soy Claude', 'Hello, I am Claude', 'es')).toBe(true);
      expect(t._isValidTranslation('Bonjour, je suis Claude', 'Hello, I am Claude', 'fr')).toBe(true);
    });
  });
});

describe('chatStream — broker recovery failures propagate as a rejection', () => {
  afterEach(() => {
    delete global.chrome.storage;
  });

  test('attempts lazy recovery, then rejects instead of silently resolving', async () => {
    global.chrome.storage = { local: { get: jest.fn(async () => ({})) } };
    const t = new SkilljarTranslator();
    t.isReady = false;
    t._ensureCloudBroker = jest.fn().mockRejectedValue(new Error('Cloud broker unavailable'));
    // The sole caller (sidebar-chat) discards chatStream's return value and
    // relies on a thrown error to render the error bubble + retry button. If
    // this resolves to a string instead, the "thinking…" spinner is stranded
    // forever with no error and no retry.
    await expect(t.chatStream('hello', 'ko', '', () => {}, {})).rejects.toThrow('Cloud broker unavailable');
    expect(t._ensureCloudBroker).toHaveBeenCalledTimes(1);
  });
});

describe('chatStream — engine preference is a privacy gate that fails closed', () => {
  afterEach(() => {
    delete global.chrome.storage;
    jest.useRealTimers();
  });

  test('rejects instead of defaulting to cloud when the preference read stalls', async () => {
    jest.useFakeTimers();
    // A stalled chrome.storage read must NOT fall back to 'cloud': the user
    // may have selected 'local' or 'off', which promise that no prompt leaves
    // the machine. Fail closed with a retryable rejection.
    global.chrome.storage = { local: { get: jest.fn(() => new Promise(() => {})) } };
    const t = new SkilljarTranslator();
    t.isReady = true;
    t._cloudPort = { postMessage: jest.fn() };
    const pending = t.chatStream('hello', 'ko', '', () => {}, {});
    const assertion = expect(pending).rejects.toThrow('Tutor engine preference read timed out');
    await jest.advanceTimersByTimeAsync(1500);
    await assertion;
    expect(t._cloudPort.postMessage).not.toHaveBeenCalled();
  });

  test('rejects instead of defaulting to cloud when the preference read throws', async () => {
    global.chrome.storage = {
      local: {
        get: jest.fn(async () => {
          throw new Error('storage backend gone');
        }),
      },
    };
    const t = new SkilljarTranslator();
    t.isReady = true;
    t._cloudPort = { postMessage: jest.fn() };
    await expect(t.chatStream('hello', 'ko', '', () => {}, {})).rejects.toThrow('storage backend gone');
    expect(t._cloudPort.postMessage).not.toHaveBeenCalled();
  });

  test('honors the stored off/local preference from a healthy read', async () => {
    global.chrome.storage = { local: { get: jest.fn(async () => ({ sb_ai_engine: 'off' })) } };
    const t = new SkilljarTranslator();
    await expect(t.chatStream('hello', 'ko', '', () => {}, {})).rejects.toThrow('turned off in settings');
  });
});

describe('local Tutor stream — real Port lifecycle', () => {
  let originalConnect;

  function makePort() {
    const messageListeners = [];
    const disconnectListeners = [];
    const port = {
      posted: [],
      postMessage: jest.fn((message) => port.posted.push(message)),
      disconnect: jest.fn(() => disconnectListeners.forEach((listener) => listener())),
      onMessage: { addListener: (listener) => messageListeners.push(listener) },
      onDisconnect: { addListener: (listener) => disconnectListeners.push(listener) },
      emitMessage: (message) => messageListeners.forEach((listener) => listener(message)),
    };
    return port;
  }

  async function settlePortSetup() {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  }

  beforeEach(() => {
    originalConnect = global.chrome.runtime.connect;
    global.chrome.storage = {
      local: {
        get: jest.fn(async (keys) => {
          if (keys === 'sb_ai_engine') return { sb_ai_engine: 'local' };
          return { sb_local_base: 'http://127.0.0.1:8080/v1', sb_local_model: 'test-model' };
        }),
      },
    };
  });

  afterEach(() => {
    global.chrome.runtime.connect = originalConnect;
    delete global.chrome.storage;
    jest.useRealTimers();
  });

  test('chatStream routes the built prompt through the local chat Port and accumulates chunks', async () => {
    const port = makePort();
    global.chrome.runtime.connect = jest.fn(() => port);
    const onChunk = jest.fn();
    const t = new SkilljarTranslator();

    const pending = t.chatStream('Explain tokens', 'ko', 'Lesson context', onChunk);
    await settlePortSetup();

    expect(global.chrome.runtime.connect).toHaveBeenCalledWith({ name: 'sb-local-chat' });
    expect(port.posted).toHaveLength(1);
    expect(port.posted[0]).toMatchObject({
      type: 'start',
      baseUrl: 'http://127.0.0.1:8080/v1',
      model: 'test-model',
    });
    expect(port.posted[0].messages[0].content).toContain('Explain tokens');
    expect(port.posted[0].messages[0].content).toContain('Lesson context');

    port.emitMessage({ type: 'chunk', delta: '안녕' });
    port.emitMessage({ type: 'chunk', delta: '하세요' });
    port.emitMessage({ type: 'done' });

    await expect(pending).resolves.toBe('안녕하세요');
    expect(onChunk).toHaveBeenNthCalledWith(1, '안녕', '안녕');
    expect(onChunk).toHaveBeenNthCalledWith(2, '하세요', '안녕하세요');
    expect(port.disconnect).toHaveBeenCalledTimes(1);
  });

  test('refinement uses the separate, wider local-refinement Port', async () => {
    const port = makePort();
    global.chrome.runtime.connect = jest.fn(() => port);
    const t = new SkilljarTranslator();

    const pending = t.refineText('Polish this block', { engine: 'local' });
    await settlePortSetup();
    port.emitMessage({ type: 'chunk', delta: 'Polished' });
    port.emitMessage({ type: 'done' });

    await expect(pending).resolves.toBe('Polished');
    expect(global.chrome.runtime.connect).toHaveBeenCalledWith({ name: 'sb-local-refinement' });
    expect(port.posted[0].messages).toEqual([{ role: 'user', content: 'Polish this block' }]);
  });

  test('cloud refinement forwards only the edit prompt and refuses an unrecognised engine', async () => {
    global.chrome.runtime.connect = jest.fn();
    const t = new SkilljarTranslator();
    t._cloudChatStream = jest.fn().mockResolvedValue('polished');

    await expect(t.refineText('Edit only this text', { engine: 'cloud', targetLang: 'ko' })).resolves.toBe('polished');
    expect(t._cloudChatStream).toHaveBeenCalledWith(
      'Edit only this text',
      'ko',
      null,
      expect.objectContaining({ model: 'claude-haiku-4-5' }),
    );
    expect(t._cloudChatStream.mock.calls[0][0]).not.toContain('Current course context');

    await expect(t.refineText('must stay local', { engine: 'experimental' })).rejects.toThrow(
      'refusing an unrecognised engine',
    );
    expect(global.chrome.runtime.connect).not.toHaveBeenCalled();
  });

  test('AbortSignal rejects cleanly and disconnects the Port exactly once', async () => {
    const port = makePort();
    global.chrome.runtime.connect = jest.fn(() => port);
    const controller = new AbortController();
    const t = new SkilljarTranslator();

    const pending = t._localChatStream('hello', jest.fn(), { signal: controller.signal });
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await settlePortSetup();
    controller.abort();

    await rejection;
    expect(port.disconnect).toHaveBeenCalledTimes(1);
    expect(port.posted).toHaveLength(1);
  });

  test('first-token and inter-token watchdogs reject a stalled stream and clear their timer', async () => {
    jest.useFakeTimers();
    const port = makePort();
    global.chrome.runtime.connect = jest.fn(() => port);
    const t = new SkilljarTranslator();

    const firstTokenPending = t._localChatStream('cold start', jest.fn());
    const firstTokenRejection = expect(firstTokenPending).rejects.toThrow('Local AI stream timed out');
    await settlePortSetup();
    await jest.advanceTimersByTimeAsync(240_000);
    await firstTokenRejection;
    expect(port.disconnect).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);

    const streamingPort = makePort();
    global.chrome.runtime.connect = jest.fn(() => streamingPort);
    const interTokenPending = t._localChatStream('mid stream', jest.fn());
    const interTokenRejection = expect(interTokenPending).rejects.toThrow('Local AI stream timed out');
    await settlePortSetup();
    streamingPort.emitMessage({ type: 'chunk', delta: 'first' });
    await jest.advanceTimersByTimeAsync(60_000);
    await interTokenRejection;
    expect(streamingPort.disconnect).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});

// ── Cache schema migration (v4.0.0) ────────────────────────────
// The published CWS build is v1.0.1 and it wrote into this SAME
// `skillbridge-cache` store at version 1. Its Puter/Gemini verify step could
// persist a non-translation ("Okay") or an empty reply as the translation
// (v3.5.40), and rows written before v3.5.41 never had protected brand terms
// restored. `_isValidTranslation` runs on the WRITE path only and cannot
// detect a short, well-formed wrong answer, so the inherited rows have to be
// dropped rather than filtered. These tests lock that migration in — without
// them a future "tidy up the upgrade handler" change silently re-inherits a
// poisoned 30-day cache for every upgrading user.
describe('_openDB — inherited v1.0.1 cache is dropped, not migrated', () => {
  /** Build a fake IDBOpenDBRequest + database that records what the handler did. */
  function fakeOpen({ existingStores = [] }) {
    const calls = { deleted: [], created: [], indexes: [] };
    const storeNames = new Set(existingStores);
    const db = {
      objectStoreNames: { contains: (name) => storeNames.has(name) },
      deleteObjectStore: (name) => {
        calls.deleted.push(name);
        storeNames.delete(name);
      },
      createObjectStore: (name, opts) => {
        calls.created.push({ name, opts });
        storeNames.add(name);
        return { createIndex: (idx, keyPath, opts2) => calls.indexes.push({ idx, keyPath, opts2 }) };
      },
    };
    return { calls, db };
  }

  let openArgs;
  let request;
  let warnSpy;

  beforeEach(() => {
    jest.useFakeTimers();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    openArgs = null;
    request = { onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
    global.indexedDB = {
      open: (name, version) => {
        openArgs = { name, version };
        return request;
      },
    };
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    warnSpy.mockRestore();
    global.indexedDB = { open: () => ({ onupgradeneeded: null, onsuccess: null, onerror: null }) };
  });

  test('opens skillbridge-cache at schema version 3', () => {
    const t = new SkilljarTranslator();
    t._openDB();
    expect(openArgs).toEqual({ name: 'skillbridge-cache', version: 3 });
  });

  // Rows cached before brand-term masking can hold a mistranslated brand name
  // (observed live: `ko\tAnthropic 과정` → `인류학적 과정`). The wrong forms are
  // ordinary words in the target language, so a targeted delete would either
  // miss rows or corrupt correct ones — the store is dropped instead.
  test('upgrading from v2 (pre-masking rows) also deletes the store', () => {
    const t = new SkilljarTranslator();
    t._openDB();
    const { calls, db } = fakeOpen({ existingStores: ['translations'] });
    request.onupgradeneeded({ target: { result: db }, oldVersion: 2 });

    expect(calls.deleted).toEqual(['translations']);
    expect(calls.created).toEqual([{ name: 'translations', opts: { keyPath: 'id' } }]);
  });

  test('upgrading from v1 (the published 1.0.1 schema) deletes the store and recreates it', () => {
    const t = new SkilljarTranslator();
    t._openDB();
    const { calls, db } = fakeOpen({ existingStores: ['translations'] });
    request.onupgradeneeded({ target: { result: db }, oldVersion: 1 });

    expect(calls.deleted).toEqual(['translations']);
    expect(calls.created).toEqual([{ name: 'translations', opts: { keyPath: 'id' } }]);
    // The lang index must come back with the store, or `_evictOldestEntries`
    // and any lang-scoped query silently lose their index.
    expect(calls.indexes).toEqual([{ idx: 'lang', keyPath: 'lang', opts2: { unique: false } }]);
  });

  test('a fresh install (oldVersion 0) creates the store without a delete', () => {
    const t = new SkilljarTranslator();
    t._openDB();
    const { calls, db } = fakeOpen({ existingStores: [] });
    request.onupgradeneeded({ target: { result: db }, oldVersion: 0 });

    expect(calls.deleted).toEqual([]);
    expect(calls.created).toEqual([{ name: 'translations', opts: { keyPath: 'id' } }]);
    expect(calls.indexes).toEqual([{ idx: 'lang', keyPath: 'lang', opts2: { unique: false } }]);
  });

  // The drop stays OPT-IN per bump: it is gated on CACHE_DROP_BELOW_VERSION,
  // not on CACHE_DB_VERSION. A future schema bump that only adds an index must
  // not silently wipe every user's cache, so raising the drop threshold has to
  // be a deliberate edit. This asserts a schema at the current threshold is
  // left alone.
  test('a schema at the drop threshold is NOT wiped — dropping is opt-in per bump', () => {
    const t = new SkilljarTranslator();
    t._openDB();
    const { calls, db } = fakeOpen({ existingStores: ['translations'] });
    request.onupgradeneeded({ target: { result: db }, oldVersion: 3 });

    expect(calls.deleted).toEqual([]);
    // Store already exists and is kept as-is.
    expect(calls.created).toEqual([]);
  });

  test('resolves via onsuccess and keeps the db handle', async () => {
    const t = new SkilljarTranslator();
    const pending = t._openDB();
    const handle = { objectStoreNames: { contains: () => true } };
    request.onsuccess({ target: { result: handle } });
    await expect(pending).resolves.toBe(true);
    expect(t._db).toBe(handle);
  });

  test('a failed open resolves non-fatally and leaves the cache disabled', async () => {
    const t = new SkilljarTranslator();
    const pending = t._openDB();
    request.onerror();
    await expect(pending).resolves.toBe(false);
    expect(t._db).toBeNull();
  });

  test('a blocked upgrade settles immediately and closes a later stale handle', async () => {
    const t = new SkilljarTranslator();
    const pending = t._openDB();

    request.onblocked();
    await expect(pending).resolves.toBe(false);
    expect(t._db).toBeNull();

    const lateHandle = { close: jest.fn() };
    request.onsuccess({ target: { result: lateHandle } });
    expect(lateHandle.close).toHaveBeenCalledTimes(1);
    expect(t._db).toBeNull();
  });

  test('a silent open times out and closes a later stale handle', async () => {
    const t = new SkilljarTranslator();
    const pending = t._openDB();

    await jest.advanceTimersByTimeAsync(3000);
    await expect(pending).resolves.toBe(false);
    expect(t._db).toBeNull();

    const lateHandle = { close: jest.fn() };
    request.onsuccess({ target: { result: lateHandle } });
    expect(lateHandle.close).toHaveBeenCalledTimes(1);
    expect(t._db).toBeNull();
  });
});
