/** Remote-hosted-code scanner regression tests. */

/* global describe, test, expect, afterEach */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { findRemoteHostedCode, assertNoRemoteHostedCode } = require('../scripts/check-rhc');

const tempDirs = [];

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillbridge-rhc-'));
  tempDirs.push(dir);
  for (const [name, source] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source);
  }
  return dir;
}

afterEach(() => {
  while (tempDirs.length) fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
});

describe('CWS remote hosted code scanner', () => {
  test('accepts extension-local executable assets', () => {
    const dir = fixture({
      'popup.js': "script.src = chrome.runtime.getURL('local.js');",
      'worker.js': "importScripts(chrome.runtime.getURL('constants.js'));",
    });
    expect(findRemoteHostedCode(dir)).toEqual([]);
    expect(() => assertNoRemoteHostedCode(dir)).not.toThrow();
  });

  test.each([
    ['static import', "import runtime from 'https://cdn.example/runtime.js'"],
    ['side-effect import', "import 'https://cdn.example/runtime.js'"],
    ['re-export', "export * from 'https://cdn.example/runtime.js'"],
    ['dynamic import', "import('https://cdn.example/code.js')"],
    ['variable dynamic import', "const url = 'https://cdn.example/runtime.js'; import(url)"],
    ['importScripts', "importScripts('https://cdn.example/worker.js')"],
    ['script source', "script.src = 'https://cdn.example/runtime.js'"],
    [
      'extensionless created script source',
      "const script = document.createElement('script'); script.src = 'https://cdn.example/runtime'",
    ],
    ['extensionless HTML script source', '<script src="https://cdn.example/runtime"></script>'],
    ['worker', "new Worker('https://cdn.example/runtime.js')"],
    ['shared worker', "new SharedWorker('https://cdn.example/runtime.js')"],
    ['worklet module', "audioWorklet.addModule('https://cdn.example/runtime.js')"],
    ['executable fetch', "fetch('https://cdn.example/runtime.js?v=1')"],
    ['WebAssembly', "fetch('https://cdn.example/runtime.wasm')"],
    ['dynamic eval', "fetch('/payload').then((r) => r.text()).then(eval)"],
    ['Function constructor', 'const globalScope = Function("return this")()'],
    [
      'constructed script URL',
      "const script = document.createElement('script'); const file = 'runtime'; script.src = 'https://cdn.example/' + file",
    ],
    [
      'constructed WebAssembly URL',
      "const file = 'https://cdn.example/runtime'; WebAssembly.instantiateStreaming(fetch(file))",
    ],
  ])('rejects remote %s', (_label, source) => {
    const dir = fixture({ 'runtime.js': source });
    expect(findRemoteHostedCode(dir).length).toBeGreaterThanOrEqual(1);
    expect(() => assertNoRemoteHostedCode(dir)).toThrow(/Remote hosted code detected/);
  });
});

// The scanner used to report `match[0]` with no location. Two problems, both
// hitting whoever has to clear the artifact: the patterns match only the sink
// PREFIX (`import('https://`), so the offending URL never appeared, and there
// was no line/column, so on the bundled Puter SDK the finding said only "this
// 2 MB file contains a dynamic import somewhere". It also used `match()`
// without `g`, reporting one hit per pattern per file.
describe('findings are locatable', () => {
  test('excerpt extends past the matched prefix to include the URL', () => {
    const dir = fixture({ 'runtime.js': "import('https://cdn.example/code.js')" });
    const [finding] = findRemoteHostedCode(dir).filter((f) => f.kind === 'remote dynamic import');
    expect(finding.excerpt).toContain('cdn.example/code.js');
  });

  test('reports 1-based line and column', () => {
    const dir = fixture({
      'runtime.js': ['// header', '', "  importScripts('https://cdn.example/worker.js');"].join('\n'),
    });
    const [finding] = findRemoteHostedCode(dir).filter((f) => f.kind === 'remote importScripts');
    expect(finding.line).toBe(3);
    expect(finding.column).toBe(3);
  });

  test('excerpt stops at the end of the line', () => {
    const dir = fixture({
      'runtime.js': ["import('https://cdn.example/a.js')", 'const unrelated = 1;'].join('\n'),
    });
    const [finding] = findRemoteHostedCode(dir).filter((f) => f.kind === 'remote dynamic import');
    expect(finding.excerpt).not.toContain('unrelated');
  });

  test('every occurrence of the same sink is reported, each with its own line', () => {
    const dir = fixture({
      'runtime.js': [
        "import('https://cdn.example/one.js')",
        'const x = 1;',
        "import('https://cdn.example/two.js')",
      ].join('\n'),
    });
    const hits = findRemoteHostedCode(dir).filter((f) => f.kind === 'remote dynamic import');
    expect(hits).toHaveLength(2);
    expect(hits.map((f) => f.line)).toEqual([1, 3]);
    expect(hits[0].excerpt).toContain('one.js');
    expect(hits[1].excerpt).toContain('two.js');
  });

  test('the thrown message carries file:line:column for each finding', () => {
    const dir = fixture({ 'runtime.js': ['// pad', "new Worker('https://cdn.example/w.js')"].join('\n') });
    let message = '';
    try {
      assertNoRemoteHostedCode(dir);
    } catch (err) {
      message = err.message;
    }
    expect(message).toContain('runtime.js:2:1');
    expect(message).toContain('cdn.example/w.js');
  });

  test('caps a flood and states how many were withheld', () => {
    const lines = [];
    for (let i = 0; i < 14; i++) lines.push(`import('https://cdn.example/chunk-${i}.js')`);
    const dir = fixture({ 'runtime.js': lines.join('\n') });
    const hits = findRemoteHostedCode(dir).filter((f) => f.kind === 'remote dynamic import');
    expect(hits).toHaveLength(11);
    expect(hits[hits.length - 1]).toMatchObject({ line: null, excerpt: '(+4 more)' });
  });

  test('a clean tree still returns no findings', () => {
    const dir = fixture({
      'popup.js': "script.src = chrome.runtime.getURL('local.js');\nscript2.src = chrome.runtime.getURL('other.js');",
    });
    expect(findRemoteHostedCode(dir)).toEqual([]);
  });
});
