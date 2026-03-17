# Testing & Debugging Guide

This guide covers how to run tests, debug the extension, and troubleshoot common issues.

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

### What is NOT tested (known gaps)

- DOM manipulation (`content.js` — 30+ functions)
- Background service worker (`background.js` — rate limiter, fetchWithRetry)
- Chrome API interactions (message passing, storage, tabs)
- YouTube subtitle logic (`youtube-subtitles.js`)
- Puter.js bridge (`page-bridge.js`)
- E2E flows (page load → translate → restore)

---

## Debugging the Extension

### Loading for development

1. Open `chrome://extensions`
2. Enable **Developer Mode** (top-right toggle)
3. Click **Load unpacked** → select the project root folder
4. After code changes: click the **reload button** (circular arrow) on the extension card, then refresh the Skilljar page

### Content Script debugging

Content scripts run in the context of `anthropic.skilljar.com` pages.

1. Navigate to any page on `anthropic.skilljar.com`
2. Open DevTools (`F12` or `Cmd+Option+I`)
3. **Console tab** → filter by `[SkillBridge]` to see extension logs
4. **Sources tab** → `Content scripts` → `SkillBridge` to set breakpoints
5. **Elements tab** → inspect injected UI (sidebar, header controls, banner)

Key console prefixes:
- `[SkillBridge]` — main content script
- `[SkillBridge PageBridge]` — Puter.js bridge (main world)

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
   - `puter` — Puter.js AI requests (Gemini/Claude)
   - `youtube.com/youtubei` — YouTube InnerTube API calls

### IndexedDB inspection

1. DevTools → **Application tab** → **IndexedDB**
2. Two databases:
   - `skillbridge-cache` → `translations` store — cached translations (30-day TTL)
   - `skillbridge-tutor` → `conversations` store — chat history

To clear the cache:
- Right-click the database → **Delete database**
- Or: DevTools → Application → Storage → **Clear site data**

### Extension storage inspection

1. DevTools → **Application tab** → **Local Storage** or run in console:

```js
chrome.storage.local.get(null, data => console.log(data));
```

Stored keys: `targetLanguage`, `autoTranslate`, `darkMode`, `dismissedBanner`

---

## Common Issues & Troubleshooting

### Translation changes not appearing

**Cause:** IndexedDB cache returns stale translations.

**Fix:** Clear the `skillbridge-cache` IndexedDB database (Application tab → IndexedDB → right-click → Delete database), then refresh the page.

### Extension not activating

**Cause:** The extension only activates on `*.skilljar.com` pages.

**Fix:** Make sure you're on `anthropic.skilljar.com`, not `anthropic.com/learn` (which redirects).

### "Bridge not ready" errors

**Cause:** Puter.js failed to load within the 20-second timeout.

**Fix:**
- Check if `puter.com` is accessible from your network
- Check console for `[SkillBridge PageBridge]` errors
- Try refreshing the page — the bridge auto-retries on load

### AI Tutor not responding

**Cause:** Puter.js free tier may be rate-limited or temporarily unavailable.

**Fix:**
- Check the Network tab for failed Puter.js requests
- Wait a minute and retry
- The tutor requires a Puter.js account for the "user-pays" model

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
  │     ├── Injects sidebar (AI tutor chat)
  │     ├── Injects floating action button
  │     └── Starts MutationObserver for dynamic content
  │
  ├── Translation pipeline (translator.js)
  │     ├── 1. Static dictionary lookup (src/data/*.json) → instant, local
  │     ├── 2. IndexedDB cache check → instant, local
  │     ├── 3. Google Translate API (via background.js) → ~200ms, external
  │     ├── 4. Protected terms auto-fix → instant, local
  │     └── 5. Gemini verification queue (via page-bridge.js → Puter.js) → background, external
  │
  ├── AI Tutor (sidebar-chat.js)
  │     ├── User sends message
  │     ├── Page context appended (title + headings + 2000 chars)
  │     └── Claude Sonnet 4 streaming response (via page-bridge.js → Puter.js) → external
  │
  └── YouTube subtitles (youtube-subtitles.js)
        ├── Detects YouTube embed iframes
        ├── Enables captions via postMessage API
        └── Sets target language subtitle track
```

### Module communication

```
content.js ←──window._sb──→ header-controls.js
     │                            sidebar-chat.js
     │                            text-selection.js
     │
     ├── chrome.runtime.sendMessage ──→ background.js (Google Translate proxy)
     │
     └── window.postMessage ──→ page-bridge.js (main world)
                                    └── puter.ai.chat() → Puter servers → Gemini/Claude
```

### IndexedDB schema

**`skillbridge-cache`** (translations):
```
{
  key: "{lang}:{original_text}",    // primary key
  text: "translated text",
  ts: 1710000000000                 // timestamp for 30-day TTL
}
```

**`skillbridge-tutor`** (conversations):
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

1. **Validate** — checks `manifest.json` and all `src/data/*.json` for valid JSON, required fields (`_meta`), and empty values
2. **Lint** — ESLint with warnings-only mode (max 50 warnings)
3. **Test** — runs all Jest tests

The CD workflow (`.github/workflows/cd.yml`) triggers on push to `main` when `src/**`, `_locales/**`, or `manifest.json` change — it builds a zip and uploads to Chrome Web Store.

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

### AI Tutor

- [ ] Click floating button → sidebar opens
- [ ] Type a question → streaming response appears
- [ ] Response renders markdown (bold, lists, code blocks) correctly
- [ ] Select text on page → "Ask Tutor" button appears → clicking sends quoted text to chat
- [ ] Chat history: click clock icon → history panel shows past conversations
- [ ] Close and reopen sidebar → chat state preserved

### Keyboard Shortcuts

- [ ] `Ctrl+Shift+S` (or `Cmd+Shift+S` on Mac) → toggles sidebar
- [ ] `Ctrl+Shift+L` → toggles dark mode
- [ ] `Ctrl+Shift+/` → shows shortcut help overlay
- [ ] `Escape` → closes help overlay or sidebar
- [ ] `/` (with sidebar open, not in input field) → focuses chat input
- [ ] Shortcuts do NOT fire when typing in textarea/input fields

### Exam Mode

- [ ] Navigate to a quiz/assessment page → exam banner appears at top
- [ ] Answer choices (radio/checkbox labels) are NOT translated
- [ ] Question text and page headings ARE translated
- [ ] AI Tutor shows integrity warning before sending message on exam page
- [ ] AI Tutor refuses to provide direct exam answers

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
- [ ] Network tab → no requests to unexpected domains (only `translate.googleapis.com`, `youtube.com`, `puter.com`)
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
| AI Tutor | Should work (Puter.js) | Untested |
| Dark mode | Should work (CSS-only) | Untested |
| Keyboard shortcuts | Should work | Untested |
| YouTube subtitles | May not work | iframe postMessage differences |
| Exam mode | Should work | Untested |

### Reporting Firefox Issues

File a bug with:
- Firefox version (`about:support` → Application Basics → Version)
- Console errors (F12 → Console → filter `[SkillBridge]`)
- Steps to reproduce
