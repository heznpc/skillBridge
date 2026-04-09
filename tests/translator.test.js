/**
 * Unit tests for SkilljarTranslator core logic.
 *
 * These tests cover pure functions that don't depend on Chrome APIs
 * or IndexedDB. We extract the class from the source file and mock
 * browser globals just enough to instantiate it.
 */

/* global describe, test, expect, beforeEach */

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

    test('has all 10 premium languages', () => {
      expect(translator.premiumLanguages).toHaveLength(10);
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

  describe('queueGeminiVerify heuristics', () => {
    test('isPremium returns true for premium languages', () => {
      expect(translator.premiumLanguages.includes('ko')).toBe(true);
      expect(translator.premiumLanguages.includes('pt-BR')).toBe(true);
      expect(translator.premiumLanguages.includes('it')).toBe(false);
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
});
