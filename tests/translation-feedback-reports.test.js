/**
 * @jest-environment jsdom
 */

/* global beforeEach, describe, expect, jest, test */

const fs = require('fs');
const path = require('path');

const CORE_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'translation-feedback.js'), 'utf8');
const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'term-reports.js'), 'utf8');

function loadIdentityLib() {
  const fake = { module: { exports: {} } };
  const identitySource = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'lesson-identity.js'), 'utf8');
  new Function('globalThis', identitySource)(fake);
  return fake.module.exports;
}

const identityLib = loadIdentityLib();
const identityTable = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'shared', 'canonical-lessons.json'), 'utf8'),
);
const CANONICAL_PAIR = (() => {
  const [id, refs] = Object.entries(identityTable.lessons)[0];
  return {
    id,
    skilljar: identityLib.refToUrl('skilljar', refs.skilljar),
    academy: identityLib.refToUrl('academy', refs.academy),
  };
})();

const LABEL = { en: 'label' };
const A11Y_LABELS = { backToSidebar: LABEL };
const REPORT_LABELS = {
  title: LABEL,
  export: LABEL,
  addThis: LABEL,
  wrongPlaceholder: LABEL,
  correctionPlaceholder: LABEL,
  save: LABEL,
  cancel: LABEL,
  empty: LABEL,
  remove: LABEL,
  helpful: { en: 'Helpful translation' },
  needsWork: { en: 'Translation needs improvement' },
  original: { en: 'Original' },
  translation: { en: 'Translation' },
  selected: { en: 'Selected' },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeHarness({
  initial = { sb_term_reports: [] },
  identity,
  deferSets = false,
  failSets = false,
  pageUrl = 'https://academy.claude.com/courses/course/lesson',
} = {}) {
  const store = clone(initial);
  const events = [];
  const setCalls = [];
  const downloads = [];
  let shouldFailSets = failSets;
  const location = new URL(pageUrl);

  const chromeStub = {
    runtime: { lastError: null },
    storage: {
      local: {
        get(keys, callback) {
          events.push('storage.get');
          const result = {};
          for (const key of [].concat(keys)) if (key in store) result[key] = clone(store[key]);
          callback(result);
        },
        set(data, callback) {
          events.push('storage.set');
          const call = {
            data,
            resolve() {
              if (shouldFailSets) {
                chromeStub.runtime.lastError = { message: 'storage backend gone' };
                callback?.();
                chromeStub.runtime.lastError = null;
                return;
              }
              Object.assign(store, clone(data));
              callback?.();
            },
          };
          setCalls.push(call);
          if (!deferSets) call.resolve();
        },
      },
    },
  };

  const sb = {
    currentLang: 'ko',
    identity,
    _chat: {
      state: { reportsPanelOpen: false },
      openSubPanel(name, html, bind) {
        if (name !== 'reports') return null;
        const host = document.getElementById('panel-host');
        host.innerHTML = html;
        this.state.reportsPanelOpen = true;
        bind?.();
        return host;
      },
      closeSubPanel() {
        this.state.reportsPanelOpen = false;
      },
    },
    $: (selector) => document.querySelector(selector),
    $id: (id) => document.getElementById(id),
    t: (map) => map?.en || '',
    escapeHtml: (text) =>
      String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;'),
    registerModule: jest.fn(),
  };

  class FakeBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.type = options?.type;
    }
  }
  const urlApi = {
    createObjectURL(blob) {
      downloads.push(blob);
      return 'blob:test';
    },
    revokeObjectURL() {},
  };

  const fakeWindow = { _sb: sb };
  new Function('window', 'module', CORE_SOURCE)(fakeWindow, undefined);
  new Function(
    'window',
    'document',
    'location',
    'chrome',
    'console',
    'Blob',
    'URL',
    'setTimeout',
    'A11Y_LABELS',
    'REPORT_LABELS',
    SOURCE,
  )(
    fakeWindow,
    document,
    location,
    chromeStub,
    console,
    FakeBlob,
    urlApi,
    (callback) => callback(),
    A11Y_LABELS,
    REPORT_LABELS,
  );

  return {
    downloads,
    events,
    fakeWindow,
    location,
    sb,
    setCalls,
    setFailure(value) {
      shouldFailSets = Boolean(value);
    },
    store,
  };
}

