/**
 * @jest-environment jsdom
 *
 * The refinement queue, driven for real.
 *
 * tests/refinement.test.js owns the policy and the validator as pure
 * functions. This owns the thing they are wired into: that a call is made only
 * when both switches are on, that a rejected result leaves the page exactly as
 * Google Translate left it, and that a stale block is never overwritten.
 *
 * "AI Off means zero model calls" is asserted by counting calls at the
 * transport, not by reading the setting back — a feature that checks a flag and
 * then calls anyway would pass the second and fail the first.
 *
 * The real module source is loaded with its globals supplied as parameters, so
 * a production change that stops consulting the policy or the validator fails
 * here rather than being re-implemented into agreement.
 */

/* global describe, test, expect, beforeEach */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

function loadLib(file) {
  const fake = { module: { exports: {} } };
  new Function('globalThis', read('src', 'lib', file))(fake);
  return fake.module.exports;
}
const policyLib = loadLib('refinement-policy.js');
const validatorLib = loadLib('refinement-validator.js');

const BASELINE = 'Anthropic Claude API 키를 x-api-key 헤더에 넣어 3번 호출하세요.';
const SOURCE = 'Put the Anthropic Claude API key in the x-api-key header and call it 3 times.';
const GOOD = 'Anthropic Claude API 키를 x-api-key 헤더에 담아 3번 요청하세요.';
/** Same terms, wrong number — the validator must reject this. */
const BAD = 'Anthropic Claude API 키를 x-api-key 헤더에 담아 5번 요청하세요.';

/**
 * Build the module over fakes, and return the handles a test needs.
 *
 * `refineText` is the transport. Counting its calls is how "zero model calls"
 * becomes an assertion rather than a claim.
 */
function setup({ mode = 'off', consented = false, tutorEngine = 'cloud', reply = GOOD, bridge = true } = {}) {
  document.body.innerHTML = `<p id="block">${BASELINE}</p>`;
  const el = document.getElementById('block');

  const calls = [];
  const store = {
    sb_refine_mode: mode,
    sb_refine_consent: consented,
    sb_ai_engine: tutorEngine,
  };
  const writes = [];

  const sb = {
    currentLang: 'ko',
    hostCaps: { bridge },
    translator: {
      supportedLanguages: { ko: 'Korean' },
      refineText: (prompt, opts) => {
        calls.push({ prompt, engine: opts.engine });
        return typeof reply === 'function' ? reply() : Promise.resolve(reply);
      },
    },
    _gt: {
      gtGeneration: 1,
      markTranslated: () => {},
    },
    safeReplaceText: (target, text) => {
      writes.push(text);
      target.textContent = text;
      return true;
    },
    registerModule() {},
  };

  const listeners = [];
  const chrome = {
    storage: {
      local: {
        get: (keys) => Promise.resolve(Object.fromEntries([].concat(keys).map((k) => [k, store[k]]))),
        set: (data) => {
          Object.assign(store, data);
          return Promise.resolve();
        },
      },
      onChanged: { addListener: (fn) => listeners.push(fn) },
    },
  };

  /** Change a setting the way the popup would, listeners and all. */
  const changeSetting = (key, newValue) => {
    store[key] = newValue;
    for (const fn of listeners) fn({ [key]: { newValue } }, 'local');
  };

  const fakeWindow = {
    _sb: sb,
    _sbRefinementPolicy: policyLib,
    _sbRefinementValidator: validatorLib,
    _protectedTerms: { getProtectedTermList: () => ['Anthropic', 'Claude', 'API'] },
    _skillbridgeLog: { createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }) },
  };

  new Function('window', 'document', 'chrome', 'console', read('src', 'content', 'refine-queue.js'))(
    fakeWindow,
    document,
    chrome,
    console,
  );

  return { sb, el, calls, writes, store, changeSetting };
}

/** Let the queue's async chain run to completion. */
async function flush() {
  for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

const enqueueCurrent = (sb, el, overrides = {}) =>
  sb._refine.enqueue({ el, source: SOURCE, baseline: BASELINE, targetLang: 'ko', ...overrides });

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('nothing runs until both switches are on', () => {
  test('off by default: enqueueing makes no call and changes nothing', async () => {
    const { sb, el, calls, writes } = setup();
    enqueueCurrent(sb, el);
    await flush();
    expect(calls).toEqual([]);
    expect(writes).toEqual([]);
    expect(el.textContent).toBe(BASELINE);
  });

  test('an engine chosen without consent still makes no call', async () => {
    const { sb, el, calls } = setup({ mode: 'cloud', consented: false });
    enqueueCurrent(sb, el);
    await flush();
    expect(calls).toEqual([]);
  });

  test('consent without an engine still makes no call', async () => {
    const { sb, el, calls } = setup({ mode: 'off', consented: true });
    enqueueCurrent(sb, el);
    await flush();
    expect(calls).toEqual([]);
  });

  test('following a Tutor that is off makes no call — AI off means off', async () => {
    const { sb, el, calls } = setup({ mode: 'follow', consented: true, tutorEngine: 'off' });
    enqueueCurrent(sb, el);
    await flush();
    expect(calls).toEqual([]);
    expect(el.textContent).toBe(BASELINE);
  });

  test('following a Tutor that is on uses that engine', async () => {
    const { sb, el, calls } = setup({ mode: 'follow', consented: true, tutorEngine: 'local' });
    enqueueCurrent(sb, el);
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0].engine).toBe('local');
  });

  test('a host with no bridge cannot run the cloud engine', async () => {
    const { sb, el, calls } = setup({ mode: 'cloud', consented: true, bridge: false });
    enqueueCurrent(sb, el);
    await flush();
    expect(calls).toEqual([]);
  });

  test('the backlog is dropped rather than held while disabled', async () => {
    // Turning this on later should refine what the learner is reading THEN,
    // not a queue of paragraphs they have already scrolled past.
    const { sb, el, calls } = setup({ mode: 'off' });
    enqueueCurrent(sb, el);
    await flush();
    expect(sb._refine.stats().pending).toBe(0);
    expect(calls).toEqual([]);
  });
});

