#!/usr/bin/env node
/**
 * Validates that the shared constants in constants.json, constants.js, and
 * background.js all match.  Exits with code 1 on mismatch.
 *
 * Usage:  node scripts/check-bg-sync.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'src', 'shared', 'constants.json');
const CONST_PATH = path.join(ROOT, 'src', 'lib', 'constants.js');
const BG_PATH = path.join(ROOT, 'src', 'background', 'background.js');

let errors = 0;

function fail(msg) {
  console.error(`MISMATCH: ${msg}`);
  errors++;
}

// --------------- 1. Read JSON source of truth ---------------

const json = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const jsonMap = json.GT_LANG_MAP;
const jsonVersion = json.YOUTUBE_CLIENT_VERSION;

if (!jsonMap || typeof jsonMap !== 'object') {
  fail('constants.json is missing GT_LANG_MAP');
}
if (!jsonVersion || typeof jsonVersion !== 'string') {
  fail('constants.json is missing YOUTUBE_CLIENT_VERSION');
}

// --------------- 2. Extract values from constants.js ---------------

const constSrc = fs.readFileSync(CONST_PATH, 'utf8');

// Extract GT_LANG_MAP object literal
const constMapMatch = constSrc.match(/const\s+GT_LANG_MAP\s*=\s*\{([^}]+)\}/);
if (!constMapMatch) {
  fail('Could not find GT_LANG_MAP in constants.js');
} else {
  const entries = [...constMapMatch[1].matchAll(/'([^']+)'\s*:\s*'([^']+)'/g)];
  const constMap = Object.fromEntries(entries.map((m) => [m[1], m[2]]));
  if (JSON.stringify(constMap) !== JSON.stringify(jsonMap)) {
    fail(
      `GT_LANG_MAP in constants.js differs from constants.json\n  constants.js:   ${JSON.stringify(constMap)}\n  constants.json: ${JSON.stringify(jsonMap)}`,
    );
  }
}

// Extract YOUTUBE_CLIENT_VERSION
const constVerMatch = constSrc.match(/const\s+YOUTUBE_CLIENT_VERSION\s*=\s*'([^']+)'/);
if (!constVerMatch) {
  fail('Could not find YOUTUBE_CLIENT_VERSION in constants.js');
} else if (constVerMatch[1] !== jsonVersion) {
  fail(
    `YOUTUBE_CLIENT_VERSION in constants.js differs from constants.json\n  constants.js:   ${constVerMatch[1]}\n  constants.json: ${jsonVersion}`,
  );
}

// --------------- 3. Extract fallback values from background.js ---------------

const bgSrc = fs.readFileSync(BG_PATH, 'utf8');

// Extract _BG_GT_LANG_MAP fallback (accepts const or let — declared once, never reassigned in practice)
const bgMapMatch = bgSrc.match(/(?:const|let)\s+_BG_GT_LANG_MAP\s*=\s*\{([^}]+)\}/);
if (!bgMapMatch) {
  fail('Could not find _BG_GT_LANG_MAP in background.js');
} else {
  const entries = [...bgMapMatch[1].matchAll(/'([^']+)'\s*:\s*'([^']+)'/g)];
  const bgMap = Object.fromEntries(entries.map((m) => [m[1], m[2]]));
  if (JSON.stringify(bgMap) !== JSON.stringify(jsonMap)) {
    fail(
      `_BG_GT_LANG_MAP fallback in background.js differs from constants.json\n  background.js:  ${JSON.stringify(bgMap)}\n  constants.json: ${JSON.stringify(jsonMap)}`,
    );
  }
}

// Extract _BG_YT_CLIENT_VERSION_DEFAULT fallback — this is the inline default
// that is always present; _BG_YT_CLIENT_VERSION itself is a `let` that gets
// hydrated from chrome.storage.local at runtime (see #78).
const bgVerMatch = bgSrc.match(/(?:const|let)\s+_BG_YT_CLIENT_VERSION_DEFAULT\s*=\s*'([^']+)'/);
if (!bgVerMatch) {
  fail('Could not find _BG_YT_CLIENT_VERSION_DEFAULT in background.js');
} else if (bgVerMatch[1] !== jsonVersion) {
  fail(
    `_BG_YT_CLIENT_VERSION_DEFAULT fallback in background.js differs from constants.json\n  background.js:  ${bgVerMatch[1]}\n  constants.json: ${jsonVersion}`,
  );
}

// --------------- Result ---------------

if (errors > 0) {
  console.error(`\n${errors} constant sync error(s) found.`);
  process.exit(1);
} else {
  console.log('All shared constants are in sync.');
}
