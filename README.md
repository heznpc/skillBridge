<div align="center">

<img src="assets/icons/icon128.png" alt="SkillBridge" width="90" />

# SkillBridge — AI Course Translator

> **Source checkpoint:** <!-- VERSION_START -->v4.2.0<!-- VERSION_END --> —
> released on GitHub only, not designated for Chrome Web Store upload. The live
> CWS version remains v1.0.1; final packaging and dashboard work are deferred
> until the current development cycle is complete.

> Available in multiple languages at the [project landing page](https://heznpc.github.io/skillBridge/).

[![CI](https://github.com/heznpc/skillBridge/actions/workflows/ci.yml/badge.svg)](https://github.com/heznpc/skillBridge/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Extension_MV3-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![Firefox MV3](https://img.shields.io/badge/Firefox-Add--on_MV3-orange.svg)](https://extensionworkshop.com/)
[![Edge MV3](https://img.shields.io/badge/Edge-Extension_MV3-blue.svg)](https://microsoftedge.microsoft.com/addons/)
[![GitHub stars](https://img.shields.io/github/stars/heznpc/skillbridge?style=social)](https://github.com/heznpc/skillbridge/stargazers)
[![GitHub contributors](https://img.shields.io/github/contributors/heznpc/skillbridge)](https://github.com/heznpc/skillbridge/graphs/contributors)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**Translate the free AI courses at [anthropic.skilljar.com](https://anthropic.skilljar.com/) into your language — instantly.**

Break the language barrier on these free AI courses. <!-- LANG_COUNT_START -->32 languages<!-- LANG_COUNT_END --> supported. The CWS edition combines course-page translation with local flashcards, bookmarks, progress, reading, and export tools. It runs on `anthropic.skilljar.com`, detected Skilljar-hosted AI courses, Claude Academy course routes at `academy.claude.com/courses`, and Claude tutorial pages at `claude.com/resources/tutorials`; non-AI Skilljar tenants are paused automatically.

> **Version boundary:** the Chrome Web Store still serves legacy v1.0.1, which
> includes the Puter-backed Gemini/Claude path and YouTube host permission.
> References below to the “CWS edition” describe the intended package boundary,
> not an assigned upload candidate. Publication is paused, and the final CWS
> version will be assigned after ongoing development; see the
> [version-split Privacy Policy](PRIVACY_POLICY.md).
> Automated browser fixtures cover Academy routing and the Tutor transport, but
> this checkpoint does not claim an authenticated live Academy post-submit DOM
> capture or a final signed-in Puter round trip; both remain final CWS gates.

[Install](#installation) · [Features](#features) · [Report Bug](https://github.com/heznpc/skillbridge/issues) · [Request Feature](https://github.com/heznpc/skillbridge/issues) · [Contributing](CONTRIBUTING.md)

</div>

---

<div align="center">

<img src="assets/screenshots/skillbridge-demo.gif" alt="SkillBridge demo — translating an AI course page in real time" width="720" />

_Install SkillBridge, visit a course page at anthropic.skilljar.com, and the entire page is translated instantly._

</div>

---

## Table of Contents

- [The Problem](#the-problem)
- [Quick Start](#quick-start)
- [Features](#features)
- [Installation](#installation)
- [How It Works](#how-it-works)
- [Architecture & Decisions](#architecture--engineering-decisions)
- [Supported Languages](#supported-languages)
- [Privacy & Security](#privacy--security)
- [Tech Stack](#tech-stack)
- [Contributing](#contributing)
- [FAQ](#faq)
- [License](#license)

## The Problem

The free AI courses at [anthropic.skilljar.com](https://anthropic.skilljar.com/) — covering prompt engineering, AI safety, the Claude API, and more — are one of the best free learning resources on the topic. Millions of developers worldwide want to take these courses, but they're **only available in English**.

Generic translators make it worse, not better:

|                    | Google Translate (page)             | SkillBridge                                            |
| ------------------ | ----------------------------------- | ------------------------------------------------------ |
| AI terminology     | ❌ "Prompt" → "신속한" (wrong)      | ✅ "Prompt" → "프롬프트" (correct)                     |
| Technical accuracy | ❌ Generic machine translation      | ✅ 1,100+ curated terms per Premium language           |
| Learning tools     | ❌ None                             | ✅ Local flashcards, bookmarks, progress, outline, PDF |
| Video subtitles    | ❌ Separate manual toggle           | ✅ Auto-translated subtitles                           |
| UI preservation    | ❌ Breaks checkboxes, progress bars | ✅ All interactive elements preserved                  |
| Cost               | Free                                | Free — no API keys needed                              |

**SkillBridge exists to remove this barrier** — making AI education accessible worldwide.

> **No API keys. No cost. Just install and learn.**

## Quick Start

1. Install the extension ([see below](#installation))
2. Visit a course page at [anthropic.skilljar.com](https://anthropic.skilljar.com/)
3. SkillBridge translates the entire page automatically

That's it.

## Features

### 🌐 Full Page Translation

Course headings, paragraphs, lists, navigation, cards, and supported code comments are translated, with AI-specific terms handled through curated dictionaries and protected-term restoration. Course controls and CJK font rendering remain intact. Text not already covered by the packaged dictionary or local cache is translated through Google Translate. Paragraphs that mix prose with links or buttons use Google Translate's structure-preserving HTML mode; if that path cannot safely reconcile the result, they keep their original markup so links and controls are never lost.

<div align="center">
<img src="assets/screenshots/01-lesson-translated.png" alt="Lesson page with curriculum fully translated" width="720" />
<br/>
<em>Course lesson with full curriculum translated — UI elements preserved.</em>
</div>

### 📴 Warm-cache Offline Fallback

If the connection drops after a supported course page has rendered,
SkillBridge reuses matching translation results already stored in IndexedDB.
This covers both plain text and structure-preserving HTML results. A persistent
localized banner reports whether cache coverage is still being checked, fully
covers the text encountered so far, covers only part of it, or has no matching
translation. Uncached text remains in the original language and is retried when
the connection returns. If Google Translate is unavailable while the browser
is still online, the banner says so without disabling saved translations or
local learning tools.

Only translation results are cached. SkillBridge does not store the course
page, lesson media, or a navigable lesson copy.

### 🧰 Local Learning Tools

The CWS edition includes spaced-repetition flashcards, bookmarks, Continue/Recent links, a local progress dashboard, an in-lesson outline, reading progress, and PDF export. Learning-tool state stays in the browser. Recognized assessment and certification surfaces are excluded from Continue/Recent and scroll-position retention.

On supported lesson surfaces that expose **Tools › Reports**, the v4.2.0
source checkpoint also lets you select one translated passage and mark it
helpful or needing work. Helpful feedback is saved locally at once; needs-work
feedback opens Reports with the English source, translation and selection
prefilled, plus an optional correction. The queue is local-only: there is no
telemetry, server submission or automatic GitHub issue.

> **AI Tutor & accounts:** the current source build includes the AI Tutor (Claude Sonnet 4.6, falling back to Sonnet 4.5) through an isolated bundled Puter runtime. The tutor uses a **free Puter sign-in** — no API key and no SkillBridge account. Page translation and the local learning tools need no account at all; only the optional cloud tutor prompts for sign-in. The transport contract is regression-tested; the latest source checkpoint's live signed-in round trip remains a final CWS gate.

Tutor history groups consecutive questions into titled, per-lesson
conversations. You can start fresh, browse every turn, delete one conversation,
clear all history, or export a local JSON copy. Saved turns are not added to a
later cloud or local Tutor request; only the active question and the disclosed
lesson context are sent.

### 🎬 Auto-Subtitles

Course videos automatically activate translated subtitles when you play them — no manual toggle needed.

### 🌙 Dark Mode

A full dark theme for the course header, lesson content, and SkillBridge panels. Toggle with one click.

### 🎓 Exam Mode & Certification Safety

**Course quizzes** (e.g., Claude 101 completion quiz) — answer choices on recognized quiz pages are skipped by translation to preserve accuracy (detection is URL- and page-selector-based).

**Proctored certification exams** (e.g., Claude Certified Architect) — on recognized certification routes the extension **disables itself**: no translation, no UI injection. Recognition is URL-pattern based, so treat it as a safeguard, not a guarantee — if Skilljar ships an exam under a URL the patterns don't cover yet, the extension won't know it's an exam. For any proctored exam, turn the extension off yourself.

### ⌨️ Keyboard Shortcuts

`Ctrl+Shift+S` toggle the sidebar, `Ctrl+Shift+F` open flashcards, `Ctrl+Shift+L` toggle dark mode, `Ctrl+Shift+/` open help, and `Escape` close.

### 📖 Per-Lesson Term Preview

When you enter a lesson, a floating card shows **6 key terms** for the current course with their translations. Auto-dismisses after 15 seconds. Click "View all" to open the full flashcard panel.

### 📄 PDF Export

Export any translated lesson as a clean, print-friendly PDF — useful for offline study or quick reference.

### 🔍 Smart Detection

Detects your browser language on first visit and offers to translate. Handles SPA navigation — when you move between lessons, the new page is translated automatically without a reload.

### 🛡️ Protected Terms

Generic translation tools often **mistranslate brand names and technical terms**. SkillBridge auto-corrects these errors after translation:

<div align="center">

| Before (Google Translate) |  After (SkillBridge)   |
| :-----------------------: | :--------------------: |
|     ❌ 인류학적 과정      |   ✅ Anthropic 과정    |
|         ❌ 클로드         |       ✅ Claude        |
|      ❌ 신속한 공학       | ✅ 프롬프트 엔지니어링 |

</div>

<div align="center">
<img src="assets/screenshots/catalog-translated.png" alt="Course catalog page translated to Korean with correct terminology" width="720" />
<br/>
<em>Course catalog translated to Korean — brand names and AI terms stay accurate.</em>
</div>

## Installation

> **Status: live CWS v1.0.1; source v4.2.0 is a GitHub-only checkpoint.**
> The Chrome Web Store listing is available in all locales **except the United
> States**, where it was removed on 2026-05-12 over a trademark issue with the
> old icon (since redesigned on `main`). The published store build is v1.0.1;
> the earlier `v3.5.x` candidates predate the current CWS changes and are not reused.
> `v4.2.0` records the current source boundary, including the bundled AI Tutor,
> local on-device Tutor, Academy support, local Notes, local translation
> feedback in Reports, and exam-safe translation refinements. Its permission scope is machine-verified against the
> manifest on every push (`npm run check:permission-docs`). Publication remains
> paused; CWS assets and dashboard fields will be regenerated only after ongoing
> development is complete — see `store-assets/RELEASE_CHECKLIST.md`.

### Chrome / Edge / Chromium browsers

**CWS-equivalent local bundle** (developer mode):

```bash
git clone https://github.com/heznpc/skillbridge.git
cd skillbridge
npm ci
npm run build:bundle
```

1. Open `chrome://extensions/` (Chrome) or `edge://extensions/` (Edge)
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select `dist/bundled`
4. Visit [anthropic.skilljar.com](https://anthropic.skilljar.com/) and start learning!

Also works in Brave, Arc, Opera, Vivaldi, and other Chromium-based browsers.

> Loading the repository root instead selects the raw developer configuration.
> Use `dist/bundled` for supported Tutor testing: only that build contains the
> reviewed CWS-sanitized SDK. Packaging disables unused remote
> TLS-socket imports, a `Function`-constructor fallback, and automatic User/profile
> lookups, unused eager filesystem-socket/resource-access startup, and the SDK's
> hidden automatic token reauthentication and persistent host-page caches. The
> SDK runs in Chrome's isolated content-script world only on
> `anthropic.skilljar.com` and trusted `academy.claude.com` course routes; Tutor
> network payloads use validated extension ports,
> not page-world messaging. The visible Tutor remains in the shared page DOM, so
> course-page scripts may observe keyboard events and rendered chat text.
> SkillBridge persists the minimum Puter session fields in extension storage, not
> the course site's storage. Puter's HTTPS sign-in returns its result to the opener
> with browser window messaging, so the course page may also observe that transient
> authentication event. Never upload the repository root or developer ZIP in place
> of the scanned CWS artifact.

### Firefox (Beta)

```bash
git clone https://github.com/heznpc/skillbridge.git
cd skillbridge
npm run build:firefox
```

1. Open `about:debugging#/runtime/this-firefox` in Firefox
2. Click **Load Temporary Add-on**
3. Navigate to `dist/firefox/` and select `manifest.json`
4. Visit [anthropic.skilljar.com](https://anthropic.skilljar.com/) and start learning!

> **Note:** Temporary add-ons are removed when Firefox restarts. For permanent installation, use a signed `.xpi` from [Firefox Add-ons](https://addons.mozilla.org/) (coming soon).

## How It Works

The CWS edition uses a staged translation engine that prioritizes local results:

```
Page text
  │
  ├─ 1,100+ curated term dictionary ──→ Instant (AI terms translated correctly)
  │
  ├─ Local cache (IndexedDB) ───────→ Instant (previous result)
  │
  └─ Remaining visible text → Google Translate
       │
       ├─ Protected Terms auto-fix ─→ Restores brand/tech terms GT mistranslates
       └─ Cache result locally for up to 30 days
```

Text not covered by the packaged dictionary or local cache is sent to Google Translate when translation is requested. Paragraphs that mix prose with links/buttons are translated structure-preserving through Google Translate's HTML mode. Baseline page translation does not invoke Puter, Claude, or the Tutor model. Optional Translation Refinement is separate, off by default and separately consented; when enabled it sends already-translated paragraphs and their English source to the model you selected for post-editing. The optional cloud Tutor uses Claude through an isolated bundled Puter runtime only when you send a Tutor message; local and off Tutor modes are also available. See the [Privacy Policy](PRIVACY_POLICY.md) for the full data flow.

The translation cache is prepared before the first translation pass, without
waiting for optional Tutor startup. While offline, both the plain-text and
structured-HTML caches are checked before missing items are deferred for an
online retry. This cache contains translation results only; it does not contain
the course page or its media.

## Architecture & engineering decisions

The interesting part of SkillBridge is the constraints, not the feature count. A few decisions worth calling out:

**Why a multi-stage pipeline, not "just call an LLM."**
Translating a course page on every navigation has to be fast and predictable. The curated dictionary fixes terms generic MT gets wrong ("Prompt" → "프롬프트", never "신속한") at zero latency, the IndexedDB cache makes matching translation results on revisits instant, Google Translate covers the remaining visible text, and protected-term restoration runs after machine translation. Local results come first; the network is used only for text that still needs translation.

**Reliability & safety are designed in, not bolted on.**

- **Exam-safe by default** — on recognized proctored certification routes the extension _disables itself_, and on recognized quiz pages answer choices are skipped by translation. Detection is pattern-based (URLs + page selectors), so it is a safeguard rather than a guarantee: sitting a proctored exam, turn the extension off. A learning aid must not be mistakable for a cheating tool.
- **Invariants over hope** — brand/product terms ("Claude", "Cowork", "Agent Skills") are protected by a dictionary and restored _after_ machine translation, rather than trusting the translator to leave them alone. (Generic concept words like "subagent" are translated natively per locale — see [docs/TRANSLATION_RULES.md](docs/TRANSLATION_RULES.md).)
- **Guarding against external drift** — the target site is a third party we don't control, so CI watchers detect when the platform adds a course or changes its DOM selectors and open an issue automatically, instead of letting users hit silent breakage.
- **Defensive content scripts** — idempotent injection guards and URL polling, because the host app navigates via SPA (content scripts can fire more than once — or not at all — per navigation).

**What I deliberately did _not_ build (and why).**

- **No SkillBridge servers / no backend** — the CWS edition stores its learning state locally and sends translation text directly to Google Translate, at the deliberate cost of cross-device sync.
- **No telemetry or analytics** — nothing is collected, not even opt-in error reports; marketing convenience never outweighs the privacy promise.
- **No A/B framework, no paid tier** — both imply infrastructure (traffic, segmentation, billing) that a free, server-less project shouldn't fake.

## Supported Languages

### Premium — Curated Dictionary + Google Translate

| Language                          | Code    | Dictionary                                                         |
| --------------------------------- | ------- | ------------------------------------------------------------------ |
| 🇰🇷 한국어 (Korean)                | `ko`    | 1,100+ entries                                                     |
| 🇯🇵 日本語 (Japanese)              | `ja`    | 1,100+ entries                                                     |
| 🇨🇳 中文简体 (Chinese Simplified)  | `zh-CN` | 1,100+ entries                                                     |
| 🇹🇼 中文繁體 (Chinese Traditional) | `zh-TW` | 1,100+ entries                                                     |
| 🇪🇸 Español (Spanish)              | `es`    | 1,100+ entries                                                     |
| 🇫🇷 Français (French)              | `fr`    | 1,100+ entries                                                     |
| 🇮🇹 Italiano (Italian)             | `it`    | 1,100+ entries (re-translated from English; native review welcome) |
| 🇩🇪 Deutsch (German)               | `de`    | 1,100+ entries                                                     |
| 🇧🇷 Português (Brazilian)          | `pt-BR` | 1,100+ entries                                                     |
| 🇷🇺 Русский (Russian)              | `ru`    | 1,100+ entries                                                     |
| 🇻🇳 Tiếng Việt (Vietnamese)        | `vi`    | 1,100+ entries                                                     |
| 🇮🇩 Bahasa Indonesia               | `id`    | 1,100+ entries                                                     |

### Standard — Google Translate

🇵🇹 Português (PT) · 🇳🇱 Nederlands · 🇵🇱 Polski · 🇺🇦 Українська · 🇨🇿 Čeština · 🇸🇪 Svenska · 🇩🇰 Dansk · 🇫🇮 Suomi · 🇳🇴 Norsk · 🇹🇷 Türkçe · 🇸🇦 العربية · 🇮🇳 हिन्दी · 🇹🇭 ภาษาไทย · 🇲🇾 Bahasa Melayu · 🇵🇭 Filipino · 🇧🇩 বাংলা · 🇮🇱 עברית · 🇷🇴 Română · 🇭🇺 Magyar · 🇬🇷 Ελληνικά

> Want to add your language as Premium? Contribute a curated dictionary — see [CONTRIBUTING.md](CONTRIBUTING.md).

### Terminology QA — how accuracy is enforced, not just promised

New Academy content is covered by a standing pipeline, not by hand-checking:
a CI watcher polls the live catalog twice a day and **fails loudly + opens an
issue** the moment a course appears that the dictionaries don't cover; the
course gets wired into all 12 premium dictionaries; structural CI gates
(`check:i18n`, `check:dict-coverage`, `check:locales`) and a real-dictionary
regression suite guard every merge after that. Proven turnaround: on
**2026-06-10** the watcher flagged the brand-new _Claude Platform 101_ course
in the morning ([#196](https://github.com/heznpc/skillBridge/issues/196)) and
all premium locales at the time were wired the same day
([#201](https://github.com/heznpc/skillBridge/pull/201)).

Beyond structure, dictionary _content_ goes through layered review — CI gates
catch shape/contamination drift on every PR, a full per-locale LLM audit runs
before every store release (see `docs/TRANSLATION_QA.md`), and native-speaker
review is the final layer:

<!-- LOCALE_QA_START -->
| Language | Code | Entries | Last curated | Last LLM audit | Native review |
|---|---|---:|---|---|---|
| 한국어 | `ko` | 1129 | 2026-07-28 | 2026-07-28 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| 日本語 | `ja` | 1129 | 2026-07-28 | 2026-07-28 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| 中文(简体) | `zh-CN` | 1129 | 2026-07-28 | 2026-07-28 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| 中文(繁體) | `zh-TW` | 1129 | 2026-07-28 | 2026-07-28 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| Español | `es` | 1129 | 2026-07-28 | 2026-07-28 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| Français | `fr` | 1129 | 2026-07-28 | 2026-07-28 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| Italiano | `it` | 1129 | 2026-07-28 | 2026-07-28 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| Deutsch | `de` | 1129 | 2026-07-28 | 2026-07-28 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| Português (BR) | `pt-BR` | 1129 | 2026-07-28 | 2026-07-28 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| Русский | `ru` | 1129 | 2026-07-28 | 2026-07-28 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| Tiếng Việt | `vi` | 1129 | 2026-07-28 | 2026-07-28 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| Bahasa Indonesia | `id` | 1129 | 2026-07-28 | 2026-07-28 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
<!-- LOCALE_QA_END -->

🙋 **Native speakers wanted** — a first native pass on your locale takes
~1–2 hours, needs no coding, and gets you credited here. See
[#202](https://github.com/heznpc/skillBridge/issues/202).

## Privacy & Security — Unpublished Source Build

These claims describe the current unpublished source build, not live legacy v1.0.1:

- **No operator analytics** — zero analytics, tracking, or telemetry; requested
  page text is still processed by Google Translate as disclosed
- **No SkillBridge servers** — we do not operate any servers; uncached page text is sent directly to Google Translate when translation is requested
- **No SkillBridge account, ever** — translation and the local learning tools need no account, email, password, or API key. The optional AI Tutor uses a **free Puter sign-in** (its own account, no API key); nothing is shared with SkillBridge
- **Local learning state** — original/translated text is cached in IndexedDB;
  preferences, flashcard review state, bookmarks, notes, translation feedback
  and manual term reports, recent lessons, and scroll positions use
  `chrome.storage.local`; feedback and reports are exported only as a
  user-requested local JSON download, and progress summaries are calculated
  locally
- **The AI Tutor is user-invoked** — page translation uses the disclosed Google Translate path but never calls Puter, Claude, or the Tutor model; only a cloud Tutor message reaches Claude through Puter, while local and off Tutor modes remain available
- **Open source** — every line of code is auditable right here

See our full [Privacy Policy](PRIVACY_POLICY.md).

## Tech Stack

| Component            | Technology                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Page Translation     | Google Translate API                                                                                              |
| Protected Terms      | Auto-correction of GT brand/product term errors per language (Claude, Cowork, Computer Use, Agent Skills, etc.)   |
| Curated Dictionaries | Hand-tuned JSON (1,100+ × 12 languages)                                                                           |
| Translation Cache    | IndexedDB                                                                                                         |
| Local Learning Tools | `chrome.storage.local` + IndexedDB                                                                                |
| AI Tutor             | Claude Sonnet 4.6, with an automatic Sonnet 4.5 fallback, via isolated bundled Puter runtime (free Puter sign-in) |
| CJK Font Rendering   | Local system/Noto fallback stacks                                                                                 |

> **Built with [Claude Code](https://docs.anthropic.com/en/docs/claude-code).**
> This project — from architecture design and feature implementation to debugging and the demo GIF — was developed using Claude Code as an AI pair-programming partner.

## Contributing

SkillBridge is a community-driven project. The single most impactful way to contribute is improving the translation dictionary for your language — no code required, just edit a JSON file. Even fixing one bad translation helps every learner using that language.

Each language's dictionary is curated to sound natural to native speakers. We align with [Anthropic's official multilingual docs](https://docs.anthropic.com) as a baseline, but community conventions matter too — if Korean developers say "프롬프트" instead of "prompt", that's what we use. Disagree with a term choice? That's exactly the kind of PR we want.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide and [Good First Issues](https://github.com/heznpc/skillbridge/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) to get started.

## FAQ

<details>
<summary><strong>Does it work on browsers other than Chrome?</strong></summary>

Yes! SkillBridge supports **Chrome**, **Firefox**, and **Edge** (plus Brave, Arc, Opera, and Vivaldi). For Chrome/Edge, load the extension directly. For Firefox, run `npm run build:firefox` to generate a compatible build. See [Installation](#installation) for detailed instructions.
</details>

<details>
<summary><strong>Do I need an API key or account?</strong></summary>

Translation and the local learning tools need no account, email, password, user API key, or human-check. The optional cloud Tutor is included in the current source build and requires a separate free Puter sign-in; the local Tutor engine and off mode do not. SkillBridge's operator never receives the Puter session token or account details. See the version notice above for the currently published legacy v1.0.1 boundary.
</details>

<details>
<summary><strong>Why does my language show as "Standard" instead of "Premium"?</strong></summary>

Premium languages have a hand-curated dictionary (1,100+ entries) that catches AI/ML term mistranslations. Standard languages use Google Translate plus local protected-term restoration. Want to promote your language? Contribute a dictionary — see <a href="CONTRIBUTING.md">CONTRIBUTING.md</a>.
</details>

<details>
<summary><strong>The translation looks wrong. How do I report it?</strong></summary>

In the v4.2.0 source build, on a supported lesson surface with **Tools ›
Reports**, select text inside one translated passage and choose the needs-work
action. SkillBridge opens Reports with the source, translation and selection
prefilled; you can add a correction and save it to the local queue. The helpful
action also writes only to that queue. English, untranslated or multi-block
selections and exam answer choices do not expose feedback actions. Nothing is
submitted automatically: export the local JSON if you choose to share it, open a
<a href="https://github.com/heznpc/skillbridge/issues">GitHub issue</a>, or edit
the dictionary directly.
</details>

<details>
<summary><strong>Is this project affiliated with Anthropic?</strong></summary>

No. SkillBridge is an unofficial community project. It is not affiliated with, endorsed by, or sponsored by Anthropic. "Anthropic", "Claude", and "Skilljar" are trademarks of their respective owners.
</details>

## Roadmap

- ~~Firefox and Edge Add-on support~~ (shipped in v2.0.0)
- ~~Exam mode — answer choice protection~~ (shipped in v2.0.0)
- ~~Certification exam kill-switch~~ (shipped in v2.1.0)
- ~~SPA navigation handling~~ (shipped in v2.1.0)
- ~~New course support: Cowork, subagents, MCP Advanced Topics~~ (shipped in v2.1.0)
- ~~Per-lesson term preview and PDF export~~ (shipped in v3.5.0)
- ~~Warm-cache reuse for plain and structured translations, with explicit
  coverage status~~ (implemented after v4.2.0; unreleased)
- ~~Assessment-safe Continue/Recent retention~~ (implemented after v4.2.0;
  unreleased)
- ~~Firefox AMO deployment pipeline~~ (shipped in v3.5.0)
- Additional curated language dictionaries (community-driven)
- Opt-in community translation review (v4.2.0 feedback remains local; no telemetry or auto-submission)
- Multi-LMS platform support beyond Skilljar

## Disclaimer

SkillBridge is a personal translation and study tool. It caches original and translated lesson text locally for up to 30 days, stores local learning state and Tutor history, sends requested translation text to Google Translate, and sends only user-invoked cloud Tutor requests to Claude through Puter. See the [Privacy Policy](PRIVACY_POLICY.md) for exact data flows and retention.

> **SkillBridge** is an unofficial, independent community project. It is not affiliated with, endorsed by, or sponsored by Anthropic or Skilljar. References to "Anthropic", "Claude", "Skilljar", and `anthropic.skilljar.com` are nominative — they describe the third-party platform and content this extension translates. All trademarks remain the property of their respective owners.

## License

[MIT](LICENSE)

---

If you find SkillBridge useful, consider [starring the repo](https://github.com/heznpc/skillbridge/stargazers). It helps more learners discover the project.
