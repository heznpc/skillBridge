#!/usr/bin/env node
/**
 * SkillBridge — Dictionary Coverage Check
 *
 * Enforces POSITIONING.md's first product pillar — "AI terminology fidelity"
 * — at the mechanical level. The positioning commits to "every premium
 * language has a hand-curated dictionary; new Academy course → terminology
 * update within 48 hours." Without this script that commitment is honor-
 * system; a missing course-section in even one language ships English
 * fallback to users in that language.
 *
 * Eight checks (any error → exit 1; warnings are non-fatal):
 *
 *   1. Section parity across dictionaries
 *      Every dictionary in src/data/ has the same top-level section set.
 *      A new course landing in one language but not the others is the
 *      most common failure mode for the 48-hour commitment.
 *
 *   2. English-key parity within each section
 *      For every section, the set of English keys must be identical
 *      across all dictionaries. (Translations differ, obviously, but the
 *      keys are the English source strings — they must match.) Catches
 *      a translator updating one language with a new term but forgetting
 *      to add it to the others.
 *
 *   3. FLASHCARD_COURSE_MAP referential integrity (constants → dicts)
 *      Every section name referenced by FLASHCARD_COURSE_MAP in
 *      `src/lib/constants.js` actually exists in the dictionaries.
 *      Catches a course slug being registered before the dictionary
 *      section is created.
 *
 *   4. Orphan section detection (dicts → constants)
 *      Every "course-shaped" section in the dictionaries is referenced
 *      by at least one slug in FLASHCARD_COURSE_MAP. Catches a section
 *      that lives in the dicts but no URL slug routes users to its
 *      flashcards / term preview.
 *
 *   5. _meta.version sync across dicts + manifest
 *      Every dictionary's `_meta.version` matches `manifest.json` version
 *      and they're all the same. generate-docs.js auto-syncs these but
 *      they can drift if docs aren't regenerated post-release; the check
 *      catches it before a CWS push.
 *
 *   6. Catalog entries translated consistently
 *      A catalog key translated in some dictionaries must not remain English
 *      in others unless it is a uniform passthrough everywhere.
 *
 *   7. Protected terms stay English in section values
 *      A key registered in a locale's `_protected` map must not be translated
 *      by that same locale's curated dictionary sections.
 *
 *   8. Framework-specific forbidden literal translations
 *      Locks known semantic traps from TRANSLATION_RULES.md, such as AI
 *      Fluency "Diligence" being due-diligence / informed responsibility,
 *      not industriousness.
 *
 * Usage: node scripts/check-dict-coverage.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// SB_DICT_DIR_OVERRIDE is honored so tests/dict-coverage-checker.test.js
// can point the script at a fault-injected fixture dir. Production runs
// (CI, local) leave it unset and use src/data/.
const DATA_DIR = process.env.SB_DICT_DIR_OVERRIDE || path.join(ROOT, 'src', 'data');
const SELECTORS_PATH = path.join(ROOT, 'src', 'lib', 'selectors.js');
const CONSTANTS_PATH = path.join(ROOT, 'src', 'lib', 'constants.js');
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');

// "Course-shaped" sections — anything that is NOT one of these is treated
// as a course module that must be referenced by FLASHCARD_COURSE_MAP. The
// short list of non-course sections is enumerated here rather than
// inferred so that a new common section gets a deliberate review.
const NON_COURSE_SECTIONS = new Set([
  '_meta',
  '_protected', // protected-terms post-processing, language-specific
  'ui', // sidebar / toolbar / button labels
  'catalog', // course catalog page
  'faq', // FAQ
  'common', // generic phrases shared across courses
  'exam_ui', // exam-mode banner / warning labels
]);

let errors = 0;
let warnings = 0;

const log = {
  pass: (m) => console.log('  ✓', m),
  warn: (m) => {
    warnings++;
    console.warn('  ⚠', m);
  },
  fail: (m) => {
    errors++;
    console.error('  ✗', m);
  },
};

// ==================== LOAD ====================

const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
if (files.length === 0) {
  console.error('No language files found in src/data/');
  process.exit(1);
}

/** @type {Record<string, Record<string, any>>} */
const dicts = {};
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
  const lang = data._meta?.lang || file.replace('.json', '');
  dicts[lang] = data;
}
const languages = Object.keys(dicts).sort();
console.log(`Loaded ${languages.length} dictionaries: ${languages.join(', ')}`);

