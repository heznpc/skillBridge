#!/usr/bin/env node
/**
 * Translation Audit Script for Skilljar i18n Assistant
 *
 * Validates translation JSON files:
 * 1. Cross-language key consistency (all languages have same keys)
 * 2. Empty/placeholder value detection
 * 3. Key format validation (no leading/trailing whitespace issues)
 * 4. Reports missing translations per language
 *
 * Usage:
 *   node scripts/audit-translations.js
 *   node scripts/audit-translations.js --fix  (auto-fix formatting issues)
 *
 * Can be scheduled via cron or CI/CD for periodic checks.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'src', 'data');
const LANGUAGES = ['ko', 'ja', 'zh-CN', 'es', 'fr', 'de'];
const REFERENCE_LANG = 'ko'; // Reference language (most complete)

function loadJSON(lang) {
  const filePath = path.join(DATA_DIR, `${lang}.json`);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Failed to load ${lang}.json: ${err.message}`);
    return null;
  }
}

function flattenDict(data) {
  const flat = {};
  for (const [section, entries] of Object.entries(data)) {
    if (section === '_meta') continue;
    if (typeof entries === 'object') {
      for (const [key, value] of Object.entries(entries)) {
        flat[`${section}.${key}`] = value;
      }
    }
  }
  return flat;
}

function getSectionKeys(data) {
  const keys = {};
  for (const [section, entries] of Object.entries(data)) {
    if (section === '_meta') continue;
    if (typeof entries === 'object') {
      keys[section] = Object.keys(entries);
    }
  }
  return keys;
}

function audit() {
  console.log('🔍 Skilljar i18n Translation Audit\n');
  console.log(`📅 Date: ${new Date().toISOString()}`);
  console.log(`📁 Data dir: ${DATA_DIR}\n`);

  const allData = {};
  let hasErrors = false;

  // 1. Load all language files
  for (const lang of LANGUAGES) {
    allData[lang] = loadJSON(lang);
    if (!allData[lang]) {
      hasErrors = true;
      continue;
    }
    const flat = flattenDict(allData[lang]);
    console.log(`✅ ${lang}.json loaded: ${Object.keys(flat).length} entries`);
  }
  console.log('');

  if (!allData[REFERENCE_LANG]) {
    console.error(`❌ Reference language ${REFERENCE_LANG}.json not found. Aborting.`);
    process.exit(1);
  }

  // 2. Cross-language key consistency
  console.log('🔑 Cross-language key consistency check:');
  const refKeys = getSectionKeys(allData[REFERENCE_LANG]);

  for (const lang of LANGUAGES) {
    if (lang === REFERENCE_LANG || !allData[lang]) continue;
    const langKeys = getSectionKeys(allData[lang]);

    for (const [section, keys] of Object.entries(refKeys)) {
      if (!langKeys[section]) {
        console.log(`  ⚠️  ${lang}: Missing section "${section}"`);
        hasErrors = true;
        continue;
      }

      const langKeySet = new Set(langKeys[section]);
      const refKeySet = new Set(keys);

      const missing = keys.filter(k => !langKeySet.has(k));
      const extra = langKeys[section].filter(k => !refKeySet.has(k));

      if (missing.length > 0) {
        console.log(`  ⚠️  ${lang}/${section}: Missing ${missing.length} keys:`);
        missing.forEach(k => console.log(`      - "${k.substring(0, 60)}${k.length > 60 ? '...' : ''}"`));
        hasErrors = true;
      }
      if (extra.length > 0) {
        console.log(`  ℹ️  ${lang}/${section}: ${extra.length} extra keys (not in ${REFERENCE_LANG})`);
      }
    }
  }
  if (!hasErrors) console.log('  ✅ All languages have consistent keys');
  console.log('');

  // 3. Empty/placeholder value detection
  console.log('📝 Empty/placeholder value check:');
  let emptyCount = 0;
  for (const lang of LANGUAGES) {
    if (!allData[lang]) continue;
    const flat = flattenDict(allData[lang]);
    for (const [key, value] of Object.entries(flat)) {
      if (!value || value.trim() === '') {
        console.log(`  ⚠️  ${lang}: Empty value for "${key.substring(0, 60)}"`);
        emptyCount++;
      }
      if (value === 'TODO' || value === 'FIXME' || value === '???') {
        console.log(`  ⚠️  ${lang}: Placeholder "${value}" for "${key.substring(0, 60)}"`);
        emptyCount++;
      }
    }
  }
  if (emptyCount === 0) console.log('  ✅ No empty or placeholder values found');
  console.log('');

  // 4. Key format validation
  console.log('🔤 Key format validation:');
  let formatIssues = 0;
  for (const lang of LANGUAGES) {
    if (!allData[lang]) continue;
    for (const [section, entries] of Object.entries(allData[lang])) {
      if (section === '_meta') continue;
      if (typeof entries !== 'object') continue;
      for (const [key, value] of Object.entries(entries)) {
        if (key !== key.trim()) {
          console.log(`  ⚠️  ${lang}/${section}: Key has whitespace: "${key.substring(0, 40)}"`);
          formatIssues++;
        }
        if (typeof value === 'string' && value !== value.trim()) {
          console.log(`  ⚠️  ${lang}/${section}: Value has leading/trailing whitespace: "${key.substring(0, 40)}"`);
          formatIssues++;
        }
      }
    }
  }
  if (formatIssues === 0) console.log('  ✅ All keys and values properly formatted');
  console.log('');

  // 5. Duplicate key detection (same English key in different sections)
  console.log('🔄 Duplicate key check:');
  let dupeCount = 0;
  for (const lang of LANGUAGES) {
    if (!allData[lang]) continue;
    const allKeys = {};
    for (const [section, entries] of Object.entries(allData[lang])) {
      if (section === '_meta') continue;
      if (typeof entries !== 'object') continue;
      for (const key of Object.keys(entries)) {
        if (allKeys[key]) {
          // Only report first language to avoid spam
          if (lang === REFERENCE_LANG) {
            console.log(`  ℹ️  Key "${key.substring(0, 50)}" appears in both "${allKeys[key]}" and "${section}"`);
          }
          dupeCount++;
        } else {
          allKeys[key] = section;
        }
      }
    }
  }
  if (dupeCount === 0) console.log('  ✅ No duplicate keys across sections');
  console.log('');

  // Summary
  console.log('═══════════════════════════════════════');
  console.log(`📊 AUDIT SUMMARY`);
  console.log(`   Languages: ${LANGUAGES.length}`);
  const refFlat = flattenDict(allData[REFERENCE_LANG]);
  console.log(`   Reference entries (${REFERENCE_LANG}): ${Object.keys(refFlat).length}`);
  console.log(`   Status: ${hasErrors || emptyCount || formatIssues ? '⚠️  Issues found' : '✅ All checks passed'}`);
  console.log('═══════════════════════════════════════');

  return hasErrors || emptyCount > 0 || formatIssues > 0 ? 1 : 0;
}

process.exit(audit());