async function flush() {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}

beforeEach(() => {
  document.body.innerHTML = '<main><h1>Lesson heading</h1></main><div id="panel-host"></div>';
  document.title = 'Translation lesson';
});

describe('translation feedback report schema', () => {
  test('renders a legacy wrongText row through the real Reports reader', async () => {
    const harness = makeHarness({
      initial: {
        sb_term_reports: [{ wrongText: 'legacy translation', correction: '', ts: 1 }],
      },
    });
    await flush();

    harness.sb._chat.toggleReportsPanel();
    await flush();

    expect(document.querySelector('.si18n-report-item .si18n-bm-title').textContent).toBe('legacy translation');
    expect(harness.store.sb_term_reports[0]).toMatchObject({
      selectedText: 'legacy translation',
      wrongText: 'legacy translation',
    });
  });

  test('normalizes legacy reports additively without inventing the original text', () => {
    const { fakeWindow } = makeHarness();
    const legacy = {
      wrongText: '잘못된 번역',
      correction: '올바른 번역',
      url: 'https://example.test/lesson',
      title: 'Legacy lesson',
      lang: 'ko',
      ts: 123,
      futureField: 'preserved',
    };

    const first = fakeWindow._sbTranslationFeedback.normalizeReports([legacy]);
    expect(first.changed).toBe(true);
    expect(first.records).toEqual([
      expect.objectContaining({
        reportSchemaVersion: 1,
        capture: 'manual',
        signal: 'negative',
        originalText: null,
        translatedText: '잘못된 번역',
        selectedText: '잘못된 번역',
        wrongText: '잘못된 번역',
        correction: '올바른 번역',
        futureField: 'preserved',
      }),
    ]);

    const second = fakeWindow._sbTranslationFeedback.normalizeReports(first.records);
    expect(second.changed).toBe(false);
    expect(second.records).toBe(first.records);
  });

  test('caps normalized storage at the newest 200 reports', () => {
    const { fakeWindow } = makeHarness();
    const raw = Array.from({ length: 205 }, (_, i) => ({ wrongText: `term-${i}`, ts: 205 - i }));
    const normalized = fakeWindow._sbTranslationFeedback.normalizeReports(raw);

    expect(normalized.changed).toBe(true);
    expect(normalized.records).toHaveLength(200);
    expect(normalized.records[0].wrongText).toBe('term-0');
    expect(normalized.records[199].wrongText).toBe('term-199');
  });

  test('loads and normalizes before identity readiness and persists one migrated snapshot', async () => {
    const identity = {
      ready: jest.fn(() => Promise.resolve()),
      migrate: jest.fn((records) => {
        expect(records[0]).toMatchObject({
          reportSchemaVersion: 1,
          originalText: null,
          translatedText: 'legacy translation',
        });
        return { records: [{ ...records[0], id: 'lesson-1' }], changed: true };
      }),
      stamp: (record) => record,
    };
    const harness = makeHarness({
      initial: { sb_term_reports: [{ wrongText: 'legacy translation', correction: '', ts: 1 }] },
      identity,
    });

    await flush();

    expect(harness.events).toEqual(['storage.get', 'storage.set']);
    expect(identity.ready).toHaveBeenCalledTimes(1);
    expect(identity.migrate).toHaveBeenCalledTimes(1);
    expect(harness.store.sb_term_reports[0]).toMatchObject({
      reportSchemaVersion: 1,
      id: 'lesson-1',
      wrongText: 'legacy translation',
    });

    harness.sb._chat.toggleReportsPanel();
    await flush();
    expect(identity.ready).toHaveBeenCalledTimes(1);
  });

  test('carries a legacy Skilljar report and new Academy feedback under one real lesson identity', async () => {
    const resolver = identityLib.createIdentityResolver(identityTable);
    const identity = {
      ready: () => Promise.resolve(),
      migrate: (records) => identityLib.migrateRecords(records, resolver, { now: 10 }),
      stamp(record, at) {
        const resolved = resolver.resolve(at);
        if (!resolved.id) return record;
        return {
          ...record,
          id: resolved.id,
          provenance: {
            schemaVersion: identityLib.IDENTITY_SCHEMA_VERSION,
            matchedBy: identityLib.IDENTITY_SOURCE.CANONICAL,
            platform: resolved.platform,
            migratedAt: record.ts,
          },
        };
      },
    };
    const harness = makeHarness({
      initial: {
        sb_term_reports: [
          {
            wrongText: 'legacy translated phrase',
            correction: '',
            url: CANONICAL_PAIR.skilljar,
            title: 'Legacy lesson',
            lang: 'ko',
            ts: 1,
          },
        ],
      },
      identity,
      pageUrl: CANONICAL_PAIR.academy,
    });
    await flush();

    expect(harness.store.sb_term_reports[0]).toMatchObject({
      id: CANONICAL_PAIR.id,
      url: CANONICAL_PAIR.skilljar,
      originalText: null,
      legacyUrls: [CANONICAL_PAIR.skilljar],
    });

    await harness.sb._chat.recordTranslationFeedback(
      {
        originalText: 'Original Academy text',
        translatedText: '번역된 Academy 텍스트',
        selectedText: 'Academy 텍스트',
      },
      'positive',
    );

    expect(harness.store.sb_term_reports).toHaveLength(2);
    expect(harness.store.sb_term_reports.map((report) => report.id)).toEqual([CANONICAL_PAIR.id, CANONICAL_PAIR.id]);
    expect(harness.store.sb_term_reports[0].url).toBe(CANONICAL_PAIR.academy);
    expect(harness.store.sb_term_reports[1].url).toBe(CANONICAL_PAIR.skilljar);
  });

  test('keeps a future-schema row opaque while migrating a current row beside it', async () => {
    const resolver = identityLib.createIdentityResolver(identityTable);
    const identity = {
      ready: () => Promise.resolve(),
      migrate: (records) => identityLib.migrateRecords(records, resolver, { now: 10 }),
      stamp: (record) => record,
    };
    const future = {
      reportSchemaVersion: 2,
      capture: 'future-capture',
      url: CANONICAL_PAIR.skilljar,
      id: 'future-owned-id',
      provenance: { future: true },
      payload: 'opaque',
    };
    const legacy = {
      wrongText: 'legacy translation',
      correction: '',
      url: CANONICAL_PAIR.skilljar,
      ts: 1,
    };
    const harness = makeHarness({ initial: { sb_term_reports: [future, legacy] }, identity });
    await flush();

    expect(harness.store.sb_term_reports[0]).toEqual(future);
    expect(harness.store.sb_term_reports[1]).toMatchObject({
      reportSchemaVersion: 1,
      id: CANONICAL_PAIR.id,
      wrongText: 'legacy translation',
    });
  });
});

