#!/usr/bin/env node
/**
 * Reconnaissance for the quiz/exam safety contract on academy.claude.com.
 *
 * SkillBridge already promises never to translate, transmit, or cache
 * answer-choice text, and to put the tutor in exam-safe mode on assessment
 * pages. Those chokepoints are written against Skilljar's markup. Before
 * Academy could be supported, someone has to know whether the same contract
 * is implementable on its DOM — this measures that, and nothing else.
 *
 * Run manually. Two stages, because the anonymous one cannot finish the job:
 *
 *   node scripts/check-academy-safety.js
 *   node scripts/check-academy-safety.js --session ~/.academy-session.json
 *
 * The second needs a signed-in Playwright storageState. Capture one with
 * `--login`, which opens a headed browser, waits for you to sign in, and
 * writes the session where you point it:
 *
 *   node scripts/check-academy-safety.js --login --session ~/.academy-session.json
 *
 * Keep that file OUT of the repository — it is a live credential. Nothing
 * here writes it inside the working tree by default, and the recon output
 * never contains cookies, tokens, or storage.
 *
 * Never a CI gate: the site is someone else's and its availability is not a
 * condition on this repository.
 *
 * WHAT IS NOT RECORDED: question text, choice text, answers, explanations,
 * or raw HTML. The contract needs the shape; the content is somebody's
 * assessment material and has no business in a public repository. The unit
 * tests use synthetic fixtures for the same reason.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { STATUS, buildSafetyRecord, withPostSubmit, evaluateSafetyContract } = require('./lib/academy-safety');

const ORIGIN = 'https://academy.claude.com';
const COURSE = '/courses/building-with-the-claude-api';
// A quiz, the final assessment, and an ordinary lesson: the lesson is the
// control. "We can detect a quiz" means nothing without a page that is not
// one and is correctly left alone.
const SAMPLE_PATHS = [
  `${COURSE}/quiz-on-accessing-claude-with-the-api`,
  `${COURSE}/final-assessment`,
  `${COURSE}/making-a-request`,
];
const READY_TIMEOUT_MS = 20_000;

function argVal(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/**
 * Read the post-submit SHAPE. Runs in the page; returns presence flags and
 * attribute names, never result text, correctness, or explanations.
 */
/* istanbul ignore next — executes in the browser, not under jest */
function readPostSubmitShape() {
  const main = document.querySelector('main') || document.body;
  const signals = [];
  if (main.querySelector('[aria-live]')) signals.push('aria-live');
  if (main.querySelector('[data-status], [data-state], [data-correct]')) signals.push('data-status');
  if (main.querySelector('[role="status"], [role="alert"]')) signals.push('aria-role');
  if (main.querySelector('[aria-invalid], [aria-checked]')) signals.push('aria-state');
  return {
    resultStatePresent: signals.length > 0,
    correctnessSignals: signals,
    explanationPresent: !!main.querySelector('details, [data-explanation], [aria-describedby]'),
    retryPresent: /try again|retake|retry|다시/i.test(main.innerText || ''),
  };
}

/**
 * Capture a signed-in session interactively.
 *
 * Writes wherever it is told and never defaults inside the working tree: the
 * file is a live credential, and the recon output deliberately contains no
 * cookies, tokens, or storage.
 */
