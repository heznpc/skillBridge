/**
 * @jest-environment jsdom
 *
 * Behavioural coverage for the real flashcard content-script IIFE. The
 * harness supplies only the browser globals that surround the module; every
 * deck, scheduling, filtering, and persistence transition below is driven
 * through the same public toggle and DOM click handlers used in production.
 */

/* global describe, test, expect, beforeEach, afterEach, jest */

const { readProductionSource } = require('./helpers/production-source');

const flashcardsSrc = readProductionSource('src', 'content', 'chat-flashcards.js');

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 1, 3, 0, 0);
const STORAGE_KEY = 'fc_course-alpha_ko';

const clone = (value) => JSON.parse(JSON.stringify(value));

async function settlePromises() {
  // The dictionary refresh has a fetch → response.json → render chain, while
  // persistence adds a promise before invoking chrome.storage.local.set.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function click(id) {
  const button = document.getElementById(id);
  expect(button).not.toBeNull();
  button.click();
}

function installGlobals() {
  global.FLASHCARD_BOX = Object.freeze({ NEW: 0, LEARNING: 1, MASTERED: 2 });
  global.FLASHCARD_COURSE_SLUGS_SORTED = [['course-alpha', ['sectionAlpha']]];
  global.FLASHCARD_LABELS = {
    title: 'Flashcards',
    reset: 'Reset',
    empty: 'No cards',
    studyAll: 'Study all',
    reviewDue: 'Review due',
    allCaughtUp: 'All caught up',
    boxNew: 'New',
    boxLearning: 'Learning',
    mastered: 'Mastered',
    flip: 'Flip',
    prev: 'Previous',
    next: 'Next',
  };
  global.A11Y_LABELS = { backToSidebar: 'Back to sidebar' };
}

/**
 * Load a fresh instance of the content script with a minimal browser shell.
 * `stored` represents storage before the panel opens. `setImpl` can hold a
 * storage callback to prove that later writes do not overtake it.
 */
function loadFlashcards({
  lang = 'ko',
  staticDict = { 'Persistent vocabulary': '지속 어휘' },
  premiumLanguages = [],
  stored = {},
  fetchImpl = jest.fn(() => Promise.reject(new Error('unexpected fetch'))),
  setImpl,
} = {}) {
  const writes = [];
  const state = { flashcardPanelOpen: false };
  const storage = {
    get: jest.fn((keys, callback) => {
      const result = {};
      for (const key of keys) if (Object.prototype.hasOwnProperty.call(stored, key)) result[key] = clone(stored[key]);
      callback(result);
    }),
    set: jest.fn((data, callback) => {
      writes.push(clone(data));
      if (setImpl) setImpl(data, callback, writes);
      else callback();
    }),
  };

  global.chrome = {
    runtime: { getURL: jest.fn((file) => `chrome-extension://skillbridge/${file}`) },
    storage: { local: storage },
  };
  global.fetch = fetchImpl;

  const sb = {
    currentLang: lang,
    translator: { staticDict, premiumLanguages },
    t: (label) => label,
    escapeHtml: (value) => String(value),
    $id: (id) => document.getElementById(id),
    registerModule: jest.fn(),
    _chat: {
      state,
      openSubPanel: jest.fn((_kind, html, bind) => {
        state.flashcardPanelOpen = true;
        document.body.innerHTML = html;
        bind();
        return true;
      }),
      closeSubPanel: jest.fn(() => {
        state.flashcardPanelOpen = false;
        document.body.innerHTML = '';
      }),
    },
  };
  window._sb = sb;

  new Function(flashcardsSrc)();
  return { sb, state, storage, writes };
}

beforeEach(() => {
  installGlobals();
  document.body.innerHTML = '';
  window.history.replaceState({}, '', '/courses/course-alpha');
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
  jest.restoreAllMocks();
  delete window._sb;
  delete global.chrome;
  delete global.fetch;
  delete global.FLASHCARD_BOX;
  delete global.FLASHCARD_COURSE_SLUGS_SORTED;
  delete global.FLASHCARD_LABELS;
  delete global.A11Y_LABELS;
});

describe('course dictionary loading', () => {
  test('warms a course-section cache, reuses it, and invalidates it when the language changes', async () => {
    const dictionaries = {
      ko: { sectionAlpha: { 'Course-specific vocabulary': '과정 전용 어휘' } },
      ja: { sectionAlpha: { 'Course-specific vocabulary': 'コース専用語彙' } },
    };
    const fetchImpl = jest.fn((url) => {
      const lang = url.includes('/ja.json') ? 'ja' : 'ko';
      return Promise.resolve({ json: () => Promise.resolve(dictionaries[lang]) });
    });
    const { sb } = loadFlashcards({
      staticDict: { 'Fallback vocabulary': '기본 어휘' },
      premiumLanguages: ['ko', 'ja'],
      fetchImpl,
    });

    sb.toggleFlashcardPanel();
    expect(document.querySelector('.si18n-flashcard-front').textContent).toBe('Fallback vocabulary');
    await settlePromises();
    expect(document.querySelector('.si18n-flashcard-front').textContent).toBe('Course-specific vocabulary');
    expect(document.querySelector('.si18n-flashcard-back').textContent).toBe('과정 전용 어휘');
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // Reopening in the same language must synchronously use the warm cache.
    sb.toggleFlashcardPanel();
    sb.toggleFlashcardPanel();
    expect(document.querySelector('.si18n-flashcard-back').textContent).toBe('과정 전용 어휘');
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // A language switch must never render the previous language's raw cache.
    sb.toggleFlashcardPanel();
    sb.currentLang = 'ja';
    sb.translator.staticDict = { 'Fallback vocabulary': '日本語の代替語彙' };
    sb.toggleFlashcardPanel();
    expect(document.querySelector('.si18n-flashcard-back').textContent).toBe('日本語の代替語彙');
    expect(document.body.textContent).not.toContain('과정 전용 어휘');
    await settlePromises();

    expect(document.querySelector('.si18n-flashcard-back').textContent).toBe('コース専用語彙');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(global.chrome.runtime.getURL).toHaveBeenLastCalledWith('src/data/ja.json');
  });
});

