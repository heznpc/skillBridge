/**
 * Parser regression tests for scripts/capture-skilljar-snapshot.js.
 *
 * Every fixture here is SYNTHETIC and inline. An earlier version tested
 * against archived copies of the real pages, which conflated two jobs: the
 * archive was supposed to be forensic evidence of what a given capture saw,
 * while a regression fixture should be the smallest markup that encodes one
 * failure. Synthetic fixtures are the better test anyway — each one names the
 * bug it exists for — and they let a public repository stop republishing
 * someone else's markup. The real captures stay on disk, untracked.
 *
 * The committed snapshot JSON is still checked, but only for the properties
 * a migration depends on.
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

/** Build a curriculum page from `<li>` fragments. */
const page = (title, items) =>
  `<h1 class="break-word">${title}</h1>\n<ul class="dp-curriculum">\n${items.join('\n')}\n</ul>`;

const lesson = (slug, id, label, kind = 'modular') =>
  `<li class=" lesson-${kind}" data-url="/${slug}/${id}">` +
  `<div class="type-icon"><sjwc-icon name="icon-text"></sjwc-icon></div>` +
  `<div class="lesson-wrapper"><div>${label} <span class="sj-lesson-time"></span></div></div></li>`;

const section = (label, extra = '') => `<li class="section ">${label}${extra}</li>`;

/** A tooltip body, rendered by Skilljar as a CHILD of the section item. */
const tooltip = (text) => `<div class="tooltips-content"><p>${text}</p><ul><li>${text}</li></ul></div>`;

describe('parseCoursePage', () => {
  test('reads sections, units, ids, kinds and a dense global order', () => {
    const html = page('Course A', [
      section('Section Alpha'),
      lesson('course-a', '100001', 'Lesson One'),
      lesson('course-a', '100002', 'Lesson Two'),
      section('Section Beta'),
      lesson('course-a', '100003', 'Quiz on Alpha', 'quiz'),
    ]);
    const out = parseCoursePage(html, 'course-a');

    expect(out.title).toBe('Course A');
    expect(out.sections.map((s) => s.title)).toEqual(['Section Alpha', 'Section Beta']);

    const units = out.sections.flatMap((s) => s.units);
    // The numeric id is the load-bearing field: sb_notes / sb_bookmarks /
    // sb_recent store `location.href`, and a Skilljar lesson URL is
    // /course-slug/<numericId>. A unit without one cannot be matched later.
    expect(units.map((u) => u.numericId)).toEqual(['100001', '100002', '100003']);
    expect(units.map((u) => u.order)).toEqual([1, 2, 3]);
    expect(units.map((u) => u.kind)).toEqual(['modular', 'modular', 'quiz']);
    expect(units[0]).toMatchObject({ title: 'Lesson One', path: '/course-a/100001' });
    expect(units.every((u) => !/[<>]/.test(u.title))).toBe(true);
  });

  test('a nested <ul> in a section tooltip does not truncate the list', () => {
    // Regression: a non-greedy `</ul>` match stopped at the tooltip's own
    // nested list, and one real course silently parsed to ZERO units.
    const html = page('Course B', [
      section('Section Alpha', tooltip('This module explains things.')),
      lesson('course-b', '200001', 'After The Tooltip'),
    ]);
    const out = parseCoursePage(html, 'course-b');
    expect(out.sections.flatMap((s) => s.units)).toHaveLength(1);
    expect(out.sections[0].units[0].title).toBe('After The Tooltip');
  });

  test('a section label is its own text, not its tooltip body', () => {
    // Regression: taking all descendant text stored section titles like
    // "Agents This module explores how to build AI agents...".
    const html = page('Course C', [
      section('Agents', tooltip('This module explores how to build agents.')),
      lesson('course-c', '300001', 'Lesson'),
    ]);
    expect(parseCoursePage(html, 'course-c').sections[0].title).toBe('Agents');
  });

  test('titles come back with entities decoded', () => {
    const html = page('Course D', [
      section('What&#x27;s next?'),
      lesson('course-d', '400001', 'Delegation &amp; the builder&#x27;s toolkit'),
    ]);
    const out = parseCoursePage(html, 'course-d');
    expect(out.sections[0].title).toBe("What's next?");
    expect(out.sections[0].units[0].title).toBe("Delegation & the builder's toolkit");
  });

  test('throws instead of returning an empty curriculum', () => {
    expect(() => parseCoursePage('<h1>x</h1><p>no list</p>', 'x')).toThrow(/no dp-curriculum/);
    expect(() => parseCoursePage('<h1>x</h1><ul class="dp-curriculum"></ul>', 'x')).toThrow(/zero units/);
  });

  test('throws on an unclosed curriculum list rather than accepting the tail', () => {
    // A truncated transfer must not look like a valid, merely shorter course.
    const truncated = `<h1>C</h1><ul class="dp-curriculum">${lesson('c', '1', 'T')}`;
    expect(() => parseCoursePage(truncated, 'c')).toThrow(/unbalanced <ul>/);
  });
});

