#!/usr/bin/env node
/**
 * SkillBridge — Skilljar curriculum snapshot capture.
 *
 * Captures the FULL curriculum of every public course on a Skilljar tenant
 * (default: anthropic.skilljar.com) into a committed JSON snapshot:
 * course → sections → units, with each unit's numeric lesson id, kind,
 * title, order, and URL.
 *
 * WHY THIS EXISTS: stored user data (sb_notes / sb_bookmarks / sb_recent) is
 * keyed by exact lesson URLs, whose shape here is /course-slug/<numericId>.
 * Moving that data onto a stable lesson identity needs the numericId ↔
 * title/section/order mapping, which only the live curriculum provides.
 *
 * The snapshot records OBSERVATIONS only — no canonical ids, no SkillBridge
 * policy. Identity mapping is a separate layer's job.
 *
 * Provenance per course: the exact fetched URL, fetch timestamp, and a
 * sha256 fingerprint of the raw HTML, so a later parser-bug discovery can
 * be traced to its source bytes (pair with the committed HTML fixture for
 * parser regressions).
 *
 * Usage:
 *   node scripts/capture-skilljar-snapshot.js [--tenant https://anthropic.skilljar.com] \
 *     [--out snapshots/skilljar/<host>-<date>.json] [--sources <dir>]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseSlugs, NON_COURSE_SLUGS } = require('./check-academy-courses');

const args = process.argv.slice(2);
function argVal(name, dflt) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : dflt;
}

const TENANT = argVal('--tenant', 'https://anthropic.skilljar.com').replace(/\/+$/, '');
const HOST = new URL(TENANT).host;
const DATE = new Date().toISOString().slice(0, 10);
const OUT = argVal('--out', path.join('snapshots', 'skilljar', `${HOST}-${DATE}.json`));
const SOURCES_DIR = argVal('--sources', path.join('snapshots', 'skilljar', 'sources'));
const UA = 'SkillBridge-SnapshotCapture/1.0 (+https://github.com/heznpc/skillbridge)';

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

async function fetchText(url) {
  const resp = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, redirect: 'follow' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
  return resp.text();
}

/**
 * Course slugs from the catalog page.
 *
 * Delegates to check-academy-courses.js's parseSlugs so the two things that
 * observe this same catalog cannot drift apart — v1 claimed "same accept/
 * reject rules" in a comment while quietly using a different set, which is
 * how `privacy` reached the snapshot as a course. Absolute links must also
 * point at the tenant being captured; another *.skilljar.com host's slug is
 * not ours to fetch.
 *
 * @param {string} html
 * @param {string} [tenantHost]
 * @returns {string[]}
 */
function parseCatalogSlugs(html, tenantHost) {
  const slugs = parseSlugs(html).filter((slug) => !NON_COURSE_SLUGS.has(slug));
  if (!tenantHost) return slugs;
  const foreign = new Set();
  const re = /href\s*=\s*["'](?:https?:)?\/\/([a-z0-9.-]*skilljar\.com)\/([^"'\s#?/]+)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1].toLowerCase() !== tenantHost.toLowerCase()) foreign.add(m[2].replace(/\/+$/, ''));
  }
  return slugs.filter((slug) => !foreign.has(slug));
}

/**
 * Catalog slugs that are first-party routes rather than courses. Anything
 * OUTSIDE this set that fails to parse is a capture FAILURE, not a note in
 * `errors` — see main().
 */
const EXPECTED_NON_COURSE = new Set([
  'certification-faq',
  'claude-certified-architect-foundations-certification',
  'privacy',
]);

/**
 * Return the inner HTML of the first element matched by `openPattern`,
 * honouring nesting of `tag`.
 *
 * A non-greedy `([\s\S]*?)</ul>` is wrong here: Skilljar renders section
 * tooltips containing their own <ul>, so the naive match stops at the nested
 * close tag and silently truncates the curriculum. `claude-in-amazon-bedrock`
 * parsed to zero units that way — a silent partial parse, which is the worst
 * possible failure for a snapshot meant to outlive its source.
 *
 * @param {string} html
 * @param {RegExp} openPattern — matches the opening tag
 * @param {string} tag — bare tag name, e.g. 'ul'
 * @returns {string|null} inner HTML, or null when the open tag is absent
 */
function extractBalanced(html, openPattern, tag) {
  const open = html.match(openPattern);
  if (!open) return null;
  const start = (open.index || 0) + open[0].length;
  const scan = new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, 'gi');
  scan.lastIndex = start;
  let depth = 1;
  let m;
  while ((m = scan.exec(html)) !== null) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index);
  }
  // Opening tag found but never closed: truncated transfer, or the markup
  // changed shape. Returning the tail would look like a valid (merely
  // shorter) curriculum and could be written to the snapshot as one.
  throw new Error(`unbalanced <${tag}>: opening tag at ${open.index} is never closed`);
}

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/**
 * Decode HTML entities in ONE pass.
 *
 * Chained `.replace()` calls have two failure modes and v1 shipped both:
 * decoding `&amp;` before the rest double-unescapes (`&amp;lt;` -> `&lt;` ->
 * `<`), and any entity without its own `.replace()` survives into the data.
 * Skilljar writes apostrophes as `&#x27;`, which the hand-listed set missed —
 * eight committed titles kept the raw entity, which would have made
 * normalized-title matching fail against Academy for no real reason.
 *
 * One regex pass cannot double-unescape (output is never rescanned) and
 * covers decimal and hex numerics by construction.
 *
 * @param {string} str
 * @returns {string}
 */
