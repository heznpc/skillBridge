#!/usr/bin/env node
/**
 * DOM Health Check — verifies that expected CSS selectors still exist
 * on the Skilljar page HTML.
 *
 * Selectors are derived from src/lib/selectors.js (the single source of
 * truth) so we never hard-code selector values in two places.
 *
 * Usage:
 *   node scripts/check-selectors.js
 *
 * In CI (CI=true), writes a report to dom-check-report.txt and exits
 * non-zero if any selector is missing.
 */

const fs = require('fs');
const path = require('path');

const selectorsPath = path.resolve(__dirname, '../src/lib/selectors.js');
const selectorsSource = fs.readFileSync(selectorsPath, 'utf8');
// Same pattern as tests/selectors.test.js — trusted first-party source.
// eslint-disable-next-line no-new-func
const SEL = new Function(`${selectorsSource}; return SKILLJAR_SELECTORS;`)();

const CATALOG_URL = 'https://anthropic.skilljar.com';
const COURSE_URL = 'https://anthropic.skilljar.com/claude-101';

// Keys from SKILLJAR_SELECTORS that MUST exist on each page type.
const CATALOG_KEYS = ['courseBox', 'courseBoxDesc'];
const COURSE_KEYS = ['lessonRow', 'lessonMain', 'sectionTitle', 'courseTitle'];

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function simpleExists(html, sel) {
  sel = sel.trim();
  if (sel.startsWith('#')) {
    const id = sel.slice(1);
    return new RegExp(`id\\s*=\\s*["']${escapeRegex(id)}["']`, 'i').test(html);
  }
  if (sel.startsWith('.')) {
    const cls = sel.slice(1);
    return new RegExp(`class\\s*=\\s*["'][^"']*\\b${escapeRegex(cls)}\\b[^"']*["']`, 'i').test(html);
  }
  return html.includes(sel);
}

/**
 * Comma-separated selector values pass if ANY variant matches.
 */
function selectorExistsInHtml(html, selectorValue) {
  return selectorValue.split(',').some((s) => simpleExists(html, s));
}

async function fetchPage(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'SkillBridge-HealthCheck/1.0', Accept: 'text/html' },
    redirect: 'follow',
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
  return resp.text();
}

async function checkPage(url, keys, label) {
  console.log(`\n── ${label}: ${url}`);
  const html = await fetchPage(url);
  console.log(`   Fetched ${html.length} bytes\n`);

  const results = [];
  for (const key of keys) {
    const value = SEL[key];
    if (!value) {
      console.log(`  [WARN]   key "${key}" not found in SKILLJAR_SELECTORS — skipped`);
      continue;
    }
    const found = selectorExistsInHtml(html, value);
    results.push({ key, selector: value, status: found ? 'OK' : 'MISSING', page: label });
    console.log(`  ${found ? '[OK]     ' : '[MISSING]'} ${key} → ${value}`);
  }
  return results;
}

async function main() {
  console.log('DOM Health Check');
  console.log(`Selectors loaded from ${selectorsPath}`);

  let allResults;
  try {
    const [catalogResults, courseResults] = await Promise.all([
      checkPage(CATALOG_URL, CATALOG_KEYS, 'Catalog'),
      checkPage(COURSE_URL, COURSE_KEYS, 'Course'),
    ]);
    allResults = [...catalogResults, ...courseResults];
  } catch (err) {
    console.error(`Failed to fetch page: ${err.message}`);
    if (process.env.CI) {
      fs.writeFileSync('dom-check-report.txt', `Fetch error: ${err.message}\n`);
    }
    process.exit(1);
  }

  console.log('');

  const missing = allResults.filter((r) => r.status === 'MISSING');
  if (missing.length === 0) {
    console.log('All selectors found.');
  } else {
    console.log(`${missing.length} selector(s) missing!`);

    if (process.env.CI) {
      const report = [
        '### Missing selectors\n',
        ...missing.map((r) => `- \`${r.key}\`: \`${r.selector}\` (${r.page})`),
        '',
        '### All results\n',
        '| Key | Selector | Page | Status |',
        '|-----|----------|------|--------|',
        ...allResults.map((r) => `| ${r.key} | \`${r.selector}\` | ${r.page} | ${r.status} |`),
      ].join('\n');
      fs.writeFileSync('dom-check-report.txt', report);
    }

    process.exit(1);
  }
}

main();
