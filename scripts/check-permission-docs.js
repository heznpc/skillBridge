#!/usr/bin/env node
/**
 * Validates that the permission surface declared in `manifest.json` is exactly
 * what the CWS-facing documents claim — no more, no less.
 *
 * Why this exists: v4.0.0 removed the weekly GitHub Releases poll and the
 * `api.github.com` host permission, but six claims about that endpoint survived
 * in `PRIVACY_POLICY.md`, `docs/privacy.html` (the page CWS review actually
 * loads), and the store listing. They were found by hand, which is not a
 * process. A privacy disclosure naming a service the manifest can no longer
 * reach is the exact mismatch that stalls review, and the reverse — a granted
 * host that no document discloses — is worse.
 *
 * Three structured surfaces are compared for SET EQUALITY against the manifest,
 * so both directions fail loudly:
 *   1. `### Candidate Permissions` table in PRIVACY_POLICY.md
 *   2. `<h3>Candidate Permissions</h3>` table in docs/privacy.html
 *   3. `## Permission Justifications` headings in store-assets/STORE_LISTING.md
 *
 * The legacy v1.0.1 sections are deliberately excluded: they describe a
 * published build with permissions v4 does not have, and that record must stay.
 *
 * Usage:  node scripts/check-permission-docs.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Capabilities earlier versions requested and this one does not. A checker
// cannot infer what was removed, but once told it can prove the documents
// stopped claiming it — including in prose and in third-party service tables,
// where set equality on the permission tables would never look.
//
// Add an entry whenever a network capability or permission is dropped. That is
// the moment every document describing it goes stale.
// Name the endpoint AND the capability. Listing only `api.github.com` let a
// stale Limited Use certification survive this gate on its first run: it
// certified data handling for "translation, local study, Tutor, and
// update-check features" without naming any host, so an endpoint-only pattern
// read clean. Under the User Data FAQ, a discrepancy between the privacy
// policy, the dashboard disclosures, and actual behavior is a violation that
// can suspend every item a publisher owns — so the prose matters as much as
// the hostname.
const RETIRED = [
  { pattern: /api\.github\.com/gi, why: 'the weekly GitHub Releases poll was removed in v4.0.0' },
  { pattern: /GitHub Releases/gi, why: 'the third-party disclosure must not outlive the capability' },
  {
    pattern: /update[- ]check|update badge|check(ing)? for updates/gi,
    why: 'v4.0.0 has no update-check feature; Chrome updates installed extensions itself',
  },
];

/** `https://*.skilljar.com/*` → `*.skilljar.com`, `http://localhost/*` → `localhost`. */
function stripPattern(pattern) {
  return String(pattern)
    .trim()
    .replace(/^[a-z*]+:\/\//i, '')
    .replace(/\/\*$/, '')
    .replace(/\/$/, '');
}

function hostOf(stripped) {
  return stripped.split('/')[0];
}

/** Chrome host patterns: `*.example.com` covers example.com and any subdomain. */
function hostCovered(host, patternHost) {
  if (patternHost === host) return true;
  if (!patternHost.startsWith('*.')) return false;
  const suffix = patternHost.slice(2);
  return host === suffix || host.endsWith(`.${suffix}`);
}

/**
 * The disclosure tokens a manifest implies. Host permissions collapse to their
 * pattern; a content-script match is included only when no host permission
 * already covers it, since that is the case needing its own justification.
 */
function manifestTokens(manifest) {
  const tokens = new Set();
  for (const perm of manifest.permissions || []) tokens.add(perm);

  const hostPatterns = [...(manifest.host_permissions || []), ...(manifest.optional_host_permissions || [])].map(
    stripPattern,
  );
  for (const pattern of hostPatterns) tokens.add(pattern);

  const csMatches = (manifest.content_scripts || []).flatMap((cs) => cs.matches || []);
  for (const match of csMatches) {
    const stripped = stripPattern(match);
    const covered = hostPatterns.some((pattern) => hostCovered(hostOf(stripped), hostOf(pattern)));
    if (!covered) tokens.add(stripped);
  }
  return tokens;
}

/**
 * Text between a heading and the next heading at the same or higher level. The
 * end search starts after the heading's own line, or the heading would match
 * its own end pattern and return an empty section — which reads as "every
 * permission is undisclosed" rather than as a parser failure.
 */
function sliceSection(text, startPattern, endPattern) {
  const start = text.search(startPattern);
  if (start === -1) return null;
  const headingEnd = text.indexOf('\n', start);
  if (headingEnd === -1) return text.slice(start);
  const end = text.slice(headingEnd).search(endPattern);
  return end === -1 ? text.slice(start) : text.slice(start, headingEnd + end);
}

/** Every `code`-quoted token in the first cell of each table row. */
function tokensFromCells(cells) {
  const tokens = new Set();
  for (const cell of cells) {
    const quoted = cell.match(/`([^`]+)`|<code>([^<]+)<\/code>/g) || [];
    for (const raw of quoted) {
      const value = raw.replace(/^`|`$/g, '').replace(/^<code>|<\/code>$/g, '');
      // Skip API names that appear in a purpose cell, e.g. chrome.storage.local.
      if (value.includes('chrome.')) continue;
      tokens.add(stripPattern(value));
    }
  }
  return tokens;
}

function privacyMdTokens(text) {
  const section = sliceSection(text, /^### Candidate Permissions$/m, /^#{2,3} /m);
  if (section === null) return null;
  const rows = section.split('\n').filter((line) => line.startsWith('|') && !/^\|[\s-]+\|/.test(line));
  const firstCells = rows
    .map((row) => row.split('|')[1] || '')
    .filter((cell) => !/Permission or site access/.test(cell));
  return tokensFromCells(firstCells);
}

function privacyHtmlTokens(text) {
  const section = sliceSection(text, /<h3>Candidate Permissions<\/h3>/, /<h[23][ >]/);
  if (section === null) return null;
  const rows = section.match(/<tr>[\s\S]*?<\/tr>/g) || [];
  const firstCells = rows.map((row) => (row.match(/<td>[\s\S]*?<\/td>/) || [''])[0]);
  return tokensFromCells(firstCells);
}

function storeListingTokens(text) {
  const section = sliceSection(text, /^## Permission Justifications$/m, /^## /m);
  if (section === null) return null;
  const headings = section.match(/^### .+$/gm) || [];
  const tokens = new Set();
  for (const heading of headings) {
    const label = heading
      .replace(/^### /, '')
      .replace(/^(optional\s+)?host permission:\s*/i, '')
      .replace(/^content-script match:\s*/i, '');
    for (const part of label.split(',')) {
      const token = stripPattern(part.replace(/\(.*?\)/g, ''));
      if (token) tokens.add(token);
    }
  }
  return tokens;
}

function diff(expected, actual) {
  return {
    missing: [...expected].filter((token) => !actual.has(token)).sort(),
    extra: [...actual].filter((token) => !expected.has(token)).sort(),
  };
}

/**
 * Returns a list of human-readable problems. Empty means the manifest and every
 * CWS-facing document agree.
 */
function findPermissionDocMismatches({ manifest, privacyMd, privacyHtml, storeListing }) {
  const problems = [];
  const expected = manifestTokens(manifest);

  const surfaces = [
    ['PRIVACY_POLICY.md "Candidate Permissions"', privacyMdTokens(privacyMd)],
    ['docs/privacy.html "Candidate Permissions"', privacyHtmlTokens(privacyHtml)],
    ['STORE_LISTING.md "Permission Justifications"', storeListingTokens(storeListing)],
  ];

  for (const [label, actual] of surfaces) {
    if (actual === null) {
      problems.push(`${label}: section not found — the gate cannot verify what it cannot locate`);
      continue;
    }
    const { missing, extra } = diff(expected, actual);
    for (const token of missing) {
      problems.push(`${label}: manifest declares \`${token}\` but no entry discloses it`);
    }
    for (const token of extra) {
      problems.push(`${label}: discloses \`${token}\`, which the manifest does not request`);
    }
  }

  // Retired capabilities, checked across whole documents rather than tables:
  // the GitHub row lived in a third-party services table, not a permission one.
  const documents = [
    ['manifest.json', JSON.stringify(manifest)],
    ['PRIVACY_POLICY.md', privacyMd],
    ['docs/privacy.html', privacyHtml],
    ['store-assets/STORE_LISTING.md', storeListing],
  ];
  for (const { pattern, why } of RETIRED) {
    for (const [label, text] of documents) {
      const hits = text.match(pattern);
      if (hits) {
        problems.push(`${label}: still mentions ${hits.length}× /${pattern.source}/ — ${why}`);
      }
    }
  }
  return problems;
}

