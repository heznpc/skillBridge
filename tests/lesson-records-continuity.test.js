/**
 * @jest-environment jsdom
 *
 * Cross-platform continuity, end to end through the real record modules.
 *
 * tests/lesson-identity.test.js proves the rules. This proves notes.js,
 * bookmarks.js and resume.js actually USE them — which is the part that
 * silently breaks. Each of those modules had its own `record.url ===
 * location.href`, and a module that keeps its own copy while the others move
 * on shows no error at all: the learner just opens a lesson and finds their
 * note gone.
 *
 * E2E cannot reach this. The specs run on localhost, and localhost is not a
 * lesson URL on either platform, so no canonical id can ever resolve there.
 * Reaching a real academy.claude.com origin would mean host-resolver rules, a
 * self-signed certificate and --ignore-certificate-errors — the same trade
 * tests/sidebar-translate-only.test.js declined, and for the same reason.
 *
 * So the real module sources are loaded here with `location`, `chrome` and the
 * `_sb` namespace supplied as parameters, and driven through their own public
 * surface. Nothing is re-implemented: a production change that stops consulting
 * identity fails here.
 */

/* global describe, test, expect, beforeEach */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

/** The real label dictionaries, so the panels render with real copy. */
const constants = new Function(
  `${read('src', 'shared', 'runtime-constants.js')}
   ${read('src', 'lib', 'selectors.js')}
   ${read('src', 'lib', 'constants.js')}
   return { A11Y_LABELS, NOTE_LABELS, BOOKMARK_LABELS, RESUME_LABELS };`,
)();

function loadLib(file) {
  const fake = { module: { exports: {} } };
  new Function('globalThis', read('src', 'lib', file))(fake);
  return fake.module.exports;
}
const identityLib = loadLib('lesson-identity.js');

/** The real shipped table, so the pairs under test are pairs that actually ship. */
const TABLE = JSON.parse(read('src', 'shared', 'canonical-lessons.json'));

/** One lesson that really is in the shipped table, addressed from both platforms. */
const PAIR = (() => {
  const [id, refs] = Object.entries(TABLE.lessons).find(
    ([, r]) => r.skilljar.split('/')[0] !== r.academy.split('/')[0],
  );
  return {
    id,
    skilljar: identityLib.refToUrl('skilljar', refs.skilljar),
    academy: identityLib.refToUrl('academy', refs.academy),
  };
})();

/** A lesson URL that is deliberately NOT in the table — below high confidence. */
const UNMATCHED = 'https://academy.claude.com/courses/claude-code-101/a-lesson-no-report-matched';

// ────────────────────────────────────────────────────────────────────
// Harness
// ────────────────────────────────────────────────────────────────────

/** A `chrome.storage.local` that answers synchronously and keeps its data. */
function makeChrome(store = {}) {
  return {
    runtime: { id: 'test-extension', lastError: null, getURL: (p) => `chrome-extension://test/${p}` },
    storage: {
      local: {
        get(keys, cb) {
          const out = {};
          for (const key of [].concat(keys)) if (key in store) out[key] = store[key];
          cb(out);
        },
        set(data, cb) {
          Object.assign(store, JSON.parse(JSON.stringify(data)));
          if (cb) cb();
        },
      },
    },
    _store: store,
  };
}

/**
 * The `_sb` namespace, carrying the REAL identity service over the REAL table.
 *
 * This mirrors src/content/lesson-store.js rather than importing it, because
 * that module's own job — fetching the table — is what cannot run in jsdom.
 * Everything it delegates to is the real implementation.
 */
function makeSb(location) {
  const resolver = identityLib.createIdentityResolver(TABLE);
  const panels = {};
  return {
    hostCaps: { contentScope: null },
    identity: {
      ready: () => Promise.resolve(),
      resolve: (u) => resolver.resolve(u),
      identityOf: (u) => identityLib.locationIdentity(resolver, u),
      find: (records, u) => identityLib.findRecord(records, resolver, u),
      matching: (records, u) => identityLib.matchingRecords(records, resolver, u),
      recordIdentity: (r) => identityLib.recordIdentity(r),
      openUrlFor: (r, u) => resolver.preferredUrl(r, u),
      stamp(record, u) {
        const resolved = resolver.resolve(u);
        if (!resolved.id) return record;
        return {
          ...record,
          id: resolved.id,
          provenance: {
            schemaVersion: identityLib.IDENTITY_SCHEMA_VERSION,
            matchedBy: identityLib.IDENTITY_SOURCE.CANONICAL,
            platform: resolved.platform,
            migratedAt: record.ts || 1,
          },
        };
      },
      migrate: (records) => identityLib.migrateRecords(records, resolver),
    },
    _chat: {
      state: {},
      openSubPanel(name, html, bind) {
        const host = document.getElementById('panel-host');
        host.innerHTML = html;
        panels[name] = true;
        bind?.();
        return true;
      },
      closeSubPanel() {},
    },
    $: (sel) => document.querySelector(sel),
    $id: (id) => document.getElementById(id),
    t: (map) => (map && map.en) || '',
    escapeHtml: (text) =>
      String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;'),
    registerModule() {},
    whenActive: (cb) => cb(),
    location,
  };
}

