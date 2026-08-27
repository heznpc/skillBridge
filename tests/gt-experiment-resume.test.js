/**
 * Resuming a throttled Phase 1 run is a quality-evidence path, not a convenience.
 *
 * Whatever a resume carries goes into the dataset that decides whether GT is
 * good enough for Academy's English residue. So the rules that decide what is
 * carried, what is re-requested, and what is recomputed are the feature, and
 * they are asserted here against the SHIPPED loop — `runExperiment` with its
 * network injected — rather than against a local re-implementation of the
 * selection rule. A test that re-derives the rule it is checking passes
 * whether or not the harness agrees with it.
 */

/* global describe, test, expect, jest */

const {
  RESULT_KIND,
  SCHEMA_VERSION,
  rowKey,
  carryableRows,
  readResumeRun,
  recheckCarriedRow,
  droppedCarriedKeys,
  duplicateTitles,
  usableLocales,
  runExperiment,
} = require('../scripts/run-gt-title-experiment');

const fs = require('fs');
const os = require('os');
const path = require('path');

/** A prior run in the shape the harness writes. */
const priorRun = (records, over = {}) => ({
  schemaVersion: SCHEMA_VERSION,
  generatedAt: '2026-08-27T10:40:03.656Z',
  titleCount: 76,
  records,
  ...over,
});

const okRow = (over = {}) => ({
  source: 'Making a request',
  locale: 'ko',
  gtCandidate: '요청하기',
  violations: { protectedTerm: false, numberOrUnit: false, productName: false, meaning: false },
  measurable: true,
  grade: null,
  evaluatorConfidence: null,
  rationale: null,
  resultKind: RESULT_KIND.OK,
  ...over,
});

/** The parts of the outside world runExperiment needs, all inert. */
const harness = (over = {}) => ({
  titles: ['Making a request'],
  locales: ['ko'],
  carried: new Map(),
  protectedTermsFor: () => ({ pt: {}, protectedTerms: [] }),
  translate: async () => ({ kind: RESULT_KIND.OK, text: 'fresh', detail: null }),
  persist: async () => {},
  sleep: async () => {},
  log: () => {},
  ...over,
});

describe('what a resume carries', () => {
  test('only a usable row is carried', () => {
    const carried = carryableRows(
      priorRun([okRow(), okRow({ source: 'Temperature', gtCandidate: '', resultKind: RESULT_KIND.RATE_LIMITED })]),
    );
    expect(carried.size).toBe(1);
    expect([...carried.keys()]).toEqual([rowKey('ko', 'Making a request')]);
  });

  test('every unusable kind is re-requested, including our own pipeline failing', () => {
    // unmask-failed is SkillBridge losing a protected term. Carrying it would
    // freeze that bug into the graded dataset instead of retrying it under
    // whatever the pipeline does now.
    const unusable = [
      RESULT_KIND.RATE_LIMITED,
      RESULT_KIND.HTTP_ERROR,
      RESULT_KIND.NETWORK,
      RESULT_KIND.MALFORMED_RESPONSE,
      RESULT_KIND.EMPTY_TRANSLATION,
      RESULT_KIND.UNMASK_FAILED,
      RESULT_KIND.HARNESS_ERROR,
    ];
    const carried = carryableRows(
      priorRun(unusable.map((kind, i) => okRow({ source: `t${i}`, gtCandidate: '', resultKind: kind }))),
    );
    expect(carried.size).toBe(0);
  });

  test('the same title in another locale is a different row', () => {
    const carried = carryableRows(priorRun([okRow(), okRow({ locale: 'ja', gtCandidate: 'リクエスト' })]));
    expect(carried.size).toBe(2);
    expect(carried.get(rowKey('ja', 'Making a request')).gtCandidate).toBe('リクエスト');
  });

  test('a locale and a source cannot be confused for one another', () => {
    // Concatenating the two without a separator that cannot occur in either
    // would let a contrived locale/source pair collide.
    const carried = carryableRows(
      priorRun([okRow({ locale: 'ko', source: 'X' }), okRow({ locale: 'koX', source: '' })]),
    );
    expect(carried.size).toBe(2);
  });

  test('a row whose source text changed is not carried', () => {
    // Identity is the exact source string, so an edited title is a new row and
    // gets re-requested rather than inheriting the old translation.
    const carried = carryableRows(priorRun([okRow({ source: 'Making a request ' })]));
    expect(carried.has(rowKey('ko', 'Making a request'))).toBe(false);
  });
});

