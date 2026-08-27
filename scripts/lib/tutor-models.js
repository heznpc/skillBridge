/**
 * The model ids the Tutor asks Puter for, read out of the broker itself.
 *
 * `src/bridge/puter-content-broker.js` runs as a bare content script in the
 * isolated world, so there is nothing to require: the ids are read from its
 * source. That is only safe if a parse that finds nothing FAILS — a regex that
 * quietly matched zero models would make the live check below pass by checking
 * an empty set, which is the one way a drift check can be worse than no check
 * at all. Every extractor here throws rather than returning empty.
 *
 * Why this is worth checking at all: the vendored SDK does not validate model
 * ids. It forwards whatever it is given and lets the server refuse, so an id
 * Puter has retired is not a startup error — it is a failed first question
 * after a successful sign-in, which is the most expensive place to find out.
 */

/** Every quoted string inside a `const <name> = new Set([...])` literal. */
function parseModelSet(source, name = 'MODELS') {
  const match = source.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  if (!match) throw new Error(`could not find ${name} in the broker source`);
  const ids = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  if (ids.length === 0) throw new Error(`${name} parsed to an empty list`);
  return ids;
}

/** Every `['from', 'to']` pair inside a `const <name> = new Map([...])` literal. */
function parseModelFallbacks(source, name = 'MODEL_FALLBACKS') {
  const match = source.match(new RegExp(`const ${name} = new Map\\(\\[([\\s\\S]*?)\\]\\);`));
  if (!match) throw new Error(`could not find ${name} in the broker source`);
  const pairs = [...match[1].matchAll(/\['([^']+)',\s*'([^']+)'\]/g)].map((m) => [m[1], m[2]]);
  if (pairs.length === 0) throw new Error(`${name} parsed to an empty list`);
  return pairs;
}

/** The default the broker falls back to for an unrecognised request. */
function parseDefaultModel(source) {
  const match = source.match(/MODELS\.has\(model\) \? model : '([^']+)'/);
  if (!match) throw new Error('could not find the default model in the broker source');
  return match[1];
}

/**
 * Every id Puter advertises, under any of the names it answers to.
 *
 * `/puterai/chat/models/details` lists each model with an `id`, a `puterId`
 * and a set of `aliases`; a request naming any of them is the same model, so
 * all three go in the set.
 */
function advertisedIds(payload) {
  const models = Array.isArray(payload?.models) ? payload.models : null;
  if (!models || models.length === 0) throw new Error('model list is empty or not in the documented shape');
  const ids = new Set();
  for (const model of models) {
    if (model?.id) ids.add(model.id);
    if (model?.puterId) ids.add(model.puterId);
    for (const alias of model?.aliases || []) ids.add(alias);
  }
  return ids;
}

/**
 * Which of the Tutor's ids Puter no longer advertises.
 *
 * A fallback target that is not itself offered is reported separately: it is
 * the second failure in a row, reached only when the first model is already
 * gone, so it is the one most likely to rot unnoticed.
 */
function auditModels({ models, fallbacks, defaultModel, advertised }) {
  const missing = models.filter((id) => !advertised.has(id));
  const missingFallbackTargets = fallbacks
    .filter(([, to]) => !advertised.has(to))
    .map(([from, to]) => `${from} → ${to}`);
  // A fallback that points outside MODELS would be sent anyway — callChat
  // passes it straight through — so it is a gap even when Puter still offers it.
  const unlistedFallbackTargets = fallbacks
    .filter(([, to]) => !models.includes(to))
    .map(([from, to]) => `${from} → ${to}`);
  const defaultMissing = !advertised.has(defaultModel);
  return {
    ok:
      missing.length === 0 &&
      missingFallbackTargets.length === 0 &&
      unlistedFallbackTargets.length === 0 &&
      !defaultMissing,
    missing,
    missingFallbackTargets,
    unlistedFallbackTargets,
    defaultMissing,
  };
}

module.exports = { parseModelSet, parseModelFallbacks, parseDefaultModel, advertisedIds, auditModels };
