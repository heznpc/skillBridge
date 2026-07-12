#!/usr/bin/env node
/**
 * Fail when a production extension artifact contains executable code loaded
 * from a remote origin. Chrome Web Store MV3 requires all executable logic,
 * including code pulled by bundled dependencies, to live in the package.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CHECKED_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.html', '.htm']);
const REMOTE_CODE_PATTERNS = [
  ['remote static import', /\b(?:import|export)\s+(?:[^"'`;]*?\s+from\s*)?["'`]https?:\/\//i],
  ['remote dynamic import', /\bimport\s*\(\s*["'`]https?:\/\//i],
  // Dynamic executable sinks with a variable/constructed URL are impossible
  // to classify safely using a package-only scan. Fail closed; a future local
  // lazy-loader must use an explicit, audited build-time allowlist.
  ['dynamic import requires audit', /\bimport\s*\(/i],
  ['remote importScripts', /\bimportScripts\s*\(\s*["'`]https?:\/\//i],
  [
    'indirect importScripts requires audit',
    /\bimportScripts\s*\(\s*(?!chrome\.runtime\.getURL\s*\(|["'`](?:\.{1,2}\/|\/|chrome-extension:\/\/))/i,
  ],
  ['remote HTML script source', /<script\b[^>]*\bsrc\s*=\s*["'`]https?:\/\//i],
  [
    'remote created script source',
    /createElement\s*\(\s*["'`]script["'`]\s*\)[\s\S]{0,240}?\.src\s*=\s*["'`]https?:\/\//i,
  ],
  [
    'indirect created script source requires audit',
    /createElement\s*\(\s*["'`]script["'`]\s*\)[\s\S]{0,400}?\.src\s*=\s*(?!chrome\.runtime\.getURL\s*\(|["'`](?:\.{1,2}\/|\/|chrome-extension:\/\/))/i,
  ],
  ['remote JavaScript source assignment', /\.src\s*=\s*["'`]https?:\/\/[^"'`]+\.(?:js|mjs)(?:[?#"'`]|$)/i],
  ['remote worker', /\bnew\s+(?:Shared)?Worker\s*\(\s*["'`]https?:\/\//i],
  ['worker constructor requires audit', /\bnew\s+(?:Shared)?Worker\s*\(/i],
  ['remote executable module', /\baddModule\s*\(\s*["'`]https?:\/\//i],
  ['worklet module requires audit', /\baddModule\s*\(/i],
  ['remote executable fetch', /\bfetch\s*\(\s*["'`]https?:\/\/[^"'`]+\.(?:js|mjs|wasm)(?:[?#"'`]|$)/i],
  ['remote WebAssembly', /https?:\/\/[^\s"'`]+\.wasm\b/i],
  [
    'WebAssembly execution requires audit',
    /\bWebAssembly\s*\.\s*(?:compile|compileStreaming|instantiate|instantiateStreaming)\s*\(/i,
  ],
  ['dynamic eval is not allowed', /\beval\s*(?:\(|[,)\]}])/i],
  ['Function constructor is not allowed', /\b(?:new\s+)?Function\s*\(/],
];

function listCodeFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...listCodeFiles(fullPath));
    else if (CHECKED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(fullPath);
  }
  return files;
}

function findRemoteHostedCode(root) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`RHC scan target is not a directory: ${root}`);
  }
  const findings = [];
  for (const file of listCodeFiles(root)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const [kind, pattern] of REMOTE_CODE_PATTERNS) {
      const match = source.match(pattern);
      if (match) findings.push({ file: path.relative(root, file), kind, excerpt: match[0].slice(0, 160) });
    }
  }
  return findings;
}

function assertNoRemoteHostedCode(root) {
  const findings = findRemoteHostedCode(root);
  if (findings.length > 0) {
    const details = findings.map(({ file, kind, excerpt }) => `- ${file}: ${kind}: ${excerpt}`).join('\n');
    throw new Error(`Remote hosted code detected in ${root}:\n${details}`);
  }
  return true;
}

if (require.main === module) {
  const target = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist', 'bundled'));
  try {
    assertNoRemoteHostedCode(target);
    console.log(`No remote hosted code found in ${target}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { findRemoteHostedCode, assertNoRemoteHostedCode };
