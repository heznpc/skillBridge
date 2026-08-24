/**
 * Parser regression tests for scripts/capture-skilljar-snapshot.js.
 *
 * These run against the committed reduced sources, never the live site: the
 * whole point of the snapshot is to outlive anthropic.skilljar.com, so its
 * parser has to stay verifiable after the source is gone.
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');
const {
  parseCatalogSlugs,
  parseCoursePage,
  decodeEntities,
  directLabel,
  reduceFixture,
  EXPECTED_NON_COURSE,
} = require('../scripts/capture-skilljar-snapshot');

const SNAP_DIR = path.join(__dirname, '..', 'snapshots', 'skilljar');
const SOURCES = path.join(SNAP_DIR, 'sources');
const snapshotFile = fs.readdirSync(SNAP_DIR).find((f) => f.endsWith('.json'));
const snapshot = JSON.parse(fs.readFileSync(path.join(SNAP_DIR, snapshotFile), 'utf8'));
const apiHtml = fs.readFileSync(path.join(SOURCES, 'claude-with-the-anthropic-api.html'), 'utf8');
const bedrockHtml = fs.readFileSync(path.join(SOURCES, 'claude-in-amazon-bedrock.html'), 'utf8');

describe('parseCoursePage', () => {
  const parsed = parseCoursePage(apiHtml, 'claude-with-the-anthropic-api');
  const units = parsed.sections.flatMap((s) => s.units);

  test('recovers every section and unit', () => {
    expect(parsed.sections).toHaveLength(13);
    expect(units).toHaveLength(85);
    expect(parsed.title).toBe('Building with the Claude API');
  });

  test('every unit carries the numeric lesson id the stored URLs are keyed by', () => {
    // sb_notes / sb_bookmarks / sb_recent store `location.href`, and a Skilljar
    // lesson URL is /course-slug/<numericId>. A unit without an id is a unit a
    // future migration cannot match, so this is the load-bearing assertion.
    expect(units.every((u) => /^\d+$/.test(u.numericId || ''))).toBe(true);
    expect(units.every((u) => u.path.startsWith('/claude-with-the-anthropic-api/'))).toBe(true);
  });

  test('order is a dense 1..N sequence across sections', () => {
    expect(units.map((u) => u.order)).toEqual(units.map((_, i) => i + 1));
  });

  test('reads titles, not markup', () => {
    expect(parsed.sections[0].title).toBe('Introduction');
    expect(units[0]).toMatchObject({ order: 1, title: 'Welcome to the course', kind: 'modular' });
    expect(units.some((u) => u.kind === 'quiz')).toBe(true);
    expect(units.every((u) => !/[<>]/.test(u.title))).toBe(true);
  });

  test('a nested <ul> inside a section tooltip does not truncate the list', () => {
    // Regression: a non-greedy `</ul>` match stopped at a tooltip's own nested
    // list, and claude-in-amazon-bedrock silently parsed to ZERO units.
    const bedrock = parseCoursePage(bedrockHtml, 'claude-in-amazon-bedrock');
    expect(bedrock.sections.flatMap((s) => s.units)).toHaveLength(83);
  });

  test('a section label is its own text, not its tooltip body', () => {
    // Regression: `textOf(inner)` swallowed the tooltip child, so ten sections
    // were stored as "Agents This module explores how to build AI agents...".
    const bedrock = parseCoursePage(bedrockHtml, 'claude-in-amazon-bedrock');
    expect(bedrock.sections.map((s) => s.title)).toEqual([
      'Course introduction',
      'Working with the API',
      'Prompt evaluations',
      'Prompt engineering',
      'Tool use',
      'Retrieval Augmented Generation',
      'Features of Claude',
      'Model Context Protocol',
      'Agents',
      'Final assessment',
      'Wrap up',
    ]);
  });

  test('throws instead of returning an empty curriculum', () => {
    expect(() => parseCoursePage('<h1>x</h1><p>no list</p>', 'x')).toThrow(/no dp-curriculum/);
    expect(() => parseCoursePage('<h1>x</h1><ul class="dp-curriculum"></ul>', 'x')).toThrow(/zero units/);
  });

  test('throws on an unclosed curriculum list rather than accepting the tail', () => {
    // A truncated transfer must not look like a valid, merely shorter course.
    const truncated = '<h1>C</h1><ul class="dp-curriculum"><li class=" lesson-video" data-url="/c/1"><div>T</div></li>';
    expect(() => parseCoursePage(truncated, 'c')).toThrow(/unbalanced <ul>/);
  });
});

describe('directLabel', () => {
  test('takes direct text and drops descendant content', () => {
    expect(directLabel('S<div><ul><li>a</li><li>b</li></ul></div>')).toBe('S');
    expect(directLabel('Agents<div class="tooltips-content"><p>Long body text.</p></div>')).toBe('Agents');
  });

  test('keeps text that follows a child element', () => {
    expect(directLabel('<span class="icon"></span>Title')).toBe('Title');
  });

  test('falls back to full text when there is no direct text at all', () => {
    expect(directLabel('<span>Only child text</span>')).toBe('Only child text');
  });

  test('a self-closing or void child does not swallow the rest of the label', () => {
    expect(directLabel('Before<br/>After')).toBe('Before After');
    expect(directLabel('A<img src="x">B')).toBe('A B');
  });
});

describe('decodeEntities', () => {
  test('decodes named, decimal, and hex entities in one pass', () => {
    // &#x27; is what Skilljar actually writes; the hand-listed v1 set missed
    // it and eight committed titles kept the raw entity.
    expect(decodeEntities('What&#x27;s next?')).toBe("What's next?");
    expect(decodeEntities('Q&#38;A')).toBe('Q&A');
    expect(decodeEntities('Delegation &amp; the builder&#x27;s toolkit')).toBe("Delegation & the builder's toolkit");
  });

  test('never double-unescapes', () => {
    // Literal text "&lt;script&gt;" must survive as text.
    expect(decodeEntities('&amp;lt;script&amp;gt;')).toBe('&lt;script&gt;');
  });

  test('leaves unknown entities alone rather than mangling them', () => {
    expect(decodeEntities('&notanentity;')).toBe('&notanentity;');
  });
});

describe('parseCatalogSlugs', () => {
  test('keeps course slugs and drops platform routes', () => {
    const slugs = parseCatalogSlugs(
      [
        '<a href="/claude-101">',
        '<a href="https://anthropic.skilljar.com/claude-code-101">',
        '<a href="/auth/login?next=/x">',
        '<a href="/privacy">',
      ].join(''),
      'anthropic.skilljar.com',
    );
    expect(slugs).toEqual(['claude-101', 'claude-code-101']);
  });

  test('rejects a slug that only appears on another skilljar tenant', () => {
    const slugs = parseCatalogSlugs(
      '<a href="/claude-101"><a href="https://anthropic-partners.skilljar.com/partner-only">',
      'anthropic.skilljar.com',
    );
    expect(slugs).toEqual(['claude-101']);
  });
});

describe('reduceFixture', () => {
  test('drops vendor payload and still parses identically', () => {
    const full = `<html><head><style>ul.dp-curriculum{}</style><script>x=1</script></head><body><h1>C</h1><ul class="dp-curriculum"><li class="section ">S</li><li class=" lesson-video" data-url="/c/9"><div>T</div></li></ul></body></html>`;
    const reduced = reduceFixture(full);
    expect(/<script|<style/i.test(reduced)).toBe(false);
    expect(parseCoursePage(reduced, 'c')).toEqual(parseCoursePage(full, 'c'));
  });
});

describe('committed snapshot integrity', () => {
  test('every course has its reduced source archived alongside the JSON', () => {
    // A sha256 proves what was fetched but cannot be re-parsed. If a parser
    // bug surfaces after Skilljar is gone, these files are what save it.
    for (const course of snapshot.courses) {
      expect(fs.existsSync(path.join(SNAP_DIR, '..', '..', course.sourcePath))).toBe(true);
    }
    expect(fs.readdirSync(SOURCES)).toHaveLength(snapshot.courses.length);
  });

  test('no archived source carries vendor script or style payload', () => {
    for (const f of fs.readdirSync(SOURCES)) {
      expect(/<script|<style/i.test(fs.readFileSync(path.join(SOURCES, f), 'utf8'))).toBe(false);
    }
  });

  test('every unit has the numeric id a migration matcher needs', () => {
    const units = snapshot.courses.flatMap((c) => c.sections.flatMap((s) => s.units));
    expect(units).toHaveLength(453);
    expect(units.filter((u) => /^\d+$/.test(u.numericId || ''))).toHaveLength(453);
  });

  test('no title kept an undecoded HTML entity', () => {
    const titles = snapshot.courses.flatMap((c) => [
      c.title,
      ...c.sections.flatMap((s) => [s.title, ...s.units.map((u) => u.title)]),
    ]);
    expect(titles.filter((t) => /&#?\w+;/.test(t))).toEqual([]);
  });

  test('no section title absorbed a tooltip body', () => {
    const sections = snapshot.courses.flatMap((c) => c.sections);
    expect(sections.filter((s) => s.title.length > 60)).toEqual([]);
  });

  test('every recorded error is a known non-course route', () => {
    for (const err of snapshot.errors) {
      expect(err.expected).toBe(true);
      expect(EXPECTED_NON_COURSE.has(err.slug)).toBe(true);
    }
  });

  test('re-parsing the archived sources reproduces the snapshot exactly', () => {
    // The strongest guarantee this file can offer: the committed JSON is
    // derivable from the committed HTML, so a future parser fix can be
    // validated end-to-end without the live site.
    for (const course of snapshot.courses) {
      const html = fs.readFileSync(path.join(SOURCES, `${course.slug}.html`), 'utf8');
      const reparsed = parseCoursePage(html, course.slug);
      expect(reparsed.sections).toEqual(course.sections);
      expect(reparsed.title).toBe(course.title);
    }
  });
});