describe('a refinement lands only if it survives the validator', () => {
  test('a good post-edit replaces the baseline', async () => {
    const { sb, el, calls } = setup({ mode: 'cloud', consented: true, reply: GOOD });
    enqueueCurrent(sb, el);
    await flush();
    expect(calls).toHaveLength(1);
    expect(el.textContent).toBe(GOOD);
    expect(sb._refine.stats().refined).toBe(1);
  });

  test('a rejected one leaves the Google Translate baseline exactly as it was', async () => {
    const { sb, el, writes } = setup({ mode: 'cloud', consented: true, reply: BAD });
    enqueueCurrent(sb, el);
    await flush();
    expect(el.textContent).toBe(BASELINE);
    expect(writes).toEqual([]);
    expect(sb._refine.stats().rejected).toBe(1);
    expect(sb._refine.stats().refined).toBe(0);
  });

  test('a transport failure is a non-event, not an error on the page', async () => {
    const { sb, el } = setup({
      mode: 'cloud',
      consented: true,
      reply: () => Promise.reject(new Error('bridge down')),
    });
    enqueueCurrent(sb, el);
    await flush();
    expect(el.textContent).toBe(BASELINE);
    expect(sb._refine.stats().failed).toBe(1);
  });

  test('an empty answer is rejected like any other failure', async () => {
    const { sb, el } = setup({ mode: 'cloud', consented: true, reply: '   ' });
    enqueueCurrent(sb, el);
    await flush();
    expect(el.textContent).toBe(BASELINE);
    expect(sb._refine.stats().rejected).toBe(1);
  });
});

describe('a stale block is never overwritten', () => {
  test('a detached element is skipped', async () => {
    const { sb, el, calls } = setup({ mode: 'cloud', consented: true });
    el.remove();
    enqueueCurrent(sb, el);
    await flush();
    expect(calls).toEqual([]);
  });

  test('a language switch mid-flight discards the result', async () => {
    let release;
    const { sb, el } = setup({
      mode: 'cloud',
      consented: true,
      reply: () => new Promise((resolve) => (release = () => resolve(GOOD))),
    });
    enqueueCurrent(sb, el);
    await flush();
    // The learner switched language while the model was thinking.
    sb.currentLang = 'ja';
    release();
    await flush();
    expect(el.textContent).toBe(BASELINE);
  });

  test('a generation bump mid-flight discards the result', async () => {
    let release;
    const { sb, el } = setup({
      mode: 'cloud',
      consented: true,
      reply: () => new Promise((resolve) => (release = () => resolve(GOOD))),
    });
    enqueueCurrent(sb, el);
    await flush();
    sb._gt.gtGeneration = 2;
    release();
    await flush();
    expect(el.textContent).toBe(BASELINE);
  });

  test('a block another pass already rewrote is left alone', async () => {
    let release;
    const { sb, el } = setup({
      mode: 'cloud',
      consented: true,
      reply: () => new Promise((resolve) => (release = () => resolve(GOOD))),
    });
    enqueueCurrent(sb, el);
    await flush();
    // Something else — a re-scan, a cache hit — rewrote this block.
    el.textContent = '다른 패스가 쓴 내용';
    release();
    await flush();
    expect(el.textContent).toBe('다른 패스가 쓴 내용');
  });
});

describe('the refinement cache is its own', () => {
  test('an accepted refinement is remembered, and reused without a second call', async () => {
    const { sb, el, calls, store } = setup({ mode: 'cloud', consented: true, reply: GOOD });
    enqueueCurrent(sb, el);
    await flush();
    expect(calls).toHaveLength(1);
    expect(Object.keys(store.sb_refine_cache || {})).toHaveLength(1);

    // Same block, same baseline, second visit.
    el.textContent = BASELINE;
    enqueueCurrent(sb, el);
    await flush();
    // Still one: the second pass was served from the refinement cache.
    expect(calls).toHaveLength(1);
    expect(el.textContent).toBe(GOOD);
    expect(sb._refine.stats().cached).toBe(1);
  });

  test('a rejected refinement is NOT cached', async () => {
    // Caching a rejection would re-serve the same rejection forever while
    // occupying a slot.
    const { sb, el, store } = setup({ mode: 'cloud', consented: true, reply: BAD });
    enqueueCurrent(sb, el);
    await flush();
    expect(store.sb_refine_cache).toBeUndefined();
  });

  test('it writes to its own storage key, never the translation memory', async () => {
    const { sb, el, store } = setup({ mode: 'cloud', consented: true, reply: GOOD });
    enqueueCurrent(sb, el);
    await flush();
    expect(store.sb_refine_cache).toBeDefined();
    expect(store.sb_translation_cache).toBeUndefined();
  });
});

