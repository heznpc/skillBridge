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

// Load selectors + constants first (constants.js depends on selectors, translator.js depends on constants)
const selectorsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'selectors.js'), 'utf8');
const constantsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'constants.js'), 'utf8');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'translator.js'), 'utf8');

// Combine selectors + constants + translator in a single eval so all are in scope
let SkilljarTranslator;
try {
  const combined = `(function() { ${selectorsSrc}; ${constantsSrc}; ${src}; return SkilljarTranslator; })()`;
  SkilljarTranslator = eval(combined);
} catch (_e) {
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

    test('has all 12 premium languages (Indonesian added v3.5.41)', () => {
      expect(translator.premiumLanguages).toHaveLength(12);
      expect(translator.premiumLanguages).toContain('it');
      expect(translator.premiumLanguages).toContain('id');
    });

    test('supportedLanguages includes 30+ languages', () => {
      expect(Object.keys(translator.supportedLanguages).length).toBeGreaterThanOrEqual(30);
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
    let warnSpy;

    beforeEach(() => {
      originalFetch = global.fetch;
      translator.staticDict = { Hello: '안녕하세요' };
      translator._lowerDict = { hello: '안녕하세요' };
      translator._protectedTerms = { Claude: ['클로드'] };
    });

    afterEach(() => {
      global.fetch = originalFetch;
      warnSpy?.mockRestore();
      warnSpy = null;
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

    test('restores protected terms on immediate Google results before verify queueing', async () => {
      translator.cachedLookup = jest.fn(async () => null);
      translator.googleTranslate = jest.fn(async () => '클로드 프롬프트 예시');
      translator.queueGeminiVerify = jest.fn();

      const result = await translator.translate('This is a Claude prompt example', 'ko');

      expect(result).toEqual({ text: 'Claude 프롬프트 예시', source: 'google' });
      expect(translator.queueGeminiVerify).toHaveBeenCalledWith(
        'This is a Claude prompt example',
        'Claude 프롬프트 예시',
        'ko',
      );
    });
  });

  describe('queueGeminiVerify heuristics', () => {
    test('isPremium returns true for premium languages (Italian promoted v3.5.34)', () => {
      expect(translator.premiumLanguages.includes('ko')).toBe(true);
      expect(translator.premiumLanguages.includes('pt-BR')).toBe(true);
      expect(translator.premiumLanguages.includes('it')).toBe(true);
      // Sanity: a still-Standard language should remain non-premium
      expect(translator.premiumLanguages.includes('nl')).toBe(false);
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

  for (const file of files) {
    describe(file, () => {
      let data;

      beforeEach(() => {
        data = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
      });

      test('is valid JSON', () => {
        expect(data).toBeDefined();
        expect(typeof data).toBe('object');
      });

      test('has _meta section', () => {
        expect(data._meta).toBeDefined();
        expect(data._meta.lang).toBeDefined();
      });

      test('has _protected section', () => {
        expect(data._protected).toBeDefined();
        expect(typeof data._protected).toBe('object');
      });

      test('_protected values are arrays', () => {
        for (const [_key, value] of Object.entries(data._protected)) {
          expect(Array.isArray(value)).toBe(true);
          // Each array should have at least one entry
          expect(value.length).toBeGreaterThan(0);
        }
      });

      test('no empty string values in dict entries', () => {
        let emptyCount = 0;
        const check = (obj) => {
          for (const [k, v] of Object.entries(obj)) {
            if (k === '_meta' || k === '_protected') continue;
            if (typeof v === 'string' && v === '') emptyCount++;
            else if (typeof v === 'object' && v !== null && !Array.isArray(v)) check(v);
          }
        };
        check(data);
        expect(emptyCount).toBe(0);
      });
    });
  }

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

describe('chatStream — bridge-not-ready propagates as a rejection', () => {
  test('rejects (does not silently resolve to a string) when the bridge is not ready', async () => {
    const t = new SkilljarTranslator();
    t.isReady = false;
    // The sole caller (sidebar-chat) discards chatStream's return value and
    // relies on a thrown error to render the error bubble + retry button. If
    // this resolves to a string instead, the "thinking…" spinner is stranded
    // forever with no error and no retry.
    await expect(t.chatStream('hello', 'ko', '', () => {}, {})).rejects.toThrow('Bridge not ready');
  });
});

describe('_verifySingle — a non-translation Gemini reply never replaces the GT result', () => {
  // Verify only runs on source text >= GEMINI_MIN_TEXT (80 chars), so the tests
  // use a realistic long source — that's the regime the length guard targets and
  // the regime production actually hits. (The earlier version of this block used
  // a 5-char 'Hello' source, which is unreachable in production and let short
  // affirmations look fine.)
  const ORIGINAL = 'Anthropic released the Claude model family to help developers build safe and reliable AI agents.';
  const GT =
    '앤트로픽은 개발자가 안전하고 신뢰할 수 있는 AI 에이전트를 구축하도록 돕기 위해 Claude 모델 제품군을 출시했습니다.';

  function harness(geminiReply) {
    const t = new SkilljarTranslator();
    const cached = [];
    const notified = [];
    t._sendRequest = async () => geminiReply;
    t._cacheTranslation = async (original, translation, lang) => {
      cached.push({ original, translation, lang });
    };
    t._notifyUpdate = (original, translation, lang, wasImproved) => {
      notified.push({ original, translation, lang, wasImproved });
    };
    return { t, cached, notified };
  }

  // Replies that mean "the Google translation is good" (bare OK + variants) AND
  // replies that are stray affirmations / junk Gemini emits instead of a clean
  // OK or a real translation. NONE of these may be cached or rendered as the
  // translation — the user must keep the correct Google output. The second group
  // is exactly what shipped broken before the length guard.
  const keepGtReplies = [
    'OK',
    'ok.',
    '"OK"', // clean OK forms (handled by the OK normalizer)
    'OK?',
    'OK,',
    'Okay',
    'OK입니다',
    '“OK”', // curly-quoted
    '- OK',
    'OK, looks good',
    '   ', // whitespace-only must NOT blank the element
  ];
  for (const reply of keepGtReplies) {
    test(`reply ${JSON.stringify(reply)} keeps the Google translation (not cached/rendered as the reply)`, async () => {
      const { t, cached, notified } = harness(reply);
      await t._verifySingle({ original: ORIGINAL, googleTranslation: GT, targetLang: 'ko' });
      // The GT result is what gets cached...
      expect(cached).toHaveLength(1);
      expect(cached[0].translation).toBe(GT);
      // ...and the render notification is wasImproved=false (so content.js does
      // NOT call safeReplaceText — the reply string never reaches the DOM).
      expect(notified).toHaveLength(1);
      expect(notified[0].translation).toBe(GT);
      expect(notified[0].wasImproved).toBe(false);
    });
  }

  test('a genuine, full-length improved translation IS cached and rendered as the improvement', async () => {
    const improved =
      '앤트로픽은 개발자들이 안전하고 신뢰할 수 있는 AI 에이전트를 만들 수 있도록 돕고자 Claude 모델 제품군을 공개했습니다.';
    const { t, cached, notified } = harness(improved);
    await t._verifySingle({ original: ORIGINAL, googleTranslation: GT, targetLang: 'ko' });
    expect(cached[0].translation).toBe(improved);
    expect(notified[0].wasImproved).toBe(true);
  });

  test('restores protected terms before caching or notifying an OK Google result', async () => {
    global.window._protectedTerms = {
      restoreProtectedTerms: (text) => text.replaceAll('앤스로픽', 'Anthropic').replaceAll('클로드', 'Claude'),
    };

    try {
      const { t, cached, notified } = harness('OK');
      const badGt = '앤스로픽은 클로드를 프런티어 모델로 출시했습니다.';

      await t._verifySingle({ original: ORIGINAL, googleTranslation: badGt, targetLang: 'ko' });

      expect(cached).toHaveLength(1);
      expect(cached[0].translation).toBe('Anthropic은 Claude를 프런티어 모델로 출시했습니다.');
      expect(notified[0].translation).toBe('Anthropic은 Claude를 프런티어 모델로 출시했습니다.');
      expect(notified[0].translation).not.toContain('앤스로픽');
      expect(notified[0].translation).not.toContain('클로드');
    } finally {
      delete global.window._protectedTerms;
    }
  });
});