describe('recording translation feedback', () => {
  const pair = {
    originalText: 'Use a system prompt.',
    translatedText: '시스템 프롬프트를 사용하세요.',
    selectedText: '시스템 프롬프트',
  };

  test('stamps immediate positive/negative feedback and queues immutable write snapshots', async () => {
    const stamped = [];
    const identity = {
      ready: () => Promise.resolve(),
      migrate: (records) => ({ records, changed: false }),
      stamp: jest.fn((record, at) => {
        expect(at).toBe('https://academy.claude.com/courses/course/lesson');
        const next = { ...record, id: `canonical-${stamped.length + 1}` };
        stamped.push(next);
        return next;
      }),
    };
    const harness = makeHarness({ identity, deferSets: true });
    await flush();

    const firstPromise = harness.sb._chat.recordTranslationFeedback(pair, 'positive');
    await flush();
    expect(harness.setCalls).toHaveLength(1);
    expect(harness.setCalls[0].data.sb_term_reports).toHaveLength(1);

    const secondPromise = harness.sb._chat.recordTranslationFeedback(pair, 'negative', '프롬프트를 유지');
    await flush();
    // The first queued payload must not grow when the live reports array does.
    expect(harness.setCalls[0].data.sb_term_reports).toHaveLength(1);

    harness.setCalls[0].resolve();
    await flush();
    expect(harness.setCalls).toHaveLength(2);
    expect(harness.setCalls[1].data.sb_term_reports).toHaveLength(2);
    harness.setCalls[1].resolve();

    const [positive, negative] = await Promise.all([firstPromise, secondPromise]);
    expect(positive).toMatchObject({
      reportSchemaVersion: 1,
      capture: 'selection',
      signal: 'positive',
      correction: '',
      ...pair,
      id: 'canonical-1',
    });
    expect(negative).toMatchObject({
      capture: 'selection',
      signal: 'negative',
      correction: '프롬프트를 유지',
      id: 'canonical-2',
    });
    expect(identity.stamp).toHaveBeenCalledTimes(2);
  });

  test('rejects an invalid signal and an empty feedback pair', async () => {
    const harness = makeHarness();
    await expect(harness.sb._chat.recordTranslationFeedback(pair, 'maybe')).resolves.toBe(false);
    await expect(
      harness.sb._chat.recordTranslationFeedback(
        { originalText: '', translatedText: '', selectedText: '' },
        'negative',
      ),
    ).resolves.toBe(false);
    expect(harness.setCalls).toHaveLength(0);
  });

  test('does not report success when chrome.storage rejects the write', async () => {
    const harness = makeHarness({ failSets: true });

    await expect(harness.sb._chat.recordTranslationFeedback(pair, 'positive')).rejects.toThrow(
      'Term reports write failed: storage backend gone',
    );
    expect(harness.store.sb_term_reports).toEqual([]);

    // The failed optimistic add must not remain in memory and silently join a
    // later successful write.
    harness.sb._chat.toggleReportsPanel();
    await flush();
    expect(document.querySelectorAll('#si18n-report-list .si18n-bm-item')).toHaveLength(0);

    harness.setFailure(false);
    await expect(harness.sb._chat.recordTranslationFeedback(pair, 'positive')).resolves.toMatchObject({
      signal: 'positive',
    });
    expect(harness.store.sb_term_reports).toHaveLength(1);
  });

  test('stamps the captured lesson even if the SPA route changes while identity becomes ready', async () => {
    let releaseIdentity;
    const identityGate = new Promise((resolve) => {
      releaseIdentity = resolve;
    });
    const identity = {
      ready: () => identityGate,
      migrate: (records) => ({ records, changed: false }),
      stamp: jest.fn((record) => record),
    };
    const harness = makeHarness({ identity });
    const capturedUrl = harness.location.href;

    const pending = harness.sb._chat.recordTranslationFeedback(pair, 'positive');
    harness.location.href = 'https://academy.claude.com/courses/course/next-lesson';
    releaseIdentity();
    await pending;

    expect(identity.stamp).toHaveBeenCalledWith(expect.objectContaining({ url: capturedUrl }), capturedUrl);
  });

  test('opens negative selection compose with source, translation and selection prefilled', async () => {
    const harness = makeHarness();
    await expect(harness.sb._chat.composeTranslationFeedback(pair)).resolves.toBe(true);

    expect(document.getElementById('si18n-report-original').value).toBe(pair.originalText);
    expect(document.getElementById('si18n-report-translation').value).toBe(pair.translatedText);
    expect(document.getElementById('si18n-report-wrong').value).toBe(pair.selectedText);

    document.getElementById('si18n-report-correction').value = '시스템 지시문';
    document.getElementById('si18n-report-save').click();
    await flush();

    expect(harness.store.sb_term_reports[0]).toMatchObject({
      capture: 'selection',
      signal: 'negative',
      ...pair,
      correction: '시스템 지시문',
    });
  });

  test('keeps the existing manual compose path as a manual negative report', async () => {
    const harness = makeHarness();
    harness.sb._chat.toggleReportsPanel();
    await flush();
    document.getElementById('si18n-report-add').click();
    document.getElementById('si18n-report-wrong').value = '토큰';
    document.getElementById('si18n-report-correction').value = 'token';
    document.getElementById('si18n-report-save').click();
    await flush();

    expect(harness.store.sb_term_reports[0]).toMatchObject({
      reportSchemaVersion: 1,
      capture: 'manual',
      signal: 'negative',
      originalText: null,
      translatedText: '토큰',
      selectedText: '토큰',
      wrongText: '토큰',
      correction: 'token',
    });
  });

  test('guards a pending compose save against double-click duplicates', async () => {
    const harness = makeHarness({ deferSets: true });
    harness.sb._chat.toggleReportsPanel();
    await flush();
    document.getElementById('si18n-report-add').click();
    document.getElementById('si18n-report-wrong').value = '토큰';
    const save = document.getElementById('si18n-report-save');

    save.click();
    save.click();
    await flush();

    expect(save.disabled).toBe(true);
    expect(harness.setCalls).toHaveLength(1);
    harness.setCalls[0].resolve();
    await flush();
    expect(harness.store.sb_term_reports).toHaveLength(1);
  });

  test('keeps failed compose input and re-enables one clean retry', async () => {
    const harness = makeHarness({ failSets: true });
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    harness.sb._chat.toggleReportsPanel();
    await flush();
    document.getElementById('si18n-report-add').click();
    document.getElementById('si18n-report-wrong').value = '토큰';
    document.getElementById('si18n-report-correction').value = 'token';
    const save = document.getElementById('si18n-report-save');

    save.click();
    await flush();

    expect(save.isConnected).toBe(true);
    expect(save.disabled).toBe(false);
    expect(document.getElementById('si18n-report-wrong').value).toBe('토큰');
    expect(harness.store.sb_term_reports).toEqual([]);

    harness.setFailure(false);
    save.click();
    await flush();

    expect(harness.store.sb_term_reports).toHaveLength(1);
    expect(harness.store.sb_term_reports[0].wrongText).toBe('토큰');
    expect(document.getElementById('si18n-report-compose').children).toHaveLength(0);
    warning.mockRestore();
  });
});

