#!/usr/bin/env node
/**
 * SkillBridge — Translation File Validator
 * Validates structural correctness of translation JSON files.
 * Used in CI to validate community translation contributions.
 *
 * Usage: node scripts/validate-translations.js [file...]
 * If no files given, validates all src/data/*.json files.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'src', 'data');
const REQUIRED_META_FIELDS = ['lang', 'langName', 'version'];

let targetFiles = process.argv.slice(2);
if (targetFiles.length === 0) {
  targetFiles = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(DATA_DIR, f));
}

let errors = 0;
let warnings = 0;

for (const filePath of targetFiles) {
  const file = path.basename(filePath);
  let data;

  // 1. Valid JSON
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.log(`ERROR ${file}: Invalid JSON — ${e.message}`);
    errors++;
    continue;
  }

  // 2. _meta section
  if (!data._meta) {
    console.log(`ERROR ${file}: Missing _meta section`);
    errors++;
  } else {
    for (const field of REQUIRED_META_FIELDS) {
      if (!data._meta[field]) {
        console.log(`ERROR ${file}: Missing _meta.${field}`);
        errors++;
      }
    }
    // lang code should match filename
    const expectedLang = file.replace('.json', '');
    if (data._meta.lang && data._meta.lang !== expectedLang) {
      console.log(`ERROR ${file}: _meta.lang "${data._meta.lang}" does not match filename "${expectedLang}"`);
      errors++;
    }
  }

  // 3. Section structure — all sections must be plain objects
  for (const [section, entries] of Object.entries(data)) {
    if (section === '_meta') continue;
    if (section === '_protected') {
      // _protected values must be arrays of strings
      if (typeof entries !== 'object' || Array.isArray(entries)) {
        console.log(`ERROR ${file}: _protected must be an object`);
        errors++;
        continue;
      }
      for (const [term, forms] of Object.entries(entries)) {
        if (!Array.isArray(forms)) {
          console.log(`ERROR ${file}: _protected."${term}" must be an array`);
          errors++;
        } else {
          for (const form of forms) {
            if (typeof form !== 'string') {
              console.log(`ERROR ${file}: _protected."${term}" contains non-string value`);
              errors++;
            }
          }
        }
      }
      continue;
    }

    if (typeof entries !== 'object' || entries === null || Array.isArray(entries)) {
      console.log(`ERROR ${file}: Section "${section}" must be a plain object`);
      errors++;
      continue;
    }

    // 4. Values must be strings
    let emptyCount = 0;
    for (const [key, value] of Object.entries(entries)) {
      if (typeof value !== 'string') {
        console.log(`ERROR ${file}: ${section}."${key.substring(0, 40)}" must be a string, got ${typeof value}`);
        errors++;
      } else if (value.trim() === '') {
        emptyCount++;
      }
    }
    if (emptyCount > 0) {
      console.log(`WARN  ${file}: ${emptyCount} empty values in section "${section}"`);
      warnings++;
    }
  }

  // 5. Recommended: _protected section
  if (!data._protected) {
    console.log(`WARN  ${file}: Missing _protected section (recommended for term accuracy)`);
    warnings++;
  }

  console.log(`  ✓ ${file}`);
}

// Summary
console.log(`\n=== Validation Complete ===`);
console.log(`Files:    ${targetFiles.length}`);
console.log(`Errors:   ${errors}`);
console.log(`Warnings: ${warnings}`);

if (errors > 0) {
  process.exit(1);
}
