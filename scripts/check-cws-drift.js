#!/usr/bin/env node
/**
 * check-cws-drift.js — compare manifest.json version against the live
 * Chrome Web Store listing.
 *
 * Why this exists
 * ---------------
 *
 * The 2026-05-29 market-pulse fetch surfaced a 3-month publish drift:
 * local `manifest.json` was at `3.5.34` while the CWS listing had been
 * frozen at `1.0.1 (2026-03-10)` since before the Italian Premium
 * dictionary, the AI-content gate, the trademark sweep, and the audit
 * fix series all landed on `main`. None of that reached users until the
 * dashboard re-upload step. Nothing in CI noticed.
 *
 * This script pulls the public CWS listing page (no auth required), extracts
 * the version + last-updated date, and prints a structured drift report.
 * The intent is two-fold:
 *
 *   1. Print to stdout for human eyes during a release-prep pass.
 *   2. Exit code 1 when the drift exceeds the configured patch-count
 *      threshold (default 5) OR when the published listing is older than
 *      the configured day threshold (default 60 days). CI runs this in
 *      a non-failing context (`continue-on-error: true`) and posts the
 *      output as a workflow annotation — the goal is visibility, not a
 *      hard block on PRs that don't include a publish step.
 *
 * Usage
 * -----
 *
 *   node scripts/check-cws-drift.js                  # human report + exit code
 *   node scripts/check-cws-drift.js --json           # machine-readable JSON
 *   node scripts/check-cws-drift.js --max-patch=10   # raise patch threshold
 *   node scripts/check-cws-drift.js --max-age-days=90
 *
 * Network failure (CWS unreachable, listing 404, parser miss) is a
 * SOFT failure — exits 0 with a warning, so a transient network blip
 * during a release-prep run doesn't block the release.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const REPO_ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'manifest.json');

// CWS extension ID for SkillBridge — sourced from
// store-assets/RELEASE_CHECKLIST.md / dashboard URL.
const CWS_EXTENSION_ID = 'oancfldkbnajdadgekkjpdnhepjjcdln';
const CWS_LISTING_URL = `https://chromewebstore.google.com/detail/${CWS_EXTENSION_ID}`;

// Defaults — tuned to skillBridge's release cadence (roughly monthly
// minor bumps when active). 5 patches at 4-6 days each ≈ a month;
// 60 days is well past the point where the drift is no longer "I'll
// batch the next release" and starts being "the published listing is
// genuinely stale".
const DEFAULT_MAX_PATCH_DRIFT = 5;
const DEFAULT_MAX_AGE_DAYS = 60;
const FETCH_TIMEOUT_MS = 15_000;

function parseArgs(argv) {
  const opts = {
    json: false,
    maxPatch: DEFAULT_MAX_PATCH_DRIFT,
    maxAgeDays: DEFAULT_MAX_AGE_DAYS,
  };
  for (const a of argv.slice(2)) {
    if (a === '--json') opts.json = true;
    else if (a.startsWith('--max-patch=')) opts.maxPatch = Number(a.slice('--max-patch='.length));
    else if (a.startsWith('--max-age-days=')) opts.maxAgeDays = Number(a.slice('--max-age-days='.length));
  }
  if (!Number.isFinite(opts.maxPatch) || opts.maxPatch < 0) opts.maxPatch = DEFAULT_MAX_PATCH_DRIFT;
  if (!Number.isFinite(opts.maxAgeDays) || opts.maxAgeDays < 0) opts.maxAgeDays = DEFAULT_MAX_AGE_DAYS;
  return opts;
}

function readLocalVersion() {
  const m = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  return m.version;
}

// Follow up to MAX_REDIRECTS hops. CWS may 301 to a localized variant
// (`/en-US/...`) — we want the final listing page either way.
const MAX_REDIRECTS = 5;

function fetchListing(url, hop = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          // CWS sometimes returns a stub page to bots; use a real-ish UA.
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: FETCH_TIMEOUT_MS,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (hop >= MAX_REDIRECTS) {
            reject(new Error(`too many redirects (>${MAX_REDIRECTS})`));
            return;
          }
          const next = new URL(res.headers.location, url).toString();
          fetchListing(next, hop + 1).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve(body));
      },
    );
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', reject);
  });
}

// CWS embeds metadata in an inline JS array near the top of the page.
// The observed structure (as of 2026-05-29) is roughly:
//   ..."<file-hash>"],null,null,"<version>",[<epoch-seconds>,<nanos>], ...
// where <version> is a normal x.y.z(.w) string and the bracketed pair is
// the last-updated timestamp. We match that shape rather than a `"version":`
// key (which doesn't appear in the rendered HTML — that's a frontend
// internal field).
//
// Fallback patterns are kept in case Google flips the layout: a visible
// "Version 3.5.34" text label, or any literal `"version":"x.y.z"` in
// future API responses. None of these are guaranteed long-term; the
// script soft-fails on parser miss rather than blocking releases.
function extractPublishedVersion(html) {
  const patterns = [
    // Primary: comma-quoted version directly preceding a timestamp array.
    /,"([0-9]+\.[0-9]+\.[0-9]+(?:\.[0-9]+)?)",\[\d{9,11},/,
    // Secondary: `"version":"3.5.34"` if a future API ships it.
    /"version"\s*:\s*"([0-9]+\.[0-9]+\.[0-9]+(?:\.[0-9]+)?)"/,
    // Tertiary: visible label.
    /Version\s+([0-9]+\.[0-9]+\.[0-9]+(?:\.[0-9]+)?)/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractLastUpdated(html) {
  // Primary: same neighborhood as the version — the timestamp array sits
  // directly after the version. Pull the unix-seconds field and turn it
  // into an ISO date.
  const epochMatch = html.match(/,"[0-9]+\.[0-9]+\.[0-9]+(?:\.[0-9]+)?",\[(\d{9,11}),/);
  if (epochMatch) {
    const seconds = Number(epochMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      return new Date(seconds * 1000).toISOString().slice(0, 10);
    }
  }
  // Secondary patterns for future-proofing.
  const fallbacks = [/Updated\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/, /"last_updated"\s*:\s*"([^"]+)"/];
  for (const p of fallbacks) {
    const m = html.match(p);
    if (m) return m[1];
  }
  return null;
}

function compareVersions(local, published) {
  // Both are dot-separated numeric strings. Returns:
  //   { totalPatchDrift: number, sameMajor: boolean, sameMinor: boolean }
  const lp = local.split('.').map(Number);
  const pp = published.split('.').map(Number);
  while (lp.length < 4) lp.push(0);
  while (pp.length < 4) pp.push(0);
  const sameMajor = lp[0] === pp[0];
  const sameMinor = sameMajor && lp[1] === pp[1];
  // Crude "patch distance" — sum the (major*1000 + minor*100 + patch)
  // delta. Good enough for "is the published version a couple of patches
  // behind or completely abandoned".
  const score = (v) => v[0] * 10000 + v[1] * 100 + v[2];
  const totalPatchDrift = score(lp) - score(pp);
  return { totalPatchDrift, sameMajor, sameMinor };
}

function ageDays(updatedString) {
  if (!updatedString) return null;
  const t = Date.parse(updatedString);
  if (Number.isNaN(t)) return null;
  return Math.round((Date.now() - t) / (24 * 60 * 60 * 1000));
}

async function main() {
  const opts = parseArgs(process.argv);
  const local = readLocalVersion();

  let html;
  try {
    html = await fetchListing(CWS_LISTING_URL);
  } catch (err) {
    const msg = `[check-cws-drift] CWS listing unreachable (${err.message}). Skipping drift check. Local version: ${local}.`;
    if (opts.json) {
      console.log(JSON.stringify({ status: 'soft-fail', reason: err.message, localVersion: local }));
    } else {
      console.warn(msg);
    }
    process.exit(0);
  }

  const published = extractPublishedVersion(html);
  const updated = extractLastUpdated(html);

  if (!published) {
    const msg =
      '[check-cws-drift] Could not extract published version from CWS listing (page format may have changed). Skipping.';
    if (opts.json) {
      console.log(JSON.stringify({ status: 'soft-fail', reason: 'parser-miss', localVersion: local }));
    } else {
      console.warn(msg);
    }
    process.exit(0);
  }

  const cmp = compareVersions(local, published);
  const age = ageDays(updated);
  const drifted = cmp.totalPatchDrift > opts.maxPatch || (age !== null && age > opts.maxAgeDays);

  const report = {
    status: drifted ? 'drift' : 'ok',
    localVersion: local,
    publishedVersion: published,
    publishedLastUpdated: updated,
    publishedAgeDays: age,
    patchDriftScore: cmp.totalPatchDrift,
    sameMajor: cmp.sameMajor,
    sameMinor: cmp.sameMinor,
    thresholds: { maxPatch: opts.maxPatch, maxAgeDays: opts.maxAgeDays },
    listingUrl: CWS_LISTING_URL,
  };

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`[check-cws-drift] ${drifted ? 'DRIFT' : 'OK'}`);
    console.log(`  local manifest version : ${local}`);
    console.log(`  published CWS version  : ${published}`);
    console.log(`  published last updated : ${updated || '(unknown)'}${age !== null ? ` (${age} days ago)` : ''}`);
    console.log(`  patch-drift score      : ${cmp.totalPatchDrift} (threshold: ${opts.maxPatch})`);
    console.log(`  age threshold          : ${opts.maxAgeDays} days`);
    console.log(`  listing URL            : ${CWS_LISTING_URL}`);
    if (drifted) {
      console.log('');
      console.log('  → Published listing is materially behind local code.');
      console.log('  → Build a release zip and upload it via the CWS developer dashboard.');
      console.log('  → store-assets/RELEASE_CHECKLIST.md has the upload step-by-step.');
    }
  }

  process.exit(drifted ? 1 : 0);
}

main().catch((err) => {
  console.error('[check-cws-drift] unexpected error:', err);
  process.exit(0); // soft-fail by design
});