describe('report list and export safety', () => {
  test('waits for a pending committed add before taking the export snapshot', async () => {
    const harness = makeHarness({ deferSets: true });
    harness.sb._chat.toggleReportsPanel();
    await flush();
    const pending = harness.sb._chat.recordTranslationFeedback(
      {
        originalText: 'Source queued before export',
        translatedText: '내보내기 전 대기 중인 번역',
        selectedText: '대기 중인 번역',
      },
      'positive',
    );
    await flush();
    expect(harness.setCalls).toHaveLength(1);

    const click = jest.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    document.getElementById('si18n-report-export').click();
    await flush();
    expect(harness.downloads).toHaveLength(0);

    harness.setCalls[0].resolve();
    await pending;
    await flush();
    click.mockRestore();

    expect(harness.downloads).toHaveLength(1);
    expect(JSON.parse(harness.downloads[0].parts.join(''))).toEqual([
      expect.objectContaining({ signal: 'positive', selectedText: '대기 중인 번역' }),
    ]);
  });

  test('deletes the clicked record rather than a pending add that later shifts its index', async () => {
    const existing = {
      reportSchemaVersion: 1,
      capture: 'manual',
      signal: 'negative',
      originalText: null,
      translatedText: 'existing translation',
      selectedText: 'existing translation',
      wrongText: 'existing translation',
      correction: '',
      ts: 1,
    };
    const harness = makeHarness({
      initial: { sb_term_reports: [existing] },
      deferSets: true,
    });
    harness.sb._chat.toggleReportsPanel();
    await flush();

    const pendingAdd = harness.sb._chat.recordTranslationFeedback(
      {
        originalText: 'New source',
        translatedText: '새 번역',
        selectedText: '새 번역',
      },
      'positive',
    );
    await flush();
    expect(harness.setCalls).toHaveLength(1);

    document.querySelector('#si18n-report-list .si18n-bm-remove').click();
    await flush();
    expect(harness.setCalls).toHaveLength(1);

    harness.setCalls[0].resolve();
    await flush();
    expect(harness.setCalls).toHaveLength(2);
    expect(harness.setCalls[1].data.sb_term_reports).toEqual([
      expect.objectContaining({ signal: 'positive', selectedText: '새 번역' }),
    ]);
    harness.setCalls[1].resolve();
    await pendingAdd;
    await flush();

    expect(harness.store.sb_term_reports).toEqual([
      expect.objectContaining({ signal: 'positive', selectedText: '새 번역' }),
    ]);
    expect(document.querySelector('.si18n-bm-title').textContent).toBe('새 번역');
  });

  test('keeps a row visible and stored when its delete write fails', async () => {
    const report = {
      reportSchemaVersion: 1,
      capture: 'manual',
      signal: 'negative',
      originalText: null,
      translatedText: '토큰',
      selectedText: '토큰',
      wrongText: '토큰',
      correction: '',
      ts: 1,
    };
    const harness = makeHarness({ initial: { sb_term_reports: [report] }, failSets: true });
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    harness.sb._chat.toggleReportsPanel();
    await flush();

    document.querySelector('#si18n-report-list .si18n-bm-remove').click();
    await flush();

    expect(harness.store.sb_term_reports).toEqual([report]);
    expect(document.querySelectorAll('#si18n-report-list .si18n-bm-item')).toHaveLength(1);
    expect(warning).toHaveBeenCalledWith(
      '[SkillBridge] Term reports storage unavailable:',
      'Term reports write failed: storage backend gone',
    );
    warning.mockRestore();
  });

  test('renders every feedback field as text and exports the canonical schema', async () => {
    const malicious = '<img src=x onerror=alert(1)>';
    const initial = {
      sb_term_reports: [
        {
          reportSchemaVersion: 1,
          capture: 'selection',
          signal: 'negative',
          originalText: `source ${malicious}`,
          translatedText: `translation ${malicious}`,
          selectedText: `selected ${malicious}`,
          correction: `correction ${malicious}`,
          url: 'https://example.test/?q="unsafe"',
          title: 'Unsafe lesson',
          lang: 'ko',
          ts: 1,
        },
      ],
    };
    const harness = makeHarness({ initial });
    harness.sb._chat.toggleReportsPanel();
    await flush();

    const row = document.querySelector('#si18n-report-list .si18n-bm-item');
    expect(row.querySelector('img')).toBeNull();
    expect(row.textContent).toContain('Translation needs improvement');
    expect(row.dataset.reportCapture).toBe('selection');
    expect(row.dataset.reportSignal).toBe('negative');
    expect(row.textContent).toContain(`source ${malicious}`);
    expect(row.textContent).toContain(`translation ${malicious}`);
    expect(row.textContent).toContain(`correction ${malicious}`);

    const click = jest.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    document.getElementById('si18n-report-export').click();
    await flush();
    click.mockRestore();
    const exported = JSON.parse(harness.downloads[0].parts.join(''));
    expect(exported[0]).toMatchObject({
      reportSchemaVersion: 1,
      capture: 'selection',
      signal: 'negative',
      originalText: `source ${malicious}`,
      translatedText: `translation ${malicious}`,
      correction: `correction ${malicious}`,
    });
  });
});
