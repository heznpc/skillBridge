<div align="center">

<img src="assets/icons/icon128.png" alt="SkillBridge" width="90" />

# SkillBridge for Anthropic Academy

> Available in multiple languages at the [project landing page](https://heznpc.github.io/skillbridge/).

[![CI](https://github.com/heznpc/skillBridge/actions/workflows/ci.yml/badge.svg)](https://github.com/heznpc/skillBridge/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Extension_MV3-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![GitHub stars](https://img.shields.io/github/stars/heznpc/skillbridge?style=social)](https://github.com/heznpc/skillbridge/stargazers)
[![GitHub contributors](https://img.shields.io/github/contributors/heznpc/skillbridge)](https://github.com/heznpc/skillbridge/graphs/contributors)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**Translate Anthropic Academy into your language — instantly.**

Break the language barrier on Anthropic's free AI courses.

[Install](#installation) · [Features](#features) · [Report Bug](https://github.com/heznpc/skillbridge/issues) · [Request Feature](https://github.com/heznpc/skillbridge/issues) · [Contributing](CONTRIBUTING.md)

</div>

---

<div align="center">

<img src="assets/screenshots/skillbridge-demo.gif" alt="SkillBridge Demo — translating Anthropic Academy in real time" width="720" />

*Install SkillBridge, visit Anthropic Academy, and the entire page is translated instantly.*

</div>

---

## Table of Contents

- [The Problem](#the-problem)
- [Quick Start](#quick-start)
- [Features](#features)
- [Installation](#installation)
- [How It Works](#how-it-works)
- [Supported Languages](#supported-languages)
- [Privacy & Security](#privacy--security)
- [Tech Stack](#tech-stack)
- [Contributing](#contributing)
- [FAQ](#faq)
- [License](#license)

## The Problem

[Anthropic Academy](https://anthropic.skilljar.com/) is one of the best free resources for learning Claude, prompt engineering, and AI safety. Millions of developers worldwide want to take these courses — but they're **only available in English**.

Generic translators make it worse, not better:

| | Google Translate (page) | SkillBridge |
|---|---|---|
| AI terminology | ❌ "Prompt" → "신속한" (wrong) | ✅ "Prompt" → "프롬프트" (correct) |
| Technical accuracy | ❌ Generic machine translation | ✅ 570+ curated terms + AI verification |
| Context-aware help | ❌ None | ✅ AI tutor answers questions about the lesson |
| Video subtitles | ❌ Separate manual toggle | ✅ Auto-translated subtitles |
| UI preservation | ❌ Breaks checkboxes, progress bars | ✅ All interactive elements preserved |
| Cost | Free | Free — no API keys needed |

**SkillBridge exists to remove this barrier** — making AI education accessible worldwide.

> **No API keys. No cost. Just install and learn.**

## Quick Start

1. Install the extension ([see below](#installation))
2. Visit [Anthropic Academy](https://anthropic.skilljar.com/)
3. SkillBridge translates the entire page automatically

That's it.

## Features

### 🌐 Full Page Translation

Every text element on the page is translated, with AI-specific terms handled correctly via curated dictionaries. Progress checkboxes, icons, navigation, and CJK fonts all stay intact.

<div align="center">
<img src="assets/screenshots/01-lesson-translated.png" alt="Lesson page with curriculum fully translated" width="720" />
<br/>
<em>Course lesson with full curriculum translated — UI elements preserved.</em>
</div>

### 🤖 AI Tutor

A sidebar chatbot powered by **Claude Sonnet 4** via [Puter.js](https://docs.puter.com/). It knows which course and lesson you're on. Ask questions in your language, get streaming answers.

### 🎬 Auto-Subtitles

Course videos automatically activate translated subtitles when you play them — no manual toggle needed.

### 🌙 Dark Mode

A full dark theme for the entire Academy site — header, sidebar, lesson content, and tutor. Toggle with one click.

### 🔍 Smart Detection

Detects your browser language on first visit and offers to translate. No setup needed.

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
<img src="assets/screenshots/catalog-translated.png" alt="Anthropic Academy catalog page translated to Korean with correct terminology" width="720" />
<br/>
<em>Course catalog translated to Korean — brand names and AI terms stay accurate.</em>
</div>

## Installation

> Install from the [Chrome Web Store](https://chromewebstore.google.com/) (search "SkillBridge for Anthropic Academy").

**Manual install** (developer mode):

```bash
git clone https://github.com/heznpc/skillbridge.git
```

1. Open `chrome://extensions/` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the cloned folder
4. Visit [anthropic.skilljar.com](https://anthropic.skilljar.com/) and start learning!

Also works in Edge, Brave, Arc, and other Chromium-based browsers.

## How It Works

SkillBridge uses a **five-tier translation engine** that prioritizes speed and accuracy:

```
Page text
  │
  ├─ 570+ curated term dictionary ──→ Instant (AI terms translated correctly)
  │
  ├─ Local cache (IndexedDB) ───────→ Instant (previously verified)
  │
  ├─ Has inline HTML tags? (<strong>, <a>, <code>...)
  │     └─ Yes → Gemini 2.0 Flash translates with tag preservation
  │
  └─ Plain text → Google Translate ─→ ~200ms
       │
       ├─ Protected Terms auto-fix ─→ Restores brand/tech terms GT mistranslates
       │
       └─ Complex sentence? → Gemini 2.0 Flash verifies → corrects if needed
```

Translation requests are sent to Google Translate and Gemini/Claude APIs via [Puter.js](https://docs.puter.com/) — no data is stored on our servers, and no account or API key is required.

## Supported Languages

### Premium — Curated Dictionary + Google Translate + AI Verification

| Language | Code | Dictionary |
|----------|------|------------|
| 🇰🇷 한국어 (Korean) | `ko` | 570+ entries |
| 🇯🇵 日本語 (Japanese) | `ja` | 570+ entries |
| 🇨🇳 中文简体 (Chinese Simplified) | `zh-CN` | 570+ entries |
| 🇪🇸 Español (Spanish) | `es` | 570+ entries |
| 🇫🇷 Français (French) | `fr` | 570+ entries |
| 🇩🇪 Deutsch (German) | `de` | 570+ entries |

### Standard — Google Translate + AI Verification

🇹🇼 中文繁體 · 🇧🇷 Português (BR) · 🇵🇹 Português (PT) · 🇮🇹 Italiano · 🇳🇱 Nederlands · 🇷🇺 Русский · 🇵🇱 Polski · 🇺🇦 Українська · 🇨🇿 Čeština · 🇸🇪 Svenska · 🇩🇰 Dansk · 🇫🇮 Suomi · 🇳🇴 Norsk · 🇹🇷 Türkçe · 🇸🇦 العربية · 🇮🇳 हिन्दी · 🇹🇭 ภาษาไทย · 🇻🇳 Tiếng Việt · 🇮🇩 Bahasa Indonesia · 🇲🇾 Bahasa Melayu · 🇵🇭 Filipino · 🇧🇩 বাংলা · 🇮🇱 עברית · 🇷🇴 Română · 🇭🇺 Magyar · 🇬🇷 Ελληνικά

> Want to add your language as Premium? Contribute a curated dictionary — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Privacy & Security

SkillBridge is designed with privacy first:

- **No data collection** — zero analytics, zero tracking, zero telemetry
- **No servers** — all translation happens client-side or via public APIs (Google Translate, Puter.js)
- **No accounts required** — works immediately after install
- **No stored content** — only caches translated outputs (never originals) in your local IndexedDB
- **Open source** — every line of code is auditable right here

See our full [Privacy Policy](PRIVACY_POLICY.md).

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Page Translation | Google Translate API |
| Inline Tag Translation | Gemini 2.0 Flash (preserves `<strong>`, `<a>`, `<code>`) |
| Quality Verification | Gemini 2.0 Flash via [Puter.js](https://docs.puter.com/) |
| Protected Terms | Auto-correction of GT brand/tech term errors per language |
| AI Tutor | Claude Sonnet 4 via Puter.js |
| Curated Dictionaries | Hand-tuned JSON (570+ × 6 languages) |
| Translation Cache | IndexedDB |
| CJK Font Rendering | Google Fonts Noto Sans |

> **Built with [Claude Code](https://docs.anthropic.com/en/docs/claude-code).**
> This project — from architecture design and feature implementation to debugging and the demo GIF — was developed using Claude Code as an AI pair-programming partner.

## Contributing

SkillBridge is a community-driven project. The single most impactful way to contribute is improving the translation dictionary for your language — no code required, just edit a JSON file. Even fixing one bad translation helps every learner using that language.

Each language's dictionary is curated to sound natural to native speakers. We align with [Anthropic's official multilingual docs](https://docs.anthropic.com) as a baseline, but community conventions matter too — if Korean developers say "프롬프트" instead of "prompt", that's what we use. Disagree with a term choice? That's exactly the kind of PR we want.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide and [Good First Issues](https://github.com/heznpc/skillbridge/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) to get started.

## FAQ

<details>
<summary><strong>Does it work on browsers other than Chrome?</strong></summary>

Yes! SkillBridge works on any Chromium-based browser — Edge, Brave, Arc, Opera, and Vivaldi. Load it as an unpacked extension the same way.
</details>

<details>
<summary><strong>Do I need an API key or account?</strong></summary>

No. SkillBridge uses Google Translate (public API) and Puter.js (free tier) for AI features. Everything works out of the box.
</details>

<details>
<summary><strong>Why does my language show as "Standard" instead of "Premium"?</strong></summary>

Premium languages have a hand-curated dictionary (570+ entries) that catches AI/ML term mistranslations. Standard languages rely on Google Translate + Gemini verification, which is still quite good. Want to promote your language? Contribute a dictionary — see <a href="CONTRIBUTING.md">CONTRIBUTING.md</a>.
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

- Additional curated language dictionaries (community-driven)
- Firefox and Edge Add-on support
- Translation quality analytics and community review
- Multi-LMS platform support beyond Skilljar

See [ROADMAP.md](docs/ROADMAP.md) for the full plan.

## Disclaimer

SkillBridge is a personal translation tool, similar to your browser's built-in translate feature. Text is translated on-the-fly in your browser — never stored or redistributed.

> **SkillBridge for Anthropic Academy** is an unofficial community project. It is not affiliated with, endorsed by, or sponsored by Anthropic. "Anthropic", "Claude", and "Skilljar" are trademarks of their respective owners.

## License

[MIT](LICENSE)

---

If you find SkillBridge useful, consider [starring the repo](https://github.com/heznpc/skillbridge/stargazers). It helps more learners discover the project.
