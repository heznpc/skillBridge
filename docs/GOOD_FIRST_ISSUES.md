# Good First Issues — Ready to File on GitHub

Use these as GitHub issues after the repository goes public. Each one is designed to be approachable for first-time contributors.

---

## Issue 1: Add Portuguese (pt-BR) as a Standard Language
**Labels:** `good first issue`, `i18n`

**Description:**
Portuguese (Brazilian) is one of the most spoken languages worldwide. Add it as a standard language option.

**What to do:**
1. Add `{ code: 'pt', name: 'Português' }` to `AVAILABLE_LANGUAGES` in `src/content/content.js`
2. Add it to the Standard `<optgroup>` in `src/popup/popup.html`
3. Add `'pt': 'Portuguese'` mapping in `src/lib/youtube-subtitles.js` `_ytLangName()`
4. Test on a Skilljar page to verify Google Translate works for pt-BR

---

## Issue 2: Add Hindi Static Dictionary (Promote to Premium)
**Labels:** `good first issue`, `i18n`, `help wanted`

**Description:**
Hindi is a standard language but could be promoted to premium with a curated dictionary. India has a large AI developer community.

**What to do:**
1. Create `src/data/hi.json` with 100+ AI/ML term translations
2. Add `'hi'` to `premiumLanguages` array in `src/lib/translator.js`
3. Native speaker review required

---

## Issue 3: Dark Mode Support for AI Tutor Sidebar
**Labels:** `good first issue`, `enhancement`, `ui`

**Description:**
The AI Tutor sidebar is always light-themed. Add dark mode support that follows the user's system preference.

**What to do:**
1. Add `@media (prefers-color-scheme: dark)` overrides in `src/content/content.css`
2. Override `--si18n-bg`, `--si18n-surface`, `--si18n-text`, `--si18n-border` CSS variables
3. Test sidebar, chat bubbles, and transcript panel in dark mode

---

## Issue 4: Keyboard Shortcut to Open/Close AI Tutor
**Labels:** `good first issue`, `enhancement`

**Description:**
Currently the AI Tutor can only be opened by clicking the floating button. Add a keyboard shortcut (e.g., `Ctrl+Shift+B`) for quick access.

**What to do:**
1. Add a `keydown` event listener in `src/content/content.js`
2. Toggle sidebar open/close on the shortcut
3. Make sure it doesn't conflict with common browser shortcuts

---

## Issue 5: Show Translation Source Badge
**Labels:** `good first issue`, `enhancement`, `ui`

**Description:**
Users can't tell if a translation came from the static dictionary (high quality), cache, or Google Translate (lower quality). Add a subtle badge or tooltip showing the source.

**What to do:**
1. In `src/content/content.js` `processGTQueue()`, track the translation source
2. Add a small indicator (e.g., colored dot or tooltip) next to translated elements
3. Dictionary = green, Gemini-verified = blue, Google Translate only = gray

---

## Issue 6: Improve Gemini Trigger Heuristics
**Labels:** `good first issue`, `translation-quality`

**Description:**
The `queueGeminiVerify()` function in `translator.js` decides which translations need AI verification. Current heuristics may miss some important texts or waste API calls on unimportant ones.

**What to do:**
1. Review the current heuristics in `translator.js` `queueGeminiVerify()`
2. Test on various Skilljar pages and identify false positives/negatives
3. Propose improved conditions with test cases

---

## Issue 7: Add Transcript Panel Auto-Scroll
**Labels:** `good first issue`, `enhancement`, `youtube`

**Description:**
The YouTube transcript panel highlights the active line but doesn't auto-scroll to keep it visible. Add smooth auto-scroll to follow playback.

**What to do:**
1. In `src/lib/youtube-subtitles.js`, find the active line highlighting logic
2. Add `scrollIntoView({ behavior: 'smooth', block: 'center' })` when active line changes
3. Disable auto-scroll when user manually scrolls (re-enable after 5s idle)

---

## Issue 8: Export Translated Page as PDF
**Labels:** `enhancement`, `help wanted`

**Description:**
Let users export the currently translated page as a PDF for offline study.

**What to do:**
1. Add an "Export PDF" button to the popup or sidebar
2. Use `window.print()` with a print-specific stylesheet, or explore `html2pdf.js`
3. Ensure translated text (not original) is captured

---

## Issue 9: Translation Memory Sharing
**Labels:** `enhancement`, `help wanted`

**Description:**
When users get a Gemini-verified translation, it's only cached locally. Create a way to contribute verified translations back to the community.

**What to do:**
1. Design a simple JSON format for shareable translation entries
2. Add an "Export my translations" feature
3. Create a process for community review and integration into static dictionaries

---

## Issue 10: Expand Unit Test Coverage
**Labels:** `good first issue`, `testing`

**Description:**
The project has 66 tests covering `staticLookup`, `_normalizeTypography`, protected terms, and language JSON validation. Help expand coverage to more areas.

**What to do:**
1. Tests live in `tests/` and run with `npm test` (Jest)
2. Add tests for `queueGeminiVerify` heuristics (short text skip, alpha ratio, prose detection)
3. Add tests for Google Translate batch edge cases (empty input, rate limiting)
4. Add tests for `hasInlineTags` detection logic
5. No need to test Chrome extension APIs (those need integration tests)