/**
 * Load one content module with its ambient globals supplied as parameters.
 *
 * `location` is a parameter because jsdom's own is not configurable, and the
 * whole point of these tests is to move between two real origins. `document`
 * stays the real jsdom document so the panels render for real.
 */
function loadModule(
  file,
  { sb, location, chrome: chromeStub, windowExtras = {}, document: documentObject = document },
) {
  const fakeWindow = Object.assign(
    {
      _sb: sb,
      _sbLessonIdentity: identityLib,
      sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      addEventListener() {},
    },
    windowExtras,
  );
  new Function(
    'window',
    'document',
    'location',
    'chrome',
    'console',
    'setInterval',
    'requestAnimationFrame',
    'A11Y_LABELS',
    'NOTE_LABELS',
    'BOOKMARK_LABELS',
    'RESUME_LABELS',
    read('src', 'content', file),
  )(
    fakeWindow,
    documentObject,
    location,
    chromeStub,
    console,
    () => 0,
    (cb) => cb(),
    constants.A11Y_LABELS,
    constants.NOTE_LABELS,
    constants.BOOKMARK_LABELS,
    constants.RESUME_LABELS,
  );
  return fakeWindow;
}

/**
 * Let every queued async step run.
 *
 * These modules await the identity table, then a storage callback, then a
 * serialized write queue — three links, so a couple of microtask ticks is not
 * enough and a test that used them would read storage before the write landed.
 */
