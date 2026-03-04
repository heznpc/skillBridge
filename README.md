# SkillBridge for Anthropic Academy

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension_MV3-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Good First Issues](https://img.shields.io/github/issues/heznpc/skillbridge/good%20first%20issue)](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)

**Break the language barrier on Anthropic's free AI courses.**

[Anthropic Academy](https://academy.anthropic.com/) offers world-class courses on Claude, prompt engineering, and AI safety — but only in English. **SkillBridge** is a community-built Chrome extension that translates the entire learning experience into 30+ languages, complete with an AI tutor that answers course questions in your language.

> No API keys. No cost. Just install and learn.

<p align="center">
  <img src="assets/icons/icon128.png" alt="SkillBridge" width="96" />
</p>

[한국어](README_KO.md) · [日本語](README_JA.md) · [中文](README_ZH-CN.md) · [Español](README_ES.md) · [Français](README_FR.md) · [Deutsch](README_DE.md)

---

## Screenshots

| Before (English only) | After (Korean) |
|---|---|
| ![Before](assets/screenshots/before.png) | ![After](assets/screenshots/after-ko.png) |

| AI Tutor Chat | Auto-Subtitle |
|---|---|
| ![Tutor](assets/screenshots/tutor.png) | ![Subtitle](assets/screenshots/subtitle.png) |

> **Contributing screenshots:** We welcome screenshots in any language! See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Features

### Three-Tier Translation Engine

Translation happens in layers, each faster than the last:

1. **Static dictionary** — 560+ hand-tuned translations per language load instantly (0ms latency)
2. **IndexedDB cache** — previously verified translations recalled from local storage
3. **Google Translate + Gemini verification** — remaining text translated by Google Translate, then complex sentences verified by Gemini 2.0 Flash in the background

Short UI strings like "4 minutes" or "Module 3" skip AI verification entirely. The smart trigger only fires on prose that Google Translate might struggle with (80+ characters with complex structure).

### AI Tutor (Claude Sonnet 4)

A sidebar chatbot powered by Claude Sonnet 4 via [Puter.js](https://docs.puter.com/). It knows which course and lesson you're viewing — ask questions in any language and get streaming responses with full context awareness.

### YouTube Auto-Subtitles

Embedded course videos automatically activate translated subtitles in your selected language using the YouTube IFrame API.

### Auto-Detection & Welcome Banner

On first visit, the extension detects your browser language and offers to translate — no manual setup required.

### Preservation of Original UI

The extension carefully preserves the original page design. CJK font weights are matched to Skilljar's Copernicus serif hierarchy (h1: light, h2: bold, h3+: medium), and child elements like progress checkboxes and icons are never destroyed during translation.

---

## Supported Languages

### Premium (Static Dictionary + Google Translate + AI Verification)

| Language | Code | Dictionary |
|----------|------|------------|
| 한국어 (Korean) | `ko` | 560+ entries |
| 日本語 (Japanese) | `ja` | 560+ entries |
| 中文简体 (Chinese Simplified) | `zh-CN` | 560+ entries |
| Español (Spanish) | `es` | 560+ entries |
| Français (French) | `fr` | 560+ entries |
| Deutsch (German) | `de` | 560+ entries |

### Standard (Google Translate + AI Verification)

中文繁體, Português (BR/PT), Italiano, Nederlands, Русский, Polski, Українська, Čeština, Svenska, Dansk, Suomi, Norsk, Türkçe, العربية, हिन्दी, ภาษาไทย, Tiếng Việt, Bahasa Indonesia, Bahasa Melayu, Filipino, বাংলা, עברית, Română, Magyar, Ελληνικά

> Want to promote a language to Premium? Add a static dictionary JSON — see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Installation

### From Source (Developer Mode)

1. Clone the repository:
   ```bash
   git clone https://github.com/heznpc/skillbridge.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable **Developer mode** (top-right toggle)

4. Click **Load unpacked** and select the cloned folder

5. Visit [academy.anthropic.com](https://academy.anthropic.com/) and start learning!

### From Chrome Web Store

> Coming soon.

---

## Usage

### Translate a Page

There are three ways to start translating:

**Popup** — Click the extension icon in Chrome toolbar → select your language → click "Translate".

**Auto-detect** — On first visit, a welcome banner detects your browser language and offers to translate the page automatically.

**Sidebar** — Open the AI Tutor (chat bubble, bottom-right) → change language from the dropdown in the header.

Enable **"Auto-translate on page load"** in the popup to translate every Anthropic Academy page automatically.

### Ask the AI Tutor

Click the chat bubble (bottom-right) to open the tutor sidebar. It's context-aware — it knows which course and lesson you're viewing. Ask questions in any language and get streaming responses powered by Claude Sonnet 4.

---

## Architecture

```
skillbridge/
├── manifest.json                    # Chrome MV3 manifest
├── _locales/                        # Chrome i18n (en, ko, ja, zh_CN)
├── src/
│   ├── background/
│   │   └── background.js            # Google Translate API proxy
│   ├── content/
│   │   ├── content.js               # DOM translation + sidebar UI + font injection
│   │   └── content.css              # Language font stacks + UI styles
│   ├── popup/
│   │   ├── popup.html               # Extension popup
│   │   └── popup.js                 # Popup logic
│   ├── lib/
│   │   ├── translator.js            # Translation engine (3-tier + Gemini verify)
│   │   ├── page-bridge.js           # Main-world bridge for Puter.js AI
│   │   └── youtube-subtitles.js     # YouTube subtitle auto-enable
│   └── data/
│       ├── ko.json                  # Korean static dictionary
│       ├── ja.json                  # Japanese
│       ├── zh-CN.json               # Chinese Simplified
│       ├── es.json                  # Spanish
│       ├── fr.json                  # French
│       └── de.json                  # German
├── assets/
│   ├── icons/                       # Extension icons (16, 48, 128)
│   └── screenshots/                 # README + Web Store screenshots
└── docs/                            # GitHub Pages landing page
```

### Translation Flow

```
Page text
  │
  ├─ Static dict match? ──→ Apply instantly (0ms)
  │
  ├─ IndexedDB cache? ──→ Apply instantly (0ms)
  │
  └─ Google Translate ──→ Apply (~200ms)
       │
       └─ Complex prose (80+ chars)?
            │
            YES → Gemini 2.0 Flash verifies in background
            │     └─ Improved? → Smooth DOM update + cache
            │
            NO  → Done (Google Translate is final)
```

---

## Tech Stack

| Component | Technology | Role |
|-----------|-----------|------|
| Page Translation | Google Translate API | Fast first-pass translation |
| Quality Verification | Gemini 2.0 Flash via Puter.js | Background accuracy check |
| AI Tutor | Claude Sonnet 4 via Puter.js | Conversational learning assistant |
| Static Dictionaries | Hand-curated JSON (560+ × 6 langs) | Instant high-quality base translations |
| Translation Cache | IndexedDB | Persists verified translations locally |
| Font Rendering | Google Fonts (Noto Sans CJK) | CJK font fallback via `<link>` injection |
| AI Gateway | [Puter.js](https://docs.puter.com/) | Free Claude + Gemini — no API keys needed |

---

## How Copyright Is Respected

SkillBridge is a personal translation tool, similar to your browser's built-in translate feature. Text is translated on-the-fly in your browser and never stored or redistributed. Static dictionaries contain only common UI strings, not course content.

> **Disclaimer:** SkillBridge for Anthropic Academy is an unofficial community project. It is not affiliated with, endorsed by, or sponsored by Anthropic. "Anthropic", "Claude", and "Skilljar" are trademarks of their respective owners.

---

## Contributing

SkillBridge is built by the community, for the community. We welcome contributions of all kinds:

- **Translation improvements** — Fix mistranslations or add entries to static dictionaries
- **New premium languages** — Create a curated JSON dictionary for a new language
- **Code contributions** — Improve the translation engine, AI tutor, or subtitle features
- **Screenshots** — Submit before/after screenshots in your language
- **Documentation** — Improve READMEs, write tutorials, translate documentation

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide and check out our [Good First Issues](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

See [ROADMAP.md](ROADMAP.md) for where this project is heading.

---

## License

MIT — see [LICENSE](LICENSE)

---

**Made for the global AI learning community.**
