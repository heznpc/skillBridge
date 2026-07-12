#!/usr/bin/env node
/**
 * Generate src/shared/runtime-constants.js from src/shared/constants.json.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'src', 'shared', 'constants.json');
const OUT_PATH = path.join(ROOT, 'src', 'shared', 'runtime-constants.js');

const json = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const out = `/**
 * SkillBridge — generated runtime constants.
 *
 * Source of truth: src/shared/constants.json
 * Regenerate with: node scripts/generate-shared-constants.js
 */
(function (root) {
  'use strict';

  const constants = Object.freeze({
    GT_LANG_MAP: Object.freeze(${JSON.stringify(json.GT_LANG_MAP)}),
  });

  root.SB_SHARED_CONSTANTS = constants;
})(typeof globalThis !== 'undefined' ? globalThis : window);
`;

fs.writeFileSync(OUT_PATH, out);
