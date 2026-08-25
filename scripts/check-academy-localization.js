#!/usr/bin/env node
/**
 * Measure how much of academy.claude.com is officially localized, per locale
 * and per surface.
 *
 * The question this answers is narrow: WHERE would SkillBridge still have to
 * translate on a page the site already localizes? It is not a judgement of
 * translation quality.
 *
 * Run manually — it drives a real browser against the live site:
 *
 *   node scripts/check-academy-localization.js
 *   node scripts/check-academy-localization.js --locales ko,ja --out report.json
 *
 * Never wired into CI. The site is someone else's, its availability is not a
 * gate on this repository, and the numbers are a dated measurement rather
 * than a contract — every record carries `observedAt` for that reason.
 *
 * A browser is required, not preferred: measured 2026-08-24, no raw HTTP
 * response carries localized content (see scripts/lib/academy-observation.js
 * for the evidence). Locales are discovered from the live selector rather
 * than hard-coded, so the set can change without this script lying.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const {
  CONFIDENCE,
  validateObservedLocale,
  validateAcademyPage,
  extractLocalizationSurface,
} = require('./lib/academy-observation');

const ORIGIN = 'https://academy.claude.com';
// One course page and one lesson page: the course page carries section and
// lesson titles, the lesson page carries prose. Between them every surface in
// the coverage record has a source.
const SAMPLE_PATHS = [
  '/courses/building-with-the-claude-api',
  '/courses/building-with-the-claude-api/making-a-request',
];
const READY_TIMEOUT_MS = 20_000;

/**
 * Strip Unicode Private Use Area characters before comparing UI text.
 *
 * Measured: the language selector's textContent is
 * `\ue082\ud55c\uad6d\uc5b4\ue027` — the label with icon-font glyphs
 * welded on either side. Those are rendering artifacts, not part of the
 * label, and an exact-match lookup against them silently returns null, which
 * this probe then reports as "missing locale evidence" for a page that
 * rendered perfectly.
 */

/**
 * The language selector renders its own name in its own language, so the
 * label IS the locale signal. Defined once here and passed INTO the page:
 * duplicating it as a literal inside an evaluated function is how the two
 * copies drift, and a lookup that silently misses just yields a null locale
 * and a page that fails closed for no real reason.
 */
const LOCALE_LABELS = Object.freeze({
  English: 'en',
  'Espa\u00f1ol': 'es',
  'Fran\u00e7ais': 'fr',
  '\u65e5\u672c\u8a9e': 'ja',
  '\ud55c\uad6d\uc5b4': 'ko',
  '\u7b80\u4f53\u4e2d\u6587': 'zh-CN',
  '\u7e41\u9ad4\u4e2d\u6587': 'zh-TW',
});

