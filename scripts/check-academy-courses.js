#!/usr/bin/env node
/**
 * SkillBridge — Academy Course Catalog Drift Check
 *
 * Closes the last gap in the product's first pillar
 * ("AI terminology fidelity — new Academy course → terminology update
 *  within 48 hours"). The dict-coverage check already enforces per-course
 * parity ONCE a course is wired into FLASHCARD_COURSE_MAP. But until this
 * script existed, nothing told the maintainer when Anthropic shipped a NEW
 * course on anthropic.skilljar.com. The 48-hour SLA was therefore honor-
 * system: a new course could ship on Monday and we wouldn't know until a
 * user filed an issue.
 *
 * Pattern: identical to scripts/check-selectors.js (the live-DOM cron).
 * Fetches the public catalog HTML, extracts every course slug it links to,
 * cross-references against FLASHCARD_COURSE_MAP in src/lib/constants.js,
 * and exits 1 if any slug on the live site is unknown to the extension.
 *
 * Usage:
 *   node scripts/check-academy-courses.js
 *
 * In CI (CI=true), writes academy-courses-report.txt and exits non-zero
 * if new courses are detected, which the GH workflow turns into an
 * auto-opened, idempotent issue.
 *
 * Test override (used by tests/academy-courses-checker.test.js):
 *   SB_CATALOG_HTML_FIXTURE=/path/to/fixture.html
 *   SB_CONSTANTS_FIXTURE=/path/to/fake-constants.js
 */

const fs = require('fs');
const path = require('path');

const CATALOG_URL = process.env.SB_CATALOG_URL || 'https://anthropic.skilljar.com/';
const STORE_LISTING_PATH =
  process.env.SB_STORE_LISTING_FIXTURE || path.resolve(__dirname, '..', 'store-assets', 'STORE_LISTING.md');

// Paths that look like course slugs but aren't. These are first-party
// non-course routes the catalog page also links to. Add new entries here
// when Skilljar/Anthropic adds new platform pages; do NOT silence by
// regex changes elsewhere.
const NON_COURSE_SLUGS = new Set([
  '',
  'auth',
  'login',
  'logout',
  'signup',
  'sign-up',
  'register',
  'profile',
  'account',
  'settings',
  'dashboard',
  'paths',
  'plans',
  'lessons',
  'search',
  'help',
  'support',
  'static',
  'about',
  'contact',
  'terms',
  'privacy',
  'cookies',
]);

