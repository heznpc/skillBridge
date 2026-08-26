/**
 * SkillBridge — is this refinement allowed to replace the baseline?
 *
 * Machine translation of technical material has a characteristic failure: the
 * grammar is fine and a term is wrong. A language model is good at fixing that
 * — and good, in the same breath, at rewriting an API endpoint, dropping a
 * version number, "correcting" a code identifier, or answering the prompt
 * instead of editing the text.
 *
 * So refinement is a POST-EDITOR with a veto, not a translator. The Google
 * Translate baseline is written to the page first and stays there; a refinement
 * only replaces it if it survives every check below; and a check that fails
 * leaves the baseline exactly where it was. Nothing here can make the page
 * worse than not running at all — which is the only basis on which an optional
 * feature that spends a model call per paragraph is worth offering.
 *
 * The checks are all of the same shape: something must survive the edit
 * unchanged. That is deliberate. A quality judgement ("is this better Korean?")
 * is exactly what a model would have to be trusted for, and trusting the model
 * to grade its own output is not a validator. Preservation is checkable.
 *
 * Pure: strings in, a verdict out. Nothing here touches the DOM or the network.
 */

/** What a refinement broke. Reported, not summarised into a boolean. */
const REFINE_VIOLATION = Object.freeze({
  /** The candidate is empty, or whitespace only. */
  EMPTY: 'empty',
  /** A protected brand or technical term was dropped, added, or altered. */
  PROTECTED_TERM: 'protected-term',
  /** A number appears a different number of times, or with a different value. */
  NUMBER: 'number',
  /** A URL was changed, dropped, or invented. */
  URL: 'url',
  /** Text inside a code span differs. */
  CODE: 'code',
  /** The HTML tag structure or a link target changed. */
  HTML: 'html',
  /** The candidate is not written in the target language. */
  WRONG_LANGUAGE: 'wrong-language',
  /** The candidate is implausibly longer or shorter than the baseline. */
  LENGTH: 'length',
  /** The candidate is the untranslated source — a refusal, or a passthrough. */
  REVERTED_TO_SOURCE: 'reverted-to-source',
});

/**
 * How far a refinement may drift in length before it is presumed to be
 * something other than an edit.
 *
 * A post-edit of a translated paragraph changes words, not size. A result at
 * three times the length is a model explaining itself ("Here is the corrected
 * translation: …"), and one at a third is a summary. Both are wrong in a way
 * no term check would catch, because both can preserve every term.
 */
const REFINE_LENGTH_MIN_RATIO = 0.45;
const REFINE_LENGTH_MAX_RATIO = 2.2;

/**
 * Numbers, kept as written.
 *
 * Compared as strings, not values: `1.0` and `1` are the same quantity and
 * different version numbers, and the second is what appears in technical
 * copy. A separator swap (1,000 → 1.000) is likewise a real change even
 * though both parse to a number in some locale.
 */
const _NUMBER_RE = /\d+(?:[.,]\d+)*/g;

