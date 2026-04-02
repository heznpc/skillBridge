#!/usr/bin/env node
/**
 * DOM Health Check — verifies that expected CSS selectors still exist
 * on the Skilljar page HTML.
 *
 * Usage:
 *   node scripts/check-selectors.js
 *
 * In CI (CI=true), writes a report to dom-check-report.txt and exits
 * non-zero if any selector is missing.
 */

const fs = require('fs');

const TARGET_URL = 'https://anthropic.skilljar.com';

const EXPECTED_SELECTORS = [
  '.coursebox-text',
  '.lesson-row',
  '#lesson-main',
  '.course-time',
  '.sj-text-course-overview',
];

async function fetchPage(url) {
  // Use native fetch (Node 18+)
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'SkillBridge-HealthCheck/1.0',
      Accept: 'text/html',
    },
    redirect: 'follow',
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} fetching ${url}`);
  }
  return resp.text();
}

/**
 * Lightweight check: look for the selector string in the raw HTML.
 * This catches class="coursebox-text" and id="lesson-main" patterns
 * without needing a full DOM parser.
 */
function selectorExistsInHtml(html, selector) {
  if (selector.startsWith('#')) {
    // id selector — look for id="value" or id='value'
    const id = selector.slice(1);
    const pattern = new RegExp(`id\\s*=\\s*["']${escapeRegex(id)}["']`, 'i');
    return pattern.test(html);
  }
  if (selector.startsWith('.')) {
    // class selector — look for class attribute containing the class name
    const cls = selector.slice(1);
    const pattern = new RegExp(`class\\s*=\\s*["'][^"']*\\b${escapeRegex(cls)}\\b[^"']*["']`, 'i');
    return pattern.test(html);
  }
  // tag or other — just check presence
  return html.includes(selector);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function main() {
  console.log('DOM Health Check');
  console.log(`Target: ${TARGET_URL}`);
  console.log(`Selectors: ${EXPECTED_SELECTORS.join(', ')}\n`);

  let html;
  try {
    html = await fetchPage(TARGET_URL);
    console.log(`Fetched ${html.length} bytes from ${TARGET_URL}\n`);
  } catch (err) {
    console.error(`Failed to fetch page: ${err.message}`);
    if (process.env.CI) {
      fs.writeFileSync('dom-check-report.txt', `Failed to fetch ${TARGET_URL}: ${err.message}\n`);
    }
    process.exit(1);
  }

  const results = [];
  let allOk = true;

  for (const selector of EXPECTED_SELECTORS) {
    const found = selectorExistsInHtml(html, selector);
    const status = found ? 'OK' : 'MISSING';
    if (!found) allOk = false;
    results.push({ selector, status });
    console.log(`  ${found ? '[OK]     ' : '[MISSING]'} ${selector}`);
  }

  console.log('');

  if (allOk) {
    console.log('All selectors found.');
  } else {
    const missing = results.filter((r) => r.status === 'MISSING');
    console.log(`${missing.length} selector(s) missing!`);

    if (process.env.CI) {
      const report = [
        '### Missing selectors\n',
        ...missing.map((r) => `- \`${r.selector}\``),
        '',
        '### All results\n',
        '| Selector | Status |',
        '|----------|--------|',
        ...results.map((r) => `| \`${r.selector}\` | ${r.status} |`),
      ].join('\n');
      fs.writeFileSync('dom-check-report.txt', report);
    }

    process.exit(1);
  }
}

main();
