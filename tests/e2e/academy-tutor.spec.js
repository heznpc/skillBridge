/**
 * SkillBridge — the Tutor's exam-safe contract on a Claude Academy assessment.
 *
 * The bridge was held off for academy.claude.com until this existed. The
 * reasoning was specific: Academy's assessment signals are nothing like
 * Skilljar's, so a tutor shipped there before the guard was verified would be
 * a tutor answering live quiz questions — the one failure this host must not
 * have.
 *
 * Everything here is asserted on THE PROMPT THE MODEL RECEIVED, captured by
 * the Puter stub, and not on the page or the rendered reply. A guard that is
 * built and then dropped somewhere between the sidebar and the transport looks
 * identical from both of those ends.
 *
 * Four claims:
 *   1. On an Academy quiz the prompt carries the exam guard.
 *   2. It carries no answer-choice text — not the choices themselves, and not
 *      the lesson body they live in.
 *   3. On an Academy lesson the guard is absent, so it is a real signal rather
 *      than something always on.
 *   4. With the engine Off, nothing is asked at all.
 *   5. And none of that is undone when the quiz becomes its own result page.
 *
 * tests/tutor-safety-contract.test.js owns the same contract across all three
 * engines at unit level. This one owns "and it survives the real transport".
 */

const { test, expect } = require('@playwright/test');
const http = require('http');
const { SETTLE_MS } = require('./helpers/timeouts');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

const LESSON_PATH = '/academy/courses/building-with-the-claude-api/accessing-claude-with-the-api';
const QUIZ_PATH = '/academy/courses/building-with-the-claude-api/quiz-on-accessing-claude-with-the-api';
// The same assessment URL after a submission. Submitting is the one transition
// this suite cannot rehearse — it needs a signed-in account and puts a real
// attempt on a real record — so the fixture served here is not a guess at the
// live markup but the worst same-URL shape the guard has to survive: the
// heading no longer names a quiz, and the answers are back on screen, marked.
const RESULTS_PATH = `${QUIZ_PATH}/results`;

const EXAM_MARKER = 'CRITICAL: The user is on a certification exam page.';
/** Nonsense on purpose — each string exists in exactly one place in the fixture. */
const CHOICE_FRAGMENTS = [
  'Zebra-cipher-alpha',
  'Marmalade-vector-bravo',
  'Quartzite-harbor-charlie',
  'Pelican-lantern-delta',
];

function startLocalTutorStub() {
  return new Promise((resolve) => {
    const requests = [];
    const server = http.createServer((req, res) => {
      if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
        res.writeHead(404).end();
        return;
      }
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        requests.push(JSON.parse(body));
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        res.write('data: {"choices":[{"delta":{"content":"ACADEMY"}}]}\n\n');
        res.end('data: [DONE]\n\n');
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, requests, baseUrl: `http://127.0.0.1:${port}/v1` });
    });
  });
}

