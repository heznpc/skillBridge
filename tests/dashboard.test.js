/**
 * Unit tests for local progress dashboard aggregation.
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

const dashboardSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'dashboard.js'), 'utf8');

function loadDashboardWithStorage(storage) {
  const fakeWindow = {
    _sb: {
      _chat: { state: {}, closeSubPanel: () => {} },
      escapeHtml: (value) => String(value ?? ''),
      t: (map) => map.en,
      $id: () => null,
      registerModule: () => {},
    },
    location: { href: 'https://anthropic.skilljar.com/lesson' },
  };
  const fakeChrome = {
    storage: {
      local: {
        get: (_keys, cb) => cb(storage),
      },
    },
  };

  new Function('window', 'chrome', 'FLASHCARD_BOX', 'DASHBOARD_LABELS', 'RESUME_LABELS', 'A11Y_LABELS', dashboardSrc)(
    fakeWindow,
    fakeChrome,
    Object.freeze({ NEW: 0, LEARNING: 1, MASTERED: 2 }),
    {
      lessons: { en: 'Lessons' },
      bookmarks: { en: 'Bookmarks' },
      decks: { en: 'Decks' },
      mastered: { en: 'Mastered' },
    },
    { title: { en: 'Recent' } },
    { backToChat: { en: 'Back' } },
  );
  return fakeWindow._sb._chat.collectDashboardStats;
}

describe('dashboard collectStats', () => {
  test('counts FLASHCARD_BOX.MASTERED as mastered', () =>
    new Promise((resolve) => {
      const collectStats = loadDashboardWithStorage({
        sb_recent: [{ url: 'https://example.test/1', title: 'One' }],
        sb_bookmarks: [{ url: 'https://example.test/2', title: 'Two' }],
        fc_course_ko: {
          boxes: {
            alpha: 0,
            beta: 1,
            gamma: 2,
          },
        },
        fc_other_ko: {
          boxes: {
            delta: 2,
          },
        },
      });

      collectStats((stats) => {
        expect(stats.recent).toHaveLength(1);
        expect(stats.bookmarks).toHaveLength(1);
        expect(stats.decks).toBe(2);
        expect(stats.tracked).toBe(4);
        expect(stats.mastered).toBe(2);
        resolve();
      });
    }));
});