function decodeEntities(str) {
  return str.replace(/&(?:#[xX]([0-9a-fA-F]+)|#(\d+)|([a-zA-Z]+));/g, (whole, hex, dec, name) => {
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    if (dec) return String.fromCodePoint(parseInt(dec, 10));
    const named = NAMED_ENTITIES[name.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

const textOf = (s) =>
  decodeEntities(s.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Reduce a fetched page to the bytes the parser regression tests need.
 *
 * The fixture exists so the parser stays verifiable after the source site is
 * gone — it does not need the vendor <script>/<style> payload, which is ~95%
 * of the page and is third-party code that static analysis would (fairly)
 * scrutinise as if it were ours. `sourceFingerprint` in the snapshot still
 * refers to the FULL fetched bytes; this file is the regression artifact,
 * not the archival copy.
 */
function reduceFixture(html) {
  const head = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/);
  const list = html.match(/<ul[^>]*class="[^"]*dp-curriculum[^"]*"[^>]*>/);
  const body = list ? html.slice(list.index) : html;
  const curriculum = extractBalanced(body, /<ul[^>]*class="[^"]*dp-curriculum[^"]*"[^>]*>/, 'ul');
  return [
    '<!-- Reduced parser-regression fixture: curriculum markup only.',
    '     Vendor script and style blocks removed; see reduceFixture() for why. -->',
    head ? head[0] : '',
    list && curriculum !== null ? `${list[0]}${curriculum}</ul>` : '',
    '',
  ].join('\n');
}

/**
 * The label of a curriculum <li>: its DIRECT text, excluding descendants.
 *
 * `textOf(inner)` on the whole element is wrong for sections. Skilljar
 * renders a tooltip body as a CHILD of the section item, so v1 stored
 * "Agents This module explores how to build AI agents using Claude's
 * capabilities. You'll see real-world..." as a section title — ten sections
 * across the snapshot were polluted this way. The visible label is the text
 * that sits directly inside the element, before any child element opens.
 *
 * @param {string} inner — inner HTML of the <li>
 * @returns {string}
 */
function directLabel(inner) {
  const chunks = [];
  let depth = 0;
  let last = 0;
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)[^>]*?(\/?)>/g;
  let m;
  while ((m = tagRe.exec(inner)) !== null) {
    if (depth === 0) chunks.push(inner.slice(last, m.index));
    const selfClosing = m[3] === '/' || /^(br|img|input|hr|meta|link|source)$/i.test(m[2]);
    if (!selfClosing) depth += m[1] === '/' ? -1 : 1;
    if (depth < 0) depth = 0;
    last = tagRe.lastIndex;
  }
  if (depth === 0) chunks.push(inner.slice(last));
  const direct = decodeEntities(chunks.join(' ')).replace(/\s+/g, ' ').trim();
  // Fall back to the full text only when there is no direct text at all —
  // an all-markup label is better than an empty one.
  return direct || textOf(inner);
}

/**
 * Parse a Skilljar course page's dp-curriculum list.
 *
 * Markup shape (verified live 2026-08-22):
 *   <ul class="dp-curriculum">
 *     <li class="section ">Section title</li>
 *     <li class=" lesson-video" data-url="/course-slug/287722">
 *       ... <div class="lesson-wrapper"><div>Lesson title <span .../></div></div>
 *     </li>
 *   </ul>
 *
 * Returns { title, sections: [{ title, units: [{order, kind, numericId, path, title}] }] }.
 * Throws when the curriculum list cannot be found — a silent empty snapshot
 * is worse than a loud failure.
 */
function parseCoursePage(html, slug) {
  // No <style>/<script> pre-strip: every pattern below anchors on a real
  // opening tag (`<ul class="`, `<h1`), which a CSS selector such as
  // `ul.dp-curriculum { ... }` cannot produce. A regex strip would be an
  // incomplete sanitizer pretending to be one; not stripping is both simpler
  // and honest about what this is — a parser, not a sanitizer.
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || html.match(/<title>([\s\S]*?)<\/title>/);
  const courseTitle = titleMatch ? textOf(titleMatch[1]) : slug;

  const list = extractBalanced(html, /<ul[^>]*class="[^"]*dp-curriculum[^"]*"[^>]*>/, 'ul');
  if (list === null) throw new Error(`no dp-curriculum list found for ${slug}`);

  const sections = [];
  let current = { title: '(no section)', units: [] };
  let order = 0;
  const openRe = /<li[^>]*class="([^"]*)"([^>]*)>/g;
  let m;
  while ((m = openRe.exec(list)) !== null) {
    const cls = m[1];
    const attrs = m[2];
    const inner = extractBalanced(list.slice(m.index), /^<li[^>]*>/, 'li');
    if (inner === null) continue;
    if (/\bsection\b/.test(cls)) {
      if (current.units.length) sections.push(current);
      current = { title: directLabel(inner), units: [] };
      continue;
    }
    const kindMatch = cls.match(/lesson-([a-z]+)/);
    if (!kindMatch) continue;
    const urlMatch = attrs.match(/data-url="([^"]+)"/) || inner.match(/data-url="([^"]+)"/);
    const p = urlMatch ? urlMatch[1] : null;
    const idMatch = p && p.match(/\/(\d+)(?:\/)?$/);
    order += 1;
    current.units.push({
      order,
      kind: kindMatch[1],
      numericId: idMatch ? idMatch[1] : null,
      path: p,
      title: textOf(inner),
    });
  }
  if (current.units.length) sections.push(current);
  if (!sections.length) throw new Error(`dp-curriculum parsed to zero units for ${slug}`);
  return { title: courseTitle, sections };
}

async function main() {
  const catalogUrl = `${TENANT}/`;
  const catalogHtml = await fetchText(catalogUrl);
  const slugs = parseCatalogSlugs(catalogHtml, HOST);
  if (!slugs.length) throw new Error('catalog parsed to zero course slugs — refusing to write an empty snapshot');
  console.log(`catalog: ${slugs.length} course slugs on ${HOST}`);

  const failures = [];
  const snapshot = {
    schemaVersion: 2,
    platform: 'skilljar',
    tenant: TENANT,
    fetchedAt: new Date().toISOString(),
    catalog: { sourceUrl: catalogUrl, sourceFingerprint: sha256(catalogHtml), courseSlugs: slugs },
    courses: [],
    errors: [],
  };

  for (const slug of slugs) {
    const url = `${TENANT}/${slug}`;
    try {
      const html = await fetchText(url);
      const parsed = parseCoursePage(html, slug);
      const unitCount = parsed.sections.reduce((n, s) => n + s.units.length, 0);
      snapshot.courses.push({
        slug,
        sourcePath: path.join(SOURCES_DIR, `${slug}.html`),
        title: parsed.title,
        sourceUrl: url,
        fetchedAt: new Date().toISOString(),
        sourceFingerprint: sha256(html),
        unitCount,
        sections: parsed.sections,
      });
      console.log(`  ${slug}: ${parsed.sections.length} sections / ${unitCount} units`);
      // Preserve the reduced curriculum markup for EVERY course, not just one.
      // A sha256 cannot be re-parsed: if a parser bug is found after Skilljar
      // is gone, the fingerprint proves what we fetched but cannot give it
      // back. These files are the archive; the fingerprint is its checksum.
      const sourcePath = path.join(SOURCES_DIR, `${slug}.html`);
      fs.mkdirSync(SOURCES_DIR, { recursive: true });
      fs.writeFileSync(sourcePath, reduceFixture(html));
    } catch (err) {
      // Only slugs KNOWN to be non-course routes may be recorded and skipped.
      // Anything else — a parser regression, a 500, a rate limit — means this
      // capture does not contain what it claims to, and the whole point is to
      // be the archival copy of a site that may not be here later. v1 pushed
      // every failure into `errors` and still exited 0, so a real course
      // could have gone missing from a "successful" snapshot.
      const expected = EXPECTED_NON_COURSE.has(slug);
      snapshot.errors.push({ slug, url, error: String(err.message || err), expected });
      if (expected) {
        console.warn(`  ${slug}: skipped (known non-course) — ${err.message}`);
      } else {
        console.error(`  ${slug}: FAILED — ${err.message}`);
        failures.push(slug);
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  if (failures.length) {
    throw new Error(
      `${failures.length} course(s) failed to capture: ${failures.join(', ')}. ` +
        'Refusing to write a snapshot that silently omits them. Add a genuinely ' +
        'non-course slug to EXPECTED_NON_COURSE, or fix the parser.',
    );
  }
  if (!snapshot.courses.length) throw new Error('zero courses captured — refusing to write');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`);
  const total = snapshot.courses.reduce((n, c) => n + c.unitCount, 0);
  console.log(
    `\nwrote ${OUT}: ${snapshot.courses.length} courses, ${total} units, ${snapshot.errors.length} skipped slugs`,
  );
}

module.exports = {
  parseCatalogSlugs,
  parseCoursePage,
  decodeEntities,
  directLabel,
  reduceFixture,
  EXPECTED_NON_COURSE,
};

if (require.main === module) {
  main().catch((err) => {
    console.error(`capture failed: ${err.message}`);
    process.exit(1);
  });
}
