# Contributing to SkillBridge — AI Course Translator

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

npm install
npm run build:bundle

# 2. Load the CWS-equivalent build in Chrome
#    → chrome://extensions
#    → Enable "Developer Mode" (top-right toggle)
#    → "Load unpacked" → select dist/bundled

# 3. Navigate to https://anthropic.skilljar.com
#    → Open the extension popup → select a language
#    → The page should translate automatically
```

> **Note:** The extension activates on `anthropic.skilljar.com` (Anthropic Academy's learning platform powered by Skilljar).

`dist/bundled` is the CWS-equivalent, no-AI build. Loading the repository root
instead selects the raw developer configuration, which retains the optional
Puter AI path and is not valid evidence for CWS privacy, permissions, or RHC.

---

## Development Setup

**Requirements:**
- Google Chrome, Firefox, or Edge (latest)
- A text editor (VS Code recommended)
- A Puter account only if explicitly testing the optional raw developer AI path

**Loading the Extension:**

Chrome / Edge:
1. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge)
2. Enable **Developer Mode** (toggle in top-right)
3. Run `npm run build:bundle`, then click **Load unpacked** and select `dist/bundled`
4. The SkillBridge icon should appear in your toolbar

Loading the project root is a separate developer-only mode. Its Puter SDK and
page bridge are omitted from `dist/bundled` and must never be included in the
CWS ZIP.

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
- Application tab → IndexedDB → `skillbridge-cache` to inspect CWS cache data (`skillbridge-tutor` applies only to the raw developer AI path)

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
│   │   ├── sidebar-chat.js    # Sidebar shell; CWS exposes local learning tools
│   │   ├── text-selection.js  # Shared-source selection helper; AI path is developer-only
│   │   └── styles/            # Content CSS partials (sidebar, transcript panel, fonts)
│   ├── background/
│   │   └── background.js      # Service worker — Google Translate, update checks, cache cleanup
│   ├── bridge/
│   │   └── puter.js           # Developer-only Puter SDK; omitted from CWS (contains lazy RHC paths)
│   ├── popup/
│   │   ├── popup.html         # Extension popup UI
│   │   └── popup.js           # Popup logic
│   ├── lib/
│   │   ├── browser-polyfill.js   # Cross-browser API compatibility shim
│   │   ├── constants.js       # Shared constants, thresholds, i18n labels, URL patterns
│   │   ├── selectors.js       # Centralized Skilljar DOM selectors (quiz, content, catalog)
│   │   ├── translator.js      # CWS: Static → Cache → GT; raw developer path may add Gemini
│   │   ├── youtube-subtitles.js  # YouTube auto-subtitle enabler
│   │   └── page-bridge.js     # Developer-only Puter main-world bridge; omitted from CWS
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

> 📐 **One read before you start: [docs/TRANSLATION_RULES.md](docs/TRANSLATION_RULES.md).**
> It's the short rulebook for editing dictionaries — values-not-keys, the
> concept-vs-product-name line, the `_protected` prose-collision test, and the
> "don't guess framework terms" rule. Every rule there exists because breaking it has
> silently corrupted real on-page text at least once.

#### How the Dictionary Works

Each language has a JSON file (`src/data/{lang}.json`) organized into sections:

```
src/data/ko.json (Korean example — 1,100+ entries; 12 premium locales, key-parity enforced)
├── _meta          → version info (don't edit)
├── ui             → navigation: "Next", "Previous", "Courses"
├── catalog        → course titles and descriptions (incl. Cowork, subagents, MCP Advanced)
├── claude101      → Claude 101 course content
├── claudeCode     → Claude Code course content
├── agentSkills    → Agent Skills course content
├── aiFluency      → AI Fluency course content
├── faq            → FAQ page content
├── common         → shared terms: "Overview", "Submit", Cowork, Dispatch, etc.
└── _protected     → GT mistranslations to auto-correct (rules: docs/TRANSLATION_RULES.md §2)
```

> **How matching works:** The extension tries to match the **exact English text** of each element on the page against dictionary keys. If found, the curated translation is used instantly — no Google Translate, no delay. In the CWS-equivalent build, text not in the dictionary falls back to Google Translate and is cached locally. The raw developer configuration may additionally enable Gemini verification through Puter.

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

The `_protected` section maps **correct English** → **known GT mistranslations**. After GT translates a sentence, the extension rewrites these known errors back to the correct term:

```json
"_protected": {
  "Claude Code": ["클로드 코드", "클로드 Code"],   // Korean — pure GT artifacts
  "Claude": ["클로드"],                            // Korean — phonetic transliteration
  "Cowork": ["코워크"]                             // Korean — a coined GT calque
}
```

> ⚠️ **`_protected` is a loaded gun.** Every wrong-form is rewritten **everywhere it
> appears** on the page, so a wrong-form that is *also a real word or name* in your
> language will corrupt legitimate prose. That is why `"skill": ["기술"]` and
> `"Claude": ["Claudio"]` were **removed** — 기술 is the ordinary word for "skill" and
> Claudio is a real given name. **Before adding any wrong-form, read
> [docs/TRANSLATION_RULES.md](docs/TRANSLATION_RULES.md) §2 and apply the
> prose-collision test:** *"can this string ever appear in correct prose as something
> other than a mangled brand?"* If yes, don't add it — use a self-referential entry
> (`"Claude": ["Claude"]`) instead of a risky mapping.

#### d) Create a New Premium Language — 🏆 Big Impact

Want to promote a standard language (GT-only) to premium? Create `src/data/{langCode}.json`:

1. Copy `src/data/ko.json` as a template
2. Translate all entries into your language
3. Adapt the `_protected` section — GT mistakes specific to your language, **following [docs/TRANSLATION_RULES.md](docs/TRANSLATION_RULES.md) §2** (apply the prose-collision test to every wrong-form so you don't corrupt real prose)
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

Standard languages use Google Translate in the CWS-equivalent build (no dictionary). The raw developer configuration may optionally add Gemini verification. To add one:
1. Add the language code and name to `AVAILABLE_LANGUAGES` in `src/lib/constants.js`
2. Add the language name to `_YT_LANG_NAMES` in `src/lib/constants.js`
3. Test that Google Translate returns reasonable results for the content

> The popup language selector is built dynamically from `constants.js` — no HTML changes needed.

### 2. Code Contributions

#### Translation Engine

The translation pipeline lives in `src/lib/translator.js`, with thresholds configured in `src/lib/constants.js`:

```
Static Dictionary → IndexedDB Cache → Google Translate → local result cache
```

Key constants in `constants.js` (v2.1.0+):
- **`CERT_DISABLE_PATTERNS`** — URL patterns for proctored certification exams. Extension fully disables on match.
- **`EXAM_URL_PATTERNS`** — URL patterns for course quizzes. Triggers exam mode (answer protection) but extension stays active.
- **`ONBOARDING_LABELS`** / **`EXAMPLE_QUESTIONS`** — First-visit onboarding UI strings (7 languages).
- **`A11Y_LABELS`** — Localized aria-labels for FAB, sidebar, dark toggle (7 languages).
- **`DEFAULT_PROTECTED_TERMS`** — Fallback list of terms to keep in English (Cowork, Dispatch, Computer Use, Subagent, etc.).

Areas that need work:
- **Developer-only Gemini heuristics** — `queueGeminiVerify()` is dormant when the CWS AI gate is off. Changes to it require a separate raw-developer test boundary and must not weaken the CWS package gate.
- **Batch processing** — the Google Translate queue processes in batches of `GT_BATCH_SIZE`. Performance tuning is welcome
- **Cache eviction strategy** — IndexedDB cache entries expire after 30 days; smarter invalidation (e.g., per-dictionary-version) could improve freshness

#### Optional Raw-Developer AI Tutor

Shared source retains Tutor/chat modules and `src/lib/page-bridge.js` for an
optional raw developer path. The CWS builder disables that gateway, exposes no
Tutor, and omits the page bridge and Puter SDK. The SDK contains lazy remote
JavaScript/WebAssembly paths, so neither the repository root nor
`store-assets/skillbridge-developer.zip` is a CWS upload artifact.

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

> **Where does the landing page live?**
> The public landing page at
> [https://heznpc.github.io/skillBridge/](https://heznpc.github.io/skillBridge/)
> is served by **GitHub Pages from this repo** (`main` branch → `/docs` folder).
> Its source is `docs/index.html`, regenerated by `npm run docs` — which keeps the
> version / language-count / QA-table markers in sync with the code, so don't
> hand-edit those marker regions. Inside this repo, the only translated long-form
> doc is `docs/i18n/CHANGES_KO.md` (Korean release notes); drop a translated README
> under `docs/i18n/README.<lang>.md` so it doesn't compete with the English
> `README.md`. Smaller localized strings go in `_locales/<lang>/messages.json`, not
> in Markdown.

> **Logging in new content modules.** `src/lib/log.js` is loaded by
> `manifest.json` content_scripts ahead of every other module, so
> `window._skillbridgeLog.createLogger('ModuleName')` is available
> globally inside content scripts. Prefer it over bare
> `console.log/warn/error` so DevTools severity filtering works and
> module names appear in user bug reports. (Background service-worker
> and `src/lib/page-bridge.js` — which runs in the page world — are
> intentionally not consumers of this module; see `src/lib/log.js`
> header.) Existing call sites are kept as-is; there's no bulk-refactor
> mandate.

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
Result cached in IndexedDB for future visits
```

The raw developer configuration can add a separate Puter-backed Gemini review
step. That path is disabled and its SDK/bridge files are omitted from the CWS
bundle, so it is not part of the CWS translation flow above.

### Key Design Decisions

- **Why Google Translate in CWS?** It provides the requested translation fallback without shipping the Puter SDK or activating an AI gateway. Curated dictionaries and protected-term restoration handle domain-specific terminology locally.
- **Why static dictionaries?** For the 570+ most critical AI/ML terms, human-curated translations are simply better than any MT engine. These are the terms that matter most for comprehension.
- **Why retain Puter source at all?** It is an optional developer/research path. It is not a feature of the next CWS candidate and must remain outside the bundled upload artifact.
- **Why separate build outputs?** `npm run build:bundle:zip` produces the only CWS-safe ZIP. `npm run build:developer:zip` is an explicit raw-source artifact and must never be uploaded to CWS; `npm run build:zip` aliases the safe bundled command.

---

## Copyright & Disclaimer

**This is an unofficial community project.** It is not affiliated with, endorsed by, or sponsored by Anthropic.

SkillBridge translates content **on-the-fly** for personal learning purposes and does not redistribute course content. The local IndexedDB translation cache stores original text, translated text, target language, and timestamps for up to 30 days so a page can reuse prior results; users can clear it through browser site-data controls.

All contributions must maintain this approach — no bulk scraping, no
server-side course archive, and no redistribution. Any local cache expansion
must remain feature-scoped, documented, user-clearable, and retention-limited.

"Anthropic", "Claude", and "Skilljar" are trademarks of their respective owners.

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

## Questions?

Open a [Discussion](../../discussions) or file an issue. We're happy to help you get started!

> 💡 **This document is in English only.** Want to translate it into your language? That PR is welcome too!

## Native language reviewers

The premium dictionaries are curated and LLM-audited, but **no locale has had
a native-speaker pass yet** — and that's the highest-leverage contribution a
non-coder can make here. One pass takes ~1–2 hours:

1. Open `src/data/<your-locale>.json`. Every key is the English source string;
   every value is the translation. Skim for wrong meaning, unnatural register,
   brand terms that should stay English (Claude, Anthropic, MCP, Claude Code,
   Managed Agents, …), and the same English term rendered inconsistently.
2. Send corrections as a PR (JSON value edits only — CI guards the structure,
   so you cannot break anything), or just open an issue listing them.
3. Your locale's `_meta.nativeReview` flips to `"reviewed"` and you're credited
   in the README's Terminology QA table.

Claim a locale on [issue #202](https://github.com/heznpc/skillBridge/issues/202).
The QA model around your review is described in `docs/TRANSLATION_QA.md`.
