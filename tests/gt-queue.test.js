/**
 * Unit tests for the pure-function half of gt-queue.js — the parts that
 * don't need a DOM. Extracted via regex from the IIFE source so production
 * code stays the source of truth (same pattern as protected-terms /
 * format-response tests).
 *
 * `isLikelyEnglish` is the gate that decides whether an element / text node
 * is worth sending to Google Translate. False positives = mistranslated
 * Korean/Japanese text; false negatives = unhelpful English left untranslated.
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'gt-queue.js'), 'utf8');
const match = src.match(/function isLikelyEnglish\(text\)\s*\{[\s\S]*?\n {2}\}/);
const isLikelyEnglish = new Function(`${match[0]}\nreturn isLikelyEnglish;`)();

// ============================================================
// RESIDUE CLASSIFICATION — protected-term-aware ratio
// ============================================================
//
// The E2E (tests/e2e/mixed-localization.spec.js) owns the SEMANTIC contract:
// already-target-language content is never re-translated, English residue is.
// This block owns the IMPLEMENTATION: the ratio, its 50% boundary, and the
// term discount. The 50% figure is an implementation detail — if the
// classifier is ever replaced, these tests should be replaced with it while
// the E2E contract survives untouched.
describe('isLikelyEnglish — protected-term discount', () => {
  /** Run `fn` with a stub protected-terms global installed. */
  function withTerms(terms, fn) {
    const had = 'window' in global;
    const prev = global.window;
    global.window = { _protectedTerms: { getProtectedTermList: () => terms } };
    try {
      return fn();
    } finally {
      if (had) global.window = prev;
      else delete global.window;
    }
  }

  // Longest-first is how protected-terms.js hands the list over.
  const TERMS = ['Anthropic Academy', 'Computer Use', 'Claude Code', 'Anthropic', 'Claude', 'API', 'SDK'];

  test('term-dense Korean is not English once the terms are discounted', () => {
    withTerms(TERMS, () => {
      expect(isLikelyEnglish('Claude API를 사용하세요')).toBe(false);
      expect(isLikelyEnglish('Claude Code와 Computer Use를 사용한 Anthropic 앱')).toBe(false);
      // #299's incident string: 82% Latin as written, 0% once discounted.
      expect(isLikelyEnglish('Anthropic 과정')).toBe(false);
    });
  });

  test('real English stays English after the discount', () => {
    withTerms(TERMS, () => {
      expect(isLikelyEnglish('Use the Claude API')).toBe(true);
      expect(isLikelyEnglish('Making a request')).toBe(true);
      expect(isLikelyEnglish('Tool use with Claude')).toBe(true);
    });
  });

  test('a term followed directly by a particle is still discounted', () => {
    // Masking anchors on letter boundaries and so misses "Computer Use를";
    // measurement deliberately does not, which is the whole reason the two
    // use different rules over the same inventory.
    withTerms(['Computer Use'], () => {
      expect(isLikelyEnglish('Computer Use를 켜세요')).toBe(false);
    });
  });

  test('longest-first matters: a bare prefix must not leave a tail behind', () => {
    // With 'Claude' applied before 'Claude Code', "Code" survives and counts
    // as English. The list is longest-first for exactly this reason.
    withTerms(TERMS, () => {
      expect(isLikelyEnglish('Claude Code 소개')).toBe(false);
    });
  });

  test('a block that is nothing but protected terms is not translatable text', () => {
    withTerms(TERMS, () => {
      expect(isLikelyEnglish('Claude Code')).toBe(false);
    });
  });

  test('with no terms available it is exactly the old ratio', () => {
    // Before buildProtectedTermsMap runs, and in every non-DOM caller.
    withTerms([], () => {
      expect(isLikelyEnglish('Anthropic 과정')).toBe(true);
    });
    expect(isLikelyEnglish('Anthropic 과정')).toBe(true);
  });
});

describe('isLikelyEnglish', () => {
  test('classic English sentence → true', () => {
    expect(isLikelyEnglish('Hello world, how are you?')).toBe(true);
  });

  test('Hangul-only string → false', () => {
    expect(isLikelyEnglish('안녕하세요 반갑습니다')).toBe(false);
  });

  test('Kana / Kanji string → false', () => {
    expect(isLikelyEnglish('こんにちは世界')).toBe(false);
  });

  test('Simplified Chinese string → false', () => {
    expect(isLikelyEnglish('你好世界，欢迎来到这里')).toBe(false);
  });

  test('mostly Cyrillic → false', () => {
    expect(isLikelyEnglish('Привет мир')).toBe(false);
  });

  test('Korean with English code-mix ("Claude를 사용하세요") → false at majority threshold', () => {
    // 6 ASCII letters out of ~13 non-space chars. Below the 50% threshold.
    expect(isLikelyEnglish('Claude를 사용하세요')).toBe(false);
  });

  test('English with a sprinkle of Korean ("Use Claude 잘") → true', () => {
    // 8 ASCII letters out of 10 non-space chars.
    expect(isLikelyEnglish('Use Claude 잘')).toBe(true);
  });

  test('whitespace and tabs do not count toward the ratio', () => {
    // Without the whitespace skip a string like "a\t\t" would count tab chars
    // toward the non-Latin denominator and flip the result.
    expect(isLikelyEnglish('a\t\tb\n')).toBe(true);
  });

  test('empty string → false', () => {
    expect(isLikelyEnglish('')).toBe(false);
  });

  test('whitespace-only string → false (no non-whitespace chars)', () => {
    expect(isLikelyEnglish('   \t\n')).toBe(false);
  });

  test('all numbers → false (digits are non-Latin in this gate)', () => {
    // "12345" has 0 Latin letters, 5 non-whitespace chars → 0/5 < 0.5.
    expect(isLikelyEnglish('12345')).toBe(false);
  });

  test('Latin letters + digits → still true when letters dominate', () => {
    // "Claude 4.6" has 6 Latin letters, 3 digits, 1 dot → 6/10 = 0.6.
    expect(isLikelyEnglish('Claude 4.6')).toBe(true);
  });

  test('exactly 50% Latin → false (strict greater-than)', () => {
    // 2 Latin out of 4 non-whitespace = 0.5 exactly; threshold is `> 0.5`.
    expect(isLikelyEnglish('ab가나')).toBe(false);
  });
});

