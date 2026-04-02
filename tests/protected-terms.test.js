/**
 * Unit tests for the Protected Terms system (from content.js).
 *
 * Tests the buildProtectedTermsMap + restoreProtectedTerms logic
 * by reimplementing the pure functions (they live inside content.js IIFE).
 */

/* global describe, test, expect, beforeEach */

// ── Reimplementation of protected terms logic ──────────────────
// (Extracted from content.js since the IIFE makes it hard to import directly)

let PROTECTED_TERMS_SORTED = [];
let _protectedTermsLang = null;

function buildProtectedTermsMap(targetLang, protectedEntries) {
  if (_protectedTermsLang === targetLang) return;
  _protectedTermsLang = targetLang;

  const map = {};
  for (const [correct, wrongForms] of Object.entries(protectedEntries)) {
    if (Array.isArray(wrongForms)) {
      for (const wrong of wrongForms) {
        map[wrong] = correct;
      }
    }
  }
  PROTECTED_TERMS_SORTED = Object.entries(map).sort((a, b) => b[0].length - a[0].length);
}

function restoreProtectedTerms(text) {
  if (PROTECTED_TERMS_SORTED.length === 0) return text;
  let result = text;
  for (const [wrong, correct] of PROTECTED_TERMS_SORTED) {
    if (result.includes(wrong)) {
      result = result.replaceAll(wrong, correct);
    }
  }
  return result;
}

function resetState() {
  PROTECTED_TERMS_SORTED = [];
  _protectedTermsLang = null;
}

// ── Tests ──────────────────────────────────────────────────────

describe('Protected Terms System', () => {
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

  beforeEach(() => {
    resetState();
  });

  describe('buildProtectedTermsMap', () => {
    test('builds map from protected entries', () => {
      buildProtectedTermsMap('ko', koProtected);
      expect(PROTECTED_TERMS_SORTED.length).toBeGreaterThan(0);
    });

    test('skips rebuild for same language', () => {
      buildProtectedTermsMap('ko', koProtected);
      const firstBuild = [...PROTECTED_TERMS_SORTED];
      buildProtectedTermsMap('ko', {}); // different data, same lang
      expect(PROTECTED_TERMS_SORTED).toEqual(firstBuild); // unchanged
    });

    test('rebuilds for different language', () => {
      buildProtectedTermsMap('ko', koProtected);
      const koBuild = [...PROTECTED_TERMS_SORTED];
      buildProtectedTermsMap('ja', { Claude: ['クロード'] });
      expect(PROTECTED_TERMS_SORTED).not.toEqual(koBuild);
    });

    test('sorts by length descending (longer matches first)', () => {
      buildProtectedTermsMap('ko', koProtected);
      for (let i = 1; i < PROTECTED_TERMS_SORTED.length; i++) {
        expect(PROTECTED_TERMS_SORTED[i - 1][0].length).toBeGreaterThanOrEqual(PROTECTED_TERMS_SORTED[i][0].length);
      }
    });
  });

  describe('restoreProtectedTerms', () => {
    beforeEach(() => {
      buildProtectedTermsMap('ko', koProtected);
    });

    test('returns unchanged text when no matches', () => {
      expect(restoreProtectedTerms('안녕하세요')).toBe('안녕하세요');
    });

    test('fixes single mistranslation', () => {
      expect(restoreProtectedTerms('클로드는 AI입니다')).toBe('Claude는 AI입니다');
    });

    test('fixes multiple mistranslations in one string', () => {
      const input = '클로드 코드를 사용하여 기술을 만듭니다';
      const result = restoreProtectedTerms(input);
      expect(result).toContain('Claude Code');
      expect(result).toContain('skills');
    });

    test('longer match takes priority over shorter', () => {
      // "클로드 코드" should match "Claude Code", not "Claude 코드"
      const result = restoreProtectedTerms('클로드 코드 설치');
      expect(result).toBe('Claude Code 설치');
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

    test('returns input when no map is built', () => {
      resetState();
      expect(restoreProtectedTerms('클로드')).toBe('클로드');
    });
  });
});
