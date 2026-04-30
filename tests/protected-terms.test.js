/**
 * Unit tests for the Protected Terms system.
 *
 * Loads the real `src/lib/protected-terms.js` IIFE (the previous version of
 * this file re-implemented the functions inline, so production-code bugs
 * would have left every test green).
 */

/* global describe, test, expect, beforeEach */

const fs = require('fs');
const path = require('path');

// Production code expects `window` and `DEFAULT_PROTECTED_TERMS` in scope.
// We give it a sandboxed `window` so the IIFE attaches its API there, and
// a stand-in for the constants.js global it reaches for as a last-resort
// fallback (its actual value doesn't matter for these tests — it's only
// returned when `getProtectedTerms()` is empty).
const fakeWindow = {};
const DEFAULT_PROTECTED_TERMS = 'API, Claude, Anthropic';

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'protected-terms.js'), 'utf8');
new Function('window', 'DEFAULT_PROTECTED_TERMS', src)(fakeWindow, DEFAULT_PROTECTED_TERMS);

const { buildProtectedTermsMap, restoreProtectedTerms, resetProtectedTerms, getKeepEnglishTerms } =
  fakeWindow._protectedTerms;

const fakeTranslator = (entries) => ({ getProtectedTerms: () => entries });

const koProtected = {
  'Claude Code': ['클로드 코드', '클로드 Code', '클라우드 코드'],
  Claude: ['클로드', '클라우드'],
  Anthropic: ['앤스로픽', '앤트로픽', '안트로픽'],
  Enterprise: ['기업'],
  skill: ['기술', '스킬'],
  skills: ['기술들', '스킬들', '기술'],
  'SKILL.md': ['스킬.md', '기술.md'],
  frontmatter: ['프론트매터', '앞부분', '서문'],
};

describe('Protected Terms System (real production code)', () => {
  beforeEach(() => {
    resetProtectedTerms();
  });

  describe('buildProtectedTermsMap', () => {
    test('built map enables restoration of mistranslated terms', () => {
      buildProtectedTermsMap('ko', fakeTranslator(koProtected));
      // Black-box check: a mistranslation should be repaired.
      expect(restoreProtectedTerms('클로드 코드를 설치하세요')).toBe('Claude Code를 설치하세요');
    });

    test('skips rebuild for same language even if entries change', () => {
      buildProtectedTermsMap('ko', fakeTranslator(koProtected));
      // Calling again with the same lang but empty entries must NOT clear
      // the map — the cache key is the language code, not the data.
      buildProtectedTermsMap('ko', fakeTranslator({}));
      expect(restoreProtectedTerms('클로드')).toBe('Claude');
    });

    test('rebuilds for different language', () => {
      buildProtectedTermsMap('ko', fakeTranslator(koProtected));
      buildProtectedTermsMap('ja', fakeTranslator({ Claude: ['クロード'] }));
      // Old Korean map should be gone; new Japanese map active.
      expect(restoreProtectedTerms('クロード')).toBe('Claude');
      // Korean entry from previous lang must NOT still apply.
      expect(restoreProtectedTerms('클로드')).toBe('클로드');
    });

    test('longer wrong-form takes priority over shorter overlapping form', () => {
      // "클로드 코드" must resolve to "Claude Code", not "Claude 코드".
      buildProtectedTermsMap('ko', fakeTranslator(koProtected));
      expect(restoreProtectedTerms('클로드 코드 설치')).toBe('Claude Code 설치');
    });

    test('handles entries with non-array values (skips them)', () => {
      buildProtectedTermsMap('ko', fakeTranslator({ Claude: 'not-an-array' }));
      // Bad shape must not crash; restoration becomes a no-op.
      expect(restoreProtectedTerms('클로드')).toBe('클로드');
    });

    test('handles missing getProtectedTerms gracefully', () => {
      buildProtectedTermsMap('ko', {}); // translator without the method
      expect(restoreProtectedTerms('클로드')).toBe('클로드');
    });
  });

  describe('restoreProtectedTerms', () => {
    beforeEach(() => {
      buildProtectedTermsMap('ko', fakeTranslator(koProtected));
    });

    test('returns unchanged text when no protected term matches', () => {
      expect(restoreProtectedTerms('안녕하세요')).toBe('안녕하세요');
    });

    test('fixes single mistranslation', () => {
      expect(restoreProtectedTerms('클로드는 AI입니다')).toBe('Claude는 AI입니다');
    });

    test('fixes multiple mistranslations in one string', () => {
      const result = restoreProtectedTerms('클로드 코드를 사용하여 기술을 만듭니다');
      expect(result).toContain('Claude Code');
      expect(result).toContain('skills');
    });

    test('fixes Enterprise term', () => {
      expect(restoreProtectedTerms('기업 플랜을 사용하세요')).toBe('Enterprise 플랜을 사용하세요');
    });

    test('fixes frontmatter term', () => {
      expect(restoreProtectedTerms('프론트매터를 작성하세요')).toBe('frontmatter를 작성하세요');
    });

    test('fixes SKILL.md term', () => {
      expect(restoreProtectedTerms('스킬.md 파일을 만드세요')).toBe('SKILL.md 파일을 만드세요');
    });

    test('handles empty string', () => {
      expect(restoreProtectedTerms('')).toBe('');
    });

    test('returns input when no map is built (after reset)', () => {
      resetProtectedTerms();
      // Reset only clears the lang cache; the sorted map stays. Build with
      // empty entries to actually empty the map.
      buildProtectedTermsMap('ja', fakeTranslator({}));
      expect(restoreProtectedTerms('클로드')).toBe('클로드');
    });

    test('replaces all occurrences of the same wrong form', () => {
      expect(restoreProtectedTerms('클로드 클로드 클로드')).toBe('Claude Claude Claude');
    });
  });

  describe('getKeepEnglishTerms', () => {
    test('returns the comma-joined list of correct terms', () => {
      buildProtectedTermsMap('ko', fakeTranslator({ Claude: ['클로드'], API: ['에이피아이'] }));
      const terms = getKeepEnglishTerms();
      expect(terms).toContain('Claude');
      expect(terms).toContain('API');
    });

    test('falls back to DEFAULT_PROTECTED_TERMS when entries are empty', () => {
      buildProtectedTermsMap('ko', fakeTranslator({}));
      expect(getKeepEnglishTerms()).toBe(DEFAULT_PROTECTED_TERMS);
    });
  });
});