async function flush() {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Open the notes panel, write `text`, and press save — the real user path. */
async function writeNote(sb, text) {
  sb._chat.toggleNotesPanel();
  await flush();
  document.getElementById('si18n-note-add').click();
  document.getElementById('si18n-note-input').value = text;
  document.getElementById('si18n-note-save').click();
  await flush();
}

/** Open the notes panel and read what the compose box preloads for this page. */
async function readNote(sb) {
  sb._chat.toggleNotesPanel();
  await flush();
  document.getElementById('si18n-note-add').click();
  return document.getElementById('si18n-note-input').value;
}

beforeEach(() => {
  document.body.innerHTML = '<div id="panel-host"></div>';
  document.title = 'A lesson';
});

// ────────────────────────────────────────────────────────────────────

describe('notes across platforms', () => {
  test('a note written on Skilljar is found on Academy', async () => {
    const chromeStub = makeChrome();

    const onSkilljar = makeSb(new URL(PAIR.skilljar));
    loadModule('notes.js', { sb: onSkilljar, location: new URL(PAIR.skilljar), chrome: chromeStub });
    await writeNote(onSkilljar, 'the credential goes in the x-api-key header');

    const stored = chromeStub._store.sb_notes;
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(PAIR.id);
    expect(stored[0].url).toBe(PAIR.skilljar);

    // Same learner, same lesson, other platform.
    document.body.innerHTML = '<div id="panel-host"></div>';
    const onAcademy = makeSb(new URL(PAIR.academy));
    loadModule('notes.js', { sb: onAcademy, location: new URL(PAIR.academy), chrome: chromeStub });
    expect(await readNote(onAcademy)).toBe('the credential goes in the x-api-key header');
  });

  test('a note for a DIFFERENT lesson is not offered', async () => {
    const chromeStub = makeChrome({
      sb_notes: [{ url: PAIR.skilljar, id: PAIR.id, title: 'x', text: 'about lesson one', ts: 1 }],
    });
    const elsewhere = new URL(UNMATCHED);
    const sb = makeSb(elsewhere);
    loadModule('notes.js', { sb, location: elsewhere, chrome: chromeStub });
    expect(await readNote(sb)).toBe('');
  });

  test('an unmatched lesson still keeps its own note, keyed by URL', async () => {
    const chromeStub = makeChrome();
    const here = new URL(UNMATCHED);
    const sb = makeSb(here);
    loadModule('notes.js', { sb, location: here, chrome: chromeStub });
    await writeNote(sb, 'a note on a lesson the report could not match');

    const stored = chromeStub._store.sb_notes;
    expect(stored).toHaveLength(1);
    // No canonical id — and that is correct, not a failure. The record behaves
    // exactly as it did before identity existed.
    expect(stored[0].id).toBeUndefined();
    expect(stored[0].url).toBe(UNMATCHED);

    document.body.innerHTML = '<div id="panel-host"></div>';
    const again = makeSb(new URL(UNMATCHED));
    loadModule('notes.js', { sb: again, location: new URL(UNMATCHED), chrome: chromeStub });
    expect(await readNote(again)).toBe('a note on a lesson the report could not match');
  });

  test('a legacy URL-keyed note is migrated on load, and its text survives', async () => {
    // Written before any of this shipped: a bare record with no id.
    const chromeStub = makeChrome({
      sb_notes: [{ url: PAIR.skilljar, title: 'Legacy', text: 'written before the move', ts: 1 }],
    });
    const onAcademy = new URL(PAIR.academy);
    const sb = makeSb(onAcademy);
    loadModule('notes.js', { sb, location: onAcademy, chrome: chromeStub });

    expect(await readNote(sb)).toBe('written before the move');
    const stored = chromeStub._store.sb_notes;
    expect(stored[0].id).toBe(PAIR.id);
    expect(stored[0].legacyUrls).toEqual([PAIR.skilljar]);
    expect(stored[0].provenance.matchedBy).toBe('canonical');
    // The original URL is preserved, not overwritten with where we are now.
    expect(stored[0].url).toBe(PAIR.skilljar);
  });

  test('saving on the second platform replaces the lesson note rather than adding a twin', async () => {
    const chromeStub = makeChrome({
      sb_notes: [{ url: PAIR.skilljar, title: 'Legacy', text: 'first version', ts: 1 }],
    });
    const onAcademy = new URL(PAIR.academy);
    const sb = makeSb(onAcademy);
    loadModule('notes.js', { sb, location: onAcademy, chrome: chromeStub });
    await writeNote(sb, 'second version');

    const stored = chromeStub._store.sb_notes;
    expect(stored).toHaveLength(1);
    expect(stored[0].text).toBe('second version');
    expect(stored[0].id).toBe(PAIR.id);
  });
});

describe('bookmarks across platforms', () => {
  /** Open the bookmarks panel and return the rendered rows. */
  async function openBookmarks(sb) {
    sb._chat.toggleBookmarksPanel();
    await flush();
    return Array.from(document.querySelectorAll('.si18n-bm-title')).map((el) => el.textContent);
  }

  test('a Skilljar bookmark is recognised as the current page on Academy', async () => {
    const chromeStub = makeChrome({
      sb_bookmarks: [{ url: PAIR.skilljar, title: 'Accessing the API', scrollY: 420, ts: 1 }],
    });
    const onAcademy = new URL(PAIR.academy);
    const sb = makeSb(onAcademy);
    loadModule('bookmarks.js', { sb, location: onAcademy, chrome: chromeStub });
    expect(await openBookmarks(sb)).toEqual(['Accessing the API']);

    // Re-bookmarking here replaces it rather than creating a second row for
    // what is the same lesson.
    sb.toggleBookmarks?.();
    document.getElementById('si18n-bm-add')?.click();
    expect(chromeStub._store.sb_bookmarks).toHaveLength(1);
    expect(chromeStub._store.sb_bookmarks[0].id).toBe(PAIR.id);
  });

  test('a bookmark for an unmatched lesson is untouched by migration', async () => {
    const chromeStub = makeChrome({
      sb_bookmarks: [{ url: UNMATCHED, title: 'Unmatched', scrollY: 10, ts: 1 }],
    });
    const here = new URL(UNMATCHED);
    const sb = makeSb(here);
    loadModule('bookmarks.js', { sb, location: here, chrome: chromeStub });
    await openBookmarks(sb);

    const stored = chromeStub._store.sb_bookmarks;
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe('Unmatched');
    expect(stored[0].scrollY).toBe(10);
    expect(stored[0].id).toBeUndefined();
  });
});

describe('recent lessons across platforms', () => {
  test('an Academy lesson is recorded at all — the Skilljar path shape misses it', async () => {
    // /courses/<c>/<slug> carries no numeric id, so the old lesson-page test
    // matched nothing on Academy and no visit was ever recorded there.
    const chromeStub = makeChrome();
    const onAcademy = new URL(PAIR.academy);
    const sb = makeSb(onAcademy);
    loadModule('resume.js', { sb, location: onAcademy, chrome: chromeStub });
    await flush();

    const stored = chromeStub._store.sb_recent;
    expect(stored).toHaveLength(1);
    expect(stored[0].url).toBe(PAIR.academy);
    expect(stored[0].id).toBe(PAIR.id);
  });

  test("the record is carried over, but the other platform's scroll offset is not", async () => {
    // Identity is shared across platforms; a pixel offset is not. The two
    // sites lay the same lesson out differently, so restoring 640px from
    // Skilljar would drop the learner at an arbitrary point on Academy and
    // read as a bug in resume. The lesson is recognised; the position starts
    // fresh for this platform.
    const chromeStub = makeChrome({
      sb_recent: [{ url: PAIR.skilljar, title: 'Accessing the API', scrollY: 640, ts: 1 }],
    });
    const onAcademy = new URL(PAIR.academy);
    const sb = makeSb(onAcademy);
    loadModule('resume.js', { sb, location: onAcademy, chrome: chromeStub });
    await flush();

    const stored = chromeStub._store.sb_recent;
    expect(stored).toHaveLength(1);
    expect(stored[0].url).toBe(PAIR.academy);
    expect(stored[0].scrollY).toBe(0);
    // The Skilljar position is preserved under its own platform, so returning
    // there still lands where the learner left off.
    expect(stored[0].positions.skilljar).toBe(640);
  });

  test('a catalog page records nothing on either platform', async () => {
    const chromeStub = makeChrome();
    const catalog = new URL('https://academy.claude.com/courses/building-with-the-claude-api');
    const sb = makeSb(catalog);
    loadModule('resume.js', { sb, location: catalog, chrome: chromeStub });
    await flush();
    expect(chromeStub._store.sb_recent).toBeUndefined();
  });

  test('an assessment verdict removes only the current provisional row', async () => {
    const assessmentUrl = 'https://academy.claude.com/courses/claude-code-101/quiz-on-tools';
    const historicalAssessmentUrl = 'https://academy.claude.com/courses/other-course/final-assessment';
    const chromeStub = makeChrome({
      sb_recent: [
        { url: assessmentUrl, title: 'Provisional current row', scrollY: 0, ts: 2 },
        { url: historicalAssessmentUrl, title: 'Unrelated historical row', scrollY: 0, ts: 1 },
      ],
    });
    const here = new URL(assessmentUrl);
    const sb = makeSb(here);
    // Reproduce a late DOM detector: the route was provisionally recorded
    // before the authoritative assessment verdict arrived.
    sb.isExamPage = false;
    const eventDocument = document.implementation.createHTMLDocument('Quiz');
    loadModule('resume.js', { sb, location: here, chrome: chromeStub, document: eventDocument });
    await flush();

    sb.isExamPage = true;
    eventDocument.dispatchEvent(new CustomEvent('skillbridge:assessmentstate', { detail: { isAssessment: true } }));
    await flush();

    expect(chromeStub._store.sb_recent.map((r) => r.url)).toEqual([historicalAssessmentUrl]);
  });

  test('an assessment or certification page is not retained on initial load', async () => {
    for (const blockedState of [{ isExamPage: true }, { certDisabled: true }]) {
      const blockedUrl = new URL(
        blockedState.certDisabled
          ? 'https://anthropic.skilljar.com/claude-certified-architect-foundations-access-request'
          : 'https://academy.claude.com/courses/claude-code-101/quiz-on-tools',
      );
      const chromeStub = makeChrome({
        sb_recent: [{ url: blockedUrl.href, title: 'Must be removed', scrollY: 0, ts: 1 }],
      });
      const sb = Object.assign(makeSb(blockedUrl), blockedState);
      const eventDocument = document.implementation.createHTMLDocument('Blocked');

      loadModule('resume.js', {
        sb,
        location: blockedUrl,
        chrome: chromeStub,
        document: eventDocument,
      });
      await flush();

      expect(chromeStub._store.sb_recent).toEqual([]);
    }
  });

  test('a settled lesson verdict records quiz-to-lesson SPA navigation', async () => {
    const here = new URL('https://academy.claude.com/courses/claude-code-101/quiz-on-tools');
    const chromeStub = makeChrome();
    const sb = Object.assign(makeSb(here), { isExamPage: true });
    const eventDocument = document.implementation.createHTMLDocument('Quiz');
    loadModule('resume.js', { sb, location: here, chrome: chromeStub, document: eventDocument });
    await flush();
    expect(chromeStub._store.sb_recent).toBeUndefined();

    here.href = PAIR.academy;
    sb.isExamPage = false;
    eventDocument.title = 'Lesson after quiz';
    eventDocument.dispatchEvent(new CustomEvent('skillbridge:assessmentstate', { detail: { isAssessment: false } }));
    await flush();

    expect(chromeStub._store.sb_recent).toHaveLength(1);
    expect(chromeStub._store.sb_recent[0]).toMatchObject({
      url: PAIR.academy,
      id: PAIR.id,
      title: 'Lesson after quiz',
    });
  });
});
