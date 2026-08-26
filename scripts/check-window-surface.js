#!/usr/bin/env node
/**
 * Every name a content script reads off a `window._sbX` namespace must exist
 * on that namespace.
 *
 * Content scripts have no module system: they reach each other only through
 * globals a library assigns to `window`. The libraries also carry a CommonJS
 * export block for the tests. When a name is added to one and not the other,
 * the result is invisible in every way that normally catches things —
 *
 *   - the unit tests load the CommonJS side, so they pass;
 *   - eslint sees a property access on an object, so it says nothing;
 *   - the bundle concatenates the files, so the build succeeds;
 *   - the browser reads `undefined` and throws only when that path runs.
 *
 * That is how ACADEMY_ASSESSMENT_PATH_PATTERNS came to be dereferenced on
 * every Academy route change while being absent from `window._sbAcademy`, with
 * a green suite. It surfaced against the live site, which is far too late for
 * something a string comparison can settle.
 *
 * Deliberately conservative: it reports a name only when the namespace is one
 * this repo defines AND the name is missing. Anything it cannot resolve is
 * left alone rather than guessed at, because a false alarm here would train
 * people to ignore it. In particular it strips comments and strings first —
 * `academy.claude.com` in a comment is not a property read — and it accepts a
 * local as an alias only when it is assigned the namespace and nothing else,
 * so `const x = window._sbY?.factory ? factory(...) : shim` is a DIFFERENT
 * object whose shape this check knows nothing about.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIB_DIR = path.join(ROOT, 'src', 'lib');
const CONSUMER_DIRS = [path.join(ROOT, 'src', 'content'), path.join(ROOT, 'src', 'background')];

/** Evaluate a library the way the browser does, and return what it put on window. */
function windowSurfacesOf(file) {
  const src = fs.readFileSync(file, 'utf8');
  const win = {};
  try {
    // `globalThis` gets a module shim so the CommonJS branch is harmless here.
    new Function('globalThis', 'window', 'document', 'chrome', src)(
      { module: { exports: {} } },
      win,
      undefined,
      undefined,
    );
  } catch (_e) {
    // A library that needs a real DOM to evaluate cannot be checked this way.
    return null;
  }
  return win;
}

function collectSurfaces() {
  const surfaces = new Map();
  for (const name of fs.readdirSync(LIB_DIR)) {
    if (!name.endsWith('.js')) continue;
    const win = windowSurfacesOf(path.join(LIB_DIR, name));
    if (!win) continue;
    for (const [key, value] of Object.entries(win)) {
      if (!key.startsWith('_sb') || !value || typeof value !== 'object') continue;
      surfaces.set(key, { file: path.relative(ROOT, path.join(LIB_DIR, name)), keys: new Set(Object.keys(value)) });
    }
  }
  return surfaces;
}

/**
 * Blank out comments and string/template literals, preserving offsets.
 *
 * Without this, a URL or a filename in prose reads as a property access —
 * `academy.claude.com` and `lesson-identity.js` both did.
 */
function stripNonCode(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
    } else if (two === '/*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (src[i] === '"' || src[i] === "'" || src[i] === '`') {
      const quote = src[i];
      let j = i + 1;
      while (j < src.length && src[j] !== quote) j += src[j] === '\\' ? 2 : 1;
      const stop = Math.min(j + 1, src.length);
      out += src.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else {
      out += src[i];
      i += 1;
    }
  }
  return out;
}

/** `window._sbAcademy.FOO` and `window._sbAcademy?.FOO`. */
const DIRECT = /window\.(_sb[A-Za-z0-9_]*)\??\.([A-Za-z_$][\w$]*)/g;

/**
 * `const academy = window._sbAcademy;` — the namespace is almost always held
 * in a local first, and the reads that matter go through THAT.
 *
 * The defect this whole check exists for was written exactly that way, so a
 * direct-access-only scan would have missed it.
 */
const ALIAS = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*window\.(_sb[A-Za-z0-9_]*)\s*;/g;

/**
 * Reads through a local alias: `academy.FOO`, `academy?.FOO`.
 *
 * The leading `(^|[^.\w$])` matters: without it, `sb.identity.migrate` looks
 * like a read of a local called `identity`, when it is a property of a
 * different object entirely.
 */
const viaAlias = (name) => new RegExp(`(^|[^.\\w$])${name}\\??\\.([A-Za-z_$][\\w$]*)`, 'g');

function main() {
  const surfaces = collectSurfaces();
  const problems = [];

  for (const dir of CONSUMER_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.js')) continue;
      const file = path.join(dir, name);
      const src = stripNonCode(fs.readFileSync(file, 'utf8'));
      const lines = src.split('\n');

      // Locals that hold a namespace, so reads through them can be resolved.
      // Recorded with the line they are declared on: a name bound near the
      // bottom of a file says nothing about an unrelated identifier used near
      // the top.
      const aliases = [];
      for (const m of src.matchAll(ALIAS)) {
        if (!surfaces.has(m[2])) continue;
        aliases.push({ local: m[1], namespace: m[2], fromLine: src.slice(0, m.index).split('\n').length });
      }

      const seen = new Set();
      const report = (namespace, prop, lineNo) => {
        // One line can match both the direct form and an alias for the same
        // read; report the finding, not the number of ways it was spotted.
        const id = `${lineNo}:${namespace}.${prop}`;
        if (seen.has(id)) return;
        seen.add(id);
        const surface = surfaces.get(namespace);
        // Unknown namespace: defined elsewhere, or built at runtime. Not ours to judge.
        if (!surface || surface.keys.has(prop)) return;
        problems.push({
          where: `${path.relative(ROOT, file)}:${lineNo}`,
          namespace,
          prop,
          defined: surface.file,
        });
      };

      for (const [i, line] of lines.entries()) {
        for (const m of line.matchAll(DIRECT)) report(m[1], m[2], i + 1);
        for (const { local, namespace, fromLine } of aliases) {
          if (i + 1 <= fromLine) continue;
          for (const m of line.matchAll(viaAlias(local))) report(namespace, m[2], i + 1);
        }
      }
    }
  }

  if (problems.length === 0) {
    console.log(`[check-window-surface] OK — ${surfaces.size} namespaces, every dereferenced name is exported.`);
    return;
  }

  console.error('[check-window-surface] MISSING\n');
  for (const p of problems) {
    console.error(`  ${p.where}: reads ${p.namespace}.${p.prop}, which ${p.defined} does not put on window`);
  }
  console.error('\n  → Add the name to the window assignment in the library that owns it.');
  console.error('  → The CommonJS export block is for tests; the browser only sees the window one.');
  process.exitCode = 1;
}

main();