describe('directLabel', () => {
  test('takes direct text and drops descendant content', () => {
    expect(directLabel('S<div><ul><li>a</li><li>b</li></ul></div>')).toBe('S');
    expect(directLabel(`Agents${tooltip('Long body text.')}`)).toBe('Agents');
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
    // &#x27; is what Skilljar writes; a hand-listed set missed it and eight
    // titles kept the raw entity, which would break title matching later.
    expect(decodeEntities('What&#x27;s next?')).toBe("What's next?");
    expect(decodeEntities('Q&#38;A')).toBe('Q&A');
    expect(decodeEntities('Delegation &amp; the builder&#x27;s toolkit')).toBe("Delegation & the builder's toolkit");
  });

  test('never double-unescapes', () => {
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
        '<a href="/course-a">',
        '<a href="https://anthropic.skilljar.com/course-b">',
        '<a href="/auth/login?next=/x">',
        '<a href="/privacy">',
      ].join(''),
      'anthropic.skilljar.com',
    );
    expect(slugs).toEqual(['course-a', 'course-b']);
  });

  test('rejects a slug that only appears on another tenant', () => {
    const slugs = parseCatalogSlugs(
      '<a href="/course-a"><a href="https://other-tenant.skilljar.com/partner-only">',
      'anthropic.skilljar.com',
    );
    expect(slugs).toEqual(['course-a']);
  });
});

describe('reduceFixture', () => {
  test('drops vendor payload and still parses identically', () => {
    const full =
      `<html><head><style>ul.dp-curriculum{}</style><script>x=1</script></head><body>` +
      page('Course E', [section('S'), lesson('course-e', '500001', 'T')]) +
      `</body></html>`;
    const reduced = reduceFixture(full);
    expect(/<script|<style/i.test(reduced)).toBe(false);
    expect(parseCoursePage(reduced, 'course-e')).toEqual(parseCoursePage(full, 'course-e'));
  });
});

describe('committed snapshot', () => {
  const dir = path.join(__dirname, '..', 'snapshots', 'skilljar');
  const file = fs.readdirSync(dir).find((f) => f.endsWith('.json'));
  const snapshot = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));

  test('publishes structure, not archived pages', () => {
    // This repository is public. The snapshot may carry what a migration
    // needs; it must not carry, or point at, a copy of the source pages.
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.html'))).toEqual([]);
    const asText = JSON.stringify(snapshot);
    expect(asText).not.toContain('sourcePath');
    expect(asText).not.toContain('Fingerprint');
    expect(asText).not.toContain('<');
  });

  test('every unit carries the numeric id a migration matcher needs', () => {
    const units = snapshot.courses.flatMap((c) => c.sections.flatMap((s) => s.units));
    expect(units.length).toBeGreaterThan(0);
    expect(units.filter((u) => /^\d+$/.test(u.numericId || ''))).toHaveLength(units.length);
    expect(units.filter((u) => u.title && u.kind && Number.isInteger(u.order))).toHaveLength(units.length);
  });

  test('no title kept an undecoded entity or a tooltip body', () => {
    const sections = snapshot.courses.flatMap((c) => c.sections);
    const titles = snapshot.courses.flatMap((c) => [
      c.title,
      ...c.sections.flatMap((s) => [s.title, ...s.units.map((u) => u.title)]),
    ]);
    expect(titles.filter((t) => /&#?\w+;/.test(t))).toEqual([]);
    expect(sections.filter((s) => s.title.length > 60)).toEqual([]);
  });

  test('every recorded error is a known non-course route', () => {
    for (const err of snapshot.errors) {
      expect(err.expected).toBe(true);
      expect(EXPECTED_NON_COURSE.has(err.slug)).toBe(true);
    }
  });
});
