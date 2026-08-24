/**
 * Parser regression tests for scripts/capture-skilljar-snapshot.js.
 *
 * These run against the committed HTML fixture rather than the live site:
 * the whole point of the snapshot is to outlive anthropic.skilljar.com, so
 * its parser has to stay verifiable after the source is gone.
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');
const { parseCatalogSlugs, parseCoursePage } = require('../scripts/capture-skilljar-snapshot');

const FIXTURE = path.join(__dirname, '..', 'snapshots', 'skilljar', 'fixture-claude-with-the-anthropic-api.html');
const html = fs.readFileSync(FIXTURE, 'utf8');

describe('parseCoursePage', () => {
  const parsed = parseCoursePage(html, 'claude-with-the-anthropic-api');
  const units = parsed.sections.flatMap((s) => s.units);

  test('recovers every section and unit', () => {
    expect(parsed.sections.length).toBe(13);
    expect(units.length).toBe(85);
  });

  test('every unit carries the numeric lesson id the stored URLs are keyed by', () => {
    // sb_notes / sb_bookmarks / sb_recent store `location.href`, and a Skilljar
    // lesson URL is /course-slug/<numericId>. A unit without an id is a unit a
    // future migration cannot match, so this is the load-bearing assertion.
    expect(units.every((u) => /^\d+$/.test(u.numericId || ''))).toBe(true);
    expect(units.every((u) => u.path && u.path.startsWith('/claude-with-the-anthropic-api/'))).toBe(true);
  });

  test('order is a dense 1..N sequence across sections', () => {
    expect(units.map((u) => u.order)).toEqual(units.map((_, i) => i + 1));
  });

  test('reads section titles and unit titles, not markup', () => {
    expect(parsed.sections[0].title).toBe('Introduction');
    expect(units[0]).toMatchObject({ order: 1, title: 'Welcome to the course', kind: 'modular' });
    expect(units.some((u) => u.kind === 'quiz')).toBe(true);
    expect(units.every((u) => !/[<>]/.test(u.title))).toBe(true);
  });

  test('a nested <ul> inside a section tooltip does not truncate the list', () => {
    // Regression: a non-greedy `</ul>` match stopped at a tooltip's own nested
    // list, and claude-in-amazon-bedrock silently parsed to ZERO units — a
    // partial parse that would have been baked into the snapshot unnoticed.
    const tooltip = '<li class="section tooltips">S<div><ul><li>a</li><li>b</li></ul></div></li>';
    const synthetic = `<ul class="dp-curriculum">${tooltip}<li class=" lesson-video" data-url="/c/123"><div>T</div></li></ul>`;
    const out = parseCoursePage(`<h1>C</h1>${synthetic}`, 'c');
    expect(out.sections.flatMap((s) => s.units)).toHaveLength(1);
    expect(out.sections[0].title).toContain('S');
  });

  test('throws instead of returning an empty curriculum', () => {
    expect(() => parseCoursePage('<h1>x</h1><p>no list</p>', 'x')).toThrow(/no dp-curriculum/);
    expect(() => parseCoursePage('<h1>x</h1><ul class="dp-curriculum"></ul>', 'x')).toThrow(/zero units/);
  });
});

describe('parseCatalogSlugs', () => {
  test('keeps course slugs and drops platform routes', () => {
    const slugs = parseCatalogSlugs(
      [
        '<a href="/claude-101">',
        '<a href="https://anthropic.skilljar.com/claude-code-101">',
        '<a href="/auth/login?next=/x">',
        '<a href="/page/terms">',
        '<a href="/checkout">',
      ].join(''),
    );
    expect(slugs).toEqual(['claude-101', 'claude-code-101']);
  });
});

describe('entity decoding', () => {
  test('&amp; is decoded last, so encoded markup cannot double-unescape into a title', () => {
    // `&amp;lt;script&amp;gt;` is the literal text "&lt;script&gt;". Decoding
    // &amp; first would turn it into "<script>" — one round of double
    // unescaping, putting markup back into a value we treat as plain text.
    const out = parseCoursePage(
      '<h1>C</h1><ul class="dp-curriculum"><li class=" lesson-video" data-url="/c/1"><div>&amp;lt;script&amp;gt; &amp; Q&amp;A</div></li></ul>',
      'c',
    );
    const title = out.sections[0].units[0].title;
    expect(title).toBe('&lt;script&gt; & Q&A');
    expect(title).not.toContain('<script>');
  });
});

describe('reduceFixture (committed regression artifact)', () => {
  test('the committed fixture carries no vendor script or style payload', () => {
    expect(/<script|<style/i.test(html)).toBe(false);
  });

  test('and still parses to the same curriculum as the full page', () => {
    const parsed = parseCoursePage(html, 'claude-with-the-anthropic-api');
    expect(parsed.sections.flatMap((s) => s.units)).toHaveLength(85);
    expect(parsed.title).toBe('Building with the Claude API');
  });
});
