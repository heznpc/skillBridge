# Testing & Debugging Guide

This guide covers how to run tests, debug the extension, and troubleshoot common issues. Unless a section says "raw developer build," browser tests target `dist/bundled`, the no-AI Chrome Web Store package.

---

## Running Tests

### All tests

```bash
npm install   # first time only
npm test      # runs all Jest tests
```

### Single test file

```bash
npx jest tests/translator.test.js
npx jest tests/format-response.test.js
npx jest tests/constants.test.js
npx jest tests/protected-terms.test.js
```

### Watch mode (re-runs on file change)

```bash
npx jest --watch
npx jest --watch tests/translator.test.js   # single file
```

### With coverage report

```bash
npx jest --coverage
```

Coverage report is generated at `coverage/lcov-report/index.html`.

### Verbose output (see individual test names)

```bash
npx jest --verbose
```

---

## Test Architecture

### How tests load source code

Since SkillBridge uses IIFEs (no ES modules/CommonJS), tests extract functions from source files at runtime:

```
tests/constants.test.js      → reads src/lib/constants.js via eval
tests/translator.test.js     → reads src/lib/translator.js via eval
tests/format-response.test.js → extracts functions via regex from sidebar-chat.js + content.js
tests/protected-terms.test.js → re-implements logic (legacy pattern)
```

**If you change function signatures or add new dependencies**, the regex extraction in `format-response.test.js` may need updating. The regex matches function boundaries by indentation level.

### Test files overview

| File | Tests | What it covers |
|------|-------|----------------|
| `translator.test.js` | ~80 | `staticLookup`, `_normalizeTypography`, `getProtectedTerms`, constructor, dictionary loading |
| `protected-terms.test.js` | ~50 | Protected term map building, term replacement, per-language dictionaries |
| `constants.test.js` | ~20 | Value validation, threshold ranges, language list integrity, i18n label coverage |
| `format-response.test.js` | ~18 | Markdown-to-HTML conversion, XSS escaping, heading/list/inline formatting |
| `glossary-checker.test.js` | ~10 | Cross-language glossary consistency, protected terms validation |

### Tested end-to-end (Playwright, in CI)

A Playwright E2E suite loads the built extension into headed Chromium (xvfb in
CI — see the `e2e` job in `.github/workflows/ci.yml`) and exercises the
integrated CWS flows: page load → translate → restore, popup startup, SPA
navigation, lazy translation, IndexedDB cache, protected-term restoration,
local learning tools, exam-mode safety, code-comment translation, PDF-export
sanitization, and the no-RHC/no-AI package boundary. Specs live in
`tests/e2e/` (`npm run test:e2e`).

### Thin coverage / known gaps

- Unit-level coverage of `content.js` DOM helpers and `background.js` internals
  beyond what the E2E suite exercises
