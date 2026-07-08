#!/usr/bin/env node
/**
 * Validates that runtime shared constants are generated from constants.json and
 * that consumers read the generated runtime object instead of duplicating the
 * values by hand. Exits with code 1 on mismatch.
 *
 * Usage:  node scripts/check-bg-sync.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'src', 'shared', 'constants.json');
const RUNTIME_PATH = path.join(ROOT, 'src', 'shared', 'runtime-constants.js');
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

// --------------- 2. Evaluate generated runtime constants ---------------

const runtimeSrc = fs.readFileSync(RUNTIME_PATH, 'utf8');
const runtimeRoot = {};
new Function('globalThis', 'window', `${runtimeSrc}; return globalThis.SB_SHARED_CONSTANTS;`)(runtimeRoot, runtimeRoot);
const runtime = runtimeRoot.SB_SHARED_CONSTANTS;

if (!runtime || typeof runtime !== 'object') {
  fail('runtime-constants.js did not expose SB_SHARED_CONSTANTS');
} else {
  if (JSON.stringify(runtime.GT_LANG_MAP) !== JSON.stringify(jsonMap)) {
    fail(
      `runtime GT_LANG_MAP differs from constants.json\n  runtime:        ${JSON.stringify(runtime.GT_LANG_MAP)}\n  constants.json: ${JSON.stringify(jsonMap)}`,
    );
  }
  if (runtime.YOUTUBE_CLIENT_VERSION !== jsonVersion) {
    fail(
      `runtime YOUTUBE_CLIENT_VERSION differs from constants.json\n  runtime:        ${runtime.YOUTUBE_CLIENT_VERSION}\n  constants.json: ${jsonVersion}`,
    );
  }
}

// --------------- 3. Verify consumers read the generated runtime ---------------

const constSrc = fs.readFileSync(CONST_PATH, 'utf8');
if (!constSrc.includes('const SB_SHARED_CONSTANTS = globalThis.SB_SHARED_CONSTANTS')) {
  fail('constants.js does not read globalThis.SB_SHARED_CONSTANTS');
}
if (!constSrc.includes('const YOUTUBE_CLIENT_VERSION = SB_SHARED_CONSTANTS.YOUTUBE_CLIENT_VERSION')) {
  fail('constants.js does not bind YOUTUBE_CLIENT_VERSION from SB_SHARED_CONSTANTS');
}
if (!constSrc.includes('const GT_LANG_MAP = SB_SHARED_CONSTANTS.GT_LANG_MAP')) {
  fail('constants.js does not bind GT_LANG_MAP from SB_SHARED_CONSTANTS');
}

const bgSrc = fs.readFileSync(BG_PATH, 'utf8');
if (!bgSrc.includes("chrome.runtime.getURL('src/shared/runtime-constants.js')")) {
  fail('background.js does not import src/shared/runtime-constants.js');
}
if (!bgSrc.includes('const _BG_SHARED_CONSTANTS = globalThis.SB_SHARED_CONSTANTS || {}')) {
  fail('background.js does not read globalThis.SB_SHARED_CONSTANTS');
}

// --------------- Result ---------------

if (errors > 0) {
  console.error(`\n${errors} constant sync error(s) found.`);
  process.exit(1);
} else {
  console.log('All shared constants are in sync.');
}
