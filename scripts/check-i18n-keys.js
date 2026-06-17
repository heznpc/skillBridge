#!/usr/bin/env node
/**
 * SkillBridge — i18n Key Coverage Check
 *
 * Two checks:
 *   (1) `_locales/<lang>/messages.json` files all share the same key set as the
 *       English baseline. Chrome rejects an extension if `default_locale` keys
 *       are missing in other locales used at install time, and divergence
 *       silently falls back to English without warning.
 *   (2) The label dictionaries declared in `src/lib/constants.js`
 *       (POPUP_LABELS, A11Y_LABELS, etc.) are object-shaped and every language
 *       sub-object exposes the same key set, so nested labels never quietly
 *       drop a sub-key on translation.
 *
 * Exit code 1 on hard mismatches; warnings are non-fatal.
 *
 * Usage: node scripts/check-i18n-keys.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LOCALES_DIR = path.join(ROOT, '_locales');
const CONSTANTS_FILE = path.join(ROOT, 'src', 'lib', 'constants.js');

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

// ==================== CHECK 1: _locales coverage ====================

console.log('\n--- Check 1: _locales/<lang>/messages.json key coverage ---');
const baselineLocale = 'en';
const baselinePath = path.join(LOCALES_DIR, baselineLocale, 'messages.json');
if (!fs.existsSync(baselinePath)) {
  log.fail(`Baseline locale missing: ${baselineLocale}/messages.json`);
} else {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const baselineKeys = new Set(Object.keys(baseline));
  const locales = fs.readdirSync(LOCALES_DIR).filter((d) => fs.statSync(path.join(LOCALES_DIR, d)).isDirectory());

  for (const lang of locales) {
    if (lang === baselineLocale) continue;
    const file = path.join(LOCALES_DIR, lang, 'messages.json');
    if (!fs.existsSync(file)) {
      log.fail(`Missing messages.json for locale: ${lang}`);
      continue;
    }
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      log.fail(`Invalid JSON in ${lang}/messages.json: ${e.message}`);
      continue;
    }
    const keys = new Set(Object.keys(data));
    const missing = [...baselineKeys].filter((k) => !keys.has(k));
    const extra = [...keys].filter((k) => !baselineKeys.has(k));
    if (missing.length || extra.length) {
      const parts = [];
      if (missing.length) parts.push(`missing ${missing.join(', ')}`);
      if (extra.length) parts.push(`extra ${extra.join(', ')}`);
      log.fail(`${lang}: ${parts.join('; ')}`);
    }
  }
  if (errors === 0) log.pass(`All ${locales.length} locales match ${baselineLocale} key set`);
}

// ==================== CHECK 2: constants.js label dict shape ====================

console.log('\n--- Check 2: constants.js label dictionaries ---');

// constants.js references selectors.js' globals at the top, so load both into
// the same Function scope before extracting the LABEL dicts.
const SELECTORS_FILE = path.join(ROOT, 'src', 'lib', 'selectors.js');
const selectorsSrc = fs.readFileSync(SELECTORS_FILE, 'utf8');
const constantsSrc = fs.readFileSync(CONSTANTS_FILE, 'utf8');

function matchExports(src) {
  const names = [];
  const re = /^const ([A-Z_][A-Z0-9_]*(?:LABELS|GREETINGS|PLACEHOLDERS|UI|QUESTIONS|DESCRIPTIONS))\s*=/gm;
  let m;
  while ((m = re.exec(src)) !== null) names.push(m[1]);
  return names;
}

let dicts;
try {
  const names = matchExports(constantsSrc);
  // matchExports targets the *_LABELS/UI/QUESTIONS/... dicts, but we also need
  // PREMIUM_LANGUAGE_CODES to derive the expected-language set (below) from the
  // source of truth instead of a hand-maintained list that goes stale.
  if (/\bconst PREMIUM_LANGUAGE_CODES\b/.test(constantsSrc) && !names.includes('PREMIUM_LANGUAGE_CODES')) {
    names.push('PREMIUM_LANGUAGE_CODES');
  }
  // Both source files reference `window` at the top; provide a stub so the
  // top-level `if (typeof window !== 'undefined')` guards don't trip.
  const runner = new Function('window', `${selectorsSrc}\n${constantsSrc}\nreturn { ${names.join(', ')} };`);
  dicts = runner({});
} catch (e) {
  log.fail(`Failed to load constants.js: ${e.message}`);
  printSummary();
  process.exit(errors > 0 ? 1 : 0);
}

// English + every premium-dictionary language. Derived from PREMIUM_LANGUAGE_CODES
// so it self-updates when a premium locale is added — the previous hand-coded list
// was en+10 and silently missed the it/id UI labels. Falls back to the full 12 if
// the constant can't be loaded.
const PREMIUM_FALLBACK = ['ko', 'ja', 'zh-CN', 'zh-TW', 'es', 'fr', 'it', 'de', 'pt-BR', 'ru', 'vi', 'id'];
const premiumCodes =
  Array.isArray(dicts.PREMIUM_LANGUAGE_CODES) && dicts.PREMIUM_LANGUAGE_CODES.length
    ? dicts.PREMIUM_LANGUAGE_CODES
    : PREMIUM_FALLBACK;
const expectedLangs = new Set(['en', ...premiumCodes]);

/**
 * Validate a flat lang map: { en: 'x', ko: 'x', ... }.
 * @returns {boolean} true if at least one expected lang is present.
 */