// Load FLASHCARD_COURSE_MAP from constants.js. The file references
// SKILLJAR_SELECTORS from selectors.js at the top, so both have to be in
// scope for the eval.
const selectorsSrc = fs.readFileSync(SELECTORS_PATH, 'utf8');
const constantsSrc = fs.readFileSync(CONSTANTS_PATH, 'utf8');
let FLASHCARD_COURSE_MAP;
try {
  const runner = new Function('window', `${selectorsSrc}\n${constantsSrc}\nreturn FLASHCARD_COURSE_MAP;`);
  FLASHCARD_COURSE_MAP = runner({});
} catch (e) {
  console.error('Failed to load FLASHCARD_COURSE_MAP from constants.js:', e.message);
  process.exit(1);
}

const manifestVersion = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')).version;

// ==================== CHECK 1: Section parity across dictionaries ====================

console.log('\n--- Check 1: Section parity across all dictionaries ---');
const baselineLang = languages[0];
const baselineSections = new Set(Object.keys(dicts[baselineLang]));

for (const lang of languages.slice(1)) {
  const sections = new Set(Object.keys(dicts[lang]));
  const missing = [...baselineSections].filter((s) => !sections.has(s));
  const extra = [...sections].filter((s) => !baselineSections.has(s));
  if (missing.length || extra.length) {
    const parts = [];
    if (missing.length) parts.push(`missing ${missing.join(', ')}`);
    if (extra.length) parts.push(`extra ${extra.join(', ')}`);
    log.fail(`${lang} vs ${baselineLang}: ${parts.join('; ')}`);
  }
}
if (errors === 0) log.pass(`All ${languages.length} dictionaries share the same ${baselineSections.size} sections`);

// ==================== CHECK 2: English-key parity within each section ====================

console.log('\n--- Check 2: English-key parity within each section ---');
// `_protected` is the per-language mistranslation-fix map (e.g. ko maps
// `클로드` → `Claude`, ja maps `クロード` → `Claude`). Different
// languages legitimately have different keys here — Google Translate
// mistranslates "Claude" in language-specific ways, and there's no
// reason ko's wrong forms should appear in de. Excluded by design.
const SKIP_PARITY_SECTIONS = new Set(['_meta', '_protected']);
const sectionsToCheck = [...baselineSections].filter((s) => !SKIP_PARITY_SECTIONS.has(s));
let check2Issues = 0;

for (const section of sectionsToCheck) {
  const baselineKeys = new Set(Object.keys(dicts[baselineLang][section] || {}));
  for (const lang of languages.slice(1)) {
    const langSection = dicts[lang][section];
    if (!langSection || typeof langSection !== 'object') continue; // covered by check 1
    const langKeys = new Set(Object.keys(langSection));
    const missingFromLang = [...baselineKeys].filter((k) => !langKeys.has(k));
    const extraInLang = [...langKeys].filter((k) => !baselineKeys.has(k));
    if (missingFromLang.length || extraInLang.length) {
      check2Issues++;
      const summary = [];
      if (missingFromLang.length) {
        summary.push(
          `${lang} missing ${missingFromLang.length} key(s) present in ${baselineLang}: ${missingFromLang
            .slice(0, 3)
            .map((k) => JSON.stringify(k))
            .join(', ')}`,
        );
      }
      if (extraInLang.length) {
        summary.push(
          `${lang} has ${extraInLang.length} extra key(s) not in ${baselineLang}: ${extraInLang
            .slice(0, 3)
            .map((k) => JSON.stringify(k))
            .join(', ')}`,
        );
      }
      log.fail(`Section "${section}" — ${summary.join('; ')}`);
    }
  }
}
if (check2Issues === 0) log.pass(`All sections have identical English-key sets across languages`);

