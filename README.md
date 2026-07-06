<div align="center">

<img src="assets/icons/icon128.png" alt="SkillBridge" width="90" />

# SkillBridge — AI Course Translator <!-- VERSION_START -->v3.5.41<!-- VERSION_END -->

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

Break the language barrier on these free AI courses. <!-- LANG_COUNT_START -->32 languages<!-- LANG_COUNT_END --> supported. The extension auto-activates on `anthropic.skilljar.com`, on any other Skilljar-hosted AI course it detects, and on Claude tutorial pages at `claude.com/resources/tutorials` (translation only on those — the AI Tutor runs on `anthropic.skilljar.com` exclusively); non-AI Skilljar tenants are paused automatically.

[Install](#installation) · [Features](#features) · [Report Bug](https://github.com/heznpc/skillbridge/issues) · [Request Feature](https://github.com/heznpc/skillbridge/issues) · [Contributing](CONTRIBUTING.md)

</div>

---

<div align="center">

<img src="assets/screenshots/skillbridge-demo.gif" alt="SkillBridge demo — translating an AI course page in real time" width="720" />

*Install SkillBridge, visit a course page at anthropic.skilljar.com, and the entire page is translated instantly.*

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

| | Google Translate (page) | SkillBridge |
|---|---|---|
| AI terminology | ❌ "Prompt" → "신속한" (wrong) | ✅ "Prompt" → "프롬프트" (correct) |
| Technical accuracy | ❌ Generic machine translation | ✅ 1,100+ curated terms + AI verification |
| Context-aware help | ❌ None | ✅ AI tutor answers questions about the lesson |
| Video subtitles | ❌ Separate manual toggle | ✅ Auto-translated subtitles |
| UI preservation | ❌ Breaks checkboxes, progress bars | ✅ All interactive elements preserved |
| Cost | Free | Free — no API keys needed |

**SkillBridge exists to remove this barrier** — making AI education accessible worldwide.

> **No API keys. No cost. Just install and learn.**

## Quick Start

1. Install the extension ([see below](#installation))
2. Visit a course page at [anthropic.skilljar.com](https://anthropic.skilljar.com/)
3. SkillBridge translates the entire page automatically

That's it.

## Features

### 🌐 Full Page Translation

Every text element on the page is translated, with AI-specific terms handled correctly via curated dictionaries. Progress checkboxes, icons, navigation, and CJK fonts all stay intact. (Blocks that mix inline formatting — bold, links, inline code — are AI-translated, so they fill in after the optional tutor's Puter human-check; plain text, headings, and lists translate with no account.)

<div align="center">
<img src="assets/screenshots/01-lesson-translated.png" alt="Lesson page with curriculum fully translated" width="720" />
<br/>
<em>Course lesson with full curriculum translated — UI elements preserved.</em>
</div>

### 🤖 AI Tutor

A sidebar chatbot powered by **Claude Sonnet 4.6** via [Puter.js](https://docs.puter.com/). It knows which course and lesson you're on. Ask questions in your language, get streaming answers. The tutor and the Puter page bridge it relies on run **only on `anthropic.skilljar.com`** — on other detected Skilljar AI tenants the extension still translates (curated dictionary + Google Translate), but the AI Tutor stays off (its bridge nonce is readable by page-world scripts, so we never expose it on tenants we don't control).

### 🎬 Auto-Subtitles

Course videos automatically activate translated subtitles when you play them — no manual toggle needed.

### 🌙 Dark Mode

A full dark theme for the entire Academy site — header, sidebar, lesson content, and tutor. Toggle with one click.

### 🎓 Exam Mode & Certification Safety

**Course quizzes** (e.g., Claude 101 completion quiz) — answer choices are protected from translation to preserve accuracy; the AI Tutor switches to exam-safe mode.

**Proctored certification exams** (e.g., Claude Certified Architect) — the extension **disables itself entirely** so it cannot be mistaken for a cheating tool. No translation, no UI injection, nothing.

### ⌨️ Keyboard Shortcuts

`Ctrl+Shift+S` toggle sidebar, `Ctrl+Shift+F` flashcards, `Ctrl+Shift+L` dark mode, `Ctrl+Shift+/` help overlay, `Escape` close, `/` focus chat.

### 📖 Per-Lesson Term Preview

When you enter a lesson, a floating card shows **6 key terms** for the current course with their translations. Auto-dismisses after 15 seconds. Click "View all" to open the full flashcard panel.

### 📄 PDF Export

Export any translated lesson as a clean, print-friendly PDF — useful for offline study or quick reference.

### 🔍 Smart Detection

Detects your browser language on first visit and offers to translate. Handles SPA navigation — when you move between lessons, the new page is translated automatically without a reload.

### 🛡️ Protected Terms

Generic translation tools often **mistranslate brand names and technical terms**. SkillBridge auto-corrects these errors after translation:

<div align="center">

| Before (Google Translate) | After (SkillBridge) |
|:---:|:---:|
| ❌ 인류학적 과정 | ✅ Anthropic 과정 |
| ❌ 클로드 | ✅ Claude |
| ❌ 신속한 공학 | ✅ 프롬프트 엔지니어링 |

</div>

<div align="center">
<img src="assets/screenshots/catalog-translated.png" alt="Course catalog page translated to Korean with correct terminology" width="720" />
<br/>
<em>Course catalog translated to Korean — brand names and AI terms stay accurate.</em>
</div>

## Installation

> **Status: live as v1.0.1; re-publication of the current v3.5.41 pending.**
> The Chrome Web Store listing is available in all locales **except the United
> States**, where it was removed on 2026-05-12 over a trademark issue with the
> old icon (since redesigned on `main`). The published store build is v1.0.1;
> `main` is the up-to-date release (v3.5.41). For the latest version — and for
> US users until re-listing — install via the manual / developer-mode path below.

### Chrome / Edge / Chromium browsers

**Manual install** (developer mode):

```bash
git clone https://github.com/heznpc/skillbridge.git
```

1. Open `chrome://extensions/` (Chrome) or `edge://extensions/` (Edge)
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the cloned folder
4. Visit [anthropic.skilljar.com](https://anthropic.skilljar.com/) and start learning!

Also works in Brave, Arc, Opera, Vivaldi, and other Chromium-based browsers.

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

SkillBridge uses a **multi-stage translation engine** that prioritizes speed and accuracy:

```
Page text
  │
  ├─ 1,100+ curated term dictionary ──→ Instant (AI terms translated correctly)
  │
  ├─ Local cache (IndexedDB) ───────→ Instant (previously verified)
  │
  ├─ Has inline HTML tags? (<strong>, <a>, <code>...)
  │     └─ Yes → Gemini 2.0 Flash translates with tag preservation (needs a one-time Puter human-check via the tutor)
  │
  └─ Plain text → Google Translate ─→ ~200ms
       │
       ├─ Protected Terms auto-fix ─→ Restores brand/tech terms GT mistranslates
       │
       └─ Complex sentence? → Gemini 2.0 Flash verifies when Puter auth is available → otherwise GT text stays in place
```

Translation requests are sent to Google Translate and Gemini/Claude APIs via [Puter.js](https://docs.puter.com/). SkillBridge does not operate any servers — but text is transmitted to these third-party services for translation and AI features. No account, email, or password is required to translate; the optional AI tutor may open a Puter window to verify you're human. See our [Privacy Policy](PRIVACY_POLICY.md) for full details.

## Architecture & engineering decisions

The interesting part of SkillBridge is the constraints, not the feature count. A few decisions worth calling out:

**Why a multi-stage pipeline, not "just call an LLM."**
Translating a whole course page on every navigation has to be fast *and* correct, so each stage above earns its place: the curated dictionary fixes the terms generic MT gets wrong ("Prompt" → "프롬프트", never "신속한") at zero latency; the IndexedDB cache makes re-visits instant; Google Translate covers the long tail at ~200ms; and the LLM verification pass runs **in the background** on complex sentences only — so AI cost and latency never sit on the critical path. Cheapest correct stage first, most expensive last.

**Reliability & safety are designed in, not bolted on.**
- **Exam-safe by default** — on proctored certification exams the extension *disables itself entirely*, and on quizzes answer choices are never translated. A learning aid must not be mistakable for a cheating tool.
- **Invariants over hope** — brand/product terms ("Claude", "Cowork", "Agent Skills") are protected by a dictionary and restored *after* machine translation, rather than trusting the translator to leave them alone. (Generic concept words like "subagent" are translated natively per locale — see [docs/TRANSLATION_RULES.md](docs/TRANSLATION_RULES.md).)
- **Guarding against external drift** — the target site is a third party we don't control, so CI watchers detect when the platform adds a course or changes its DOM selectors and open an issue automatically, instead of letting users hit silent breakage.
- **Defensive content scripts** — idempotent injection guards and URL polling, because the host app navigates via SPA (content scripts can fire more than once — or not at all — per navigation).

**What I deliberately did *not* build (and why).**
- **No servers / no backend** — everything runs client-side; translation and AI go straight to third parties via Puter.js. This is what keeps it free forever and privacy-preserving, at the deliberate cost of cross-device sync.
- **No telemetry or analytics** — nothing is collected, not even opt-in error reports; marketing convenience never outweighs the privacy promise.
- **No A/B framework, no paid tier** — both imply infrastructure (traffic, segmentation, billing) that a free, server-less project shouldn't fake.

The full "things we will not do" list is kept public on purpose in [TODO.md](TODO.md).

## Supported Languages

### Premium — Curated Dictionary + Google Translate + AI Verification

| Language | Code | Dictionary |
|----------|------|------------|
| 🇰🇷 한국어 (Korean) | `ko` | 1,100+ entries |
| 🇯🇵 日本語 (Japanese) | `ja` | 1,100+ entries |
| 🇨🇳 中文简体 (Chinese Simplified) | `zh-CN` | 1,100+ entries |
| 🇹🇼 中文繁體 (Chinese Traditional) | `zh-TW` | 1,100+ entries |
| 🇪🇸 Español (Spanish) | `es` | 1,100+ entries |
| 🇫🇷 Français (French) | `fr` | 1,100+ entries |
| 🇮🇹 Italiano (Italian) | `it` | 1,100+ entries (re-translated from English; native review welcome) |
| 🇩🇪 Deutsch (German) | `de` | 1,100+ entries |
| 🇧🇷 Português (Brazilian) | `pt-BR` | 1,100+ entries |
| 🇷🇺 Русский (Russian) | `ru` | 1,100+ entries |
| 🇻🇳 Tiếng Việt (Vietnamese) | `vi` | 1,100+ entries |
| 🇮🇩 Bahasa Indonesia | `id` | 1,100+ entries |

### Standard — Google Translate + AI Verification

🇵🇹 Português (PT) · 🇳🇱 Nederlands · 🇵🇱 Polski · 🇺🇦 Українська · 🇨🇿 Čeština · 🇸🇪 Svenska · 🇩🇰 Dansk · 🇫🇮 Suomi · 🇳🇴 Norsk · 🇹🇷 Türkçe · 🇸🇦 العربية · 🇮🇳 हिन्दी · 🇹🇭 ภาษาไทย · 🇲🇾 Bahasa Melayu · 🇵🇭 Filipino · 🇧🇩 বাংলা · 🇮🇱 עברית · 🇷🇴 Română · 🇭🇺 Magyar · 🇬🇷 Ελληνικά

> Want to add your language as Premium? Contribute a curated dictionary — see [CONTRIBUTING.md](CONTRIBUTING.md).

### Terminology QA — how accuracy is enforced, not just promised

New Academy content is covered by a standing pipeline, not by hand-checking:
a CI watcher polls the live catalog twice a day and **fails loudly + opens an
issue** the moment a course appears that the dictionaries don't cover; the
course gets wired into all 12 premium dictionaries; structural CI gates
(`check:i18n`, `check:dict-coverage`, `check:locales`) and a real-dictionary
regression suite guard every merge after that. Proven turnaround: on
**2026-06-10** the watcher flagged the brand-new *Claude Platform 101* course
in the morning ([#196](https://github.com/heznpc/skillBridge/issues/196)) and
all premium locales at the time were wired the same day
([#201](https://github.com/heznpc/skillBridge/pull/201)).

Beyond structure, dictionary *content* goes through layered review — CI gates
catch shape/contamination drift on every PR, a full per-locale LLM audit runs
before every store release (see `docs/TRANSLATION_QA.md`), and native-speaker
review is the final layer:

<!-- LOCALE_QA_START -->
| Language | Code | Entries | Last curated | Last LLM audit | Native review |
|---|---|---:|---|---|---|
| 한국어 | `ko` | 1129 | 2026-04-02 | 2026-06-10 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| 日本語 | `ja` | 1129 | 2026-04-02 | 2026-06-10 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| 中文(简体) | `zh-CN` | 1129 | 2026-04-02 | 2026-06-10 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| 中文(繁體) | `zh-TW` | 1129 | 2026-04-02 | 2026-06-10 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| Español | `es` | 1129 | 2026-04-02 | 2026-06-10 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| Français | `fr` | 1129 | 2026-04-02 | 2026-06-10 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| Italiano | `it` | 1129 | 2026-06-03 | 2026-06-10 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| Deutsch | `de` | 1129 | 2026-04-02 | 2026-06-10 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| Português (BR) | `pt-BR` | 1129 | 2026-04-02 | 2026-06-10 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| Русский | `ru` | 1129 | 2026-04-02 | 2026-06-10 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| Tiếng Việt | `vi` | 1129 | 2026-04-02 | 2026-06-10 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| Bahasa Indonesia | `id` | 1129 | 2026-06-17 | 2026-06-17 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
<!-- LOCALE_QA_END -->

🙋 **Native speakers wanted** — a first native pass on your locale takes
~1–2 hours, needs no coding, and gets you credited here. See
[#202](https://github.com/heznpc/skillBridge/issues/202).

## Privacy & Security

SkillBridge is designed with privacy first:

- **No data collection** — zero analytics, zero tracking, zero telemetry
- **No SkillBridge servers** — we do not operate any servers. Translation and AI requests are sent to third-party services (Google Translate, Puter.js → Gemini/Claude)
- **No account required to translate** — works immediately after install; the optional AI tutor may open a one-time Puter "verify you're human" window
- **Local storage only** — translation cache (30-day TTL) and chat history are stored in your browser's IndexedDB. This data never leaves your device
- **Open source** — every line of code is auditable right here

See our full [Privacy Policy](PRIVACY_POLICY.md).

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Page Translation | Google Translate API |
| Inline Tag Translation | Gemini 2.0 Flash (preserves `<strong>`, `<a>`, `<code>`) |
| Quality Verification | Gemini 2.0 Flash via [Puter.js](https://docs.puter.com/) when Puter auth is available |
| Protected Terms | Auto-correction of GT brand/product term errors per language (Claude, Cowork, Computer Use, Agent Skills, etc.) |
| AI Tutor | Claude Sonnet 4.6 via Puter.js |
| Curated Dictionaries | Hand-tuned JSON (1,100+ × 12 languages) |
| Translation Cache | IndexedDB |
| CJK Font Rendering | Local system/Noto fallback stacks |

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

Not for translation — it works out of the box via Google Translate with no account, email, API key, or password, and the background Gemini quality check stays silent when you're signed out (it never prompts you). The optional **AI Tutor** uses [Puter.js](https://puter.com/) (free, no API key); the first time you open it, Puter may show a window to verify you're human (its free "user-pays" tier). So: read and translate with zero setup; the tutor is the one feature that may open a brief Puter human-check.
</details>

<details>
<summary><strong>Why does my language show as "Standard" instead of "Premium"?</strong></summary>

Premium languages have a hand-curated dictionary (1,100+ entries) that catches AI/ML term mistranslations. Standard languages rely on Google Translate + Gemini verification, which is still quite good. Want to promote your language? Contribute a dictionary — see <a href="CONTRIBUTING.md">CONTRIBUTING.md</a>.
</details>

<details>
<summary><strong>The translation looks wrong. How do I report it?</strong></summary>

Open an <a href="https://github.com/heznpc/skillbridge/issues">issue</a> with the original English text, the bad translation, and your suggested correction. Or even better — submit a PR directly to the dictionary JSON file for your language.
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
- ~~Per-lesson term preview, PDF export, offline cache hardening~~ (shipped in v3.5.0)
- ~~Firefox AMO deployment pipeline~~ (shipped in v3.5.0)
- Additional curated language dictionaries (community-driven)
- Translation quality analytics and community review
- Multi-LMS platform support beyond Skilljar


## Disclaimer

SkillBridge is a personal translation tool, similar to your browser's built-in translate feature. Text is translated on-the-fly in your browser — never stored or redistributed.

> **SkillBridge** is an unofficial, independent community project. It is not affiliated with, endorsed by, or sponsored by Anthropic or Skilljar. References to "Anthropic", "Claude", "Skilljar", and `anthropic.skilljar.com` are nominative — they describe the third-party platform and content this extension translates. All trademarks remain the property of their respective owners.

## License

[MIT](LICENSE)

---

If you find SkillBridge useful, consider [starring the repo](https://github.com/heznpc/skillbridge/stargazers). It helps more learners discover the project.
