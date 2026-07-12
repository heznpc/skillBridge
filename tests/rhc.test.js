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
    const dir = fixture({ 'popup.js': "script.src = chrome.runtime.getURL('local.js');" });
    expect(findRemoteHostedCode(dir)).toEqual([]);
    expect(() => assertNoRemoteHostedCode(dir)).not.toThrow();
  });

  test.each([
    ['static import', "import runtime from 'https://cdn.example/runtime.js'"],
    ['side-effect import', "import 'https://cdn.example/runtime.js'"],
    ['re-export', "export * from 'https://cdn.example/runtime.js'"],
    ['dynamic import', "import('https://cdn.example/code.js')"],
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
    ['variable dynamic import', "const url = 'https://cdn.example/runtime.js'; import(url)"],
    [
      'extensionless remote fetch followed by eval',
      "fetch('https://cdn.example/runtime').then((r) => r.text()).then(eval)",
    ],
    [
      'constructed script URL',
      "const script = document.createElement('script'); const path = 'runtime'; script.src = 'https://cdn.example/' + path",
    ],
    [
      'constructed WebAssembly URL',
      "const path = 'https://cdn.example/runtime'; WebAssembly.instantiateStreaming(fetch(path))",
    ],
  ])('rejects remote %s', (_label, source) => {
    const dir = fixture({ 'runtime.js': source });
    expect(findRemoteHostedCode(dir).length).toBeGreaterThanOrEqual(1);
    expect(() => assertNoRemoteHostedCode(dir)).toThrow(/Remote hosted code detected/);
  });
});