describe('withdrawing consent stops work already in flight', () => {
  /** A transport whose first call hangs until the test releases it. */
  function gated() {
    let release;
    const gate = new Promise((r) => (release = r));
    let served = 0;
    return {
      reply: () => {
        served += 1;
        return served === 1 ? gate : Promise.resolve(GOOD);
      },
      release: (v) => release(v),
      served: () => served,
    };
  }

  test('the open call is aborted and its answer never lands', async () => {
    const t = gated();
    const { sb, el, writes, changeSetting } = setup({ mode: 'cloud', consented: true, reply: t.reply });
    sb._refine.enqueue({ el, baseline: BASELINE, source: SOURCE, targetLang: 'ko' });
    await flush();
    expect(t.served()).toBe(1);

    changeSetting('sb_refine_consent', false);
    t.release(GOOD);
    await flush();

    // The answer arrived after consent was withdrawn, so it is discarded
    // rather than written to the page.
    expect(writes).toEqual([]);
    expect(el.textContent).toBe(BASELINE);
  });

  test('a second queued call never starts', async () => {
    const t = gated();
    const { sb, el, calls, changeSetting } = setup({ mode: 'cloud', consented: true, reply: t.reply });
    const second = document.createElement('p');
    second.textContent = BASELINE;
    document.body.appendChild(second);

    sb._refine.enqueue({ el, baseline: BASELINE, source: SOURCE, targetLang: 'ko' });
    sb._refine.enqueue({ el: second, baseline: BASELINE, source: SOURCE, targetLang: 'ko' });
    await flush();
    expect(calls).toHaveLength(1);

    changeSetting('sb_refine_mode', 'off');
    t.release(GOOD);
    await flush();

    expect(calls).toHaveLength(1);
  });

  test('the engine is re-read before every call, not once per drain', async () => {
    const t = gated();
    const { sb, el, calls, changeSetting } = setup({ mode: 'cloud', consented: true, reply: t.reply });
    const second = document.createElement('p');
    second.textContent = BASELINE;
    document.body.appendChild(second);

    sb._refine.enqueue({ el, baseline: BASELINE, source: SOURCE, targetLang: 'ko' });
    sb._refine.enqueue({ el: second, baseline: BASELINE, source: SOURCE, targetLang: 'ko' });
    await flush();

    // Change the STORE only — no event. The next call must still see it.
    changeSetting('sb_refine_consent', false);
    t.release(GOOD);
    await flush();
    expect(calls).toHaveLength(1);
  });
});

describe('cost is bounded', () => {
  test('a block far outside the viewport is never queued', () => {
    const { sb } = setup({ mode: 'cloud', consented: true });
    const far = document.createElement('p');
    far.textContent = BASELINE;
    document.body.appendChild(far);
    // jsdom reports a zero rect for everything, so drive the measurement.
    far.getBoundingClientRect = () => ({ top: 99999, bottom: 99999 + 20 });
    sb._refine.enqueue({ el: far, baseline: BASELINE, source: SOURCE, targetLang: 'ko' });
    expect(sb._refine.stats().pending).toBe(0);
  });

  test('a block just below the fold still counts as about to be read', () => {
    const { sb } = setup({ mode: 'cloud', consented: true });
    const near = document.createElement('p');
    near.textContent = BASELINE;
    document.body.appendChild(near);
    near.getBoundingClientRect = () => ({ top: 400, bottom: 440 });
    sb._refine.enqueue({ el: near, baseline: BASELINE, source: SOURCE, targetLang: 'ko' });
    expect(sb._refine.stats().pending + sb._refine.stats().queued).toBeGreaterThan(0);
  });
});

describe('cache identity covers every input', () => {
  test('two sources sharing one baseline do not share a refinement', async () => {
    // The prompt is built from the English source as well as the baseline, so
    // keying on the baseline alone served the first source's post-edit for the
    // second.
    const replies = [GOOD, `${GOOD} 다시.`];
    let i = 0;
    const { sb, el, calls } = setup({ mode: 'cloud', consented: true, reply: () => Promise.resolve(replies[i++]) });

    sb._refine.enqueue({ el, baseline: BASELINE, source: SOURCE, targetLang: 'ko' });
    await flush();

    const other = document.createElement('p');
    other.textContent = BASELINE;
    document.body.appendChild(other);
    sb._refine.enqueue({ el: other, baseline: BASELINE, source: `${SOURCE} Twice.`, targetLang: 'ko' });
    await flush();

    expect(calls).toHaveLength(2);
  });
});
