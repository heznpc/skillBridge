/*
 * SkillBridge — store-asset scenes (consumed by `npm run capture:store`).
 *
 * The generic harness (scripts/store-assets/, inherited from the browser-
 * extension-starter) owns build → launch → screenshot → caption → promo →
 * video → description. This file owns the SkillBridge-specific parts:
 *
 *   - prepareExtension: reuse the E2E helper's makePatchedExtension(), which
 *     copies dist/bundled, widens the manifest to localhost, and swaps in the
 *     streaming Puter stub (so the AI-tutor scene gets a deterministic reply).
 *   - setup(): reuse the E2E network stubs (GitHub / Puter), serve the styled
 *     store fixtures, and translate via a FROZEN offline map so captures are
 *     reproducible. --live-gt hits real Google Translate; --freeze re-records
 *     the frozen map from a live run (the spec's "freeze해 시드").
 *   - scenes: drive each money-shot state via the content-world op table.
 *
 * Trademark-safety: the fixtures use a GENERIC "Academy" chrome (no Anthropic
 * logo), brand names appear only nominatively, and the harness composites an
 * "unofficial / not affiliated" disclaimer band onto every screenshot + the
 * promo tile.
 *
 * Running this is also a real-bundle smoke test: each screenshot only appears
 * if that feature actually rendered from dist/bundled.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');

const { evalInContentWorld, makePatchedExtension } = require('./tests/e2e/helpers/extension');
const { registerStubs, GT_KO, buildGTResponse } = require('./tests/e2e/helpers/network-stubs');

const FIXTURES = path.join(__dirname, 'store-assets', 'fixtures');
const TEMPLATES = path.join(__dirname, 'store-assets', 'templates');
const LESSON_HTML = fs.readFileSync(path.join(FIXTURES, 'lesson.html'), 'utf8');
const QUIZ_HTML = fs.readFileSync(path.join(FIXTURES, 'quiz.html'), 'utf8');
const FIXTURE_CSP =
  "default-src * data: blob: 'unsafe-eval' 'unsafe-inline'; " +
  "script-src * 'unsafe-eval' 'unsafe-inline' data: blob:; style-src * 'unsafe-inline'";

// A lesson URL whose path contains a real course slug, so the flashcard deck
// builds non-empty (chat-flashcards matches FLASHCARD_COURSE_MAP by url.includes).
const LESSON_URL = '/courses/claude-with-the-anthropic-api/lessons/introduction-to-claude';
// Plain /quiz → regular exam mode (translate title/question, skip answers, show
// the exam banner). A course-slug quiz path can trip the full cert-disable.
const QUIZ_URL = '/quiz';

const DISCLAIMER = 'Unofficial · independent project · not affiliated with or endorsed by Anthropic';
const KO = 'ko';

/** Poll until the page-bridge (Puter stub) is ready so chat can stream. */
async function waitBridge(context, page) {
  for (let i = 0; i < 40; i++) {
    const b = await evalInContentWorld(context, 'bridgeReady');
    if (b && b.isReady) return;
    await page.waitForTimeout(250);
  }
}

/** Poll until the content script has fully initialized (exam detection, translator). */
async function waitInit(context, page) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const s = await evalInContentWorld(context, 'snapshot');
    if (s && s.init && s.sb && s.methods && s.methods.gt) return;
    await page.waitForTimeout(200);
  }
}

/** Drive a lesson into the translated Korean state (used by several scenes). */
async function openTranslatedLesson(page, context, baseUrl) {
  await page.goto(`${baseUrl}${LESSON_URL}`, { waitUntil: 'networkidle' });
  await evalInContentWorld(context, 'suppressOnboarding');
  await evalInContentWorld(context, 'switchLanguage', KO);
  await page
    .waitForFunction(() => /[가-힣]/.test(document.querySelector('#p-1')?.textContent || ''), null, { timeout: 15_000 })
    .catch(() => {});
}