// ==================== CHECK 3: FLASHCARD_COURSE_MAP → dictionary section references ====================

console.log('\n--- Check 3: FLASHCARD_COURSE_MAP referenced sections exist in dictionaries ---');
const referencedSections = new Set();
for (const [slug, sections] of Object.entries(FLASHCARD_COURSE_MAP)) {
  if (!Array.isArray(sections)) {
    log.fail(`FLASHCARD_COURSE_MAP[${JSON.stringify(slug)}] is not an array`);
    continue;
  }
  for (const section of sections) {
    referencedSections.add(section);
    // Spot-check one language — if section is missing in one, check 1 will
    // also flag the others.
    if (!(section in dicts[baselineLang])) {
      log.fail(`FLASHCARD_COURSE_MAP[${JSON.stringify(slug)}] → ${JSON.stringify(section)} not in dictionaries`);
    }
  }
}
if (errors === 0) log.pass(`All ${referencedSections.size} sections referenced by FLASHCARD_COURSE_MAP exist`);

// ==================== CHECK 4: Orphan course-shaped sections ====================

console.log('\n--- Check 4: All course-shaped dictionary sections are routable ---');
const courseSections = [...baselineSections].filter((s) => !NON_COURSE_SECTIONS.has(s));
let check4Issues = 0;
for (const section of courseSections) {
  if (!referencedSections.has(section)) {
    check4Issues++;
    log.warn(
      `Section ${JSON.stringify(section)} exists in dictionaries but no URL slug in FLASHCARD_COURSE_MAP routes to it — flashcards / term preview will never trigger for this course`,
    );
  }
}
if (check4Issues === 0) {
  log.pass(`All ${courseSections.length} course sections are reachable via FLASHCARD_COURSE_MAP`);
}

// ==================== CHECK 5: _meta.version sync ====================

console.log('\n--- Check 5: _meta.version matches manifest.json across all dictionaries ---');
let check5Issues = 0;
for (const lang of languages) {
  const v = dicts[lang]._meta?.version;
  if (v !== manifestVersion) {
    check5Issues++;
    log.fail(
      `${lang}: _meta.version = ${JSON.stringify(v)}, manifest = ${JSON.stringify(manifestVersion)} — run \`npm run docs\` to resync`,
    );
  }
}
if (check5Issues === 0) {
  log.pass(`All ${languages.length} dictionaries on version ${manifestVersion}`);
}

// ==================== CHECK 6: catalog entries translated consistently ====================
// Within the `catalog` section (course titles), a key that is TRANSLATED
// (value != key) in at least one dictionary but left == its English key in
// another is a partial-translation gap: the same course title shows a curated
// translation to some users and English fallback to others. A key that is
// == key in EVERY dictionary is an intentional proper-noun passthrough (e.g.
// "Claude 101") and is NOT flagged; nor is one translated everywhere. This
// caught "Claude with Amazon Bedrock" / "Claude with Google Cloud's Vertex AI"
// sitting English in 7 of 12 catalogs while cloudDeployment translated them.

console.log('\n--- Check 6: catalog entries translated consistently across dictionaries ---');
const CATALOG_SECTION = 'catalog';
let check6Issues = 0;
const catalogKeys = new Set(Object.keys(dicts[baselineLang][CATALOG_SECTION] || {}));
for (const key of catalogKeys) {
  const translatedIn = [];
  const untranslatedIn = [];
  for (const lang of languages) {
    if (lang === 'en') continue; // en (if ever added) is the source — value == key is correct
    const v = dicts[lang][CATALOG_SECTION]?.[key];
    if (v === undefined) continue; // key parity is Check 2's job
    if (v === key) untranslatedIn.push(lang);
    else translatedIn.push(lang);
  }
  if (translatedIn.length > 0 && untranslatedIn.length > 0) {
    check6Issues++;
    log.fail(
      `catalog key ${JSON.stringify(key)} translated in ${translatedIn.length} dict(s) but left English in ` +
        `${untranslatedIn.length}: ${untranslatedIn.join(', ')} — partial translation (curate or mark as passthrough)`,
    );
  }
}
if (check6Issues === 0) {
  log.pass('All catalog entries are translated everywhere or intentional passthrough everywhere');
}

