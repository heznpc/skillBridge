#!/usr/bin/env node
/**
 * SkillBridge — Skilljar curriculum snapshot capture.
 *
 * Captures the FULL curriculum of every public course on a Skilljar tenant
 * (default: anthropic.skilljar.com) into a committed JSON snapshot:
 * course → sections → units, with each unit's numeric lesson id, kind,
 * title, order, and URL.
 *
 * WHY THIS EXISTS (2026-08-22): Anthropic opened academy.claude.com and the
 * official FAQ marks Skilljar as a separate, legacy-leaning system. Stored
 * user data (sb_notes / sb_bookmarks / sb_recent) is keyed by exact Skilljar
 * lesson URLs, whose shape is /course-slug/<numericId>. Any future migration
 * to canonical lesson identity needs the numericId ↔ title/section/order
 * mapping — and Skilljar is the side that can disappear. This snapshot is
 * that insurance, captured while the site is still up.
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
 *     [--out snapshots/skilljar/<host>-<date>.json] [--fixture-course <slug>]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
function argVal(name, dflt) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : dflt;
}

const TENANT = argVal('--tenant', 'https://anthropic.skilljar.com').replace(/\/+$/, '');
const HOST = new URL(TENANT).host;
const DATE = new Date().toISOString().slice(0, 10);
const OUT = argVal('--out', path.join('snapshots', 'skilljar', `${HOST}-${DATE}.json`));
const FIXTURE_COURSE = argVal('--fixture-course', null);
const UA = 'SkillBridge-SnapshotCapture/1.0 (+https://github.com/heznpc/skillbridge)';

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

async function fetchText(url) {
  const resp = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, redirect: 'follow' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
  return resp.text();
}

/** Course slugs from the catalog page. Same accept/reject rules as
 * scripts/check-academy-courses.js (platform routes stripped). */
function parseCatalogSlugs(html) {
  const slugs = new Set();
  const re = /href\s*=\s*["'](?:(?:https?:)?\/\/[a-z0-9.-]*skilljar\.com)?\/([^"'\s#?]+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1].trim().replace(/\/+$/, '');
    if (!slug || slug.includes('/')) continue;
    if (/^(auth|static|checkout|page|theme|accounts?|search|profile)$/.test(slug)) continue;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) continue;
    slugs.add(slug);
  }
  return [...slugs].sort();
}

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
  return html.slice(start);
}

/**
 * Decode the handful of entities Skilljar titles actually contain.
 *
 * `&amp;` is decoded LAST on purpose: decoding it first turns `&amp;lt;`
 * into `&lt;` and then into `<`, i.e. one round of double-unescaping that
 * would let encoded markup back into a title string.
 */
const decodeEntities = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

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
      current = { title: textOf(inner), units: [] };
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
  const slugs = parseCatalogSlugs(catalogHtml);
  if (!slugs.length) throw new Error('catalog parsed to zero course slugs — refusing to write an empty snapshot');
  console.log(`catalog: ${slugs.length} course slugs on ${HOST}`);

  const snapshot = {
    schemaVersion: 1,
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
        title: parsed.title,
        sourceUrl: url,
        fetchedAt: new Date().toISOString(),
        sourceFingerprint: sha256(html),
        unitCount,
        sections: parsed.sections,
      });
      console.log(`  ${slug}: ${parsed.sections.length} sections / ${unitCount} units`);
      if (FIXTURE_COURSE && slug === FIXTURE_COURSE) {
        const fixturePath = path.join(path.dirname(OUT), `fixture-${slug}.html`);
        fs.writeFileSync(fixturePath, reduceFixture(html));
        console.log(`  fixture written: ${fixturePath}`);
      }
    } catch (err) {
      // A slug from the catalog that is not a course page (marketing tile,
      // program page) parses to no curriculum — record it rather than fail
      // the whole capture, but NEVER silently drop a real course.
      snapshot.errors.push({ slug, url, error: String(err.message || err) });
      console.warn(`  ${slug}: SKIPPED — ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  if (!snapshot.courses.length) throw new Error('zero courses captured — refusing to write');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`);
  const total = snapshot.courses.reduce((n, c) => n + c.unitCount, 0);
  console.log(
    `\nwrote ${OUT}: ${snapshot.courses.length} courses, ${total} units, ${snapshot.errors.length} skipped slugs`,
  );
}

module.exports = { parseCatalogSlugs, parseCoursePage };

if (require.main === module) {
  main().catch((err) => {
    console.error(`capture failed: ${err.message}`);
    process.exit(1);
  });
}
