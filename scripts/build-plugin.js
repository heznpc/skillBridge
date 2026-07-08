#!/usr/bin/env node
/**
 * Claude Code plugin data generator.
 *
 * Derives the bundled terminology data for the `skillbridge-academy-terms`
 * Claude Code plugin from the canonical extension assets:
 *
 *   - src/data/*.json        — the 11 curated language dictionaries
 *                              (course-content term pairs + _protected guardrails)
 *   - src/lib/constants.js   — FLASHCARD_COURSE_MAP (course-slug -> content blocks)
 *
 * Nothing here is hand-authored: re-run after editing the canonical assets and
 * the plugin stays in sync. Output lands under:
 *
 *   claude-plugin/skills/academy-terms/data/
 *     terms.<lang>.json   — per-language flattened dictionary
 *     courses.json        — derived Academy course catalog
 *     index.json          — generation manifest (langs, counts, source version)
 *
 * Usage:
 *   node scripts/build-plugin.js          # write files
 *   node scripts/build-plugin.js --check  # verify on-disk output matches (CI)
 *
 * In --check mode, exits non-zero if any generated file is missing or stale,
 * so CI can guarantee the committed plugin data was not hand-edited.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'src', 'data');
const RUNTIME_CONSTANTS_PATH = path.join(ROOT, 'src', 'shared', 'runtime-constants.js');
const CONSTANTS_PATH = path.join(ROOT, 'src', 'lib', 'constants.js');
const OUT_DIR = path.join(ROOT, 'claude-plugin', 'skills', 'academy-terms', 'data');

// Content blocks whose EN->translation rows are genuine *terminology*
// (course material vocabulary). Excludes UI chrome, FAQ prose, exam UI, and
// _meta — those are app plumbing, not study terms. _protected is handled
// separately because its shape is term -> [wrong translations].
const TERM_BLOCKS = [
  'catalog',
  'claude101',
  'claudeCode',
  'agentSkills',
  'claudeCowork',
  'subagents',
  'aiFluency',
  'common',
  'mcpIntro',
  'mcpAdvanced',
  'aiCapabilities',
  'claudeAPI',
  'aiFluencyEdu',
  'aiFluencyStudent',
  'aiFluencyNonprofit',
  'cloudDeployment',
  'extendedThinking',
  'teachingAI',
];

// Human-readable names for each course content block, for the catalog file.
const BLOCK_TITLES = {
  claude101: 'Claude 101',
  claudeCode: 'Claude Code in Action',
  agentSkills: 'Introduction to Agent Skills',
  claudeCowork: 'Introduction to Claude Cowork',
  subagents: 'Introduction to Subagents',
  aiFluency: 'AI Fluency: Framework & Foundations',
  mcpIntro: 'Introduction to Model Context Protocol',
  mcpAdvanced: 'Model Context Protocol: Advanced Topics',
  aiCapabilities: 'AI Capabilities and Limitations',
  claudeAPI: 'Building with the Claude API',
  aiFluencyEdu: 'AI Fluency for Educators',
  aiFluencyStudent: 'AI Fluency for Students',
  aiFluencyNonprofit: 'AI Fluency for Nonprofits',
  cloudDeployment: 'Claude with Cloud Providers (Bedrock / Vertex AI)',
  extendedThinking: 'Extended Thinking with Claude',
  teachingAI: 'Teaching AI Fluency',
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Read FLASHCARD_COURSE_MAP out of constants.js by evaluating the real literal,
 * the same way scripts/check-academy-courses.js (loadKnownSlugs) and
 * scripts/check-dict-coverage.js read it. constants.js is content-script source
 * that references SKILLJAR_SELECTORS at load, so we stub that with a Proxy and
 * run the file in an isolated Function scope to get the actual evaluated object.
 *
 * This replaces an earlier regex-into-JSON normalizer that text-mangled the
 * source (strip `//`, `'`->`"`, quote bare keys, drop trailing commas): that
 * approach silently breaks on any value the JS literal legitimately allows but
 * the regexes don't anticipate — an apostrophe or `//` inside a string value, a
 * block comment, or a brace inside a comment. Evaluating the literal can't drift
 * from what the extension actually loads.
 */
function loadCourseMap() {
  // Security note: `new Function` here is NOT a code-injection surface. The only
  // interpolated value is the contents of our own first-party src/lib/constants.js,
  // read from disk at build time — not user/network input. Anyone who could tamper
  // with it already controls the shipped content-script source, so evaluating it
  // adds no marginal risk. This mirrors the accepted pattern in
  // scripts/check-academy-courses.js (loadKnownSlugs) and check-dict-coverage.js.
  const runtimeConstantsSrc = fs.readFileSync(RUNTIME_CONSTANTS_PATH, 'utf8');
  const src = fs.readFileSync(CONSTANTS_PATH, 'utf8');
  // constants.js only references SKILLJAR_SELECTORS at module scope; its values
  // don't affect FLASHCARD_COURSE_MAP, so a "" -> Proxy stub is sufficient.
  const stub = 'const SKILLJAR_SELECTORS = new Proxy({}, { get: () => "" });';
  const map = new Function(
    `${runtimeConstantsSrc}\n${stub}\n${src}\nreturn typeof FLASHCARD_COURSE_MAP !== 'undefined' ? FLASHCARD_COURSE_MAP : null;`,
  )();
  if (!map || typeof map !== 'object') {
    throw new Error('FLASHCARD_COURSE_MAP not found (or not an object) in constants.js');
  }
  return map;
}