function argVal(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/**
 * Read the surfaces and the locale evidence out of a hydrated page.
 * Runs in the page; keep it self-contained.
 */
/* istanbul ignore next — executes in the browser, not under jest */
function readSnapshot(localeLabels) {
  const clean = (s) =>
    String(s || '')
      .replace(/[\uE000-\uF8FF]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  const text = (el) => (el ? clean(el.textContent) : '');
  const many = (sel) =>
    Array.from(document.querySelectorAll(sel))
      .map((el) => text(el))
      .filter(Boolean);

  const labels = Object.keys(localeLabels);
  const selectorEl = Array.from(document.querySelectorAll('button, [role="button"]')).find((el) =>
    labels.includes(text(el)),
  );
  const selectorLabel = selectorEl ? text(selectorEl) : '';
  const selectedLocale = localeLabels[selectorLabel] || null;

  const main = document.querySelector('main') || document.body;
  const courseTitle = text(main.querySelector('h1'));
  const bodyBlocks = Array.from(main.querySelectorAll('p, li'))
    .map((el) => text(el))
    .filter((t) => t.length >= 20)
    .slice(0, 40);

  return {
    htmlLang: document.documentElement.lang || null,
    selectedLocale,
    selectorLabel,
    courseTitle,
    sectionTitles: many('main h2').slice(0, 30),
    lessonTitles: many('main a[href*="/courses/"]')
      .filter((t) => t.length > 1 && t.length < 80)
      .slice(0, 60),
    quizTitles: many('main a[href*="quiz"]').slice(0, 20),
    bodyBlocks,
  };
}

/**
 * Discover which locales the live selector actually offers.
 * Hard-coding the set would make this script keep reporting a number after
 * the site changed — the one failure mode a probe must not have.
 */
async function discoverLocales(page) {
  await page.goto(`${ORIGIN}/courses`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('main', { timeout: READY_TIMEOUT_MS });

  // The options only exist once the selector is opened — the collapsed
  // control renders just the current locale, so reading the DOM without
  // clicking discovers exactly one language and looks like a site that
  // offers one language.
  const trigger = page
    .locator('button[aria-label]')
    .filter({
      hasText:
        /English|Espa\u00f1ol|Fran\u00e7ais|\u65e5\u672c\u8a9e|\ud55c\uad6d\uc5b4|\u7b80\u4f53\u4e2d\u6587|\u7e41\u9ad4\u4e2d\u6587/,
    })
    .first();
  await trigger.click({ timeout: READY_TIMEOUT_MS });
  await page.waitForTimeout(1000);

  return page.evaluate((localeLabels) => {
    const labels = Object.keys(localeLabels);
    const seen = new Set();
    for (const el of document.querySelectorAll('button, a, [role="menuitem"], [role="option"], option')) {
      const t = (el.textContent || '')
        .replace(/[\uE000-\uF8FF]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (labels.includes(t)) seen.add(localeLabels[t]);
    }
    return [...seen];
  }, LOCALE_LABELS);
}

/**
 * Observe one page in one locale.
 *
 * `locale` is a REQUEST. What came back is recorded separately, because the
 * two are not the same thing and conflating them is how a probe reports a
 * locale it never actually saw.
 */
async function observeAcademyPage(context, requestedPath, { locale }) {
  const page = await context.newPage();
  const observedAt = new Date().toISOString();
  try {
    const url = `${ORIGIN}/${locale}${requestedPath}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    // Wait for content, not for the network: a SPA with background polling
    // may never go idle, and idleness would not prove the root is filled.
    // The language selector is part of the readiness condition on purpose —
    // it is the second half of the locale evidence, and it appears LATER than
    // the heading. Waiting only for the heading snapshots a page whose
    // selector has not rendered, which then fails closed for "missing locale
    // evidence" on a page that was about to be perfectly readable.
    await page
      .waitForFunction(
        (labels) => {
          const main = document.querySelector('main');
          const heading = main && main.querySelector('h1');
          if (!heading || !(heading.textContent || '').trim()) return false;
          return Array.from(document.querySelectorAll('button, [role="button"]')).some((el) =>
            labels.includes(
              (el.textContent || '')
                .replace(/[\uE000-\uF8FF]/gu, '')
                .replace(/\s+/g, ' ')
                .trim(),
            ),
          );
        },
        Object.keys(LOCALE_LABELS),
        { timeout: READY_TIMEOUT_MS },
      )
      .catch(() => {});

    const snapshot = await page.evaluate(readSnapshot, LOCALE_LABELS);
    const pageCheck = validateAcademyPage(snapshot);
    const localeCheck = validateObservedLocale(snapshot, locale);

    const record = {
      requestedLocale: locale,
      observedLocale: localeCheck.observedLocale,
      confidence: localeCheck.confidence,
      observedAt,
      requestedPath,
      finalUrl: page.url(),
      evidence: {
        htmlLang: snapshot.htmlLang,
        selectedLocale: snapshot.selectedLocale,
        selectorLabel: snapshot.selectorLabel,
        contentReady: pageCheck.ok,
      },
    };

    // Fail closed: no coverage number unless the page is real AND the locale
    // it rendered in is known. A number attached to an unidentified page is
    // worse than no number.
    if (!pageCheck.ok) return { ...record, ok: false, reason: pageCheck.reason };
    if (localeCheck.confidence !== CONFIDENCE.HIGH) return { ...record, ok: false, reason: localeCheck.reason };

    return { ...record, ok: true, coverage: extractLocalizationSurface(snapshot, localeCheck.observedLocale) };
  } finally {
    await page.close();
  }
}

async function main() {
  const outPath = argVal(
    '--out',
    path.join('snapshots', 'academy', `localization-${new Date().toISOString().slice(0, 10)}.json`),
  );
  const browser = await chromium.launch();
  const records = [];
  try {
    const discovery = await browser.newContext();
    const discoveryPage = await discovery.newPage();
    const discovered = await discoverLocales(discoveryPage);
    await discovery.close();

    const requested = argVal('--locales', null);
    const locales = requested ? requested.split(',').map((s) => s.trim()) : discovered;
    if (!locales.length) throw new Error('no locales discovered from the live selector — refusing to guess');
    console.log(`locales: ${locales.join(', ')}${requested ? ' (from --locales)' : ' (discovered)'}`);

    for (const locale of locales) {
      const context = await browser.newContext({ locale });
      try {
        for (const p of SAMPLE_PATHS) {
          const record = await observeAcademyPage(context, p, { locale });
          records.push(record);
          const summary = record.ok ? JSON.stringify(record.coverage) : `SKIPPED — ${record.reason}`;
          console.log(`  ${locale} ${p}\n    ${summary}`);
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const report = {
    schemaVersion: 1,
    origin: ORIGIN,
    generatedAt: new Date().toISOString(),
    records,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nwrote ${outPath}: ${records.length} observations, ${records.filter((r) => r.ok).length} usable`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`localization probe failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { observeAcademyPage, discoverLocales, SAMPLE_PATHS };