describe('trusting a snapshot', () => {
  test('a snapshot from an unknown schema version is refused, not read', () => {
    expect(() => carryableRows(priorRun([okRow()], { schemaVersion: 99 }))).toThrow(/schemaVersion/);
  });

  test('the schema version this dataset was collected under is still resumable', () => {
    // The ko/ja rows in hand were written as schemaVersion 1. Refusing them
    // would throw away the only usable rows the resume exists to carry.
    const carried = carryableRows(priorRun([okRow()], { schemaVersion: 1 }));
    expect(carried.size).toBe(1);
  });

  test('a file that is not a run at all is refused', () => {
    expect(() => carryableRows({ records: [okRow()] })).toThrow(/schemaVersion/);
    expect(() => carryableRows(null)).toThrow();
  });

  test('reading a run records where it came from', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-resume-'));
    const p = path.join(dir, 'run.json');
    fs.writeFileSync(p, JSON.stringify(priorRun([okRow()])));
    const { provenance, carried } = readResumeRun(p);
    expect(carried.size).toBe(1);
    expect(provenance).toMatchObject({ schemaVersion: SCHEMA_VERSION, generatedAt: '2026-08-27T10:40:03.656Z' });
    expect(provenance.path).toContain('run.json');
    expect(provenance.carriedRows).toBe(1);
  });
});

describe('a carried row under the current pipeline', () => {
  test('deterministic violations are recomputed, not inherited', () => {
    // The carried row says the brand survived. Under the dictionary this run
    // actually loaded, it did not — and the snapshot must not be believed over
    // the code.
    const stale = okRow({
      source: 'Claude and the API',
      gtCandidate: '클로드와 API',
      violations: {
        protectedTerm: false,
        numberOrUnit: false,
        productName: false,
        meaning: false,
      },
    });
    const fresh = recheckCarriedRow(stale, ['Claude']);
    expect(fresh.violations.protectedTerm).toBe(true);
    expect(fresh.violations.productName).toBe(true);
  });

  test('a recomputation that disagrees with the snapshot is recorded, not silently applied', () => {
    const stale = okRow({ source: 'Claude', gtCandidate: '클로드' });
    const fresh = recheckCarriedRow(stale, ['Claude']);
    expect(fresh.violationsDrifted).toBe(true);
    expect(fresh.carriedViolations).toEqual(stale.violations);
  });

  test('a recomputation that agrees leaves no drift marker', () => {
    const fresh = recheckCarriedRow(okRow(), []);
    expect(fresh.violationsDrifted).toBeUndefined();
    expect(fresh.carriedViolations).toBeUndefined();
  });

  test('a human grade survives, because the candidate it was given for is unchanged', () => {
    const graded = okRow({ grade: 'B', evaluatorConfidence: 'high', rationale: 'slightly stiff' });
    const fresh = recheckCarriedRow(graded, []);
    expect(fresh.grade).toBe('B');
    expect(fresh.evaluatorConfidence).toBe('high');
    expect(fresh.rationale).toBe('slightly stiff');
    expect(fresh.gtCandidate).toBe(graded.gtCandidate);
  });

  test('a meaning judgement is a human field and is never recomputed away', () => {
    const judged = okRow({
      violations: { protectedTerm: false, numberOrUnit: false, productName: false, meaning: true },
    });
    expect(recheckCarriedRow(judged, []).violations.meaning).toBe(true);
  });

  test('a carried row is labelled as carried', () => {
    expect(recheckCarriedRow(okRow(), []).provenance).toBe('carried');
  });
});

describe('the input a resume is replayed against', () => {
  test('a carried row the current input no longer asks for is reported, not dropped in silence', () => {
    // Narrowing --locales to spend a small window on one locale would otherwise
    // write an output file missing every row the run did not ask for — losing
    // the rows the resume existed to protect.
    const carried = carryableRows(priorRun([okRow(), okRow({ locale: 'ja' }), okRow({ source: 'Temperature' })]));
    const dropped = droppedCarriedKeys(carried, { titles: ['Making a request'], locales: ['ko'] });
    expect(dropped).toEqual(expect.arrayContaining([rowKey('ja', 'Making a request'), rowKey('ko', 'Temperature')]));
    expect(dropped).toHaveLength(2);
  });

  test('an input that covers every carried row drops nothing', () => {
    const carried = carryableRows(priorRun([okRow(), okRow({ locale: 'ja' })]));
    expect(droppedCarriedKeys(carried, { titles: ['Making a request'], locales: ['ko', 'ja'] })).toEqual([]);
  });

  test('a repeated title is caught before it can become two identical output rows', () => {
    expect(duplicateTitles(['a', 'b', 'a'])).toEqual(['a']);
    expect(duplicateTitles(['a', 'b'])).toEqual([]);
  });
  test('a repeated locale is caught the same way a repeated title is', () => {
    // `--locales ko,ko` would emit every ko row twice and count each of them
    // twice in the locale's own tally.
    expect(duplicateTitles(['ko', 'ja', 'ko'])).toEqual(['ko']);
  });

  test('an empty entry is not a locale', () => {
    // A trailing comma in --locales would otherwise request `tl=`.
    expect(usableLocales('ko, ,ja,')).toEqual(['ko', 'ja']);
  });
});

