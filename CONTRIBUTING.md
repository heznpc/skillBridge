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
- [Copyright & Disclaimer](#copyright--disclaimer)

---

## Quick Start

```bash
# 1. Fork & clone
git clone https://github.com/heznpc/skillbridge.git
cd skillbridge-anthropic-academy

# 2. Load in Chrome
#    → chrome://extensions
#    → Enable "Developer Mode" (top-right toggle)
#    → "Load unpacked" → select the project folder

# 3. Navigate to https://anthropic.skilljar.com
#    → Open the extension popup → select a language
#    → The page should translate automatically
```

No build step. No npm install. It just works.

---

## Development Setup

**Requirements:**
- Google Chrome (latest)
- A text editor (VS Code recommended)
- A free [Puter.js](https://puter.com) account (for AI Tutor testing — optional)

**Loading the Extension:**

1. Open `chrome://extensions`
2. Enable **Developer Mode** (toggle in top-right)
3. Click **Load unpacked** and select the project root folder
4. The SkillBridge icon should appear in your toolbar

**Testing Changes:**

After editing any file, go to `chrome://extensions` and click the reload button (🔄) on the SkillBridge card. Then refresh the Skilljar page.

**Useful DevTools Tips:**
- Open DevTools (F12) → Console tab → filter by `[SkillBridge]` to see extension logs
- The background service worker has its own console — click "service worker" link on the extensions page
- Network tab → filter `translate.googleapis.com` to inspect translation API calls

---

## Project Structure

```
skilljar-i18n-assistant/
├── manifest.json              # Extension manifest (Manifest V3)
├── _locales/                  # Chrome i18n (extension name/description)
│   ├── en/ ko/ ja/ zh_CN/
├── src/
│   ├── content/
│   │   ├── content.js         # Main content script — DOM translation + AI Tutor sidebar
│   │   └── content.css        # All styles (sidebar, transcript panel, fonts)
│   ├── background/
│   │   └── background.js      # Service worker — Google Translate proxy + URL fetcher
│   ├── popup/
│   │   ├── popup.html         # Extension popup UI
│   │   └── popup.js           # Popup logic
│   └── lib/
│       ├── translator.js      # Translation engine (Static → Cache → GT + Gemini)
│       ├── youtube-subtitles.js  # YouTube auto-subtitle + transcript panel
│       └── page-bridge.js     # Puter.js main-world bridge (for AI Tutor)
│   └── data/                  # Static JSON translation dictionaries
│       ├── ko.json            # English → Korean (559 entries)
│       ├── ja.json            # English → Japanese
│       ├── zh-CN.json         # English → Chinese Simplified
│       ├── es.json            # English → Spanish
│       ├── fr.json            # English → French
│       └── de.json            # English → German
├── assets/icons/              # Extension icons
├── ROADMAP.md                 # Project roadmap
└── README.md                  # Main readme (+ translations)
```

---

## How to Contribute

### 1. Translation Contributions

This is the most impactful way to help. There are several levels:

#### a) Fix an Existing Translation (Easiest)

Found a bad translation? The static dictionaries are simple JSON key-value pairs:

```json
// src/data/ko.json
{
  "Prompt Engineering": "프롬프트 엔지니어링",
  "Fine-tuning": "파인튜닝",
  "Retrieval-Augmented Generation": "검색 증강 생성"
}
```

Just edit the value and submit a PR. Please include:
- The original English text
- The current (wrong) translation
- Your corrected translation
- Why it's better (context helps reviewers)

#### b) Add Entries to an Existing Dictionary

Browse the Skilljar courses and note technical terms that are being translated poorly by Google Translate. Add them to the appropriate dictionary file.

**Good candidates for dictionary entries:**
- AI/ML technical terms (e.g., "token window", "system prompt", "hallucination")
- Anthropic-specific terms (e.g., "Constitutional AI", "Claude", "Artifacts")
- Course navigation terms that Google Translate mangles

#### c) Create a New Premium Language Dictionary

Want to promote a standard language to premium? Create a new `src/data/{langCode}.json` file with at least 100 curated entries. See existing dictionaries for reference.

**Steps:**
1. Copy `src/data/ko.json` as a starting template
2. Translate all entries into your target language
3. Add the language code to the `premiumLanguages` array in `src/lib/translator.js`
4. Test thoroughly on actual Skilljar pages
5. Submit a PR — native speaker review is required

#### d) Add a New Standard Language

Standard languages work with Google Translate only (no dictionary). To add one:
1. Add the language code and name to `AVAILABLE_LANGUAGES` in `src/content/content.js`
2. Add it to the Standard `<optgroup>` in `src/popup/popup.html`
3. Add the language mapping in `src/lib/youtube-subtitles.js` `_ytLangName()`
4. Test that Google Translate returns reasonable results for Skilljar content

### 2. Code Contributions

#### Translation Engine

The 3-tier translation pipeline lives in `src/lib/translator.js`:

```
Static Dictionary → IndexedDB Cache → Google Translate + Gemini Verification
```

Areas that need work:
- **Gemini trigger heuristics** — the `queueGeminiVerify()` function decides which texts get AI-verified. The current heuristics (length > 80 chars, alpha ratio > 0.5, etc.) can be improved
- **Batch processing** — the Google Translate queue processes in batches of 10. Performance tuning is welcome
- **Cache invalidation** — currently cache entries never expire. A TTL strategy would help

#### AI Tutor (Claude Sonnet 4)

The tutor lives in `src/content/content.js` (sidebar creation) and uses `src/lib/page-bridge.js` to communicate with Puter.js in the main world.

#### YouTube Features

`src/lib/youtube-subtitles.js` handles:
- Auto-enabling subtitles on embedded YouTube videos
- Fetching captions via YouTube's timedtext API
- Translating and displaying a transcript panel below videos

### 3. Documentation

- Improve existing README translations
- Add README in a new language
- Write tutorials or guides
- Create screenshots/GIFs for the README

---

## Code Guidelines

- **Vanilla JavaScript** — no frameworks, no build step, no transpilation
- **No external npm dependencies** — the extension must work without `npm install`
- **Chrome Manifest V3** — respect the strict CSP. No inline scripts, no eval()
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
4. **Fill out the PR template** — describe what changed and why
5. **One PR per concern** — don't mix a bug fix with a new feature
6. **Screenshots welcome** — especially for UI changes

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
- **Why static dictionaries?** For the 559 most critical AI/ML terms, human-curated translations are simply better than any MT engine. These are the terms that matter most for comprehension.
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