test.describe('SkillBridge — Academy tutor exam safety', () => {
  /** @type {Awaited<ReturnType<typeof launchExtension>>} */
  let extCtx;
  /** @type {import('@playwright/test').Page} */
  let page;
  /** @type {{server: import('http').Server, baseUrl: string}} */
  let fixture;

  /** Load a route, select the Academy profile, and wait for the tutor transport. */
  async function gotoAcademy(path) {
    await page.goto(`${fixture.baseUrl}${path}`);

    const deadline = Date.now() + SETTLE_MS;
    let ready = null;
    while (Date.now() < deadline) {
      const snap = await evalInContentWorld(extCtx.context, 'snapshot');
      ready = await evalInContentWorld(extCtx.context, 'bridgeReady');
      if (snap?.init && snap?.methods?.gt && ready?.isReady) break;
      await page.waitForTimeout(200);
    }
    if (!ready?.isReady) throw new Error('tutor transport never became ready');

    await evalInContentWorld(extCtx.context, 'useAcademyProfile');
    await evalInContentWorld(extCtx.context, 'settleExamState');
    await evalInContentWorld(extCtx.context, 'clearTutorPrompt');
    await evalInContentWorld(extCtx.context, 'injectSidebar');
    await evalInContentWorld(extCtx.context, 'toggleSidebar');
  }

  /** Ask the tutor one question and return the prompt the model actually got. */
  async function askTutor(question) {
    const sent = await evalInContentWorld(extCtx.context, 'sendChat', question);
    if (sent?.error) throw new Error(`could not send: ${sent.error}`);
    const deadline = Date.now() + SETTLE_MS;
    while (Date.now() < deadline) {
      const captured = await evalInContentWorld(extCtx.context, 'lastTutorPrompt');
      if (captured?.prompt) return captured.prompt;
      await page.waitForTimeout(100);
    }
    return null;
  }

  test.beforeAll(async () => {
    fixture = await startFixtureServer();
    extCtx = await launchExtension();
    await registerStubs(extCtx.context);
    page = await extCtx.context.newPage();
    page.on('pageerror', (err) => console.log('[page:pageerror]', err.message));
  });

  test.afterAll(async () => {
    await closeExtension(extCtx);
    await stopFixtureServer(fixture.server);
  });

  test('on an Academy quiz, the prompt the model receives carries the exam guard', async () => {
    await gotoAcademy(QUIZ_PATH);
    expect((await evalInContentWorld(extCtx.context, 'examState')).isExamPage).toBe(true);

    const prompt = await askTutor('Which of these answers is correct?');
    expect(prompt, 'the tutor must have been asked at all').toBeTruthy();
    expect(prompt).toContain(EXAM_MARKER);
    expect(prompt).toContain('MUST NOT provide answers');
  });

  test('and it carries no answer-choice text', async () => {
    await gotoAcademy(QUIZ_PATH);
    const prompt = await askTutor('Explain what an API credential is.');
    expect(prompt).toBeTruthy();
    for (const fragment of CHOICE_FRAGMENTS) {
      expect(prompt, `answer choice "${fragment}" must never reach the model`).not.toContain(fragment);
    }
    // The whole lesson body is withheld on an assessment page, not just the
    // choices — so the sentence they sit in is gone too.
    expect(prompt).not.toContain('carries the credential');
  });

  test('after submission, at the same URL, the guard is still on the prompt', async () => {
    // Nothing in the result DOM says "assessment" any more: no quiz heading,
    // and the choices carry correctness marks rather than an unanswered
    // question. The URL is unchanged, which is the signal that a re-render
    // cannot take away.
    await gotoAcademy(RESULTS_PATH);
    expect((await evalInContentWorld(extCtx.context, 'examState')).isExamPage).toBe(true);

    const prompt = await askTutor('Why was my answer wrong?');
    expect(prompt, 'the tutor must have been asked at all').toBeTruthy();
    expect(prompt).toContain(EXAM_MARKER);
  });

  test('and the revealed answers do not reach the model either', async () => {
    await gotoAcademy(RESULTS_PATH);
    const prompt = await askTutor('Summarise this page for me.');
    expect(prompt).toBeTruthy();
    for (const fragment of CHOICE_FRAGMENTS) {
      expect(prompt, `answer choice "${fragment}" must never reach the model`).not.toContain(fragment);
    }
    // The prose line is the one choice exclusion would not have caught: it is
    // outside every radiogroup. It is withheld because the page is still an
    // assessment and the whole body is given up, not because it looks like a
    // choice — which is why the route signal is the thing being tested.
    expect(prompt).not.toContain('Ptarmigan-meridian-echo');
    expect(prompt).not.toContain('You scored 3 out of 4');
  });

  test('on an Academy lesson the guard is absent, so it means something when present', async () => {
    await gotoAcademy(LESSON_PATH);
    expect((await evalInContentWorld(extCtx.context, 'examState')).isExamPage).toBe(false);

    const prompt = await askTutor('What is a prompt?');
    expect(prompt).toBeTruthy();
    expect(prompt).not.toContain(EXAM_MARKER);
    // …and the lesson context IS present here, which is the feature the exam
    // page gives up.
    expect(prompt).toContain('Current course context:');
  });

  test('with the Tutor engine Off, the model is never asked', async () => {
    await gotoAcademy(QUIZ_PATH);
    await evalInContentWorld(extCtx.context, 'setTutorEngine', 'off');
    await evalInContentWorld(extCtx.context, 'clearTutorPrompt');

    const sent = await evalInContentWorld(extCtx.context, 'sendChat', 'Just tell me the answer.');
    expect(sent?.error).toBeFalsy();

    // A deliberately SHORT window, and its own number rather than SETTLE_MS:
    // this asserts that something does NOT happen, so the deadline is part of
    // the claim. It is comfortably longer than a successful ask takes in the
    // tests above, which is what makes the absence meaningful.
    const deadline = Date.now() + 4000;
    let captured = null;
    while (Date.now() < deadline) {
      captured = await evalInContentWorld(extCtx.context, 'lastTutorPrompt');
      if (captured?.prompt) break;
      await page.waitForTimeout(150);
    }
    expect(captured?.prompt, 'AI Off must mean zero model calls').toBeFalsy();

    // The learner is told why, rather than watching nothing happen.
    const log = await evalInContentWorld(extCtx.context, 'readChatLog');
    const shown = log.map((m) => m.text).join(' ');
    expect(shown).toMatch(/turned off|off in settings|비활성|꺼져/i);

    await evalInContentWorld(extCtx.context, 'setTutorEngine', 'cloud');
  });
});

