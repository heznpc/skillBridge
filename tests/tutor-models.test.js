/**
 * Reading the Tutor's model ids out of the broker, and comparing them to what
 * Puter offers.
 *
 * The extraction is the risky half. The broker is a bare content script with
 * nothing to require, so the ids are read from its source — and a regex that
 * quietly matched nothing would make the live drift check pass by comparing an
 * empty set, which is worse than having no check. So every extractor here is
 * asserted to fail loudly, and each one is also run against the real broker so
 * a refactor that moves the literals breaks a test rather than a release.
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');
const {
  parseModelSet,
  parseModelFallbacks,
  parseDefaultModel,
  advertisedIds,
  auditModels,
} = require('../scripts/lib/tutor-models');

const brokerSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'bridge', 'puter-content-broker.js'), 'utf8');

describe('reading the ids the Tutor ships', () => {
  test('the real broker still parses', () => {
    const models = parseModelSet(brokerSource);
    expect(models.length).toBeGreaterThan(0);
    expect(models).toContain('claude-haiku-4-5');
    expect(parseModelFallbacks(brokerSource).length).toBeGreaterThan(0);
    expect(models).toContain(parseDefaultModel(brokerSource));
  });

  test('every fallback target is itself a shipped model', () => {
    // callChat passes the fallback straight to the SDK, so a target outside
    // MODELS is sent unchecked — selectModel never sees it.
    const models = parseModelSet(brokerSource);
    for (const [, to] of parseModelFallbacks(brokerSource)) expect(models).toContain(to);
  });

  test('a source the literals have moved out of fails rather than parsing empty', () => {
    expect(() => parseModelSet('const MODELS = new Set(loadThem());')).toThrow(/could not find/);
    expect(() => parseModelFallbacks('const MODEL_FALLBACKS = buildMap();')).toThrow(/could not find/);
    expect(() => parseDefaultModel('const selectModel = (m) => pick(m);')).toThrow(/could not find/);
  });

  test('an empty literal is a parse failure, not an empty answer', () => {
    // The shape that would let the live check "pass" while checking nothing.
    expect(() => parseModelSet('const MODELS = new Set([]);')).toThrow(/empty/);
    expect(() => parseModelFallbacks('const MODEL_FALLBACKS = new Map([]);')).toThrow(/empty/);
  });
});

describe('what Puter advertises', () => {
  const payload = {
    models: [
      {
        id: 'claude-haiku-4-5',
        puterId: 'anthropic:anthropic/claude-haiku-4-5',
        aliases: ['anthropic/claude-haiku-4.5'],
      },
      { id: 'claude-sonnet-4-5', aliases: [] },
    ],
  };

  test('an id counts under any name Puter answers to', () => {
    const ids = advertisedIds(payload);
    expect(ids.has('claude-haiku-4-5')).toBe(true);
    expect(ids.has('anthropic/claude-haiku-4.5')).toBe(true);
    expect(ids.has('anthropic:anthropic/claude-haiku-4-5')).toBe(true);
  });

  test('an empty or unrecognised payload is refused, not read as "nothing offered"', () => {
    // Otherwise an endpoint change would report every model as retired.
    expect(() => advertisedIds({ models: [] })).toThrow(/empty|shape/);
    expect(() => advertisedIds({})).toThrow(/empty|shape/);
    expect(() => advertisedIds(null)).toThrow(/empty|shape/);
  });
});

describe('the drift verdict', () => {
  const advertised = new Set(['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-sonnet-4-6']);

  test('everything offered is a pass', () => {
    const result = auditModels({
      models: ['claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
      fallbacks: [['claude-sonnet-4-6', 'claude-sonnet-4-5']],
      defaultModel: 'claude-haiku-4-5',
      advertised,
    });
    expect(result.ok).toBe(true);
  });

  test('a retired model is named', () => {
    const result = auditModels({
      models: ['claude-opus-9-9', 'claude-haiku-4-5'],
      fallbacks: [['claude-opus-9-9', 'claude-haiku-4-5']],
      defaultModel: 'claude-haiku-4-5',
      advertised,
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['claude-opus-9-9']);
  });

  test('a retired fallback target is reported on its own', () => {
    // It is the second failure in a row, reached only once the first model is
    // already gone, so nothing else would surface it.
    const result = auditModels({
      models: ['claude-sonnet-4-6', 'claude-opus-9-9'],
      fallbacks: [['claude-sonnet-4-6', 'claude-opus-9-9']],
      defaultModel: 'claude-haiku-4-5',
      advertised,
    });
    expect(result.missingFallbackTargets).toEqual(['claude-sonnet-4-6 → claude-opus-9-9']);
  });

  test('a fallback pointing outside MODELS is a gap even while Puter still offers it', () => {
    const result = auditModels({
      models: ['claude-sonnet-4-6'],
      fallbacks: [['claude-sonnet-4-6', 'claude-sonnet-4-5']],
      defaultModel: 'claude-haiku-4-5',
      advertised,
    });
    expect(result.ok).toBe(false);
    expect(result.unlistedFallbackTargets).toEqual(['claude-sonnet-4-6 → claude-sonnet-4-5']);
  });

  test('losing the default is called out by name', () => {
    // Every unrecognised request lands on it, so this one breaks the Tutor for
    // everyone rather than for one setting.
    const result = auditModels({
      models: ['claude-sonnet-4-6'],
      fallbacks: [['claude-sonnet-4-6', 'claude-sonnet-4-5']],
      defaultModel: 'claude-opus-9-9',
      advertised,
    });
    expect(result.defaultMissing).toBe(true);
  });
});