function readAll() {
  return {
    manifest: JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')),
    privacyMd: fs.readFileSync(path.join(ROOT, 'PRIVACY_POLICY.md'), 'utf8'),
    privacyHtml: fs.readFileSync(path.join(ROOT, 'docs', 'privacy.html'), 'utf8'),
    storeListing: fs.readFileSync(path.join(ROOT, 'store-assets', 'STORE_LISTING.md'), 'utf8'),
  };
}

if (require.main === module) {
  const inputs = readAll();
  const problems = findPermissionDocMismatches(inputs);
  if (problems.length) {
    console.error('[check-permission-docs] MISMATCH\n');
    for (const problem of problems) console.error(`  ${problem}`);
    console.error(
      '\n  → The manifest is the source of truth. Update the documents to match it,\n' +
        '    or drop the permission if the documents describe the intended surface.\n' +
        '  → docs/privacy.html is NOT generated from PRIVACY_POLICY.md; edit both.\n',
    );
    process.exit(1);
  }
  const count = manifestTokens(inputs.manifest).size;
  console.log(
    `[check-permission-docs] OK — ${count} declared permissions/hosts disclosed consistently in 3 documents.`,
  );
}

module.exports = {
  findPermissionDocMismatches,
  manifestTokens,
  privacyMdTokens,
  privacyHtmlTokens,
  storeListingTokens,
  RETIRED,
};
