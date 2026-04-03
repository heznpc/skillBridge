# Contributing to SkillBridge for Anthropic Academy

Thank you for your interest in contributing! SkillBridge makes Anthropic's educational content accessible to learners worldwide — and every contribution, whether it's fixing a typo or adding a new language, moves us closer to that goal.

> **New to open source?** Look for issues labeled [`good first issue`](../../labels/good%20first%20issue). They're specifically designed to be approachable.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [How to Contribute](#how-to-contribute)
  - [Translation Contributions](#1-translation-contributions)
  - [Code Contributions](#2-code-contributions)
  - [Documentation](#3-documentation)
- [Code Guidelines](#code-guidelines)
- [Pull Request Process](#pull-request-process)
- [Understanding the Architecture](#understanding-the-architecture)
- [Testing & Debugging](TESTING.md) — full guide
- [Copyright & Disclaimer](#copyright--disclaimer)

---

## Quick Start

```bash
# 1. Fork & clone
git clone https://github.com/heznpc/skillbridge.git
cd skillbridge

# 2. Load in Chrome
#    → chrome://extensions
#    → Enable "Developer Mode" (top-right toggle)
#    → "Load unpacked" → select the project folder

# 3. Navigate to https://anthropic.skilljar.com
#    → Open the extension popup → select a language
#    → The page should translate automatically
```

> **Note:** The extension activates on `anthropic.skilljar.com` (Anthropic Academy's learning platform powered by Skilljar).

No build step. No npm install. It just works.

---

## Development Setup

**Requirements:**
- Google Chrome, Firefox, or Edge (latest)
- A text editor (VS Code recommended)
- A free [Puter.js](https://puter.com) account (for AI Tutor testing — optional)

**Loading the Extension:**

Chrome / Edge:
1. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge)
2. Enable **Developer Mode** (toggle in top-right)
3. Click **Load unpacked** and select the project root folder
4. The SkillBridge icon should appear in your toolbar

Firefox:
1. Run `npm run build:firefox` to generate the Firefox-compatible build
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on** and select `dist/firefox/manifest.json`

**Testing Changes:**

After editing any file, go to `chrome://extensions` and click the reload button on the SkillBridge card. Then refresh the Skilljar page. For Firefox, re-run `npm run build:firefox` and reload the temporary add-on.

**Running Tests:**

```bash
npm install                              # first time only
npm test                                 # runs all ~700 Jest tests
npx jest tests/translator.test.js        # single file
npx jest --watch                         # re-run on file changes
npx jest --coverage                      # generate coverage report
```

Tests cover the translation engine, dictionary loading, cache logic, protected term replacement, and markdown formatting. **All tests must pass before submitting a PR.**

**Debugging:**
- Open DevTools (F12) → Console tab → filter by `[SkillBridge]` to see extension logs
- The background service worker has its own console — click "service worker" link on the extensions page
- Network tab → filter `translate.googleapis.com` to inspect translation API calls
- Application tab → IndexedDB → `skillbridge-cache` / `skillbridge-tutor` to inspect stored data

> For the full testing and debugging guide (breakpoints, troubleshooting, data flow, IndexedDB schema), see **[TESTING.md](TESTING.md)**.

---

## Project Structure

```
skillbridge/
├── manifest.json              # Extension manifest (Manifest V3)
├── _locales/                  # Chrome i18n (extension name/description)
│   ├── en/ ko/ ja/ zh_CN/
├── src/
│   ├── content/
│   │   ├── content.js         # Main content script — DOM translation, init, GT queue
│   │   ├── header-controls.js # Header language selector, dark mode, welcome banner
│   │   ├── sidebar-chat.js    # AI Tutor sidebar, chat, conversation history
│   │   ├── text-selection.js  # Text selection "Ask Tutor" button
│   │   └── content.css        # All styles (sidebar, transcript panel, fonts)
│   ├── background/
│   │   └── background.js      # Service worker — Google Translate proxy + URL fetcher
│   ├── bridge/
│   │   └── puter.js           # Bundled Puter.js library (MV3 compliant)
│   ├── popup/
│   │   ├── popup.html         # Extension popup UI
│   │   └── popup.js           # Popup logic
│   ├── lib/
│   │   ├── browser-polyfill.js   # Cross-browser API compatibility shim
│   │   ├── constants.js       # Shared constants, thresholds, i18n labels, URL patterns
│   │   ├── selectors.js       # Centralized Skilljar DOM selectors (quiz, content, catalog)
│   │   ├── translator.js      # Translation engine (Static → Cache → GT + Gemini)
│   │   ├── youtube-subtitles.js  # YouTube auto-subtitle enabler
│   │   └── page-bridge.js     # Puter.js main-world bridge (for AI Tutor)
│   └── data/                  # Static JSON translation dictionaries
│       ├── ko.json            # English → Korean (570+ entries)
│       ├── ja.json            # English → Japanese
│       ├── zh-CN.json         # English → Chinese Simplified
│       ├── es.json            # English → Spanish
│       ├── fr.json            # English → French
│       └── de.json            # English → German
├── assets/icons/              # Extension icons
├── scripts/
│   ├── build-firefox.js       # Generates Firefox-compatible build in dist/firefox/
│   └── audit-translations.js  # Translation audit utility
├── docs/                      # Landing page, i18n READMEs, privacy policy
│   └── i18n/                  # Translated READMEs (KO, JA, ZH-CN, ES, FR, DE)
└── README.md                  # Main readme
```

---

## How to Contribute

### 1. Translation Contributions — 🌍 Native Speakers Wanted!

**This is the single most impactful way to contribute.** You don't need to write any code — just edit a JSON file in your native language. Each dictionary improvement instantly helps every learner using that language.

#### How the Dictionary Works

Each language has a JSON file (`src/data/{lang}.json`) organized into sections:

```
src/data/ko.json (Korean example — 570+ entries)
├── _meta          → version info (don't edit)
├── ui             → navigation: "Next", "Previous", "Courses"
├── catalog        → course titles and descriptions (incl. Cowork, subagents, MCP Advanced)
├── claude101      → Claude 101 course content
├── claudeCode     → Claude Code course content
├── agentSkills    → Agent Skills course content
├── aiFluency      → AI Fluency course content
├── faq            → FAQ page content
├── common         → shared terms: "Overview", "Submit", Cowork, Dispatch, etc.
└── _protected     → terms GT mistranslates (incl. Cowork, Computer Use, Subagent)
```

> **How matching works:** The extension tries to match the **exact English text** of each element on the page against dictionary keys. If found, the curated translation is used instantly — no Google Translate, no delay. For text not in the dictionary, the system falls back to Google Translate → Gemini AI verification.

#### a) Fix a Translation — ⏱️ 2 minutes

Found a bad translation? Just edit the value:

```json
// Before (wrong — GT translated "Claude" to Korean)
"Claude loads only skill names and descriptions at startup": "클로드는 시작 시 기술 이름과 설명만 로드합니다"

// After (correct)
"Claude loads only skill names and descriptions at startup": "Claude는 시작할 때 skill 이름과 설명만 로드합니다"
```

Submit a PR with: the original English text, your correction, and a brief reason why.

> **Prefer not to edit JSON directly?** Use our [Translation Submission](../../issues/new?template=translation-submission.yml) issue template — paste your translations and a maintainer will integrate them.

#### b) Add Missing Entries — ⏱️ 10 minutes

The most effective way to improve quality: browse any Anthropic Academy course page with SkillBridge active, spot an awkward translation, and add the correct version to the dictionary.

**High-impact additions:**
- **Full sentences** that GT translates awkwardly (sentence-level entries bypass GT entirely)
- **AI/ML terms** that GT gets wrong (e.g., "hallucination", "token window", "system prompt")
- **Course-specific phrases** that repeat across lessons
- **Time/format patterns** like "(5 minutes)" → "(5분)" that appear everywhere

**Tip:** Open DevTools → Console → filter `[SkillBridge]` to see which texts hit the dictionary ("Static: N translations") vs. which go to GT ("GT queue: N"). Everything in the GT queue is a candidate for a dictionary entry.

#### c) Fix Protected Terms — 🛡️ Stop GT from Breaking Brand Names

The `_protected` section maps **correct English** → **known GT mistranslations**. After GT translates a sentence, the extension replaces these known errors with the correct term:

```json
"_protected": {
  "Claude Code": ["클로드 코드", "클로드 Code"],   // Korean
  "Claude": ["クロード"],                          // Japanese
  "Enterprise": ["企业"],                          // Chinese
  "skill": ["기술", "스킬"]                         // Korean
}
```

If you notice GT consistently translating a brand/technical term wrong in your language, add the wrong form to the `_protected` section. The extension will auto-correct it after GT runs.

#### d) Create a New Premium Language — 🏆 Big Impact

Want to promote a standard language (GT-only) to premium? Create `src/data/{langCode}.json`:

1. Copy `src/data/ko.json` as a template
2. Translate all entries into your language
3. Adapt the `_protected` section with GT mistakes specific to your language
4. Add the language code to `PREMIUM_LANGUAGES` in `src/lib/constants.js`
5. Test on actual Anthropic Academy pages
6. Submit a PR — native speaker review is required

You don't need to translate everything at once. **Even 100 entries is a great start** — especially if they cover the `ui`, `common`, and `_protected` sections.

#### Validating Your Translations Locally

Before submitting a PR, run the validation scripts to catch structural issues:

```bash
npm run validate    # checks JSON structure, _meta, value types
npm run glossary    # checks protected terms, cross-language consistency
```

These checks also run automatically in CI on every PR.

#### e) Add a New Standard Language

Standard languages use Google Translate + Gemini verification (no dictionary). To add one:
1. Add the language code and name to `AVAILABLE_LANGUAGES` in `src/lib/constants.js`
2. Add the language name to `_YT_LANG_NAMES` in `src/lib/constants.js`
3. Test that Google Translate returns reasonable results for the content

> The popup language selector is built dynamically from `constants.js` — no HTML changes needed.

### 2. Code Contributions

#### Translation Engine

The translation pipeline lives in `src/lib/translator.js`, with thresholds configured in `src/lib/constants.js`:

```
Static Dictionary → IndexedDB Cache → Google Translate + Gemini Verification
```

Key constants in `constants.js` (v2.1.0+):
- **`CERT_DISABLE_PATTERNS`** — URL patterns for proctored certification exams. Extension fully disables on match.
- **`EXAM_URL_PATTERNS`** — URL patterns for course quizzes. Triggers exam mode (answer protection) but extension stays active.
- **`ONBOARDING_LABELS`** / **`EXAMPLE_QUESTIONS`** — First-visit onboarding UI strings (7 languages).
- **`A11Y_LABELS`** — Localized aria-labels for FAB, sidebar, dark toggle (7 languages).
- **`DEFAULT_PROTECTED_TERMS`** — Fallback list of terms to keep in English (Cowork, Dispatch, Computer Use, Subagent, etc.).

Areas that need work:
- **Gemini trigger heuristics** — the `queueGeminiVerify()` function decides which texts get AI-verified. Thresholds are in `SKILLBRIDGE_THRESHOLDS` (constants.js)
- **Batch processing** — the Google Translate queue processes in batches of `GT_BATCH_SIZE`. Performance tuning is welcome
- **Cache eviction strategy** — IndexedDB cache entries expire after 30 days; smarter invalidation (e.g., per-dictionary-version) could improve freshness

#### AI Tutor (Claude Sonnet 4)

The tutor lives in `src/content/sidebar-chat.js` (sidebar UI, chat, conversation history) and uses `src/lib/page-bridge.js` to communicate with Puter.js in the main world. Text selection quoting is in `src/content/text-selection.js`.

#### YouTube Features

`src/lib/youtube-subtitles.js` handles:
- Auto-enabling subtitles on embedded YouTube videos
- Setting caption language via YouTube's postMessage API
- MutationObserver for lazily-loaded iframes

### 3. Documentation

- Improve existing README translations
- Add README in a new language
- Write tutorials or guides
- Create screenshots/GIFs for the README

---

## Code Guidelines

- **Vanilla JavaScript** — no frameworks, no build step, no transpilation
- **No external npm dependencies** — the extension must work without `npm install`
- **Manifest V3** — respect the strict CSP. No inline scripts, no eval()
- **Cross-browser compatibility** — use `chrome.*` APIs (the polyfill handles Firefox). Do not use Firefox-only `browser.*` APIs directly. Avoid Chrome-only features not supported by Firefox MV3 (e.g., `chrome.offscreen`). When in doubt, check [MDN's browser compatibility tables](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Browser_support_for_JavaScript_APIs)
- **Naming conventions:**
  - CSS classes: `si18n-*` (sidebar/UI) or `sb-transcript-*` (transcript panel)
  - HTML IDs: `skillbridge-*`
  - Console logs: `[SkillBridge]` prefix
  - IndexedDB: `skillbridge-cache`
- **Keep it lightweight** — every KB matters for a browser extension
- **Comment complex logic** — especially translation heuristics and YouTube API interactions
- **Test on actual Skilljar pages** — `https://anthropic.skilljar.com` is the only supported domain

---

## Pull Request Process

1. **Fork** the repository and create your branch from `main`
2. **Name your branch** descriptively: `fix/gemini-spinner-short-text`, `feat/add-portuguese`, `docs/update-readme-ko`
3. **Make your changes** and test on `anthropic.skilljar.com`
4. **Run `npm test`** — all tests must pass
5. **Fill out the PR template** — describe what changed and why
6. **One PR per concern** — don't mix a bug fix with a new feature
7. **Screenshots welcome** — especially for UI changes

### PR Checklist

Before submitting, make sure you can check all of these:

- [ ] I tested my changes on `anthropic.skilljar.com`
- [ ] `npm test` passes (all tests)
- [ ] No new console errors in DevTools
- [ ] My branch is up to date with `main`
- [ ] For translation PRs: I am a native speaker of the target language
- [ ] For code PRs: I followed the [Code Guidelines](#code-guidelines) (vanilla JS, no build step, `[SkillBridge]` log prefix)

### Your First PR — Step by Step

New to this project? Here's a concrete walkthrough for fixing a translation:

```bash
# 1. Fork on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/skillbridge.git
cd skillbridge

# 2. Create a branch
git checkout -b fix/ko-prompt-translation

# 3. Edit the dictionary (e.g., fix a Korean translation)
#    Open src/data/ko.json in your editor and make your change

# 4. Run tests
npm install && npm test

# 5. Load in Chrome → test on anthropic.skilljar.com

# 6. Commit and push
git add src/data/ko.json
git commit -m "fix(ko): correct translation for 'system prompt'"
git push origin fix/ko-prompt-translation

# 7. Open a PR on GitHub — done!
```

### Review Timeline

We aim to review PRs within 3-5 days. Translation PRs from native speakers get priority.

---

## Understanding the Architecture

### Translation Flow

```
Page loads on anthropic.skilljar.com
  ↓
content.js collects text elements
  ↓
translator.js checks Static Dictionary
  ↓ (miss)
translator.js checks IndexedDB cache
  ↓ (miss)
background.js proxies to Google Translate API
  ↓
translator.js receives Google translation
  ↓
queueGeminiVerify() decides: does this need AI verification?
  ↓ (yes, if text is complex enough)
Gemini 2.0 Flash reviews and optionally improves the translation
  ↓
Result cached in IndexedDB for future visits
```

### Key Design Decisions

- **Why Google Translate + Gemini instead of just one?** Google Translate is fast and free. Gemini catches domain-specific errors (e.g., translating "Claude" as a person's name). Two-tier gives us speed AND quality.
- **Why static dictionaries?** For the 570+ most critical AI/ML terms, human-curated translations are simply better than any MT engine. These are the terms that matter most for comprehension.
- **Why Puter.js for the AI Tutor?** It provides free access to Claude Sonnet 4 without requiring users to have API keys. The "user-pays" model means the extension itself costs nothing.
- **Why no build step?** Lower barrier to entry for contributors. Clone, load, done.

---

## Copyright & Disclaimer

**This is an unofficial community project.** It is not affiliated with, endorsed by, or sponsored by Anthropic.

SkillBridge translates content **on-the-fly** for personal learning purposes. It does NOT store, permanently cache, or redistribute any original Skilljar course content. The extension only caches the translated outputs (not the originals) in the user's local IndexedDB.

All contributions must maintain this approach — no scraping, no content storage, no redistribution.

"Anthropic", "Claude", and "Skilljar" are trademarks of their respective owners.

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

## Questions?

Open a [Discussion](../../discussions) or file an issue. We're happy to help you get started!

> 💡 **This document is in English only.** Want to translate it into your language? That PR is welcome too!