describe('Leitner scheduling', () => {
  test('uses 3/7-day promotions and a wrong answer resets the card to NEW with a 1-day due date', async () => {
    const { sb, writes } = loadFlashcards();
    sb.toggleFlashcardPanel();

    click('si18n-fc-box-up');
    await settlePromises();
    expect(writes.at(-1)[STORAGE_KEY]).toEqual({
      boxes: { 'Persistent vocabulary': FLASHCARD_BOX.LEARNING },
      dues: { 'Persistent vocabulary': NOW + 3 * DAY_MS },
      index: 0,
    });

    click('si18n-fc-box-up');
    await settlePromises();
    expect(writes.at(-1)[STORAGE_KEY]).toEqual({
      boxes: { 'Persistent vocabulary': FLASHCARD_BOX.MASTERED },
      dues: { 'Persistent vocabulary': NOW + 7 * DAY_MS },
      index: 0,
    });

    click('si18n-fc-box-down');
    await settlePromises();
    expect(writes.at(-1)[STORAGE_KEY]).toEqual({
      boxes: { 'Persistent vocabulary': FLASHCARD_BOX.NEW },
      dues: { 'Persistent vocabulary': NOW + DAY_MS },
      index: 0,
    });
    expect(document.querySelector('.si18n-fc-box-label').textContent).toBe('New');
  });

  test('review mode contains only cards whose due timestamp has arrived', () => {
    const due = 'Already due vocabulary';
    const future = 'Future vocabulary';
    const { sb } = loadFlashcards({
      staticDict: { [due]: '복습할 어휘', [future]: '나중 어휘' },
      stored: {
        [STORAGE_KEY]: {
          boxes: { [due]: FLASHCARD_BOX.LEARNING, [future]: FLASHCARD_BOX.MASTERED },
          dues: { [due]: NOW - 1, [future]: NOW + DAY_MS },
          index: 0,
        },
      },
    });
    sb.toggleFlashcardPanel();

    expect(document.getElementById('si18n-fc-mode-toggle').textContent).toBe('Review due (1)');
    expect(document.querySelector('.si18n-flashcard-progress').textContent).toContain('1 / 2');
    click('si18n-fc-mode-toggle');

    expect(document.querySelector('.si18n-flashcard-progress').textContent).toContain('1 / 1');
    expect(document.querySelector('.si18n-flashcard-front').textContent).toBe(due);
    expect(document.body.textContent).not.toContain(future);

    click('si18n-fc-box-up');
    expect(document.body.textContent).toContain('All caught up');
  });

  test('legacy progress without dues remains reviewable immediately', () => {
    const term = 'Legacy vocabulary';
    const { sb } = loadFlashcards({
      staticDict: { [term]: '이전 어휘' },
      stored: { [STORAGE_KEY]: { boxes: { [term]: FLASHCARD_BOX.MASTERED }, index: 0 } },
    });
    sb.toggleFlashcardPanel();

    expect(document.querySelector('.si18n-fc-box-label').textContent).toBe('Mastered');
    expect(document.getElementById('si18n-fc-mode-toggle').textContent).toBe('Review due (1)');
    click('si18n-fc-mode-toggle');
    expect(document.querySelector('.si18n-flashcard-front').textContent).toBe(term);
    expect(document.querySelector('.si18n-flashcard-progress').textContent).toContain('1 / 1');
  });
});

describe('persistence ordering', () => {
  test('an unresolved write blocks the next rapid click so the final persisted state wins', async () => {
    const completions = [];
    const { sb, storage, writes } = loadFlashcards({
      setImpl: (_data, callback) => completions.push(callback),
    });
    sb.toggleFlashcardPanel();

    click('si18n-fc-box-up');
    await settlePromises();
    expect(storage.set).toHaveBeenCalledTimes(1);
    expect(writes[0][STORAGE_KEY].boxes['Persistent vocabulary']).toBe(FLASHCARD_BOX.LEARNING);

    click('si18n-fc-box-down');
    await settlePromises();
    expect(storage.set).toHaveBeenCalledTimes(1);

    completions.shift()();
    await settlePromises();
    expect(storage.set).toHaveBeenCalledTimes(2);
    expect(writes[1][STORAGE_KEY]).toEqual({
      boxes: { 'Persistent vocabulary': FLASHCARD_BOX.NEW },
      dues: { 'Persistent vocabulary': NOW + DAY_MS },
      index: 0,
    });
    completions.shift()();
  });
});