async function captureSession(sessionPath) {
  if (!sessionPath) throw new Error('--login needs --session <path outside the repository>');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/courses`, { waitUntil: 'domcontentloaded' });
  console.log('Sign in in the browser window, then return here and press Enter.');
  await new Promise((resolve) => process.stdin.once('data', resolve));
  await context.storageState({ path: sessionPath });
  await browser.close();
  console.log(`session written to ${sessionPath} — keep it out of the repository`);
}

/**
 * Read the safety-relevant SHAPE of a hydrated page.
 * Runs in the page. Returns counts, roles and attribute names — never text.
 */
/* istanbul ignore next — executes in the browser, not under jest */
function readSafetyShape() {
  const main = document.querySelector('main') || document.body;
  const clean = (s) =>
    String(s || '')
      .replace(/[-]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();

  const choiceEls = Array.from(
    main.querySelectorAll(
      'input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"], [role="option"]',
    ),
  );
  const first = choiceEls[0] || null;
  const stableAttrs = first
    ? Array.from(first.attributes)
        .map((a) => a.name)
        .filter((n) => n.startsWith('data-') || n === 'role' || n === 'name')
    : [];

  const submit = Array.from(main.querySelectorAll('button, [role="button"], input[type="submit"]')).find((el) =>
    /submit|check|answer|continue|next|제출|확인/i.test(clean(el.textContent) || el.getAttribute('aria-label') || ''),
  );

  return {
    path: location.pathname,
    heading: clean((main.querySelector('h1') || {}).textContent),
    // The page states the wall outright ("Sign in to take the quiz"), which
    // is a far better signal than looking for a generic "Sign in" that also
    // appears in the site header on every page, signed in or not. Truncating
    // the search is what made the first run misreport this.
    authWallCopy: /sign in to (take|start|continue)|로그인.{0,12}(응시|시작)/i.test(clean(main.innerText)),
    question: {
      count: main.querySelectorAll('[role="group"], fieldset, legend').length,
      role: first && first.closest('[role="radiogroup"]') ? 'radiogroup' : null,
    },
    choices: {
      count: choiceEls.length,
      inputType: first && first.tagName === 'INPUT' ? first.type : null,
      role: first ? first.getAttribute('role') : null,
      labelAssociated: choiceEls.some((el) => !!(el.id && main.querySelector(`label[for="${el.id}"]`))),
      withinForm: choiceEls.some((el) => !!el.closest('form')),
      stableAttrs,
    },
    controls: {
      submitPresent: !!submit,
      submitRole: submit ? submit.getAttribute('role') || submit.tagName.toLowerCase() : null,
    },
  };
}

async function main() {
  const outPath = argVal(
    '--out',
    path.join('snapshots', 'academy', `safety-recon-${new Date().toISOString().slice(0, 10)}.json`),
  );
  const sessionPath = argVal('--session', null);
  if (process.argv.includes('--login')) {
    await captureSession(sessionPath);
    return;
  }
  const authenticated = !!sessionPath && fs.existsSync(sessionPath);
  console.log(authenticated ? 'stage: authenticated' : 'stage: anonymous');

  const browser = await chromium.launch();
  const records = [];
  try {
    const context = await browser.newContext(authenticated ? { storageState: sessionPath } : {});
    const page = await context.newPage();
    for (const p of SAMPLE_PATHS) {
      await page.goto(`${ORIGIN}${p}`, { waitUntil: 'domcontentloaded' });
      // Wait for the thing being OBSERVED, not merely for a heading, and not
      // for "some body text" either. Measured: on a quiz route the body is
      // already ~2,185 characters before the sign-in notice renders at
      // ~1.5s, so a generic length check is satisfied first and snapshots a
      // page that has not yet said why the assessment is missing — reported
      // as "quiz content not rendered" for a page that was about to explain
      // itself. On a quiz route, settle only on the assessment or its
      // explanation; a lesson route has neither and settles on body text.
      const isQuizRoute = /(quiz|exam|assessment)/i.test(p);
      await page
        .waitForFunction(
          (quizRoute) => {
            const main = document.querySelector('main');
            if (!main) return false;
            const heading = main.querySelector('h1');
            if (!heading || !(heading.textContent || '').trim()) return false;
            const hasChoices = main.querySelector(
              'input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"], [role="option"]',
            );
            const explainsWall = /sign in to (take|start|continue)|로그인/i.test(main.innerText || '');
            if (quizRoute) return !!(hasChoices || explainsWall);
            return (main.innerText || '').trim().length > 400;
          },
          isQuizRoute,
          { timeout: READY_TIMEOUT_MS },
        )
        .catch(() => {});

      const shape = await page.evaluate(readSafetyShape);
      let record = buildSafetyRecord({ ...shape, observedAt: new Date().toISOString() });

      // Post-submit state only exists after answering as a signed-in user.
      // Submitting is a deliberate act against someone else's assessment, so
      // it happens only when a session was supplied AND the choices are
      // actually on screen.
      if (authenticated && record.choices.count > 0 && record.controls.submitPresent) {
        const choice = page.locator('input[type="radio"], [role="radio"]').first();
        await choice.click({ timeout: 5_000 }).catch(() => {});
        const submit = page.getByRole('button', { name: /submit|check|answer|제출|확인/i }).first();
        await submit.click({ timeout: 5_000 }).catch(() => {});
        await page.waitForTimeout(2_000);
        record = withPostSubmit(record, await page.evaluate(readPostSubmitShape));
      }
      records.push(record);
      console.log(
        `  ${p}\n    kind=${record.pageKind} (${record.pageKindSignals.join('+') || 'none'}) ` +
          `choices=${record.choices.count} excludable=${record.choices.excludable} ` +
          `status=${record.status}${record.blocker ? ` blocker=${record.blocker}` : ''}`,
      );
    }
    await context.close();
  } finally {
    await browser.close();
  }

  const contract = evaluateSafetyContract(records);
  const report = { schemaVersion: 1, origin: ORIGIN, generatedAt: new Date().toISOString(), contract, records };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log('\ncontract:');
  for (const [k, v] of Object.entries(contract)) console.log(`  ${k}: ${v}`);
  console.log(`\nwrote ${outPath}`);
  if (contract.verdict !== STATUS.COMPLETE) {
    console.log('\nSTILL PARTIAL — post-submit state needs an authenticated session.');
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`safety reconnaissance failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { SAMPLE_PATHS };