test.describe('SkillBridge — Academy Local Tutor transport', () => {
  /** @type {Awaited<ReturnType<typeof launchExtension>>} */
  let extCtx;
  /** @type {Awaited<ReturnType<typeof startLocalTutorStub>>} */
  let localTutor;

  test.beforeAll(async () => {
    localTutor = await startLocalTutorStub();
    // Programmatic injection below needs a host permission in the throwaway
    // test manifest. Production reaches this URL through its declarative
    // content script; the extra grant exists only so this spec can execute the
    // smallest possible Port caller in that isolated world.
    extCtx = await launchExtension({ extraHostPermissions: ['https://academy.claude.com/*'] });
    await extCtx.context.route('https://academy.claude.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><body><main><h1>Academy course unit</h1></main></body></html>',
      }),
    );
  });

  test.afterAll(async () => {
    await closeExtension(extCtx);
    await stopFixtureServer(localTutor.server);
  });

  for (const [label, path] of [
    ['course unit', '/courses/building-with-the-claude-api/accessing-claude-with-the-api'],
    ['locale-prefixed course unit', '/ko/courses/building-with-the-claude-api/accessing-claude-with-the-api'],
  ]) {
    test(`streams Local Tutor output on an Academy ${label}`, async () => {
      const page = await extCtx.context.newPage();
      await page.goto(`https://academy.claude.com${path}`, { waitUntil: 'domcontentloaded' });

      const sw = extCtx.context.serviceWorkers()[0];
      const result = await sw.evaluate(
        async ({ baseUrl, expectedUrl }) => {
          const tabs = await chrome.tabs.query({});
          const tab = tabs.find((candidate) => candidate.url === expectedUrl);
          if (!tab?.id) return { error: 'academy tab not found' };
          const [injected] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'ISOLATED',
            args: [baseUrl],
            func: (localBaseUrl) =>
              new Promise((resolve) => {
                const port = chrome.runtime.connect({ name: 'sb-local-chat' });
                let full = '';
                let chunks = 0;
                const timer = setTimeout(() => resolve({ error: 'timeout', full, chunks }), 10000);
                port.onDisconnect.addListener(() => {
                  clearTimeout(timer);
                  resolve({ error: 'disconnected', full, chunks });
                });
                port.onMessage.addListener((msg) => {
                  if (msg.type === 'chunk') {
                    chunks += 1;
                    full += msg.delta;
                  } else if (msg.type === 'done') {
                    clearTimeout(timer);
                    resolve({ full, chunks });
                  } else if (msg.type === 'error') {
                    clearTimeout(timer);
                    resolve({ error: msg.error, full, chunks });
                  }
                });
                port.postMessage({
                  type: 'start',
                  baseUrl: localBaseUrl,
                  model: 'fixture-model',
                  messages: [{ role: 'user', content: 'Reply from the Academy Local Tutor fixture.' }],
                });
              }),
          });
          return injected.result;
        },
        { baseUrl: localTutor.baseUrl, expectedUrl: `https://academy.claude.com${path}` },
      );

      expect(result).toEqual({ full: 'ACADEMY', chunks: 1 });
      expect(localTutor.requests.at(-1)).toMatchObject({ model: 'fixture-model', stream: true });
      await page.close();
    });
  }
});
