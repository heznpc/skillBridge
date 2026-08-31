/**
 * @jest-environment jsdom
 *
 * Translation-feedback records have two jobs: capture exactly which live
 * translation a learner reacted to, and keep the pre-v4.2 report queue
 * readable without destroying any of its fields. These tests exercise the
 * production module in both of the environments in which it is loaded.
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

const LIB_PATH = path.join(__dirname, '..', 'src', 'lib', 'translation-feedback.js');
const source = fs.readFileSync(LIB_PATH, 'utf8');
const api = require(LIB_PATH);

const { REPORT_SCHEMA_VERSION, resolveSelection, normalizeReports, makeFeedbackReport } = api;

function select(node, start, end) {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  return range;
}

function trackedElement({ originalHTML, translatedHTML }) {
  const el = document.createElement('p');
  el.innerHTML = translatedHTML;
  document.body.appendChild(el);
  const originalTexts = new Map([[el, originalHTML]]);
  const translatedTexts = new Map([['source key', [{ el }]]]);
  return { el, originalTexts, translatedTexts };
}

describe('module surfaces', () => {
  test('exports the v4.2 API through CommonJS', () => {
    expect(REPORT_SCHEMA_VERSION).toBe(1);
    expect(api).toEqual({
      REPORT_SCHEMA_VERSION,
      resolveSelection,
      normalizeReports,
      makeFeedbackReport,
    });
  });

  test('also exposes the same API from a classic browser script', () => {
    const browserWindow = {};
    new Function('window', 'module', 'exports', source)(browserWindow, undefined, undefined);

    expect(browserWindow._sbTranslationFeedback.REPORT_SCHEMA_VERSION).toBe(1);
    expect(Object.keys(browserWindow._sbTranslationFeedback).sort()).toEqual(Object.keys(api).sort());
  });
});

describe('resolveSelection', () => {
  test('resolves a nested Range to its one translated block', () => {
    const { el, originalTexts, translatedTexts } = trackedElement({
      originalHTML: 'Learn <strong>Claude API</strong> today.',
      translatedHTML: '오늘 <strong>Claude API</strong>를 배우세요.',
    });
    const text = el.querySelector('strong').firstChild;

    expect(resolveSelection(select(text, 0, text.length), originalTexts, translatedTexts)).toEqual({
      element: el,
      originalText: 'Learn Claude API today.',
      translatedText: '오늘 Claude API를 배우세요.',
      selectedText: 'Claude API',
    });
  });

  test('reads translatedText from the live element, not a stale map key', () => {
    const { el, originalTexts, translatedTexts } = trackedElement({
      originalHTML: 'Send the request.',
      translatedHTML: '요청을 보내세요.',
    });
    el.textContent = '수정된 번역을 보내세요.';

    expect(resolveSelection(select(el.firstChild, 0, 3), originalTexts, translatedTexts)).toMatchObject({
      translatedText: '수정된 번역을 보내세요.',
      selectedText: '수정된',
    });
  });

  test('turns the saved innerHTML snapshot into plain original text', () => {
    const { el, originalTexts, translatedTexts } = trackedElement({
      originalHTML: 'Use &lt;code&gt; with <code>x-api-key</code>.',
      translatedHTML: '<span>사용</span> <code>x-api-key</code>.',
    });

    expect(resolveSelection(select(el.firstChild.firstChild, 0, 2), originalTexts, translatedTexts).originalText).toBe(
      'Use <code> with x-api-key.',
    );
  });

  test('rejects an untracked or only-snapshotted element', () => {
    const el = document.createElement('p');
    el.textContent = '번역문';
    document.body.appendChild(el);
    const range = select(el.firstChild, 0, 3);

    expect(resolveSelection(range, new Map(), new Map())).toBeNull();
    expect(resolveSelection(range, new Map([[el, 'English']]), new Map())).toBeNull();
  });

  test('rejects a stale tracking entry after the element is back in English', () => {
    const { el, originalTexts, translatedTexts } = trackedElement({
      originalHTML: 'Back in English.',
      translatedHTML: 'Back in English.',
    });

    expect(resolveSelection(select(el.firstChild, 0, 4), originalTexts, translatedTexts)).toBeNull();
  });

  test('rejects a Range spanning more than one translated block', () => {
    const first = trackedElement({ originalHTML: 'First.', translatedHTML: '첫째.' });
    const second = trackedElement({ originalHTML: 'Second.', translatedHTML: '둘째.' });
    const translatedTexts = new Map([
      ['First.', [{ el: first.el }]],
      ['Second.', [{ el: second.el }]],
    ]);
    const range = document.createRange();
    range.setStart(first.el.firstChild, 0);
    range.setEnd(second.el.firstChild, second.el.firstChild.length);

    expect(
      resolveSelection(
        range,
        new Map([
          [first.el, 'First.'],
          [second.el, 'Second.'],
        ]),
        translatedTexts,
      ),
    ).toBeNull();
  });

  test('rejects empty selections and malformed inputs', () => {
    const { el, originalTexts, translatedTexts } = trackedElement({
      originalHTML: 'Original.',
      translatedHTML: '번역.',
    });
    const collapsed = select(el.firstChild, 1, 1);

    expect(resolveSelection(collapsed, originalTexts, translatedTexts)).toBeNull();
    expect(resolveSelection(null, originalTexts, translatedTexts)).toBeNull();
    expect(resolveSelection(select(el.firstChild, 0, 1), {}, translatedTexts)).toBeNull();
  });
});

describe('makeFeedbackReport', () => {
  test('normalizes a selected positive or negative signal and its metadata', () => {
    expect(
      makeFeedbackReport({
        capture: ' selection ',
        signal: ' negative ',
        originalText: '  Send the request. ',
        translatedText: '  요청을 보내세요. ',
        selectedText: '  요청  ',
        correction: '  요청문  ',
        url: ' https://example.test/lesson ',
        title: ' Lesson title ',
        lang: ' ko ',
        ts: 1234,
      }),
    ).toEqual({
      reportSchemaVersion: REPORT_SCHEMA_VERSION,
      capture: 'selection',
      signal: 'negative',
      originalText: 'Send the request.',
      translatedText: '요청을 보내세요.',
      selectedText: '요청',
      correction: '요청문',
      wrongText: '요청',
      url: 'https://example.test/lesson',
      title: 'Lesson title',
      lang: 'ko',
      ts: 1234,
    });
  });

  test('projects selectedText into wrongText for the v4.1 Reports reader', () => {
    const report = makeFeedbackReport({
      capture: 'selection',
      signal: 'negative',
      originalText: 'Send the request.',
      translatedText: '요청을 보내세요.',
      selectedText: '요청',
    });
    const renderV41Rows = (rows) => rows.map((row) => row.wrongText);

    expect(report.selectedText).toBe('요청');
    expect(renderV41Rows([report])).toEqual(['요청']);
  });

  test('keeps an explicit legacy wrongText without replacing canonical selectedText', () => {
    const report = makeFeedbackReport({
      capture: 'selection',
      signal: 'negative',
      originalText: 'Send the request.',
      translatedText: '요청을 보내세요.',
      selectedText: '요청',
      wrongText: '요청어',
    });

    expect(report).toMatchObject({ selectedText: '요청', wrongText: '요청어' });
  });

  test('allows manual feedback, preserves wrongText, and falls back to the translation for selection', () => {
    expect(
      makeFeedbackReport({
        capture: 'manual',
        signal: 'negative',
        originalText: 'manual capture has no verified source',
        translatedText: '  토큰  ',
      }),
    ).toEqual({
      reportSchemaVersion: REPORT_SCHEMA_VERSION,
      capture: 'manual',
      signal: 'negative',
      originalText: null,
      translatedText: '토큰',
      selectedText: '토큰',
      correction: '',
      wrongText: '토큰',
    });
  });

  test('accepts an optional correction on a positive signal', () => {
    expect(
      makeFeedbackReport({
        capture: 'selection',
        signal: 'positive',
        originalText: 'Correct.',
        translatedText: '올바릅니다.',
        selectedText: '올바릅니다.',
        correction: '  메모  ',
      }).correction,
    ).toBe('메모');
  });

  test('rejects invalid required fields and enum values', () => {
    const base = {
      capture: 'selection',
      signal: 'positive',
      originalText: 'Original',
      translatedText: '번역',
      selectedText: '번역',
    };

    expect(makeFeedbackReport(null)).toBeNull();
    expect(makeFeedbackReport({ ...base, capture: 'hover' })).toBeNull();
    expect(makeFeedbackReport({ ...base, signal: 'neutral' })).toBeNull();
    expect(makeFeedbackReport({ ...base, originalText: null })).toBeNull();
    expect(makeFeedbackReport({ ...base, translatedText: '   ', selectedText: '' })).toBeNull();
    expect(makeFeedbackReport({ ...base, correction: 42 })).toBeNull();
    expect(makeFeedbackReport({ ...base, ts: Infinity })).toBeNull();
  });
});

describe('normalizeReports', () => {
  test('accepts both the stored array and an export envelope', () => {
    const report = makeFeedbackReport({
      capture: 'selection',
      signal: 'positive',
      originalText: 'Good translation.',
      translatedText: '좋은 번역.',
      selectedText: '좋은 번역.',
    });

    const stored = [report];
    const current = normalizeReports(stored);
    expect(current).toEqual({ records: stored, changed: false });
    expect(current.records).toBe(stored);
    expect(normalizeReports({ reports: [report] })).toEqual({ records: [report], changed: true });
  });

  test('migrates a legacy wrongText row additively', () => {
    const legacy = {
      wrongText: '토큰',
      correction: 'token',
      url: 'https://example.test/lesson',
      title: 'Lesson',
      lang: 'ko',
      ts: 99,
      privateNote: 'keep this field',
    };

    expect(normalizeReports([legacy])).toEqual({
      changed: true,
      records: [
        {
          ...legacy,
          reportSchemaVersion: REPORT_SCHEMA_VERSION,
          capture: 'manual',
          signal: 'negative',
          originalText: null,
          translatedText: '토큰',
          selectedText: '토큰',
        },
      ],
    });
  });

  test('migration is idempotent', () => {
    const once = normalizeReports([{ wrongText: '프롬프트', correction: '' }]);
    expect(once.changed).toBe(true);
    expect(normalizeReports(once.records)).toEqual({ records: once.records, changed: false });
  });

  test('backfills the legacy reader alias on an early v4.2 row and preserves an explicit value', () => {
    const withoutAlias = {
      reportSchemaVersion: REPORT_SCHEMA_VERSION,
      capture: 'selection',
      signal: 'positive',
      originalText: 'Send the request.',
      translatedText: '요청을 보내세요.',
      selectedText: '요청',
      correction: '',
    };
    const withAlias = { ...withoutAlias, signal: 'negative', wrongText: '명시적 별칭' };

    const normalized = normalizeReports([withoutAlias, withAlias]);

    expect(normalized.changed).toBe(true);
    expect(normalized.records[0]).toEqual({ ...withoutAlias, wrongText: '요청' });
    expect(normalized.records[1]).toEqual(withAlias);
    expect(normalizeReports(normalized.records)).toEqual({ records: normalized.records, changed: false });
  });

  test('caps the persisted queue at the newest 200 valid reports without letting malformed rows consume the cap', () => {
    const raw = [
      ...Array.from({ length: 8 }, () => null),
      ...Array.from({ length: 205 }, (_, index) => ({ wrongText: `term-${index}`, ts: 205 - index })),
    ];
    const normalized = normalizeReports(raw);

    expect(normalized.changed).toBe(true);
    expect(normalized.records).toHaveLength(200);
    expect(normalized.records[0].wrongText).toBe('term-0');
    expect(normalized.records[199].wrongText).toBe('term-199');
  });

  test('drops malformed rows and returns an empty array for malformed containers', () => {
    const valid = makeFeedbackReport({
      capture: 'manual',
      signal: 'negative',
      originalText: null,
      translatedText: '오역',
      selectedText: '오역',
    });
    const invalidCapture = { ...valid, capture: 'automatic' };

    expect(normalizeReports([null, 'row', {}, { wrongText: '   ' }, invalidCapture, valid])).toEqual({
      records: [valid],
      changed: true,
    });
    expect(normalizeReports([])).toEqual({ records: [], changed: false });
    expect(normalizeReports(undefined)).toEqual({ records: [], changed: false });
    expect(normalizeReports(null)).toEqual({ records: [], changed: true });
    expect(normalizeReports('not an array')).toEqual({ records: [], changed: true });
    expect(normalizeReports({ reports: 'not an array' })).toEqual({ records: [], changed: true });
  });

  test('preserves an unknown future-schema row without rewriting or deleting it', () => {
    const future = {
      reportSchemaVersion: REPORT_SCHEMA_VERSION + 1,
      capture: 'automatic-v2',
      encryptedPayload: 'opaque future data',
    };
    const raw = [future];
    const normalized = normalizeReports(raw);

    expect(normalized).toEqual({ records: raw, changed: false });
    expect(normalized.records).toBe(raw);
  });
});
