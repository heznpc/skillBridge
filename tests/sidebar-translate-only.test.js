/**
 * @jest-environment jsdom
 *
 * Unit tests for the `hostCaps.bridge === false` surface in sidebar-chat.js.
 *
 * `getHostCapabilities` gives claude.com tutorials and non-Anthropic Skilljar
 * tenants `bridge: false`, and `tests/platform.test.js` proves the profile
 * table says so. Nothing proved what the code READING that flag then does —
 * seven branches across sidebar-chat.js and keyboard-shortcuts.js had no
 * coverage at any level, so the same FAB could have opened an AI chat on a host
 * with no AI transport and every test would still have passed.
 *
 * E2E cannot reach these hosts: `context.route().fulfill()` does not trigger MV3
 * content-script injection (see helpers/network-stubs.js), so a spec would need
 * a real HTTPS origin answering to `claude.com` — Chrome host-resolver rules, a
 * self-signed cert and `--ignore-certificate-errors`. That is a lot of new
 * release-gate flake surface for branches that are plain functions of one
 * object on `sb`. Same call, and same reason, as
 * tests/translation-scope.test.js.
 *
 * Functions are extracted from the real source (never re-implemented) so a
 * production change cannot pass green.
 */
/* global describe, test, expect */
const fs = require('fs');
const path = require('path');

const SIDEBAR_SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'sidebar-chat.js'), 'utf8');
const SHORTCUTS_SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'keyboard-shortcuts.js'), 'utf8');

/** Pull one `  function name() { ... }` block out of an IIFE source file. */
function extractFunction(source, name) {
  const start = source.indexOf(`  function ${name}(`);
  if (start === -1) throw new Error(`Could not find ${name} — did the source shape change?`);
  const end = source.indexOf('\n  }\n', start);
  if (end === -1) throw new Error(`Could not find the end of ${name}`);
  return source.slice(start, end + 4);
}

/**
 * Build `getSidebarHTML` with a fake namespace. Label lookups collapse to the
 * key name so assertions read clearly and do not depend on translation copy.
 */
function buildSidebarHTML({ bridge }) {
  const label = (key) => `«${key}»`;
  const sb = {
    hostCaps: { bridge },
    t: (map) => (typeof map === 'string' ? map : label(map && map.__key)),
    escapeHtml: (text) =>
      String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;'),
  };
  // Every label map the function touches. Each carries its own key so the
  // stub `t()` can name it in the output.
  const named = (key) => ({ __key: key });
  const globals = {
    A11Y_LABELS: {
      closeSidebar: named('closeSidebar'),
      chatHistory: named('chatHistory'),
    },
    MENU_LABELS: { tools: named('tools'), dashboard: named('dashboard') },
    FLASHCARD_LABELS: { openFlashcards: named('openFlashcards') },
    PDF_EXPORT_LABELS: { title: named('pdfTitle') },
    BOOKMARK_LABELS: { openBookmarks: named('openBookmarks') },
    RESUME_LABELS: { openRecent: named('openRecent') },
    CHAT_PLACEHOLDERS: named('chatPlaceholder'),
    SEND_LABELS: named('send'),
    CHOOSE_LANGUAGE_LABEL: named('chooseLanguage'),
    AVAILABLE_LANGUAGES: [
      { code: 'en', label: 'English' },
      { code: 'ko', label: '한국어' },
    ],
    // Greeting and example questions are the tutor's own content; stubbed
    // because these tests are about which panel appears, not its copy.
    getTutorGreeting: () => '«greeting»',
    getExampleQuestionsHTML: () => '«examples»',
  };

  const body = [
    extractFunction(SIDEBAR_SRC, 'getSidebarHTML'),
    extractFunction(SIDEBAR_SRC, 'langPanelHTML'),
    extractFunction(SIDEBAR_SRC, 'chatPanelHTML'),
    'return getSidebarHTML();',
  ].join('\n');

  const names = ['sb', ...Object.keys(globals)];
  const values = [sb, ...Object.values(globals)];
  return new Function(...names, body)(...values);
}