- Real YouTube iframe caption activation (E2E can't drive the embedded player)
- **Archived AI regression references** — `tutor-chat`, `tutor-offline`,
  `chat-history`, and `stream-cancel` remain in `tests/e2e/` as historical
  regression references, but `run-e2e` no longer executes them and the current
  helper loads only `dist/bundled`. They are not a runnable developer suite.
  Reactivating them requires a separate remote-free developer harness; until
  then, they provide no release evidence for either the CWS or raw AI path.
- Visual / dark-mode QA, mobile layout, long-session memory — manual only

---

## Debugging the Extension

### Loading for development

To test the CWS-equivalent package:

```bash
npm run build:bundle
```

1. Open `chrome://extensions`
2. Enable **Developer Mode** (top-right toggle)
3. Click **Load unpacked** → select `dist/bundled`
4. After code changes: click the **reload button** (circular arrow) on the extension card, then refresh the Skilljar page

Loading the repository root instead uses the raw developer configuration. That
configuration retains the optional Puter-based AI gateway and must not be used
to validate CWS privacy, permissions, remote-code status, or screenshots.

### Content Script debugging

Content scripts run in the context of `anthropic.skilljar.com` pages.

1. Navigate to any page on `anthropic.skilljar.com`
2. Open DevTools (`F12` or `Cmd+Option+I`)
3. **Console tab** → filter by `[SkillBridge]` to see extension logs
4. **Sources tab** → `Content scripts` → `SkillBridge` to set breakpoints
5. **Elements tab** → inspect injected UI (sidebar, header controls, banner)

Key console prefixes:
- `[SkillBridge]` — main content script
- `[SkillBridge PageBridge]` — raw developer build only; absent from CWS

### Service Worker debugging

The background service worker has a **separate** DevTools console.

1. Go to `chrome://extensions`
2. Find SkillBridge → click **"service worker"** link
3. A new DevTools window opens for the service worker
4. Check Console for Google Translate errors, rate limiting logs

### Network debugging

1. DevTools → **Network tab**
2. Useful filters:
   - `translate.googleapis.com` — Google Translate API calls
   - `api.github.com` — background public release check
   - `puter` — raw developer build only; any Puter request in the CWS bundle is a release blocker

Embedded YouTube players make their own page/frame requests. SkillBridge no
longer fetches InnerTube or captions and requests no YouTube host permission.

### IndexedDB inspection

1. DevTools → **Application tab** → **IndexedDB**
2. CWS data:
   - `skillbridge-cache` → `translations` store — cached translations (30-day TTL)
   - local learning-tool state is stored through `chrome.storage.local`

The raw developer AI path may also create `skillbridge-tutor`; that database is
not part of the CWS feature set.

To clear the cache:
- Right-click the database → **Delete database**
- Or: DevTools → Application → Storage → **Clear site data**

### Extension storage inspection

1. DevTools → **Application tab** → **Local Storage** or run in console:

```js
chrome.storage.local.get(null, data => console.log(data));
```

Stored keys: `targetLanguage`, `autoTranslate`, `darkMode`, `welcomeShown`, `fabSeen`

---

## Common Issues & Troubleshooting

### Translation changes not appearing

**Cause:** IndexedDB cache returns stale translations.

**Fix:** Clear the `skillbridge-cache` IndexedDB database (Application tab → IndexedDB → right-click → Delete database), then refresh the page.

### Extension not activating

**Cause:** The extension only activates on `*.skilljar.com` pages.

**Fix:** Make sure you're on `anthropic.skilljar.com`, not `anthropic.com/learn` (which redirects).

### Raw developer AI gateway issues

`Bridge not ready`, Puter authentication, and AI Tutor troubleshooting apply
only when the repository root is loaded as an unpacked developer build. The CWS
bundle must not initialize the page bridge or make Puter requests. If it does,
stop release testing and treat that as a package-boundary defect.

### Google Translate rate limiting

**Cause:** Built-in rate limiter caps at 120 requests/minute.

**Fix:** Wait 60 seconds. The rate limiter uses a sliding window. On large pages (500+ elements), the first load may hit the limit but subsequent loads use the IndexedDB cache.

### Dark mode not applying to some elements

**Cause:** The extension toggles `.si18n-dark` on `<html>`. Some third-party injected elements may not be covered by CSS rules.

**Fix:** File a bug report with a screenshot showing the unstyled element and its CSS selector.

### YouTube subtitles not auto-activating

**Cause:** YouTube embed iframes must support `enablejsapi=1`. Some restricted embeds block this.

**Fix:**
- Check if the video plays in a YouTube iframe (vs. custom player)
- Check console for `[SkillBridge YT]` messages
- Subtitles retry with exponential backoff (500ms → 8s), so wait a few seconds

### Tests failing after source changes

**Cause:** `format-response.test.js` extracts functions via regex. If you change the function structure (indentation, add/remove blank lines between `formatResponse` and `applyInline`), the regex may fail.

**Fix:** Update the regex in `tests/format-response.test.js` lines 22-28 to match the new function boundaries.

---

## Data Flow Reference

```
User visits anthropic.skilljar.com
  │
  ├── content.js initializes
  │     ├── Injects header controls (language selector, dark mode toggle)
  │     ├── Injects local tools / language sidebar
  │     ├── Injects floating action button
  │     └── Starts MutationObserver for dynamic content
  │
  ├── Translation pipeline (translator.js)
  │     ├── 1. Static dictionary lookup (src/data/*.json) → instant, local
  │     ├── 2. IndexedDB cache check → instant, local
  │     ├── 3. Google Translate API (via background.js) → external
  │     ├── 4. Protected terms auto-fix → instant, local
  │     └── 5. IndexedDB result cache → local, 30-day TTL
  │
  ├── Local learning tools
  │     ├── Flashcards, bookmarks, recent lessons, progress dashboard
  │     ├── Outline, reading progress, and PDF export
  │     └── State stored in the browser
  │
  └── YouTube subtitles (youtube-subtitles.js)
        ├── Detects YouTube embed iframes
        ├── Enables captions via postMessage API
        └── Sets target language without a YouTube host permission
```

### Module communication

```
content.js ←──window._sb──→ header-controls.js
     │                            sidebar-chat.js
     │                            local learning-tool modules
     │
     ├── chrome.runtime.sendMessage ──→ background.js (Google Translate proxy)
     └── chrome.storage / IndexedDB ─→ local preferences, cache, and study state
```

The raw developer build adds a separate page-bridge → Puter → Gemini/Claude
path. It is intentionally absent from the CWS data-flow diagram and artifact.

### IndexedDB schema

**`skillbridge-cache`** (translations):
```
{
  key: "{lang}:{original_text}",    // primary key
  text: "translated text",
  ts: 1710000000000                 // timestamp for 30-day TTL
}
```

**Raw developer build only — `skillbridge-tutor`** (conversations):
```
{
  id: auto-increment,               // primary key
  question: "user's message",
  answer: "AI response (raw markdown)",
  lang: "ko",
  chapter: "Claude 101",            // from page h1
  timestamp: 1710000000000,         // index
  url: "https://anthropic.skilljar.com/..."
}
```

---

## CI Pipeline

The CI workflow (`.github/workflows/ci.yml`) runs on every push to `main` and on PRs:

1. **Validate** — checks manifest, translation JSON, glossary consistency, i18n keys, locale contamination, dictionary coverage, shared constants, dictionary freshness, plugin sync, and live Skilljar selectors
2. **Build** — builds the Firefox artifact and bundled Chrome artifact
3. **Test** — runs all Jest tests
4. **E2E** — loads the built extension into Chromium and runs the Playwright suite

The CWS CD workflow (`.github/workflows/cd.yml`) runs after successful CI on `main` or by manual dispatch, then applies its own deploy-relevant file gate. Live publish is blocked unless CWS secrets are configured, `CWS_PUBLICATION_PAUSED` is off (or manually forced), the secret listing target matches SkillBridge, and `CWS_DASHBOARD_READY_VERSION` equals the manifest version. Draft uploads (`publish=false`) do not create the live `cws-v*` deployed tag.

---

## Manual QA Checklist

Use this checklist before releases or when reviewing PRs that touch core functionality. Copy into your PR description and check off items as you verify them.

### Core Translation

- [ ] Visit `anthropic.skilljar.com` → select a non-English language → page translates
- [ ] Progress bar appears and completes
- [ ] Switch back to English → original text restores correctly
- [ ] Protected terms (Claude, Anthropic, API, SDK) remain in English after translation
- [ ] Navigate to a different lesson → auto-translate triggers if enabled
- [ ] Refresh page → cached translations load instantly (check Network tab — no GT calls for cached text)

### Local Learning Tools

- [ ] Click the floating language/tools button → sidebar opens with no chat input
- [ ] Open flashcards → course glossary deck appears and review state persists
- [ ] Add a bookmark → exact lesson position appears in Bookmarks
- [ ] Open Continue/Recent → visited lesson and scroll position appear
- [ ] Open dashboard → local course and progress summaries render
- [ ] Open outline → heading links navigate within the lesson
- [ ] Export PDF → translated lesson renders without extension controls
- [ ] Network tab shows no Puter, Gemini, Claude, or page-bridge request

### Keyboard Shortcuts

- [ ] `Ctrl+Shift+S` (or `Cmd+Shift+S` on Mac) → toggles sidebar
- [ ] `Ctrl+Shift+L` → toggles dark mode
- [ ] `Ctrl+Shift+/` → shows shortcut help overlay
- [ ] `Escape` → closes help overlay or sidebar
- [ ] Shortcuts do NOT fire when typing in textarea/input fields

### Exam Mode (Course Quizzes)

- [ ] Navigate to a quiz/assessment page → exam banner appears at top
- [ ] Answer choices (radio/checkbox labels) are NOT translated
- [ ] Question text and page headings ARE translated
- [ ] Local tools do not expose or translate quiz answer choices

### Certification Exam Kill-Switch

- [ ] Navigate to a certification URL (e.g., `/claude-certified-architect-foundations`) → extension does NOT inject anything (no FAB, no header controls, no sidebar)
- [ ] Console shows `[SkillBridge] Certification exam page detected — extension disabled.`
- [ ] SPA navigation to a certification page → extension tears down (translations restored, observer disconnected)
- [ ] SPA navigation back from certification page to a course → translations re-apply

### Onboarding (First Visit)

- [ ] Clear extension storage → visit Anthropic Academy → onboarding banner appears
- [ ] **English browser**: banner shows "SkillBridge is ready" with language selector and "Choose Language" / "Got it" buttons
- [ ] **Non-English browser**: banner shows translate prompt in detected language
- [ ] Click "Got it" / dismiss → banner doesn't reappear on refresh
- [ ] FAB button pulses on first visit (3 cycles), stops on click
- [ ] Sidebar first open → language and local tools are available without an AI chat surface

### SPA Navigation

- [ ] Navigate between lessons without full page reload → new content translates automatically
- [ ] URL changes (pushState) are detected → exam mode re-evaluated

### Dark Mode

- [ ] Toggle dark mode → entire page goes dark (header, content, sidebar, footer)
- [ ] Refresh page → dark mode persists
- [ ] Exam banner renders correctly in dark mode
- [ ] Shortcut help overlay renders correctly in dark mode

### YouTube Subtitles

- [ ] Page with embedded YouTube video → play video → translated subtitles activate
- [ ] Subtitle language matches selected translation language

### Cross-Browser (Beta)

- [ ] **Chrome**: load unpacked → all features work
- [ ] **Firefox**: `npm run build:firefox` → load temporary add-on from `dist/firefox/` → extension loads without errors
- [ ] **Firefox**: basic translation works (select language, page translates)
- [ ] **Edge**: load unpacked → all features work

### Security Spot-Check

- [ ] Open DevTools Console → no errors containing `[SkillBridge]`
- [ ] Extension-origin network requests are limited to `translate.googleapis.com` and the periodic `api.github.com` release check
- [ ] No CWS runtime request reaches Puter, Gemini, Claude models, `page-bridge.js`, or `src/bridge/puter.js`; the packaged files and manifest omit the bridge/SDK even though dormant shared-source strings may remain in `content.bundle.js`
- [ ] Application tab → IndexedDB → `skillbridge-cache` entries have timestamps (TTL working)

---

## Firefox Testing Guide (Beta)

Firefox support is currently in **beta**. Use this guide to test.

### Setup

```bash
npm run build:firefox          # generates dist/firefox/
```

### Load in Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Navigate to `dist/firefox/manifest.json`

> Temporary add-ons are removed when Firefox restarts.

### What to Test

| Feature | Expected | Known Issues |
|---------|----------|-------------|
| Page translation | Works (GT + static dict) | None known |
| Optional raw-source AI gateway | Developer build only; not CWS | Untested |
| Dark mode | Should work (CSS-only) | Untested |
| Keyboard shortcuts | Should work | Untested |
| YouTube subtitles | May not work | iframe postMessage differences |
| Exam mode | Should work | Untested |

### Reporting Firefox Issues

File a bug with:
- Firefox version (`about:support` → Application Basics → Version)
- Console errors (F12 → Console → filter `[SkillBridge]`)
- Steps to reproduce
