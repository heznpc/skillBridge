/**
 * Self-test for `scripts/check-academy-courses.js`. The script enforces
 * the product's first pillar at the catalog-discovery level
 * (a silent regression would void the 48h SLA the workflow advertises),
 * so we exercise both the parser in isolation AND the end-to-end CLI
 * against fixtures.
 *
 * Mirrors the approach used by `tests/dict-coverage-checker.test.js`.
 */

/* global describe, test, expect, beforeAll */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'check-academy-courses.js');
const { parseSlugs, NON_COURSE_SLUGS } = require(SCRIPT);

function run(env) {
  // spawnSync with array args avoids js/shell-command-injection-from-
  // environment. SCRIPT is __dirname-derived (no injection vector) but
  // the array form documents that.
  const r = spawnSync(process.execPath, [SCRIPT], {
    env: { ...process.env, ...env, CI: 'true' },
    encoding: 'utf8',
    cwd: os.tmpdir(),
  });
  return { code: r.status ?? 1, out: (r.stdout || '') + (r.stderr || '') };
}

function writeFixture(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-academy-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

describe('parseSlugs', () => {
  test('extracts the course slug from a typical Skilljar anchor', () => {
    const html = '<a href="https://anthropic.skilljar.com/claude-101" title="Claude 101">Claude 101</a>';
    expect(parseSlugs(html)).toEqual(['claude-101']);
  });

  test('deduplicates repeated anchors (catalog renders the same slug in both nav and grid)', () => {
    const html = `
      <a href="https://anthropic.skilljar.com/claude-101">Top</a>
      <a href="https://anthropic.skilljar.com/claude-101" title="x">Tile</a>
    `;
    expect(parseSlugs(html)).toEqual(['claude-101']);
  });

  test('returns slugs sorted (stable diff output across runs)', () => {
    const html = `
      <a href="https://anthropic.skilljar.com/zeta">Z</a>
      <a href="https://anthropic.skilljar.com/alpha">A</a>
      <a href="https://anthropic.skilljar.com/middle">M</a>
    `;
    expect(parseSlugs(html)).toEqual(['alpha', 'middle', 'zeta']);
  });

  test('strips trailing slash variants (canonical form only)', () => {
    const html = `
      <a href="https://anthropic.skilljar.com/claude-code-101/">A</a>
      <a href="https://anthropic.skilljar.com/claude-code-101">B</a>
    `;
    expect(parseSlugs(html)).toEqual(['claude-code-101']);
  });

  test('rejects multi-segment paths (platform routes, not course slugs)', () => {
    const html = `
      <a href="https://anthropic.skilljar.com/auth/login?next=%2F">Sign In</a>
      <a href="https://anthropic.skilljar.com/static/skilljar-monorepo/...">asset</a>
    `;
    expect(parseSlugs(html)).toEqual([]);
  });

  test('rejects bare-host and fragment-only hrefs (Back / anchor)', () => {
    const html = `
      <a href="https://anthropic.skilljar.com/">Home</a>
      <a href="https://anthropic.skilljar.com/#top">Top</a>
    `;
    expect(parseSlugs(html)).toEqual([]);
  });

  test('rejects known non-course slugs (login, dashboard, settings, …)', () => {
    const html = `
      <a href="https://anthropic.skilljar.com/auth">a</a>
      <a href="https://anthropic.skilljar.com/dashboard">b</a>
      <a href="https://anthropic.skilljar.com/settings">c</a>
      <a href="https://anthropic.skilljar.com/paths">d</a>
      <a href="https://anthropic.skilljar.com/claude-101">e</a>
    `;
    expect(parseSlugs(html)).toEqual(['claude-101']);
  });

  test('NON_COURSE_SLUGS covers the bare-platform routes we have actually seen', () => {
    // Regression guard: if Skilljar adds a new platform route (e.g. /catalog)
    // and someone wires it into NON_COURSE_SLUGS, this test reminds them
    // that the canonical platform-route list lives in one place.
    expect(NON_COURSE_SLUGS.has('auth')).toBe(true);
    expect(NON_COURSE_SLUGS.has('dashboard')).toBe(true);
    expect(NON_COURSE_SLUGS.has('paths')).toBe(true);
  });

  test('extracts slugs from a representative chunk of the real catalog page', () => {
    // Snippet captured from the live anthropic.skilljar.com response.
    // Trimmed to 4 anchors so the test doesn't rot if Skilljar reorders
    // their grid; the catalog-drift workflow itself runs against the
    // live URL so the full-list assertion lives there.
    const html = `
      <a href="https://anthropic.skilljar.com/claude-101" title="Claude 101">…</a>
      <a href="https://anthropic.skilljar.com/claude-code-101" title="Claude Code 101">…</a>
      <a href="https://anthropic.skilljar.com/ai-fluency-for-small-businesses" title="AI Fluency for Small Businesses">…</a>
      <a href="https://anthropic.skilljar.com/auth/login?next=%2F">Sign In</a>
    `;
    expect(parseSlugs(html)).toEqual(['ai-fluency-for-small-businesses', 'claude-code-101', 'claude-101'].sort());
  });
});

describe('CLI behavior (against fixtures)', () => {
  let htmlAllKnown;
  let htmlOneUnknown;
  let constantsFile;

  beforeAll(() => {
    htmlAllKnown = writeFixture('catalog-all-known.html', '<a href="https://anthropic.skilljar.com/claude-101">X</a>');
    htmlOneUnknown = writeFixture(
      'catalog-one-unknown.html',
      `<a href="https://anthropic.skilljar.com/claude-101">X</a>
       <a href="https://anthropic.skilljar.com/totally-new-course">Y</a>`,
    );
    constantsFile = writeFixture('fake-constants.js', "const FLASHCARD_COURSE_MAP = { 'claude-101': ['claude101'] };");
  });

  test('exits 0 when every live slug is known', () => {
    const res = run({
      SB_CATALOG_HTML_FIXTURE: htmlAllKnown,
      SB_CONSTANTS_FIXTURE: constantsFile,
    });
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/All live courses are wired/);
  });

  test('exits 1 and prints the unknown slug when a course is missing from the map', () => {
    const res = run({
      SB_CATALOG_HTML_FIXTURE: htmlOneUnknown,
      SB_CONSTANTS_FIXTURE: constantsFile,
    });
    expect(res.code).toBe(1);
    expect(res.out).toMatch(/totally-new-course/);
    expect(res.out).toMatch(/\[NEW\]/);
  });

  test('CI=true writes the report file with the new slug', () => {
    // Use a temp cwd so the report file lands in a known location.
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-academy-report-'));
    const r = spawnSync(process.execPath, [SCRIPT], {
      env: {
        ...process.env,
        CI: 'true',
        SB_CATALOG_HTML_FIXTURE: htmlOneUnknown,
        SB_CONSTANTS_FIXTURE: constantsFile,
      },
      cwd,
      encoding: 'utf8',
    });
    expect(r.status).toBe(1);
    const report = fs.readFileSync(path.join(cwd, 'academy-courses-report.txt'), 'utf8');
    expect(report).toMatch(/totally-new-course/);
    expect(report).toMatch(/48h terminology SLA/);
  });
});