// ==================== CHECK 7: protected terms stay English in section values ====================
// Each dict's `_protected` map keys are the canonical English brand / product /
// code terms that must survive translation (the runtime restores them). If a
// curated section uses one of those terms as a KEY, its VALUE must stay English
// too — otherwise the dictionary ships the very mistranslation _protected exists
// to undo (e.g. ko translating "Anthropic Academy" → "Anthropic 아카데미", or
// ja/zh translating the "Skills" platform feature). Per-locale: a term protected
// in ja need not be protected in de, so each dict is checked against ITS OWN
// _protected set, which is also why this is false-positive-free.
//
// SCOPE: this catches a protected term used as a standalone section KEY whose
// value drifted off English. Protected terms EMBEDDED inside a longer key/value
// (e.g. "Claude with Amazon Bedrock") are intentionally NOT scanned here — the
// runtime restoreProtectedTerms pass owns that case; a substring scan would
// false-positive on legitimate translations that correctly keep the brand token.

console.log('\n--- Check 7: protected terms stay English in section values ---');
let check7Issues = 0;
for (const lang of languages) {
  const protectedTerms = new Set(Object.keys(dicts[lang]._protected || {}));
  if (protectedTerms.size === 0) continue;
  for (const section of Object.keys(dicts[lang])) {
    if (SKIP_PARITY_SECTIONS.has(section)) continue; // _meta, _protected
    const obj = dicts[lang][section];
    if (!obj || typeof obj !== 'object') continue;
    for (const [key, value] of Object.entries(obj)) {
      if (protectedTerms.has(key) && value !== key) {
        check7Issues++;
        log.fail(
          `${lang}: ${JSON.stringify(section)}.${JSON.stringify(key)} = ${JSON.stringify(value)} ` +
            `translates a _protected term — must stay ${JSON.stringify(key)}`,
        );
      }
    }
  }
}
if (check7Issues === 0) {
  log.pass('No dictionary translates a term registered in its own _protected map');
}

// ==================== CHECK 8: framework-specific forbidden literal translations ====================
// Some course-framework terms are intentionally NOT translated by literal
// dictionary sense. The canonical example from docs/TRANSLATION_RULES.md §6:
// AI Fluency "Diligence" means due diligence / informed responsibility for
// deployment outputs, not "industriousness". Structural parity checks cannot
// catch this semantic regression, so pin the known trap mechanically.

console.log('\n--- Check 8: framework-specific forbidden literal translations ---');
const FORBIDDEN_FRAMEWORK_RENDERINGS = [
  {
    lang: 'ja',
    source: /\bDiligence\b/i,
    forbidden: /勤勉/,
    forbiddenLabel: '勤勉',
    expected: '検証 / 展開時の検証責任',
  },
];
let check8Issues = 0;
for (const rule of FORBIDDEN_FRAMEWORK_RENDERINGS) {
  const dict = dicts[rule.lang];
  if (!dict) continue;
  for (const section of Object.keys(dict)) {
    if (SKIP_PARITY_SECTIONS.has(section)) continue;
    const obj = dict[section];
    if (!obj || typeof obj !== 'object') continue;
    for (const [key, value] of Object.entries(obj)) {
      if (!rule.source.test(key)) continue;
      if (rule.forbidden.test(String(value))) {
        check8Issues++;
        log.fail(
          `${rule.lang}: ${JSON.stringify(section)}.${JSON.stringify(key)} = ${JSON.stringify(value)} ` +
            `uses forbidden literal rendering ${rule.forbiddenLabel}; expected ${rule.expected}`,
        );
      }
    }
  }
}
if (check8Issues === 0) {
  log.pass('No framework term uses a known forbidden literal rendering');
}

// ==================== SUMMARY ====================

console.log(`\n${errors} error(s), ${warnings} warning(s)`);
process.exit(errors > 0 ? 1 : 0);
