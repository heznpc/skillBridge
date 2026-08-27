#!/usr/bin/env node
/**
 * Are the models the Tutor asks Puter for still models Puter offers?
 *
 * The vendored SDK does not validate a model id. It forwards whatever it is
 * given and lets the server refuse, so an id Puter has retired is not a
 * startup error or a build failure — it is a failed first question after a
 * successful sign-in, which is the most expensive place to find out and the
 * hardest to reproduce without an account.
 *
 * The list is public and needs no credentials, so this can be checked without
 * one. Same shape as check-selectors.js: fetch the live source of truth,
 * compare against what the extension actually ships, exit non-zero on drift.
 *
 *   node scripts/check-tutor-models.js
 */

const fs = require('fs');
const path = require('path');
const {
  parseModelSet,
  parseModelFallbacks,
  parseDefaultModel,
  advertisedIds,
  auditModels,
} = require('./lib/tutor-models');

const MODELS_URL = 'https://api.puter.com/puterai/chat/models/details';
const BROKER = path.resolve(__dirname, '..', 'src', 'bridge', 'puter-content-broker.js');

async function main() {
  const source = fs.readFileSync(BROKER, 'utf8');
  const models = parseModelSet(source);
  const fallbacks = parseModelFallbacks(source);
  const defaultModel = parseDefaultModel(source);
  console.log('Tutor model check');
  console.log(`  ships ${models.length} models, ${fallbacks.length} fallbacks, default ${defaultModel}`);

  let payload;
  try {
    const response = await fetch(MODELS_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    payload = await response.json();
  } catch (err) {
    console.error(`Failed to read ${MODELS_URL}: ${err.message}`);
    process.exit(1);
  }

  const advertised = advertisedIds(payload);
  const result = auditModels({ models, fallbacks, defaultModel, advertised });
  console.log(`  Puter advertises ${advertised.size} ids`);

  if (result.ok) {
    console.log('  ✓ every model the Tutor requests is still offered');
    return;
  }
  if (result.defaultMissing) console.log(`  ✗ the default model ${defaultModel} is no longer offered`);
  for (const id of result.missing) console.log(`  ✗ ${id} is no longer offered`);
  for (const pair of result.missingFallbackTargets) console.log(`  ✗ fallback target gone: ${pair}`);
  for (const pair of result.unlistedFallbackTargets) console.log(`  ✗ fallback target is not in MODELS: ${pair}`);
  process.exit(1);
}

main();
