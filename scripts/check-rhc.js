#!/usr/bin/env node
/**
 * Fail when a production extension artifact contains executable code loaded
 * from a remote origin. Chrome Web Store MV3 requires executable logic,
 * including code pulled by bundled dependencies, to live in the package.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CHECKED_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.html', '.htm']);
const REMOTE_CODE_PATTERNS = [
  ['remote static import', /\b(?:import|export)\s+(?:[^"'`;]*?\s+from\s*)?["'`]https?:\/\//i],
  ['remote dynamic import', /\bimport\s*\(\s*["'`]https?:\/\//i],
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

// `matchAll` requires the global flag, and it throws a TypeError without one —
// which would turn a future pattern added without `g` into a crashed scan
// instead of a clean build failure. Normalize once here rather than trusting
// every literal above to carry the flag. `matchAll` iterates over a clone, so
// these shared regexes never accumulate `lastIndex` state between files.
const GLOBAL_PATTERNS = REMOTE_CODE_PATTERNS.map(([kind, pattern]) => [
  kind,
  pattern.flags.includes('g') ? pattern : new RegExp(pattern.source, `${pattern.flags}g`),
]);

const EXCERPT_MAX_CHARS = 160;
// An unbounded list would let one minified vendor file bury the rest of the
// report. Report this many hits per pattern per file, then say how many were
// withheld.
const MAX_MATCHES_PER_KIND = 10;

/** 1-based line/column for a match offset. */
function locate(source, index) {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < index; i += 1) {
    if (source.charCodeAt(i) === 10) {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, column: index - lineStart + 1 };
}

/**
 * The patterns above deliberately match only the SINK PREFIX — `import('https://`
 * — so `match[0]` stops before the URL that a reader actually needs. Widen the
 * excerpt forward from the match offset instead, stopping at the end of the
 * line so a minified file yields one readable fragment rather than the file.
 */
function excerptAt(source, index) {
  const window = source.slice(index, index + EXCERPT_MAX_CHARS);
  const newline = window.indexOf('\n');
  return newline === -1 ? window : window.slice(0, newline);
}

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
    const relative = path.relative(root, file);
    for (const [kind, pattern] of GLOBAL_PATTERNS) {
      let reported = 0;
      let withheld = 0;
      for (const match of source.matchAll(pattern)) {
        if (reported >= MAX_MATCHES_PER_KIND) {
          withheld += 1;
          continue;
        }
        reported += 1;
        const { line, column } = locate(source, match.index);
        findings.push({ file: relative, kind, line, column, excerpt: excerptAt(source, match.index) });
      }
      if (withheld > 0) {
        findings.push({ file: relative, kind, line: null, column: null, excerpt: `(+${withheld} more)` });
      }
    }
  }
  return findings;
}

function assertNoRemoteHostedCode(root) {
  const findings = findRemoteHostedCode(root);
  if (findings.length > 0) {
    const details = findings
      .map(({ file, kind, line, column, excerpt }) => {
        const at = line === null ? file : `${file}:${line}:${column}`;
        return `- ${at}: ${kind}: ${excerpt}`;
      })
      .join('\n');
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