/** URLs and bare hostnames that look like endpoints. */
const _URL_RE = /(?:https?:\/\/|www\.)[^\s<>"'`)\]]+/gi;

/** Inline code: <code>…</code> and backtick spans. */
const _CODE_RE = /<code\b[^>]*>([\s\S]*?)<\/code>|`([^`]+)`/gi;

/** Tag name plus href/src, in document order — the structure that must survive. */
const _TAG_RE = /<\s*\/?\s*([a-z][a-z0-9-]*)\b[^>]*>/gi;
const _HREF_RE = /\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

/** Every match of `re` in `text`, as a sorted multiset key list. */
function _collect(text, re, pick) {
  const out = [];
  const source = String(text || '');
  re.lastIndex = 0;
  let match = re.exec(source);
  while (match) {
    const value = pick ? pick(match) : match[0];
    if (value != null && value !== '') out.push(String(value));
    match = re.exec(source);
  }
  return out.sort();
}

/** Two multisets, compared as sorted lists. */
function _sameMultiset(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/** Count non-overlapping occurrences of `needle`, case-sensitively. */
function _countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) return count;
    count += 1;
    from = index + needle.length;
  }
}

/** Collapse whitespace so a reflow is not read as an edit. */
function _normalize(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Decide whether `candidate` may replace `baseline`.
 *
 * @param {object} args
 * @param {string} args.baseline   The Google Translate output currently on the page.
 * @param {string} args.candidate  What the model returned.
 * @param {string} [args.source]   The original English, when the caller has it.
 * @param {string[]} [args.protectedTerms] Terms that must survive verbatim.
 * @returns {{ ok: boolean, violations: string[], detail: object }}
 */
/**
 * Scripts whose presence can be checked without language identification.
 *
 * Only these targets get the check. Telling Spanish from English needs real
 * language ID, which this codebase does not have — the same limit that makes
 * the Academy localization policy fail closed on Latin locales. Claiming a
 * check we cannot perform would be worse than admitting the gap.
 */
const TARGET_SCRIPTS = Object.freeze({
  ko: /[\uAC00-\uD7AF\u1100-\u11FF]/,
  ja: /[\u3040-\u30FF\u4E00-\u9FFF]/,
  'zh-CN': /[\u4E00-\u9FFF]/,
  'zh-TW': /[\u4E00-\u9FFF]/,
  zh: /[\u4E00-\u9FFF]/,
  ru: /[\u0400-\u04FF]/,
  ar: /[\u0600-\u06FF]/,
  hi: /[\u0900-\u097F]/,
  th: /[\u0E00-\u0E7F]/,
});

function validateRefinement({ baseline, candidate, source = '', targetLang = '', protectedTerms = [] } = {}) {
  const violations = [];
  const detail = {};
  const base = String(baseline || '');
  const cand = String(candidate || '');

  if (!_normalize(cand)) {
    return { ok: false, violations: [REFINE_VIOLATION.EMPTY], detail };
  }

  // A model that declined, or echoed the prompt, hands back the English. That
  // is not an improvement over a translated baseline; it is a regression the
  // learner would read as the extension breaking.
  if (source && _normalize(cand) === _normalize(source) && _normalize(base) !== _normalize(source)) {
    violations.push(REFINE_VIOLATION.REVERTED_TO_SOURCE);
  }

  // An exact echo of the source is caught above, but a PARAPHRASE of it is
  // not: "Use the Claude API for this request" keeps every term, number, URL
  // and length bound while being English. Where the target uses a script Latin
  // does not, requiring that script is a cheap, deterministic check that the
  // answer is in the language the learner asked for.
  const script = TARGET_SCRIPTS[targetLang];
  if (script && !script.test(cand)) {
    violations.push(REFINE_VIOLATION.WRONG_LANGUAGE);
    detail.targetLang = targetLang;
  }

  const baseLen = _normalize(base).length;
  const candLen = _normalize(cand).length;
  if (baseLen > 0) {
    const ratio = candLen / baseLen;
    detail.lengthRatio = Number(ratio.toFixed(3));
    if (ratio < REFINE_LENGTH_MIN_RATIO || ratio > REFINE_LENGTH_MAX_RATIO) {
      violations.push(REFINE_VIOLATION.LENGTH);
    }
  }

  // Protected terms: counted, not merely present. A model that keeps one
  // "Claude" and translates the other three has still corrupted the passage,
  // and a presence check would call that fine.
  const termDetail = [];
  for (const term of protectedTerms) {
    const inBase = _countOccurrences(base, term);
    if (inBase === 0) continue;
    const inCand = _countOccurrences(cand, term);
    if (inCand !== inBase) termDetail.push({ term, baseline: inBase, candidate: inCand });
  }
  if (termDetail.length > 0) {
    violations.push(REFINE_VIOLATION.PROTECTED_TERM);
    detail.terms = termDetail;
  }

  const baseNumbers = _collect(base, _NUMBER_RE);
  const candNumbers = _collect(cand, _NUMBER_RE);
  if (!_sameMultiset(baseNumbers, candNumbers)) {
    violations.push(REFINE_VIOLATION.NUMBER);
    detail.numbers = { baseline: baseNumbers, candidate: candNumbers };
  }

  const baseUrls = _collect(base, _URL_RE);
  const candUrls = _collect(cand, _URL_RE);
  if (!_sameMultiset(baseUrls, candUrls)) {
    violations.push(REFINE_VIOLATION.URL);
    detail.urls = { baseline: baseUrls, candidate: candUrls };
  }

  // Code spans are compared by content, so a reordered pair still passes while
  // an edited identifier does not.
  const pickCode = (m) => (m[1] != null ? m[1] : m[2]);
  const baseCode = _collect(base, _CODE_RE, pickCode).map(_normalize);
  const candCode = _collect(cand, _CODE_RE, pickCode).map(_normalize);
  if (!_sameMultiset(baseCode.sort(), candCode.sort())) {
    violations.push(REFINE_VIOLATION.CODE);
    detail.code = { baseline: baseCode, candidate: candCode };
  }

  // Tag sequence in ORDER, not as a multiset: markup that survives as a set but
  // arrives rearranged is markup we would splice back wrongly.
  const baseTags = [];
  const candTags = [];
  _TAG_RE.lastIndex = 0;
  for (let m = _TAG_RE.exec(base); m; m = _TAG_RE.exec(base)) baseTags.push(m[0].replace(/\s+/g, ' ').toLowerCase());
  _TAG_RE.lastIndex = 0;
  for (let m = _TAG_RE.exec(cand); m; m = _TAG_RE.exec(cand)) candTags.push(m[0].replace(/\s+/g, ' ').toLowerCase());
  const baseHrefs = _collect(base, _HREF_RE, (m) => m[1] ?? m[2] ?? m[3]);
  const candHrefs = _collect(cand, _HREF_RE, (m) => m[1] ?? m[2] ?? m[3]);
  if (baseTags.length !== candTags.length || baseTags.some((t, i) => t !== candTags[i])) {
    violations.push(REFINE_VIOLATION.HTML);
    detail.tags = { baseline: baseTags, candidate: candTags };
  } else if (!_sameMultiset(baseHrefs, candHrefs)) {
    violations.push(REFINE_VIOLATION.HTML);
    detail.hrefs = { baseline: baseHrefs, candidate: candHrefs };
  }

  return { ok: violations.length === 0, violations, detail };
}

if (typeof window !== 'undefined') {
  window._sbRefinementValidator = {
    REFINE_VIOLATION,
    REFINE_LENGTH_MIN_RATIO,
    REFINE_LENGTH_MAX_RATIO,
    validateRefinement,
  };
}

if (typeof globalThis !== 'undefined' && typeof globalThis.module !== 'undefined') {
  globalThis.module.exports = {
    REFINE_VIOLATION,
    REFINE_LENGTH_MIN_RATIO,
    REFINE_LENGTH_MAX_RATIO,
    validateRefinement,
  };
}