function looksLikeLangMap(obj) {
  if (!obj || typeof obj !== 'object') return false;
  return Object.keys(obj).some((k) => expectedLangs.has(k));
}

function checkLangCoverage(label, dict) {
  const missing = [...expectedLangs].filter((l) => !(l in dict));
  if (missing.length) log.warn(`${label}: missing language(s) ${missing.join(', ')}`);
}

function checkLangOuter(name, dict) {
  // { en: object|string, ko: object|string, ... }
  checkLangCoverage(name, dict);
  const enValue = dict.en;
  if (enValue && typeof enValue === 'object' && !Array.isArray(enValue)) {
    const baseline = new Set(Object.keys(enValue));
    for (const lang of Object.keys(dict)) {
      const v = dict[lang];
      if (!v || typeof v !== 'object' || Array.isArray(v)) {
        log.fail(`${name}.${lang}: expected object (matching .en), got ${typeof v}`);
        continue;
      }
      const sub = new Set(Object.keys(v));
      const miss = [...baseline].filter((k) => !sub.has(k));
      const extra = [...sub].filter((k) => !baseline.has(k));
      if (miss.length) log.fail(`${name}.${lang}: missing sub-keys ${miss.join(', ')}`);
      if (extra.length) log.warn(`${name}.${lang}: extra sub-keys ${extra.join(', ')}`);
    }
  }
}

function checkSectionOuter(name, dict) {
  // { sectionA: { en, ko, ... }, sectionB: {...}, ... }
  // Skip if no value is an object (e.g. SKILLBRIDGE_MODEL_LABELS is a flat
  // language-agnostic lookup, not an i18n dict).
  const hasObjectValues = Object.values(dict).some((v) => v && typeof v === 'object');
  if (!hasObjectValues) return;
  for (const [section, langMap] of Object.entries(dict)) {
    if (!langMap || typeof langMap !== 'object') continue;
    if (!looksLikeLangMap(langMap)) {
      // Nested deeper — recurse one level
      for (const [sub, deeper] of Object.entries(langMap)) {
        if (looksLikeLangMap(deeper)) checkLangCoverage(`${name}.${section}.${sub}`, deeper);
      }
      continue;
    }
    checkLangCoverage(`${name}.${section}`, langMap);
  }
}

for (const [name, dict] of Object.entries(dicts)) {
  if (!dict || typeof dict !== 'object') {
    log.warn(`${name}: not an object, skipping`);
    continue;
  }
  if (looksLikeLangMap(dict)) {
    checkLangOuter(name, dict);
  } else {
    checkSectionOuter(name, dict);
  }
}

if (errors === 0) log.pass(`All label dictionaries shape-consistent`);

printSummary();
process.exit(errors > 0 ? 1 : 0);

function printSummary() {
  console.log(`\n${errors} error(s), ${warnings} warning(s)`);
}
