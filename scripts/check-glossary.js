#!/usr/bin/env node
/**
 * SkillBridge — Glossary Consistency Checker
 * Validates protected terms structure and cross-language translation consistency.
 *
 * Protected terms exist to fix Google Translate output, NOT to constrain
 * human-curated static dictionary entries — so this checker focuses on
 * structural issues and cross-language coverage.
 *
 * Usage: node scripts/check-glossary.js
 * Exit code 1 on errors, 0 on success (warnings are non-fatal).
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'src', 'data');

// ==================== LOAD ALL LANGUAGE FILES ====================

const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
if (files.length === 0) {
  console.error('No language files found in src/data/');
  process.exit(1);
}

const languages = {};
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
  const lang = data._meta?.lang || file.replace('.json', '');
  languages[lang] = data;
}

let errors = 0;
let warnings = 0;

// ==================== CHECK 1: _protected Section Structure ====================

console.log('\n--- Check 1: Protected terms structure ---');
let check1Issues = 0;

for (const [lang, data] of Object.entries(languages)) {
  const protectedTerms = data._protected;
  if (!protectedTerms) {
    console.log(`  WARN  [${lang}] No _protected section`);
    warnings++;
    check1Issues++;
    continue;
  }

  for (const [correct, wrongForms] of Object.entries(protectedTerms)) {
    if (!Array.isArray(wrongForms)) {
      console.log(`  ERROR [${lang}] _protected."${correct}" must be an array`);
      errors++;
      check1Issues++;
      continue;
    }

    if (wrongForms.length === 0) {
      console.log(`  WARN  [${lang}] _protected."${correct}" has empty wrong-forms array`);
      warnings++;
      check1Issues++;
    }

    for (const wrong of wrongForms) {
      // Self-referential: wrong form equals correct form (harmless no-op, but noisy)
      if (wrong === correct) {
        console.log(`  WARN  [${lang}] _protected."${correct}" lists itself as a wrong form (no-op)`);
        warnings++;
        check1Issues++;
      }
    }
  }
}
if (check1Issues === 0) console.log('  All protected sections are well-formed.');

// ==================== CHECK 2: Protected Terms Coverage ====================
// Core brand terms should be protected in every language.

console.log('\n--- Check 2: Protected terms cross-language coverage ---');
let check2Issues = 0;

const allProtectedKeys = new Set();
for (const data of Object.values(languages)) {
  if (data._protected) {
    for (const key of Object.keys(data._protected)) {
      allProtectedKeys.add(key);
    }
  }
}

// Core terms that should ideally be protected in every language
const CORE_TERMS = ['Claude', 'Anthropic', 'API', 'SDK'];
for (const term of CORE_TERMS) {
  for (const [lang, data] of Object.entries(languages)) {
    if (!data._protected?.[term]) {
      console.log(`  WARN  [${lang}] Missing core protected term: "${term}"`);
      warnings++;
      check2Issues++;
    }
  }
}
if (check2Issues === 0) console.log('  All languages protect core brand terms.');

// ==================== CHECK 3: Section Coverage ====================

console.log('\n--- Check 3: Section coverage ---');
let check3Issues = 0;

const allSections = new Set();
for (const data of Object.values(languages)) {
  for (const section of Object.keys(data)) {
    if (!section.startsWith('_')) allSections.add(section);
  }
}

for (const [lang, data] of Object.entries(languages)) {
  const missing = [];
  for (const section of allSections) {
    if (!data[section]) missing.push(section);
  }
  if (missing.length > 0) {
    console.log(`  WARN  [${lang}] Missing sections: ${missing.join(', ')}`);
    warnings++;
    check3Issues++;
  }
}
if (check3Issues === 0) console.log('  All languages have matching sections.');

// ==================== CHECK 4: Key Coverage Summary ====================
// Rather than listing every single missing key, report summary per language.

console.log('\n--- Check 4: Key coverage summary ---');
let check4Issues = 0;

const allKeys = new Map(); // section → Set<key>
for (const data of Object.values(languages)) {
  for (const [section, entries] of Object.entries(data)) {
    if (section.startsWith('_')) continue;
    if (typeof entries !== 'object' || entries === null) continue;
    if (!allKeys.has(section)) allKeys.set(section, new Set());
    for (const key of Object.keys(entries)) {
      allKeys.get(section).add(key);
    }
  }
}

for (const [lang, data] of Object.entries(languages)) {
  let totalMissing = 0;
  const missingSections = {};

  for (const [section, keys] of allKeys) {
    let sectionMissing = 0;
    for (const key of keys) {
      if (!data[section]?.[key]) sectionMissing++;
    }
    if (sectionMissing > 0) {
      missingSections[section] = sectionMissing;
      totalMissing += sectionMissing;
    }
  }

  if (totalMissing > 0) {
    const details = Object.entries(missingSections)
      .map(([s, n]) => `${s}: ${n}`)
      .join(', ');
    console.log(`  WARN  [${lang}] ${totalMissing} missing keys (${details})`);
    warnings++;
    check4Issues++;
  }
}
if (check4Issues === 0) console.log('  All languages have matching keys.');

// ==================== CHECK 5: Possibly Untranslated ====================

console.log('\n--- Check 5: Possibly untranslated entries ---');
let check5Issues = 0;

for (const [lang, data] of Object.entries(languages)) {
  let identicalCount = 0;
  const samples = [];

  for (const [section, entries] of Object.entries(data)) {
    if (section.startsWith('_')) continue;
    if (typeof entries !== 'object' || entries === null) continue;

    for (const [key, value] of Object.entries(entries)) {
      if (typeof value !== 'string') continue;
      if (key === value && key.length > 30 && /[a-zA-Z]{5,}/.test(key)) {
        identicalCount++;
        if (samples.length < 3) samples.push(key.substring(0, 50));
      }
    }
  }

  if (identicalCount > 0) {
    console.log(`  WARN  [${lang}] ${identicalCount} entries where value = key (possibly untranslated)`);
    for (const s of samples) console.log(`         e.g. "${s}..."`);
    warnings++;
    check5Issues++;
  }
}
if (check5Issues === 0) console.log('  No suspicious identical entries.');

// ==================== SUMMARY ====================

console.log('\n========================================');
console.log(`  Glossary Check Complete`);
console.log(`  Languages: ${Object.keys(languages).join(', ')}`);
console.log(`  Errors:   ${errors}`);
console.log(`  Warnings: ${warnings}`);
console.log('========================================\n');

if (errors > 0) {
  console.log('FAILED — fix the errors above before merging.');
  process.exit(1);
} else {
  console.log('PASSED' + (warnings > 0 ? ' (with warnings)' : ''));
}