describe('sidebar surface when the host has no AI bridge', () => {
  test('a bridge host renders the chat panel, not the language panel', () => {
    const html = buildSidebarHTML({ bridge: true });
    expect(html).toContain('si18n-chat-input');
    expect(html).toContain('SkillBridge Tutor');
    expect(html).not.toContain('si18n-lang-panel');
  });

  test('a bridge-less host renders the language panel and drops the chat input', () => {
    const html = buildSidebarHTML({ bridge: false });
    expect(html).toContain('si18n-lang-panel');
    // The chat input must be absent, not merely hidden: there is no transport
    // behind it on this host, so a typed question would fail with no
    // explanation.
    expect(html).not.toContain('si18n-chat-input');
    expect(html).not.toContain('si18n-chat-send');
  });

  test('the header title drops "Tutor" where there is no tutor', () => {
    expect(buildSidebarHTML({ bridge: true })).toContain('SkillBridge Tutor');
    const translateOnly = buildSidebarHTML({ bridge: false });
    expect(translateOnly).toContain('SkillBridge');
    expect(translateOnly).not.toContain('SkillBridge Tutor');
  });

  // `getHostCapabilities` returns a frozen profile, but content.js falls back to
  // a hand-built object if platform.js failed to load. An absent flag must read
  // as "bridge present" here so the Skilljar default is never silently
  // downgraded to translate-only.
  test('an undefined bridge flag keeps the tutor surface (=== false, not falsy)', () => {
    const html = buildSidebarHTML({ bridge: undefined });
    expect(html).toContain('si18n-chat-input');
    expect(html).not.toContain('si18n-lang-panel');
  });

  test('local study tools stay available on a bridge-less host', () => {
    const html = buildSidebarHTML({ bridge: false });
    // Flashcards, bookmarks, recent and the dashboard are all local; only the
    // AI transport is missing, so removing them too would be a regression.
    for (const id of ['si18n-fc-btn', 'si18n-bm-btn', 'si18n-recent-btn', 'si18n-dash-btn']) {
      expect(html).toContain(id);
    }
  });
});

describe('bridge flag is read consistently across the surface', () => {
  test('every consumer compares with === false so an absent flag means "bridge present"', () => {
    // A `!hostCaps.bridge` or `!== true` slip anywhere here would turn the
    // Skilljar tutor into the translate-only surface for anyone whose profile
    // object is incomplete (content.js builds one by hand when platform.js
    // failed to load).
    //
    // Counting only the well-formed comparisons would not catch that: a slip
    // makes the regex match FEWER times, not wrong ones. So compare the total
    // number of reads against the number of accepted comparisons — they must be
    // equal, which means no read escapes the accepted forms.
    const reads = SIDEBAR_SRC.match(/hostCaps\?\.bridge/g) || [];
    const accepted = [...SIDEBAR_SRC.matchAll(/hostCaps\?\.bridge\s*([!=]==)\s*false\b/g)];
    expect(reads.length).toBeGreaterThan(0);
    expect(accepted).toHaveLength(reads.length);
  });

  test('the focus-chat shortcut is withheld on a bridge-less host', () => {
    // keyboard-shortcuts.js drops `/` from the help overlay and the key map
    // when there is no chat to focus.
    expect(SHORTCUTS_SRC).toContain("sb.hostCaps?.bridge === false ? [] : [{ key: '/'");
  });

  test('the Ask-Tutor selection button is only wired where the bridge exists', () => {
    expect(SIDEBAR_SRC).toContain('if (sb.hostCaps?.bridge !== false) sb.initAskTutorButton?.();');
  });

  test('event binding routes to the language panel instead of the chat', () => {
    // Two call sites must branch: the initial `bindSidebarEvents` and
    // `restoreChatPanelEvents`, which runs after a sub-panel closes. Miss the
    // second and closing Flashcards on claude.com rebinds a chat that is not
    // there, leaving the language picker dead.
    const callSites = SIDEBAR_SRC.split('bindLanguagePanelEvents();').length - 1;
    expect(callSites).toBe(2);
    for (const caller of ['bindSidebarEvents', 'restoreChatPanelEvents']) {
      const start = SIDEBAR_SRC.indexOf(`  function ${caller}(`);
      expect(start).toBeGreaterThan(-1);
      const end = SIDEBAR_SRC.indexOf('\n  }\n', start);
      expect(SIDEBAR_SRC.slice(start, end)).toContain('bindLanguagePanelEvents();');
    }
  });
});
