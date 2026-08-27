/**
 * The Phase 1 harness has to say WHY a row is unusable.
 *
 * These failures are not the same finding and must not be read as one. A rate
 * limit says nothing about translation quality; a malformed response says the
 * endpoint changed; a failed unmask says OUR pipeline lost a protected term.
 * An earlier version returned a bare null for both an empty translation and a
 * failed unmask, so a run could not tell a pipeline bug from a quiet endpoint
 * — which matters because the experiment is currently blocked on HTTP 429 and
 * will be re-run, unchanged, whenever that lifts.
 */

/* global describe, test, expect, beforeEach, afterEach */

const { translateOnce, RESULT_KIND } = require('../scripts/run-gt-title-experiment');

/** A protected-term stub that masks nothing unless a test asks it to. */
const passthrough = (over = {}) => ({
  maskProtectedTerms: () => ({ text: 'Making a request', tokens: [] }),
  unmaskProtectedTerms: (t) => t,
  ...over,
});

const jsonResponse = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

let originalFetch;
beforeEach(() => {
  originalFetch = global.fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
});

describe('translateOnce failure classification', () => {
  test('a successful translation is ok and carries the text', async () => {
    global.fetch = async () => jsonResponse([[['요청 만들기', 'Making a request']]]);
    const r = await translateOnce('Making a request', 'ko', passthrough());
    expect(r.kind).toBe(RESULT_KIND.OK);
    expect(r.text).toBe('요청 만들기');
  });

  test('HTTP 429 is named, not lumped with other HTTP errors', async () => {
    // The one failure that means "come back later" rather than "the code is
    // wrong", and the one currently blocking this experiment.
    global.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
    const r = await translateOnce('x', 'ko', passthrough());
    expect(r.kind).toBe(RESULT_KIND.RATE_LIMITED);
    expect(r.text).toBeNull();
  });

  test('another HTTP status is a different kind', async () => {
    global.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
    const r = await translateOnce('x', 'ko', passthrough());
    expect(r.kind).toBe(RESULT_KIND.HTTP_ERROR);
    expect(r.detail).toContain('503');
  });

  test('a request that never got an answer is a network failure', async () => {
    global.fetch = async () => {
      throw new TypeError('fetch failed');
    };
    const r = await translateOnce('x', 'ko', passthrough());
    expect(r.kind).toBe(RESULT_KIND.NETWORK);
  });

  test('a 200 that is not the documented JSON shape is malformed, not empty', async () => {
    // An interstitial or a consent wall answers 200 with HTML.
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    });
    const r = await translateOnce('x', 'ko', passthrough());
    expect(r.kind).toBe(RESULT_KIND.MALFORMED_RESPONSE);
  });

  test('JSON that parses but has the wrong shape is malformed, not empty', async () => {
    // The endpoint answers `[[[translated, source, …], …], …]`. Everything
    // below parses cleanly and is still not that, so scoring any of them as an
    // empty translation would blame Google for a contract change — and `[{}]`
    // would previously have thrown inside the harness and been recorded as the
    // harness's own bug.
    for (const body of [{}, [], [{}], { 0: [['x']] }, [null], ['not-an-array']]) {
      global.fetch = async () => jsonResponse(body);
      const r = await translateOnce('x', 'ko', passthrough());
      expect(r.kind).toBe(RESULT_KIND.MALFORMED_RESPONSE);
      expect(r.text).toBeNull();
    }
  });

  test('a non-string translated field is malformed, not a translation', async () => {
    // The gap a segment-is-an-array check leaves open. Each of these survives
    // that check and then coerces through `seg[0] || ''` into something that
    // reads like a translation — "[object Object]" and "42" would have been
    // graded as real output.
    for (const body of [[[[{}, 'source']]], [[[42, 'source']]], [[[null, 'source']]], [[[undefined, 'source']]]]) {
      global.fetch = async () => jsonResponse(body);
      const r = await translateOnce('x', 'ko', passthrough());
      expect(r.kind).toBe(RESULT_KIND.MALFORMED_RESPONSE);
      expect(r.text).toBeNull();
    }
  });

  test('an object or number never coerces into a candidate', async () => {
    // Stated as the property rather than the mechanism: whatever the field
    // holds, nothing that is not a string may reach gtCandidate.
    global.fetch = async () => jsonResponse([[[{}, 'source']]]);
    const r = await translateOnce('x', 'ko', passthrough());
    expect(r.text).not.toBe('[object Object]');
    expect(r.kind).not.toBe(RESULT_KIND.OK);
  });

  test('an empty string is a well-formed response, not a malformed one', async () => {
    // The boundary the string check must not overshoot.
    global.fetch = async () => jsonResponse([[['', 'source']]]);
    const r = await translateOnce('x', 'ko', passthrough());
    expect(r.kind).toBe(RESULT_KIND.EMPTY_TRANSLATION);
  });

  test('a wrong shape is never confused with an empty translation', async () => {
    global.fetch = async () => jsonResponse([]);
    const wrongShape = await translateOnce('x', 'ko', passthrough());
    global.fetch = async () => jsonResponse([[['', '']]]);
    const empty = await translateOnce('x', 'ko', passthrough());
    expect(wrongShape.kind).toBe(RESULT_KIND.MALFORMED_RESPONSE);
    expect(empty.kind).toBe(RESULT_KIND.EMPTY_TRANSLATION);
    expect(wrongShape.kind).not.toBe(empty.kind);
  });

  test('a multi-segment response is still joined correctly', async () => {
    // The shape check must not reject the legitimate multi-segment form.
    global.fetch = async () =>
      jsonResponse([
        [
          ['첫 번째 ', 'first '],
          ['두 번째', 'second'],
        ],
      ]);
    const r = await translateOnce('x', 'ko', passthrough());
    expect(r.kind).toBe(RESULT_KIND.OK);
    expect(r.text).toBe('첫 번째 두 번째');
  });

  test('an empty translation and a failed unmask are told apart', async () => {
    // Both used to be a bare null. One blames Google, the other blames us.
    global.fetch = async () => jsonResponse([[['', '']]]);
    const empty = await translateOnce('x', 'ko', passthrough());
    expect(empty.kind).toBe(RESULT_KIND.EMPTY_TRANSLATION);

    global.fetch = async () => jsonResponse([[['번역됨', 'translated']]]);
    const unmaskFailed = await translateOnce(
      'x',
      'ko',
      passthrough({
        maskProtectedTerms: () => ({ text: 'x', tokens: ['TOKEN0'] }),
        unmaskProtectedTerms: () => null,
      }),
    );
    expect(unmaskFailed.kind).toBe(RESULT_KIND.UNMASK_FAILED);
    expect(unmaskFailed.kind).not.toBe(empty.kind);
  });

  test('no failure is ever reported as a usable candidate', async () => {
    // The property that keeps a blocked run from looking like a quality result.
    const failures = [
      async () => ({ ok: false, status: 429, json: async () => ({}) }),
      async () => ({ ok: false, status: 500, json: async () => ({}) }),
      async () => jsonResponse([[['', '']]]),
    ];
    for (const f of failures) {
      global.fetch = f;
      const r = await translateOnce('x', 'ko', passthrough());
      expect(r.kind).not.toBe(RESULT_KIND.OK);
      expect(r.text).toBeNull();
    }
  });
});
