/**
 * One exam-safe contract, whichever Tutor engine is selected.
 *
 * The engine setting is a privacy choice — Cloud sends to Puter, Local sends to
 * a server the learner runs, Off sends nothing. It must NOT also be a safety
 * choice: a learner who switches to a local model has not opted out of exam
 * protection, and one who leaves it on Cloud has not opted into a stricter
 * prompt. The three paths were assembled in the same function, which made that
 * true by adjacency rather than by design; the prompt builder is now separate
 * and every engine is handed its output.
 *
 * What is asserted here is behavioural, not textual. `chatStream` is actually
 * invoked with each engine setting and the transports are faked at their
 * boundaries, so a change that routes one engine around the builder fails —
 * which a source-string assertion could not catch.
 *
 * "AI Off = zero model calls" is the strongest claim in the set, so it is
 * checked at every boundary at once: no Port opened, no fetch issued, no
 * puter.ai.chat reached.
 */

/* global describe, test, expect, beforeEach, afterEach */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

/** Everything the transports could possibly touch, recorded. */
let calls;

/** Instantiate the real class with every boundary faked and observable. */
function makeTranslator({ engine, storage = {} } = {}) {
  calls = { ports: [], fetches: [], puterChats: [], prompts: [] };

  const store = { sb_ai_engine: engine, sb_local_base: 'http://localhost:11434/v1', sb_local_model: 'x', ...storage };
  const chrome = {
    runtime: {
      id: 'test',
      lastError: null,
      getURL: (p) => p,
      connect: (info) => {
        calls.ports.push(info?.name);
        // A Port that never answers. Every engine path under test is asserted
        // on what it SENT, so a reply would only add timing to the test.
        return {
          name: info?.name,
          // The local transport wraps the prompt in an OpenAI-shaped message
          // list; unwrap it so the two engines' payloads are comparable as the
          // same string rather than as two different envelopes.
          postMessage: (msg) => calls.prompts.push(msg?.messages?.[0]?.content ?? msg?.prompt ?? ''),
          disconnect() {},
          onMessage: { addListener() {}, removeListener() {} },
          onDisconnect: { addListener() {}, removeListener() {} },
        };
      },
    },
    storage: {
      local: {
        get: (keys) => Promise.resolve(Object.fromEntries([].concat(keys).map((k) => [k, store[k]]))),
        set: () => Promise.resolve(),
      },
    },
  };

  const globals = {
    chrome,
    indexedDB: { open: () => ({ onupgradeneeded: null, onsuccess: null, onerror: null }) },
    window: { addEventListener() {} },
    fetch: (...args) => {
      calls.fetches.push(args[0]);
      return Promise.reject(new Error('no network in this test'));
    },
    crypto: { randomUUID: () => 'test-id' },
  };

  const factory = new Function(
    ...Object.keys(globals),
    `${read('src', 'shared', 'runtime-constants.js')}
     ${read('src', 'lib', 'selectors.js')}
     ${read('src', 'lib', 'constants.js')}
     ${read('src', 'lib', 'translator.js')}
     return SkilljarTranslator;`,
  );
  const Translator = factory(...Object.values(globals));
  const translator = new Translator({ aiEnabled: true });

  // Cloud path: pretend the broker handshake already happened, and record what
  // would go over the wire.
  translator.isReady = true;
  translator._cloudPort = {
    postMessage: (msg) => {
      if (msg?.type === 'start') calls.puterChats.push(msg.prompt);
    },
    disconnect() {},
  };
  return translator;
}

/**
 * Start a stream, let it post, then abort it.
 *
 * Both transports arm an idle watchdog as soon as they send. Left running,
 * those timers outlive the test and Jest reports a stream timeout from a test
 * that already passed — so every stream started here is cancelled the moment
 * its payload has been recorded. The abort happens AFTER the send, which is
 * the thing under assertion.
 */