function loadCatalogHtml() {
  const fixture = process.env.SB_CATALOG_HTML_FIXTURE;
  if (fixture) return Promise.resolve(fs.readFileSync(fixture, 'utf8'));
  return fetch(CATALOG_URL, {
    headers: {
      'User-Agent': 'SkillBridge-CourseDriftCheck/1.0 (+https://github.com/heznpc/skillbridge)',
      Accept: 'text/html',
    },
    redirect: 'follow',
  }).then((resp) => {
    if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${CATALOG_URL}`);
    return resp.text();
  });
}

function loadStoreListingText() {
  return fs.readFileSync(STORE_LISTING_PATH, 'utf8');
}

/**
 * Extracts course slugs from anthropic.skilljar.com catalog HTML.
 *
 * Skilljar renders each course as <a href="https://anthropic.skilljar.com/{slug}">.
 * Anchors with query strings or multi-segment paths (e.g. /auth/login?next=)
 * are stripped — those are platform routes, not courses.
 *
 * Exported (via module.exports.parseSlugs) so the unit test can feed it
 * a deterministic fixture without an HTTP round trip.
 */
function parseSlugs(html) {
  const slugs = new Set();
  // The Skilljar catalog renders course tiles as path-relative anchors
  // (`href="/claude-101"`). Absolute URLs also appear for the same slugs
  // on some templates. Accept both. The first capture group is the slug
  // itself, sans leading slash and sans trailing query/fragment/slash.
  const re = /href\s*=\s*["'](?:(?:https?:)?\/\/anthropic\.skilljar\.com)?\/([^"'\s#?]+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let slug = m[1].trim();
    // Trim trailing slash.
    if (slug.endsWith('/')) slug = slug.slice(0, -1);
    // Reject multi-segment paths (e.g. "auth/login", "static/css/...").
    if (slug.includes('/')) continue;
    // Reject template placeholders that leaked into the HTML
    // (e.g. `${href}`, `${academyHref}` from un-rendered template literals).
    if (slug.includes('$') || slug.includes('{') || slug.includes('}')) continue;
    // Slug shape: lowercase letters, digits, and hyphens only.
    // This filters out CSS-asset filenames (which include dots) and
    // tracking-pixel paths (which include underscores or query-like chars).
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) continue;
    if (NON_COURSE_SLUGS.has(slug)) continue;
    slugs.add(slug);
  }
  return [...slugs].sort();
}

function parseStoreListingCourseCount(text) {
  const match = text.match(/All\s+(\d+)\s+currently-published courses/i);
  return match ? Number(match[1]) : null;
}

/**
 * Pulls FLASHCARD_COURSE_MAP from src/lib/constants.js as a plain object,
 * the same way scripts/check-selectors.js loads SKILLJAR_SELECTORS. We
 * deliberately avoid `require()` because constants.js is content-script
 * source (no CommonJS export), and we want exactly one source of truth.
 */
function loadKnownSlugs() {
  const constantsPath = process.env.SB_CONSTANTS_FIXTURE || path.resolve(__dirname, '..', 'src', 'lib', 'constants.js');
  const runtimeConstantsPath = path.resolve(__dirname, '..', 'src', 'shared', 'runtime-constants.js');
  const runtimeConstantsSrc = fs.readFileSync(runtimeConstantsPath, 'utf8');
  const src = fs.readFileSync(constantsPath, 'utf8');
  // constants.js is content-script source and references SKILLJAR_SELECTORS
  // (defined in src/lib/selectors.js, loaded first by manifest.json). We
  // only care about FLASHCARD_COURSE_MAP here, so inject a Proxy stub that
  // returns "" for any selector access — exact selector values don't affect
  // FLASHCARD_COURSE_MAP, which is a literal object of string→string[] rows.
  const stub = 'const SKILLJAR_SELECTORS = new Proxy({}, { get: () => "" });';
  const map = new Function(
    `${runtimeConstantsSrc}\n${stub}\n${src}; return typeof FLASHCARD_COURSE_MAP !== 'undefined' ? FLASHCARD_COURSE_MAP : {};`,
  )();
  return new Set(Object.keys(map));
}

async function main() {
  console.log('Academy Course Catalog Drift Check');
  console.log(`Catalog: ${CATALOG_URL}`);

  let html;
  try {
    html = await loadCatalogHtml();
  } catch (err) {
    console.error(`Failed to fetch catalog: ${err.message}`);
    if (process.env.CI) {
      fs.writeFileSync('academy-courses-report.txt', `Fetch error: ${err.message}\n`);
    }
    process.exit(1);
  }

  const liveSlugs = parseSlugs(html);
  const knownSlugs = loadKnownSlugs();
  const storeListingCount = parseStoreListingCourseCount(loadStoreListingText());

  console.log(`\n   Live catalog slugs: ${liveSlugs.length}`);
  console.log(`   Known to FLASHCARD_COURSE_MAP: ${knownSlugs.size}\n`);

  const unknown = liveSlugs.filter((s) => !knownSlugs.has(s));
  const storeListingIssue =
    storeListingCount === null
      ? { kind: 'missing' }
      : storeListingCount !== liveSlugs.length
        ? { kind: 'mismatch', declared: storeListingCount, live: liveSlugs.length }
        : null;
  for (const slug of liveSlugs) {
    const tag = knownSlugs.has(slug) ? '[OK]      ' : '[NEW]     ';
    console.log(`  ${tag} ${slug}`);
  }

  console.log('');

  if (unknown.length === 0 && !storeListingIssue) {
    console.log('All live courses are wired into FLASHCARD_COURSE_MAP and STORE_LISTING.md.');
    return;
  }

  if (unknown.length > 0) {
    console.log(`${unknown.length} unknown course slug(s) on the live catalog:`);
    for (const slug of unknown) console.log(`  - ${slug}`);
    console.log('');
  }

  if (storeListingIssue) {
    if (storeListingIssue.kind === 'missing') {
      console.log('STORE_LISTING.md is missing the supported-course count sentence.');
    } else {
      console.log(
        `Store listing count mismatch: STORE_LISTING.md declares ${storeListingIssue.declared}, ` +
          `live catalog has ${storeListingIssue.live}.`,
      );
    }
    console.log('');
  }

  if (process.env.CI) {
    const report = ['### Academy catalog drift detected\n'];
    if (unknown.length > 0) {
      report.push(...unknown.map((s) => `- New slug: \`${s}\` → https://anthropic.skilljar.com/${s}`), '');
    }
    if (storeListingIssue?.kind === 'missing') {
      report.push('- `store-assets/STORE_LISTING.md` is missing the supported-course count sentence.', '');
    } else if (storeListingIssue?.kind === 'mismatch') {
      report.push(
        `- Store listing count mismatch: \`${storeListingIssue.declared}\` declared, ` +
          `\`${storeListingIssue.live}\` live catalog slug(s).`,
        '',
      );
    }
    report.push(
      '',
      '### All live slugs\n',
      ...liveSlugs.map((s) => `- ${knownSlugs.has(s) ? '✅' : '🆕'} \`${s}\``),
      '',
      '### Required follow-up (48h terminology SLA)\n',
      '1. Add a section for each new course to all 12 premium-language dictionaries in `src/data/`.',
      '2. Map the slug(s) into `FLASHCARD_COURSE_MAP` in `src/lib/constants.js`.',
      '3. Update `store-assets/STORE_LISTING.md` if the supported-course count or list is stale.',
      '4. `npm run check:dict-coverage` and `npm run check:academy` must pass before the issue closes.',
    );
    fs.writeFileSync('academy-courses-report.txt', report.join('\n'));
  }

  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = { parseSlugs, parseStoreListingCourseCount, NON_COURSE_SLUGS };