module.exports = {
  build: 'npm run build:bundle', // smoke test starts here; produces dist/bundled
  outDir: 'store-assets',
  disclaimer: DISCLAIMER,
  description: { from: 'store-assets/STORE_LISTING.md' },

  // dist/bundled (copied + manifest widened to localhost + streaming Puter stub).
  prepareExtension: () => makePatchedExtension(),

  async setup({ context, flags }) {
    // GitHub + Puter stubs (and a GT_KO route we override below).
    await registerStubs(context);

    // Google Translate: deterministic frozen map by default.
    const frozen = { ...require('./store-assets/fixtures/gt-frozen.ko.json') };
    delete frozen._comment;
    const MAP = { ...GT_KO, ...frozen };
    const recorded = {};
    await context.route('https://translate.googleapis.com/**', async (route) => {
      const q = new URL(route.request().url()).searchParams.get('q') || '';
      const norm = decodeURIComponent(q).replace(/\s+/g, ' ').trim();
      if (flags && flags.freeze) {
        // Record mode: hit real GT, capture its output, fulfill with the real response.
        const resp = await route.fetch();
        const body = await resp.text();
        try {
          recorded[norm] = JSON.parse(body)[0][0][0];
        } catch (_e) {
          /* leave unrecorded on parse failure */
        }
        return route.fulfill({ response: resp });
      }
      if (flags && flags.liveGt) return route.continue(); // real Google Translate
      // Default: frozen map; unmapped strings fall back to the ORIGINAL text so
      // a forgotten string stays clean English instead of an [UNTRANSLATED] marker.
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildGTResponse(MAP[norm] || norm)),
      });
    });

    // Suppress first-run onboarding so it doesn't obscure scenes (scene 2 shows
    // it explicitly). Pre-seeding storage before any navigation stops the timer.
    const sw = context.serviceWorkers()[0];
    if (sw) {
      try {
        await sw.evaluate(() => chrome.storage.local.set({ welcomeShown: true }));
      } catch (_e) {
        /* SW not ready — the per-scene suppressOnboarding op covers it */
      }
    }

    // Serve the styled store fixtures (quiz path → quiz fixture, else lesson).
    const server = http.createServer((req, res) => {
      const p = (req.url || '/').split('?')[0];
      const isQuiz = /(quiz|exam|assessment)/.test(p);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': FIXTURE_CSP });
      res.end(isQuiz ? QUIZ_HTML : LESSON_HTML);
    });
    const baseUrl = await new Promise((resolve) =>
      server.listen(0, '127.0.0.1', () => resolve(`http://localhost:${server.address().port}`)),
    );

    return {
      env: { baseUrl },
      teardown: async () => {
        if (flags && flags.freeze && Object.keys(recorded).length) {
          fs.writeFileSync(path.join(FIXTURES, 'gt-frozen.ko.json'), JSON.stringify(recorded, null, 2) + '\n');
        }
        await new Promise((r) => server.close(() => r()));
      },
    };
  },

  scenes: [
    {
      name: '01-translate',
      caption: 'Read every lesson in your language',
      async run({ page, context, baseUrl }) {
        await openTranslatedLesson(page, context, baseUrl);
        await page.waitForTimeout(500); // let the GT batch settle
        await evalInContentWorld(context, 'cleanForCapture');
        await page.waitForTimeout(150);
      },
    },
    {
      name: '02-language-select',
      caption: 'Pick from 32 languages — onboarding offers one for you',
      async run({ page, context, baseUrl }) {
        await page.goto(`${baseUrl}${LESSON_URL}`, { waitUntil: 'networkidle' });
        await evalInContentWorld(context, 'showWelcomeBanner', KO);
        await page.waitForSelector('#si18n-welcome-banner', { timeout: 8_000 });
        await page.waitForTimeout(500); // allow the slide-in transition
      },
    },
    {
      name: '03-sidebar-tutor',
      caption: 'Ask the in-page AI tutor, grounded in the lesson',
      async run({ page, context, baseUrl }) {
        await openTranslatedLesson(page, context, baseUrl);
        await evalInContentWorld(context, 'injectSidebar');
        await evalInContentWorld(context, 'toggleSidebar');
        await waitBridge(context, page);
        await evalInContentWorld(context, 'sendChat', '프롬프트가 무엇인가요?');
        await page.waitForSelector('#si18n-chat-messages .si18n-chat-bot', { timeout: 10_000 });
        await page.waitForTimeout(900); // let the streamed reply finish
        await evalInContentWorld(context, 'cleanForCapture');
        await page.waitForTimeout(150);
      },
    },
    {
      name: '04-flashcards',
      caption: 'Spaced-repetition flashcards from the course glossary',
      async run({ page, context, baseUrl }) {
        await openTranslatedLesson(page, context, baseUrl); // ko dict + slug URL → non-empty deck
        await evalInContentWorld(context, 'injectSidebar');
        await evalInContentWorld(context, 'toggleSidebar');
        await evalInContentWorld(context, 'toggleFlashcardPanel');
        // The flashcard UI renders into #si18n-panel-chat; #si18n-fc-container
        // is the card area (present whether the deck is empty or not).
        await page.waitForSelector('#si18n-fc-container', { timeout: 8_000 });
        await page.waitForTimeout(700);
        await evalInContentWorld(context, 'cleanForCapture');
        await page.waitForTimeout(150);
      },
    },
    {
      name: '05-exam-safe',
      caption: 'Exam-safe: quiz answers are never translated',
      async run({ page, context, baseUrl }) {
        await page.goto(`${baseUrl}${QUIZ_URL}`, { waitUntil: 'networkidle' });
        await evalInContentWorld(context, 'suppressOnboarding');
        await waitInit(context, page); // exam detection + translator must be ready first
        await evalInContentWorld(context, 'switchLanguage', KO);
        // Poll until the title swaps to Korean (the GT batch lands fire-and-forget).
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline) {
          const qt = await evalInContentWorld(context, 'quizText');
          if (qt && qt.title && /[가-힣]/.test(qt.title)) break;
          await page.waitForTimeout(200);
        }
        await page.waitForSelector('#si18n-exam-banner', { timeout: 4_000 }).catch(() => {});
        await evalInContentWorld(context, 'cleanForCapture');
        await page.waitForTimeout(300);
      },
    },
  ],

  promoTiles: [
    {
      name: 'promo-tile-440x280',
      template: path.join(TEMPLATES, 'promo-tile.html'),
      width: 440,
      height: 280,
      replacements: {
        TAGLINE:
          "Take Anthropic's free AI courses in 32 languages — accurate AI terminology, an in-page AI tutor, exam-safe.",
        DISCLAIMER: 'Unofficial · not affiliated with or endorsed by Anthropic',
      },
    },
  ],

  demo: {
    name: 'demo',
    async run({ page, context, baseUrl }) {
      await page.goto(`${baseUrl}${LESSON_URL}`, { waitUntil: 'networkidle' });
      await evalInContentWorld(context, 'suppressOnboarding');
      await page.waitForTimeout(900);
      await evalInContentWorld(context, 'switchLanguage', KO); // watch it translate
      await page
        .waitForFunction(() => /[가-힣]/.test(document.querySelector('#p-1')?.textContent || ''), null, {
          timeout: 15_000,
        })
        .catch(() => {});
      await page.waitForTimeout(1400);
      await evalInContentWorld(context, 'injectSidebar');
      await evalInContentWorld(context, 'toggleSidebar');
      await waitBridge(context, page);
      await evalInContentWorld(context, 'sendChat', '프롬프트가 무엇인가요?');
      await page.waitForSelector('#si18n-chat-messages .si18n-chat-bot', { timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(1600);
      await evalInContentWorld(context, 'toggleFlashcardPanel'); // peek flashcards
      await page.waitForTimeout(1800);
    },
  },
};
