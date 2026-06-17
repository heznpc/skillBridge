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

    test('is idempotent — applying twice equals applying once', () => {
      const once = restoreProtectedTerms('클로드 코드를 사용하여 기술을 만듭니다');
      const twice = restoreProtectedTerms(once);
      expect(twice).toBe(once);
    });

    test('returns empty string for null input (does not throw)', () => {
      // Real callers pass `null` when a Gemini stream aborts mid-flight;
      // the previous implementation crashed with `Cannot read .includes of null`.
      expect(restoreProtectedTerms(null)).toBe('');
    });

    test('returns empty string for undefined input (does not throw)', () => {
      expect(restoreProtectedTerms(undefined)).toBe('');
    });

    test('passes non-string input through unchanged', () => {
      // Defensive — a number sneaking in shouldn't crash. Returning the input
      // makes the corruption obvious upstream rather than masking it as "".
      expect(restoreProtectedTerms(42)).toBe(42);
    });
  });

  describe('hardening — empty / self-mapping wrong forms', () => {
    test('skips empty-string wrong forms (would corrupt every char)', () => {
      // String.prototype.replaceAll('', x) inserts x between every char.
      // Production must filter empties before they reach the replace step.
      buildProtectedTermsMap('ko', fakeTranslator({ Claude: ['', '클로드'] }));
      expect(restoreProtectedTerms('클로드 hi')).toBe('Claude hi');
    });

    test('skips wrong forms that equal their correct form (no-op cycle)', () => {
      // Self-mapping like { Claude: ['Claude'] } would do String.replaceAll
      // work for nothing on every pass; ensuring it's filtered keeps the hot
      // path tight as glossaries grow.
      buildProtectedTermsMap('ko', fakeTranslator({ Claude: ['Claude', '클로드'] }));
      expect(restoreProtectedTerms('Claude와 클로드')).toBe('Claude와 Claude');
    });

    test('skips non-string wrong forms inside the array (defensive)', () => {
      buildProtectedTermsMap('ko', fakeTranslator({ Claude: [null, undefined, 42, '클로드'] }));
      expect(restoreProtectedTerms('클로드')).toBe('Claude');
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

describe('GT gloss self-duplication collapse', () => {
  beforeEach(() => {
    resetProtectedTerms();
    buildProtectedTermsMap('ko', fakeTranslator(koProtected));
  });

  test('collapses the restore-induced dup: "클로드(Claude)" → "Claude"', () => {
    // GT emits "클로드(Claude)"; restore turns 클로드→Claude → "Claude(Claude)";
    // the collapse then yields a single "Claude".
    expect(restoreProtectedTerms('클로드(Claude)를 사용하세요')).toBe('Claude를 사용하세요');
  });

  test('collapses an already-duplicated "Claude(Claude)"', () => {
    expect(restoreProtectedTerms('Claude(Claude)')).toBe('Claude');
  });

  test('collapses with a space before the paren: "클로드 (Claude)"', () => {
    expect(restoreProtectedTerms('클로드 (Claude)')).toBe('Claude');
  });

  test('collapses fullwidth parens: "클로드（Claude）"', () => {
    expect(restoreProtectedTerms('클로드（Claude）')).toBe('Claude');
  });

  test('longer canonical term wins: "Claude Code(Claude Code)" → "Claude Code"', () => {
    expect(restoreProtectedTerms('Claude Code(Claude Code)')).toBe('Claude Code');
  });

  test('does NOT collapse a paren holding different text: "Claude (the assistant)"', () => {
    expect(restoreProtectedTerms('Claude (the assistant)')).toBe('Claude (the assistant)');
  });

  test('does NOT touch non-canonical self-dup like code "fn(fn)"', () => {
    // "fn" is not a protected term, so it never enters the collapse alternation.
    expect(restoreProtectedTerms('fn(fn)')).toBe('fn(fn)');
  });
});

// Regression guard for the corruption class documented in protected-terms.js:
// restoreProtectedTerms does an unanchored replaceAll with no CJK word boundary,
// so any _protected wrong-form that is itself a common standalone word silently
// corrupts correct prose (e.g. 클라우드 "Cloud" -> Claude, 인류 "humanity" ->
// Anthropic, 大型企业 "large enterprise" -> 大型Enterprise). This runs against the
// REAL shipped src/data/*.json (not a fixture), so it fails if a dangerous
// wrong-form is ever (re-)introduced into a CJK dictionary's _protected section.
describe('no corruption of correct CJK prose (real shipped dictionaries)', () => {
  // Each sentence is ordinary target-language prose containing a word that used
  // to be a dangerous wrong-form. After the fix it must pass through untouched.
  const cases = {
    ko: [
      '클라우드 컴퓨팅은 확장 가능합니다', // Cloud (was -> Claude)
      '인류의 미래를 생각합니다', // humanity (was -> Anthropic)
      '대기업 환경에서 일합니다', // large enterprise (was -> 대Enterprise)
      '기술자가 필요합니다', // technician (was -> skill자)
      '우리는 협업합니다', // collaborate (was -> Cowork)
      '문서의 앞부분을 읽으세요', // front part (was -> frontmatter)
      '개인적인 의견입니다', // personal opinion (was -> Personal)
    ],
    ja: [
      '人類の未来を考える', // humanity (was -> Anthropic)
      '個人的な意見です', // personal (was -> Personal)
      '共同作業のスペース', // joint work (was -> Cowork)
    ],
    'zh-CN': [
      '人类的未来', // humanity (was -> Anthropic)
      '大型企业环境', // large enterprise (was -> Enterprise)
      '任务调度系统', // task scheduling (was -> Dispatch)
      '个人观点', // personal view (was -> Personal)
      '团队协作', // team collaboration (was -> Cowork)
    ],
    'zh-TW': [
      '人類的未來', // humanity (was -> Anthropic)
      '大型企業環境', // large enterprise (was -> Enterprise)
      '任務調度系統', // task scheduling (was -> Dispatch)
      '個人觀點', // personal view (was -> Personal)
      '團隊協作', // team collaboration (was -> Cowork)
    ],
    // Latin/Cyrillic/Vietnamese locales — same bug class, swept later than the
    // CJK four. Each sentence is ordinary prose using the language's everyday
    // word that had been registered as a brand "wrong-form".
    es: [
      'estas habilidades de comunicación', // skills (was -> skills)
      'el envío de mensajes', // sending (was -> Dispatch)
      'un complemento útil', // add-on (was -> Plugin)
      'el trabajo conjunto del equipo', // joint work (was -> Cowork)
    ],
    fr: [
      'les compétences nécessaires', // skills (was -> skills)
      "l'extension de navigateur", // extension (was -> Plugin)
      'le travail collaboratif', // collaborative work (was -> Cowork)
      'le préambule du document', // preamble (was -> frontmatter)
    ],
    it: [
      'le competenze che svilupperai', // skills (was -> skills)
      'Collegare gli strumenti', // to connect (was -> Plugin)
      "l'abilità di scrivere", // ability (was -> skill)
      'la questione principale del corso', // main issue (was -> frontmatter)
    ],
    de: [
      'die Zusammenarbeit im Unternehmen', // collaboration + company (was -> Cowork/Enterprise)
      'diese Fähigkeiten sind wichtig', // abilities (was -> Skills)
      'eine nützliche Erweiterung', // extension (was -> Plugin)
      'Da ist ein Haken', // there's a catch (was -> hook)
    ],
    'pt-BR': [
      'essas habilidades de comunicação', // skills (was -> skills)
      'o envio de mensagens', // sending (was -> Dispatch)
      'o trabalho conjunto da equipe', // joint work (was -> Cowork)
      'Pessoal, vamos começar', // folks (was -> Personal)
    ],
    ru: [
      'эти навыки общения', // skills (was -> skills)
      'Совместная работа команды', // joint work (was -> Cowork)
      'Отправка сообщений', // sending (was -> Dispatch)
      'Персональный подход', // personal (was -> Personal)
    ],
    vi: [
      'những kỹ năng giao tiếp', // skills (was -> skills)
      'phần đầu của bài học', // the beginning (was -> frontmatter)
      'Doanh nghiệp phát triển', // business (was -> Enterprise)
      'cộng tác với nhau', // collaborate (was -> Cowork)
    ],
    id: [
      'Perusahaan ini berkembang pesat', // company (breaks if Enterprise -> Perusahaan is ever added)
      'keterampilan komunikasi yang penting', // skills (breaks if skills -> keterampilan)
      'Pasang kait pada dinding itu', // hook/hanger (breaks if hook -> kait)
      'kami menjalin kerja sama yang erat', // collaboration (breaks if Cowork -> kerja sama)
    ],
  };

  for (const [lang, sentences] of Object.entries(cases)) {
    test(`${lang}: correct prose is not corrupted by protected-term restoration`, () => {
      const dict = require(`../src/data/${lang}.json`);
      resetProtectedTerms();
      buildProtectedTermsMap(lang, fakeTranslator(dict._protected));
      for (const sentence of sentences) {
        expect(restoreProtectedTerms(sentence)).toBe(sentence);
      }
    });
  }
});

describe('restore engine — substring/boundary safety', () => {
  beforeEach(() => resetProtectedTerms());

  test('drops a wrong-form that is a substring of its own correct term (no self-corruption)', () => {
    // "subagen" ⊂ "subagent": unanchored replaceAll would yield "subagentt".
    buildProtectedTermsMap('id', fakeTranslator({ subagent: ['subagen'], subagents: ['subagen'] }));
    expect(restoreProtectedTerms('Buat subagent baru')).toBe('Buat subagent baru');
    expect(restoreProtectedTerms('Daftar subagents di sini')).toBe('Daftar subagents di sini');
  });

  test('Latin wrong-form is letter-boundary-anchored — never corrupts a longer word containing it', () => {
    buildProtectedTermsMap('xx', fakeTranslator({ Plugin: ['plug'] }));
    expect(restoreProtectedTerms('a plughole and a plug')).toBe('a plughole and a Plugin');
  });

  test('Latin standalone restoration still fires', () => {
    buildProtectedTermsMap('fr', fakeTranslator({ 'slash command': ['commande slash'] }));
    expect(restoreProtectedTerms('Tapez la commande slash.')).toBe('Tapez la slash command.');
  });

  test('CJK restoration is preserved when adjacent to a particle (CJK keeps substring matching)', () => {
    buildProtectedTermsMap('ko', fakeTranslator({ Claude: ['클로드'] }));
    expect(restoreProtectedTerms('클로드는 유용합니다')).toBe('Claude는 유용합니다');
  });

  test('CJK interpunct guard — a foreign person name (Claude Monet) is NOT corrupted', () => {
    // 克洛德 = both "Claude" (product) AND the given name of 克洛德·莫奈 (Claude Monet).
    // The middle dot (·/・) marks a foreign-name boundary, so the restore must skip it.
    buildProtectedTermsMap('zh-CN', fakeTranslator({ Claude: ['克洛德', '克劳德'] }));
    expect(restoreProtectedTerms('克洛德·莫奈是印象派画家')).toBe('克洛德·莫奈是印象派画家');
    buildProtectedTermsMap('ja', fakeTranslator({ Claude: ['クロード'] }));
    expect(restoreProtectedTerms('クロード・モネは画家です')).toBe('クロード・モネは画家です');
  });

  test('CJK interpunct guard — the standalone product term still restores', () => {
    buildProtectedTermsMap('zh-CN', fakeTranslator({ Claude: ['克洛德'] }));
    expect(restoreProtectedTerms('克洛德是一个 AI 助手')).toBe('Claude是一个 AI 助手');
  });
});