/** Build the per-language flattened dictionary for one source file. */
function buildLangDict(data) {
  const terms = {};
  for (const block of TERM_BLOCKS) {
    const rows = data[block];
    if (!rows || typeof rows !== 'object') continue;
    for (const [en, translated] of Object.entries(rows)) {
      // First writer wins so the more specific course blocks don't get
      // clobbered by generic ones; identical keys map to identical values
      // across blocks anyway.
      if (!(en in terms)) terms[en] = translated;
    }
  }

  return {
    _meta: {
      lang: data._meta.lang,
      langName: data._meta.langName,
      sourceVersion: data._meta.version,
      sourceLastUpdated: data._meta.lastUpdated,
      generatedFrom: `src/data/${data._meta.lang}.json`,
      termCount: Object.keys(terms).length,
    },
    // Canonical brand / API terms that must NEVER be translated, with the
    // known bad renderings to actively reject. Preserved verbatim.
    protected: data._protected || {},
    // EN term -> correct localized rendering.
    terms,
  };
}

/** Build the derived course catalog from the slug map + block titles. */
function buildCourses(courseMap, langs) {
  // Invert: content-block -> [slugs that resolve to it].
  const blockToSlugs = {};
  for (const [slug, blocks] of Object.entries(courseMap)) {
    for (const block of blocks) {
      (blockToSlugs[block] ||= []).push(slug);
    }
  }

  const courses = Object.keys(BLOCK_TITLES)
    .filter((block) => blockToSlugs[block])
    .map((block) => ({
      block,
      title: BLOCK_TITLES[block],
      slugs: [...new Set(blockToSlugs[block])].sort(),
    }));

  return {
    _meta: {
      source: 'FLASHCARD_COURSE_MAP in src/lib/constants.js',
      courseCount: courses.length,
      languages: langs,
    },
    courses,
  };
}

function stable(obj) {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

function main() {
  const check = process.argv.includes('--check');

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
  if (files.length === 0) {
    console.error(`No language dictionaries found in ${DATA_DIR}`);
    process.exit(1);
  }

  const courseMap = loadCourseMap();
  const langs = [];
  const outputs = {};
  let sourceVersion = null;

  for (const file of files) {
    const data = readJson(path.join(DATA_DIR, file));
    const lang = data._meta.lang;
    langs.push(lang);
    sourceVersion = sourceVersion || data._meta.version;
    outputs[`terms.${lang}.json`] = stable(buildLangDict(data));
  }

  outputs['courses.json'] = stable(buildCourses(courseMap, langs));
  outputs['index.json'] = stable({
    plugin: 'skillbridge-academy-terms',
    generatedBy: 'scripts/build-plugin.js',
    sourceVersion,
    languages: langs,
    files: ['courses.json', ...langs.map((l) => `terms.${l}.json`)].sort(),
    note: 'Derived from src/data/*.json and src/lib/constants.js — do not edit by hand. Run `npm run build:plugin`.',
  });

  if (check) {
    let stale = false;
    for (const [name, content] of Object.entries(outputs)) {
      const target = path.join(OUT_DIR, name);
      let existing;
      try {
        existing = fs.readFileSync(target, 'utf8');
      } catch {
        existing = null;
      }
      if (existing !== content) {
        console.error(`  [STALE] ${path.relative(ROOT, target)}`);
        stale = true;
      }
    }
    // Orphan detection: a generated file on disk with no current source (e.g. a
    // language dropped/renamed in src/data) is not in `outputs`, so the loop
    // above never compares it and it would otherwise be silently rubber-stamped.
    if (fs.existsSync(OUT_DIR)) {
      for (const name of fs.readdirSync(OUT_DIR)) {
        if (name.endsWith('.json') && !(name in outputs)) {
          console.error(`  [ORPHAN] ${path.relative(ROOT, path.join(OUT_DIR, name))} — no source; run build:plugin`);
          stale = true;
        }
      }
    }
    if (stale) {
      console.error('\nPlugin data is stale. Run `npm run build:plugin` and commit the result.');
      process.exit(1);
    }
    console.log(`Plugin data is up to date (${langs.length} languages).`);
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  // Remove orphan generated files (e.g. a language dropped from src/data) so the
  // output dir exactly matches the current source set.
  for (const name of fs.readdirSync(OUT_DIR)) {
    if (name.endsWith('.json') && !(name in outputs)) {
      fs.rmSync(path.join(OUT_DIR, name));
      console.log(`  removed orphan ${path.relative(ROOT, path.join(OUT_DIR, name))}`);
    }
  }
  for (const [name, content] of Object.entries(outputs)) {
    fs.writeFileSync(path.join(OUT_DIR, name), content);
    console.log(`  wrote ${path.relative(ROOT, path.join(OUT_DIR, name))}`);
  }
  console.log(`\nGenerated plugin data for ${langs.length} languages from src/data/.`);
}

main();
