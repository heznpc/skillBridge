#!/usr/bin/env node

/**
 * generate-docs.js
 *
 * Reads manifest.json, constants.js, and package.json, then updates
 * docs/index.html and README.md by replacing content between marker comments.
 *
 * Markers:
 *   <!-- VERSION_START -->...<!-- VERSION_END -->
 *   <!-- LANG_COUNT_START -->...<!-- LANG_COUNT_END -->
 *   <!-- PREMIUM_LANGS_START -->...<!-- PREMIUM_LANGS_END -->
 *   <!-- FEATURES_START -->...<!-- FEATURES_END -->
 *
 * Usage:  node scripts/generate-docs.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// 1. Read source files
// ---------------------------------------------------------------------------

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const constantsSrc = fs.readFileSync(path.join(ROOT, 'src/lib/constants.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

// ---------------------------------------------------------------------------
// 2. Parse constants.js
// ---------------------------------------------------------------------------

/**
 * Extract an array of { code, label } objects from a named constant.
 * Handles both literal entries and spread syntax (...PREMIUM_LANGUAGES).
 */
function parseLanguageArray(src, name) {
  // Match the array block: const NAME = [ ... ];
  const re = new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`);
  const m = src.match(re);
  if (!m) return [];

  const body = m[1];
  const entries = [];

  // Literal entries: { code: 'xx', label: '...' }
  const entryRe = /\{\s*code:\s*'([^']+)',\s*label:\s*'([^']+)'\s*\}/g;
  let em;
  while ((em = entryRe.exec(body)) !== null) {
    entries.push({ code: em[1], label: em[2] });
  }

  // If the array spreads another array (e.g. ...PREMIUM_LANGUAGES), resolve it
  const spreadRe = /\.\.\.(\w+)/g;
  let sm;
  while ((sm = spreadRe.exec(body)) !== null) {
    const spreadName = sm[1];
    const spreadEntries = parseLanguageArray(src, spreadName);
    // Insert spread entries at the position they appear (before any literals that follow)
    // For simplicity we prepend them — AVAILABLE_LANGUAGES spreads PREMIUM first.
    entries.unshift(...spreadEntries);
  }

  return entries;
}

const premiumLangs = parseLanguageArray(constantsSrc, 'PREMIUM_LANGUAGES');
const availableLangs = parseLanguageArray(constantsSrc, 'AVAILABLE_LANGUAGES');

// Deduplicate (spread + literal may overlap)
const seen = new Set();
const uniqueAvailable = availableLangs.filter((l) => {
  if (seen.has(l.code)) return false;
  seen.add(l.code);
  return true;
});

// Exclude English for the "translated languages" count
const translatedCount = uniqueAvailable.filter((l) => l.code !== 'en').length;

// Models
const modelMatch = constantsSrc.match(/const\s+SKILLBRIDGE_MODELS\s*=\s*\{([\s\S]*?)\};/);
const models = {};
if (modelMatch) {
  const modelRe = /(\w+):\s*'([^']+)'/g;
  let mm;
  while ((mm = modelRe.exec(modelMatch[1])) !== null) {
    models[mm[1]] = mm[2];
  }
}

// Model display labels
const labelMatch = constantsSrc.match(/const\s+SKILLBRIDGE_MODEL_LABELS\s*=\s*\{([\s\S]*?)\};/);
const modelLabels = {};
if (labelMatch) {
  const labelRe = /(\w+):\s*'([^']+)'/g;
  let lm;
  while ((lm = labelRe.exec(labelMatch[1])) !== null) {
    modelLabels[lm[1]] = lm[2];
  }
}

const version = manifest.version;

// ---------------------------------------------------------------------------
// 3. Build replacement content
// ---------------------------------------------------------------------------

// Language count text (just the number + "languages" for flexible contexts)
const langCountShort = `${translatedCount}+`;

// Premium languages — rendered as lang-tag spans for the landing page
function buildLangTagsHtml(langs) {
  const tags = langs.map((l) => `        <span class="lang-tag">${l.label}</span>`);
  // Add a "+ more" tag showing the remaining standard languages
  const standardCount = translatedCount - premiumLangs.length;
  if (standardCount > 0) {
    tags.push(`        <span class="lang-tag">+ ${standardCount} more</span>`);
  }
  return ['      <div class="languages">', ...tags, '      </div>'].join('\n');
}

// Feature cards HTML — read current features from the index.html and keep them as-is.
// The script only updates version/lang counts/premium list; feature cards are maintained
// manually but wrapped in markers so they *could* be generated in the future.

// ---------------------------------------------------------------------------
// 4. Replace between markers
// ---------------------------------------------------------------------------

/**
 * Replace content between <!-- TAG_START --> and <!-- TAG_END --> markers.
 * Handles both inline (same-line) and block (multi-line) markers.
 */
function replaceBetweenMarkers(content, tag, replacement) {
  // Inline pattern: <!-- TAG_START -->...<!-- TAG_END --> on a single line
  const inlineRe = new RegExp(`(<!--\\s*${tag}_START\\s*-->)[\\s\\S]*?(<!--\\s*${tag}_END\\s*-->)`, 'g');
  return content.replace(inlineRe, `$1${replacement}$2`);
}

// --- docs/index.html ---
const indexPath = path.join(ROOT, 'docs/index.html');
let indexHtml = fs.readFileSync(indexPath, 'utf8');

indexHtml = replaceBetweenMarkers(indexHtml, 'VERSION', `v${version}`);
indexHtml = replaceBetweenMarkers(indexHtml, 'LANG_COUNT', langCountShort);
indexHtml = replaceBetweenMarkers(indexHtml, 'PREMIUM_LANGS', '\n' + buildLangTagsHtml(premiumLangs) + '\n      ');

fs.writeFileSync(indexPath, indexHtml, 'utf8');

// --- README.md ---
const readmePath = path.join(ROOT, 'README.md');
let readme = fs.readFileSync(readmePath, 'utf8');

readme = replaceBetweenMarkers(readme, 'VERSION', `v${version}`);
readme = replaceBetweenMarkers(readme, 'LANG_COUNT', `${translatedCount} languages`);

fs.writeFileSync(readmePath, readme, 'utf8');

// ---------------------------------------------------------------------------
// 5. Report
// ---------------------------------------------------------------------------

console.log('generate-docs: updated docs from source files\n');
console.log(`  Version:            ${version} (from manifest.json)`);
console.log(`  Package version:    ${pkg.version} (from package.json)`);
console.log(`  Total languages:    ${translatedCount} (excluding English)`);
console.log(`  Premium languages:  ${premiumLangs.length} — ${premiumLangs.map((l) => l.label).join(', ')}`);
console.log(`  Standard languages: ${translatedCount - premiumLangs.length}`);
console.log(
  `  AI models:          ${Object.entries(modelLabels)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ')}`,
);
console.log('');
console.log('  Updated files:');
console.log(`    - ${path.relative(ROOT, indexPath)}`);
console.log(`    - ${path.relative(ROOT, readmePath)}`);