describe('inline routing invariants', () => {
  test('structured blocks never take the flattening flat-GT path', () => {
    // Structured blocks (inline tags or interactive labels) must never be
    // flattened by safeReplaceText. They always ride the deterministic,
    // structure-preserving HTML-GT path, even when the AI bridge is available.
    expect(src).not.toContain('const useGeminiBlocks = sb.hostCaps?.bridge !== false;');
    expect(src).toContain('const isStructured = (item) => item.hasInlineTags || item.hasInteractive;');
    // flat GT path gets plain-text blocks only
    expect(src).toContain('return uncached.filter((item) => !isStructured(item));');
    // every structured block is routed to the HTML-GT queue, not flattened
    expect(src).toContain('for (const item of structured) if (item.el?.parentNode) htmlQueue.push(item);');
    expect(src).not.toContain('queueGeminiBlockTranslation');
  });

  test('HTML-GT path applies through the integrity gate + reconciliation', () => {
    // The structure-preserving path never assigns el.innerHTML; it gates on
    // tag/href integrity and reconciles original nodes back in.
    expect(src).toContain('if (!htmlGt.checkTagIntegrity(el, root)) return false;');
    expect(src).toContain('if (!htmlGt.reconcileHtml(el, root)) return false;');
    expect(src).toContain('_restoreProtectedInTextNodes(el)');
  });

  test('interactive detection is a deep query, not a direct-children check', () => {
    // hasInlineTags only inspects direct children, so wrapper shapes like
    // <p><span>text <a>link</a></span></p> slip past it. The routing guard
    // must therefore use a descendant query.
    expect(src).toContain('el.querySelector(\'a, button, summary, [role="button"], [role="link"]\')');
    expect(src).toContain('hasInteractive: _hasInteractiveEls(el)');
  });
});

// ============================================================
// DOUBLE-TRANSLATION GUARD (source contract)
// ============================================================
//
// Regression cover for the brand-name loss found live 2026-08-19. Root cause:
// `applyStaticTranslations` re-runs on a LATE_CONTENT timer and on every SPA
// route change and re-scans the whole page, so the static dictionary's own
// output re-entered `processOneElement` as if it were source English:
//
//   "Anthropic courses" --static--> "Anthropic 과정" --GT--> "인류학적 과정"
//
// "Anthropic 과정" is 82% Latin characters, so `isLikelyEnglish` classified it
// as English and sent it back to Google Translate. The IndexedDB cache still
// held the proof: a row keyed `ko\tAnthropic 과정`, i.e. a key that was already
// translated. These assertions pin the guard's wiring, which a DOM-free test
// cannot exercise directly (processOneElement needs `_sb`, a translator and a
// live document).
describe('processOneElement re-processing guard', () => {
  const processOne = src.slice(
    src.indexOf('function processOneElement'),
    src.indexOf('function applyStaticTranslations'),
  );

  test('the guard runs before the English heuristic that misclassified our output', () => {
    const guardAt = processOne.indexOf('alreadyTranslated(el, fullText)');
    const heuristicAt = processOne.indexOf('isLikelyEnglish(fullText)');
    expect(guardAt).toBeGreaterThan(-1);
    // Ordering matters: isLikelyEnglish is exactly what mis-fires on
    // already-translated mixed text, so the guard must short-circuit first.
    expect(guardAt).toBeLessThan(heuristicAt);
  });

  test('every successful static path records what it wrote', () => {
    // Both static exits — whole-element replace and per-text-node replace —
    // must mark, or the un-marked one keeps leaking into GT.
    expect(processOne.match(/markTranslated\(el\)/g)).toHaveLength(2);
  });

  test('the GT apply path marks too, so Latin-script locales stop re-translating', () => {
    // For es/fr/de the GT output is still >50% Latin, so without this the
    // element would be re-sent to GT on every subsequent pass.
    const track = src.slice(
      src.indexOf('function trackTranslatedElement'),
      src.indexOf('function pruneDetachedEntries'),
    );
    expect(track).toContain('markTranslated(el)');
  });

  test('marks are scoped to the language generation so a switch re-translates', () => {
    expect(src).toContain('_lastWritten.set(el, { gen: gtGeneration, out: el.textContent.trim() })');
    expect(src).toContain('prior.gen === gtGeneration && prior.out === currentText');
  });

  test('marks live in a WeakMap so detached nodes are not retained', () => {
    expect(src).toContain('const _lastWritten = new WeakMap()');
  });
});
