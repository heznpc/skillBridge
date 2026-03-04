# SkillBridge for Anthropic Academy

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Good First Issues](https://img.shields.io/github/issues/heznpc/skillbridge/good%20first%20issue)](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)

**Break the language barrier on Anthropic's free AI courses.**

[Anthropic's Skilljar courses](https://anthropic.skilljar.com/) provide world-class training on Claude, prompt engineering, and AI safety — but only in English. **SkillBridge for Anthropic Academy** is a community-built Chrome extension that translates the entire learning experience into 30+ languages, with an AI tutor that answers your questions in real time.

> No API keys. No cost. Just install and learn.

<p align="center">
  <img src="assets/icons/icon128.png" alt="SkillBridge" width="96" />
</p>

[한국어](README_KO.md) · [日本語](README_JA.md) · [中文](README_ZH-CN.md) · [Español](README_ES.md) · [Français](README_FR.md) · [Deutsch](README_DE.md)

---

## Screenshots

<!-- TODO: Replace with actual screenshots from anthropic.skilljar.com -->
| Before (English only) | After (Korean translation) |
|---|---|
| ![Before](assets/screenshots/before.png) | ![After](assets/screenshots/after-ko.png) |

| AI Tutor Sidebar | YouTube Transcript |
|---|---|
| ![Tutor](assets/screenshots/tutor.png) | ![Transcript](assets/screenshots/transcript.png) |

> **Note:** Screenshots coming soon. Want to contribute? See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Features

### Three-Tier Translation Engine

Translation happens in layers, each faster than the last:

1. **Static dictionary** — 559+ hand-tuned translations per language load instantly with zero latency
2. **IndexedDB cache** — previously verified translations are recalled from local storage
3. **Google Translate + Gemini verification** — remaining text is translated by Google Translate, then complex sentences are background-verified by Gemini 2.0 Flash for accuracy

Short UI labels like "4 minutes" or "Module 3" skip Gemini entirely — the smart trigger only fires on prose that Google Translate might struggle with (80+ character sentences with punctuation or complex structure).

### AI Tutor (Claude Sonnet 4)

A sidebar chatbot powered by Claude Sonnet 4 via [Puter.js](https://docs.puter.com/). Ask about course content in any supported language and get streaming responses with full context awareness of the current page.

### YouTube Subtitle Translation

Embedded course videos automatically activate translated subtitles matching your selected language, using YouTube's native subtitle API.

### Auto-Detection & Welcome Banner

On first visit, the extension detects your browser language and offers to translate the page — no manual setup required.

---

## Supported Languages

### Premium (Static Dictionary + Google Translate + AI Verify)

| Language | Code | Static Dictionary |
|----------|------|-------------------|
| 한국어 (Korean) | `ko` | 559 entries |
| 日本語 (Japanese) | `ja` | 559 entries |
| 中文简体 (Chinese Simplified) | `zh-CN` | 559 entries |
| Español (Spanish) | `es` | 559 entries |
| Français (French) | `fr` | 559 entries |
| Deutsch (German) | `de` | 559 entries |

### Standard (Google Translate + AI Verify)

中文繁體, Português, Italiano, Nederlands, Русский, Polski, Українська, Čeština, Svenska, Dansk, Suomi, Norsk, Türkçe, العربية, हिन्दी, ภาษาไทย, Tiếng Việt, Bahasa Indonesia, Bahasa Melayu, Filipino, বাংলা, עברית, Română, Magyar, Ελληνικά

---

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/heznpc/skillbridge.git
   ```

2. Open Chrome → `chrome://extensions/`

3. Enable **Developer mode** (top right toggle)

4. Click **Load unpacked** → select the cloned folder

5. Navigate to [anthropic.skilljar.com](https://anthropic.skilljar.com/) and start learning!

---

## Usage

### Translate a Page

**Option A — Popup:** Click the extension icon → select language → click "Translate".

**Option B — Auto-detect:** On first visit, a banner offers to translate based on your browser language.

**Option C — Sidebar:** Open the AI Tutor sidebar → use the language dropdown in the header.

Toggle **"Auto-translate on page load"** in the popup to translate every page automatically.

### Ask the AI Tutor

Click the chat bubble (bottom-right) to open the sidebar. The tutor is context-aware — it knows which course and section you're viewing. Ask questions in any language and get streaming responses powered by Claude Sonnet 4.

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
│   │   ├── content.js               # DOM translation + sidebar UI
│   │   └── content.css              # Styles (tutor, spinners, banner)
│   ├── popup/
│   │   ├── popup.html               # Extension popup
│   │   └── popup.js                 # Popup logic
│   ├── lib/
│   │   ├── translator.js            # Translation engine (3-tier + Gemini verify)
│   │   ├── page-bridge.js           # Main-world bridge for Puter.js AI
│   │   └── youtube-subtitles.js     # YouTube subtitle auto-translation
│   └── data/
│       ├── ko.json                  # Korean static dictionary
│       ├── ja.json                  # Japanese
│       ├── zh-CN.json               # Chinese Simplified
│       ├── es.json                  # Spanish
│       ├── fr.json                  # French
│       └── de.json                  # German
└── assets/icons/
```

### Translation Flow

```
Page text
  │
  ├─ Static dict match? ──→ Apply instantly (0ms)
  │
  ├─ IndexedDB cache hit? ──→ Apply instantly (0ms)
  │
  └─ Google Translate ──→ Apply result (~200ms)
       │
       └─ Text > 80 chars + complex prose?
            │
            YES → Gemini 2.0 Flash verifies in background
            │     └─ If improved → update DOM with fade
            │     └─ Cache result in IndexedDB
            │
            NO  → Done (Google Translate is final)
```

---

## Tech Stack

| Component | Technology | Role |
|-----------|-----------|------|
| Page Translation | Google Translate API | Fast first-pass translation |
| Quality Verification | Gemini 2.0 Flash (Puter.js) | Background accuracy check |
| AI Tutor | Claude Sonnet 4 (Puter.js) | Conversational learning assistant |
| Static Dictionaries | Hand-curated JSON (559 × 6 langs) | Instant high-quality base translations |
| Translation Cache | IndexedDB | Persists verified translations locally |
| AI Gateway | [Puter.js](https://docs.puter.com/) | Free Claude, Gemini, GPT — no API keys |

---

## How Copyright Is Respected

SkillBridge is a personal translation tool, similar to your browser's built-in translate feature. Text is translated on-the-fly in your browser. No content is stored or redistributed. Static dictionaries contain only UI strings, not course content.

> **Disclaimer:** SkillBridge for Anthropic Academy is an unofficial community project. It is not affiliated with, endorsed by, or sponsored by Anthropic. This extension translates content on-the-fly for personal learning — it does not store or redistribute any original course content. "Anthropic", "Claude", and "Skilljar" are trademarks of their respective owners.

---

## Contributing

SkillBridge is built by the community, for the community. We welcome contributions of all kinds!

- **Translation improvements** — Fix a bad translation or add entries to the static dictionaries
- **New languages** — Add a standard language or promote one to premium with a curated dictionary
- **Code contributions** — Improve the translation engine, AI Tutor, or YouTube features
- **Documentation** — Improve READMEs, write tutorials, add screenshots

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide, and check out our [Good First Issues](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) to get started.

See [ROADMAP.md](ROADMAP.md) for where this project is heading.

## License

MIT — see [LICENSE](LICENSE)

---

**Made for the global AI learning community.**
