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
skillbridge/
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

### 1. Translation Contributions — 🌍 Native Speakers Wanted!

**This is the single most impactful way to contribute.** You don't need to write any code — just edit a JSON file in your native language. Each dictionary improvement instantly helps every learner using that language.

#### How the Dictionary Works

Each language has a JSON file (`src/data/{lang}.json`) organized into sections:

```
src/data/ko.json (Korean example — 590+ entries)
├── _meta          → version info (don't edit)
├── ui             → navigation: "Next", "Previous", "Courses"
├── catalog        → course titles and descriptions
├── claude101      → Claude 101 course content
├── claudeCode     → Claude Code course content
├── agentSkills    → Agent Skills course content
├── aiFluency      → AI Fluency course content
├── faq            → FAQ page content
├── common         → shared terms: "Overview", "Submit", etc.
└── _protected     → terms GT mistranslates (see below)
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
4. Add the language code to `premiumLanguages` in `src/lib/translator.js`
5. Test on actual Anthropic Academy pages
6. Submit a PR — native speaker review is required

You don't need to translate everything at once. **Even 100 entries is a great start** — especially if they cover the `ui`, `common`, and `_protected` sections.

#### e) Add a New Standard Language

Standard languages use Google Translate + Gemini verification (no dictionary). To add one:
1. Add the language code and name to `AVAILABLE_LANGUAGES` in `src/content/content.js`
2. Add it to the Standard `<optgroup>` in `src/popup/popup.html`
3. Add the language mapping in `src/lib/youtube-subtitles.js` `_ytLangName()`
4. Test that Google Translate returns reasonable results for the content

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

> 💡 **This document is in English only.** Want to translate it into your language? That PR is welcome too!