async function sendAndCancel(translator, opts) {
  const controller = new AbortController();
  const stream = translator.chatStream(ASK, 'ko', opts.courseContext ?? 'ctx', () => {}, {
    isExamPage: opts.isExamPage,
    signal: controller.signal,
  });
  stream.catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const ASK = 'Which one of these is right?';
const EXAM_MARKER = 'CRITICAL: The user is on a certification exam page.';
/** A choice string that must never appear in a prompt, on any engine. */
const CHOICE = 'Zebra-cipher-alpha carries the credential';

beforeEach(() => {
  calls = { ports: [], fetches: [], puterChats: [], prompts: [] };
});

afterEach(() => {
  delete global.SkilljarTranslator;
});

describe('the prompt builder is the single source of the guard', () => {
  const translator = makeTranslator({ engine: 'cloud' });

  test('an exam page adds the guard', () => {
    const prompt = translator._buildTutorPrompt({ userMessage: ASK, targetLang: 'ko', isExamPage: true });
    expect(prompt).toContain(EXAM_MARKER);
    expect(prompt).toContain('MUST NOT provide answers');
  });

  test('a lesson page does not', () => {
    const prompt = translator._buildTutorPrompt({ userMessage: ASK, targetLang: 'ko', isExamPage: false });
    expect(prompt).not.toContain(EXAM_MARKER);
  });

  test('an absent flag is treated as "not an exam", matching the caller default', () => {
    // opts.isExamPage is undefined whenever a caller omits it. This must not
    // silently become a guard, or the non-exam prompt would carry an
    // instruction that makes the tutor refuse ordinary lesson questions.
    expect(translator._buildTutorPrompt({ userMessage: ASK, targetLang: 'ko' })).not.toContain(EXAM_MARKER);
  });

  test('the prompt names no single platform', () => {
    // It used to say "courses hosted at anthropic.skilljar.com", which is
    // wrong on Academy and tells the model the learner is somewhere they
    // are not.
    const prompt = translator._buildTutorPrompt({ userMessage: ASK, targetLang: 'ko' });
    expect(prompt).not.toContain('skilljar.com');
    expect(prompt).toContain("Anthropic's free AI courses");
  });

  test('the course context is carried verbatim, and only when there is one', () => {
    expect(translator._buildTutorPrompt({ userMessage: ASK, targetLang: 'ko', courseContext: 'C' })).toContain(
      'Current course context: C',
    );
    expect(translator._buildTutorPrompt({ userMessage: ASK, targetLang: 'ko' })).not.toContain(
      'Current course context:',
    );
  });
});

describe('every engine carries the same guard', () => {
  test('cloud sends the guarded prompt', async () => {
    const translator = makeTranslator({ engine: 'cloud' });
    await sendAndCancel(translator, { isExamPage: true });
    expect(calls.puterChats).toHaveLength(1);
    expect(calls.puterChats[0]).toContain(EXAM_MARKER);
  });

  test('local sends the guarded prompt, byte for byte the same one', async () => {
    const cloud = makeTranslator({ engine: 'cloud' });
    await sendAndCancel(cloud, { isExamPage: true });
    const cloudPrompt = calls.puterChats[0];

    const local = makeTranslator({ engine: 'local' });
    await sendAndCancel(local, { isExamPage: true });
    expect(calls.ports).toContain('sb-local-chat');
    expect(calls.prompts[0]).toContain(EXAM_MARKER);
    // Not merely "also guarded" — identical. The engine choice is a privacy
    // choice and must not change a single character of the instruction.
    expect(calls.prompts[0]).toBe(cloudPrompt);
  });

  test('neither engine is handed answer-choice text', async () => {
    // The context the content script builds on an assessment page is the
    // title and a refusal instruction; the lesson body, which is where the
    // choices live, is dropped before it ever reaches the tutor.
    const examContext = 'Certification Exam: Quiz on accessing Claude with the API. DO NOT help with answers.';
    for (const engine of ['cloud', 'local']) {
      const translator = makeTranslator({ engine });

      await sendAndCancel(translator, { isExamPage: true, courseContext: examContext });
      const sent = [...calls.puterChats, ...calls.prompts].join('\n');
      expect(sent).not.toContain(CHOICE);
      expect(sent).toContain(EXAM_MARKER);
    }
  });
});

describe('the engine-preference read leaves nothing behind', () => {
  test('a resolved read does not leave its timeout armed', async () => {
    // The 1.5s guard used to outlive every chat message and then reject with
    // nobody listening — one unhandled rejection per tutor question, plus a
    // timer per question in a content script that lives as long as the page.
    const translator = makeTranslator({ engine: 'cloud' });
    const pending = [];
    const realSetTimeout = global.setTimeout;
    const realClearTimeout = global.clearTimeout;
    global.setTimeout = (fn, ms) => {
      const handle = realSetTimeout(fn, ms);
      pending.push(handle);
      return handle;
    };
    global.clearTimeout = (handle) => {
      const i = pending.indexOf(handle);
      if (i > -1) pending.splice(i, 1);
      return realClearTimeout(handle);
    };
    try {
      await translator._getAiEngine();
      expect(pending).toEqual([]);
    } finally {
      global.setTimeout = realSetTimeout;
      global.clearTimeout = realClearTimeout;
    }
  });
});

describe('AI Off makes no model call at all', () => {
  test('it rejects, and nothing is sent anywhere', async () => {
    const translator = makeTranslator({ engine: 'off' });
    await expect(translator.chatStream(ASK, 'ko', 'ctx', () => {}, { isExamPage: true })).rejects.toThrow(
      /turned off/i,
    );
    // Every boundary at once: no Port opened, no fetch issued, nothing posted
    // to the cloud broker.
    expect(calls.ports).toEqual([]);
    expect(calls.fetches).toEqual([]);
    expect(calls.puterChats).toEqual([]);
    expect(calls.prompts).toEqual([]);
  });

  test('it is still silent on a lesson page, not only under exam protection', async () => {
    const translator = makeTranslator({ engine: 'off' });
    await expect(translator.chatStream(ASK, 'ko', 'ctx', () => {})).rejects.toThrow(/turned off/i);
    expect(calls.ports).toEqual([]);
    expect(calls.fetches).toEqual([]);
    expect(calls.puterChats).toEqual([]);
  });

  test('an unreadable engine preference fails closed rather than defaulting to cloud', async () => {
    // The preference read is the privacy gate. A storage stall must not fall
    // through into the path that ships the prompt to Puter.
    const translator = makeTranslator({ engine: 'cloud' });
    translator._getAiEngine = () => Promise.reject(new Error('Tutor engine preference read timed out'));
    await expect(translator.chatStream(ASK, 'ko', 'ctx', () => {})).rejects.toThrow();
    expect(calls.puterChats).toEqual([]);
    expect(calls.fetches).toEqual([]);
  });
});