describe('the run loop', () => {
  test('a carried row costs no request', async () => {
    const translate = jest.fn(async () => ({ kind: RESULT_KIND.OK, text: 'fresh', detail: null }));
    const carried = carryableRows(priorRun([okRow()]));
    const { records } = await runExperiment(harness({ carried, translate }));
    expect(translate).not.toHaveBeenCalled();
    expect(records).toHaveLength(1);
    expect(records[0].gtCandidate).toBe('요청하기');
  });

  test('a row not in hand is requested', async () => {
    const translate = jest.fn(async () => ({ kind: RESULT_KIND.OK, text: 'fresh', detail: null }));
    const { records } = await runExperiment(harness({ translate }));
    expect(translate).toHaveBeenCalledTimes(1);
    expect(records[0]).toMatchObject({ gtCandidate: 'fresh', provenance: 'fetched', resultKind: RESULT_KIND.OK });
  });

  test('carried and freshly fetched rows stay distinguishable in the output', async () => {
    const carried = carryableRows(priorRun([okRow()]));
    const { records } = await runExperiment(harness({ carried, titles: ['Making a request', 'Temperature'] }));
    expect(records.map((r) => r.provenance)).toEqual(['carried', 'fetched']);
  });

  test('every newly collected row is on disk before the next request is made', async () => {
    // The premise of the whole feature is that the window closes without
    // warning. A run that only writes at the end pays for rows it then loses.
    const persisted = [];
    const translate = async (source) => ({ kind: RESULT_KIND.OK, text: `t:${source}`, detail: null });
    await runExperiment(
      harness({
        titles: ['a', 'b', 'c'],
        translate,
        persist: async (records) => persisted.push(records.length),
      }),
    );
    expect(persisted).toEqual([1, 2, 3]);
  });

  test('a run that cannot write stops instead of spending the window into memory', async () => {
    // Rows are only worth collecting if they survive the process. If the write
    // fails there is nothing left to salvage by continuing, and continuing
    // would report a collection that never landed.
    const translate = jest.fn(async () => ({ kind: RESULT_KIND.OK, text: 'fresh', detail: null }));
    await expect(
      runExperiment(
        harness({
          titles: ['a', 'b', 'c'],
          translate,
          persist: async () => {
            throw new Error('ENOSPC');
          },
        }),
      ),
    ).rejects.toThrow(/ENOSPC/);
    expect(translate).toHaveBeenCalledTimes(1);
  });

  test('a harness bug is recorded as one, not as a translation result', async () => {
    const translate = async () => {
      throw new TypeError('bad call');
    };
    const { records } = await runExperiment(harness({ translate }));
    expect(records[0].resultKind).toBe(RESULT_KIND.HARNESS_ERROR);
    expect(records[0].measurable).toBe(false);
  });

  test('an unusable row never carries a measurable candidate', async () => {
    const translate = async () => ({ kind: RESULT_KIND.RATE_LIMITED, text: null, detail: 'HTTP 429' });
    const { records } = await runExperiment(harness({ translate }));
    expect(records[0]).toMatchObject({ gtCandidate: '', measurable: false, resultKind: RESULT_KIND.RATE_LIMITED });
    expect(records[0].violations).toEqual({
      protectedTerm: false,
      numberOrUnit: false,
      productName: false,
      meaning: false,
    });
  });

  test('the same title in two locales produces two rows, not one', async () => {
    const { records } = await runExperiment(harness({ locales: ['ko', 'ja'] }));
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.locale)).toEqual(['ko', 'ja']);
  });

  test('no output row is emitted twice', async () => {
    const carried = carryableRows(priorRun([okRow()]));
    const { records } = await runExperiment(
      harness({ carried, titles: ['Making a request', 'Temperature'], locales: ['ko', 'ja'] }),
    );
    const keys = records.map((r) => rowKey(r.locale, r.source));
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('a carried row from a locale this run does not visit never reaches the output', async () => {
    // The counterpart to droppedCarriedKeys: whatever the CLI decides to do
    // about the drop, the loop itself must not smuggle a stale row in.
    const carried = carryableRows(priorRun([okRow({ locale: 'zh-CN' })]));
    const { records } = await runExperiment(harness({ carried }));
    expect(records.every((r) => r.locale === 'ko')).toBe(true);
  });

  test('the per-locale tally separates carried from fetched from unusable', async () => {
    // A denominator that counts 76 carried rows as a clean sweep would report a
    // run that made no requests as a successful collection.
    const carried = carryableRows(priorRun([okRow()]));
    const translate = async () => ({ kind: RESULT_KIND.RATE_LIMITED, text: null, detail: 'HTTP 429' });
    const { tallies } = await runExperiment(
      harness({ carried, titles: ['Making a request', 'Temperature'], translate }),
    );
    expect(tallies).toEqual([
      expect.objectContaining({ locale: 'ko', carried: 1, fetched: 1, unusable: 1, titles: 2 }),
    ]);
  });
});
