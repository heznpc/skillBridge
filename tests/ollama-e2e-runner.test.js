/* global describe, test, expect */

const {
  DEFAULT_MODEL,
  chooseModel,
  installedModelNames,
  modelIsInstalled,
  parseArgs,
} = require('../scripts/run-ollama-e2e');

describe('Ollama E2E runner arguments', () => {
  test('defaults to quiet browser automation with automatic model preparation', () => {
    expect(parseArgs()).toEqual({ headed: false, pull: true, requestedModel: null });
  });

  test('accepts explicit headed, no-pull, and model settings', () => {
    expect(parseArgs(['--headed', '--no-pull', '--model', 'qwen3:0.6b'])).toEqual({
      headed: true,
      pull: false,
      requestedModel: 'qwen3:0.6b',
    });
    expect(parseArgs(['--model=gemma3:1b']).requestedModel).toBe('gemma3:1b');
  });

  test('rejects incomplete and unknown options instead of silently ignoring them', () => {
    expect(() => parseArgs(['--model'])).toThrow(/requires a model name/);
    expect(() => parseArgs(['--visible'])).toThrow(/Unknown option/);
  });
});

describe('Ollama E2E model selection', () => {
  test('normalizes the API tag payload and ignores malformed rows', () => {
    expect(installedModelNames({ models: [{ name: 'gemma3:4b' }, { model: 'llama3:latest' }, {}, null] })).toEqual([
      'gemma3:4b',
      'llama3:latest',
    ]);
  });

  test('reuses an installed chat model but avoids embedding-only models', () => {
    expect(chooseModel(['nomic-embed-text:latest', 'gemma3:4b'])).toBe('gemma3:4b');
  });

  test('prefers the compact test model once it has been prepared', () => {
    expect(chooseModel(['gemma3:27b', DEFAULT_MODEL])).toBe(DEFAULT_MODEL);
  });

  test('uses the compact default only when no chat model is available', () => {
    expect(chooseModel([])).toBe(DEFAULT_MODEL);
    expect(chooseModel(['mxbai-embed-large:latest'])).toBe(DEFAULT_MODEL);
  });

  test('an explicit model always wins and tag aliases are recognized', () => {
    expect(chooseModel(['gemma3:4b'], 'qwen3:0.6b')).toBe('qwen3:0.6b');
    expect(modelIsInstalled(['qwen3:latest'], 'qwen3')).toBe(true);
    expect(modelIsInstalled(['qwen3:0.6b'], 'qwen3:0.6b')).toBe(true);
    expect(modelIsInstalled(['gemma3:4b'], 'qwen3')).toBe(false);
  });
});
