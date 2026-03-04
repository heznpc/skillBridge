<div align="center">

🌐 **English** · [한국어](README_KO.md) · [日本語](README_JA.md) · [中文](README_ZH-CN.md) · [Español](README_ES.md) · [Français](README_FR.md) · [Deutsch](README_DE.md)

</div>

---

<div align="center">

<img src="assets/icons/icon128.png" alt="SkillBridge" width="80" />

# SkillBridge for Anthropic Academy

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Extension_MV3-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**Break the language barrier on Anthropic's free AI courses.**

</div>

---

[Anthropic Academy](https://academy.anthropic.com/) offers world-class courses on Claude, prompt engineering, and AI safety — but only in English. **SkillBridge** is a community-built Chrome extension that translates the entire learning experience into **30+ languages**, complete with an AI tutor that answers course questions in your language.

> No API keys. No cost. Just install and learn.

## Features

### Three-Tier Translation Engine

| Layer | Method | Speed |
|-------|--------|-------|
| 1 | **Static dictionary** — 560+ hand-tuned entries per language | Instant |
| 2 | **IndexedDB cache** — previously verified translations | Instant |
| 3 | **Google Translate + Gemini 2.0 Flash** verification | ~200ms |

Short UI strings skip AI verification. The smart trigger only fires on complex prose (80+ characters) that Google Translate might struggle with.

### AI Tutor — Claude Sonnet 4

A sidebar chatbot powered by Claude Sonnet 4 via [Puter.js](https://docs.puter.com/). Context-aware: it knows which course and lesson you're viewing. Ask questions in any language, get streaming responses.

### YouTube Auto-Subtitles

Embedded course videos automatically activate translated subtitles in your selected language using the YouTube IFrame API.

### Smart Auto-Detection

On first visit, the extension detects your browser language and offers to translate — no manual setup needed.

### Faithful UI Preservation

CJK font weights are matched to Skilljar's Copernicus serif hierarchy. Progress checkboxes, icons, and other child elements are preserved during translation via safe text-node replacement.

## Supported Languages

### Premium — Static Dictionary + Google Translate + AI Verification

| Language | Code | Dictionary |
|----------|------|------------|
| 🇰🇷 한국어 (Korean) | `ko` | 560+ entries |
| 🇯🇵 日本語 (Japanese) | `ja` | 560+ entries |
| 🇨🇳 中文简体 (Chinese Simplified) | `zh-CN` | 560+ entries |
| 🇪🇸 Español (Spanish) | `es` | 560+ entries |
| 🇫🇷 Français (French) | `fr` | 560+ entries |
| 🇩🇪 Deutsch (German) | `de` | 560+ entries |

### Standard — Google Translate + AI Verification

🇹🇼 中文繁體 · 🇧🇷 Português (BR) · 🇵🇹 Português (PT) · 🇮🇹 Italiano · 🇳🇱 Nederlands · 🇷🇺 Русский · 🇵🇱 Polski · 🇺🇦 Українська · 🇨🇿 Čeština · 🇸🇪 Svenska · 🇩🇰 Dansk · 🇫🇮 Suomi · 🇳🇴 Norsk · 🇹🇷 Türkçe · 🇸🇦 العربية · 🇮🇳 हिन्दी · 🇹🇭 ภาษาไทย · 🇻🇳 Tiếng Việt · 🇮🇩 Bahasa Indonesia · 🇲🇾 Bahasa Melayu · 🇵🇭 Filipino · 🇧🇩 বাংলা · 🇮🇱 עברית · 🇷🇴 Română · 🇭🇺 Magyar · 🇬🇷 Ελληνικά

> Want to promote a Standard language to Premium? Contribute a static dictionary — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Installation

```bash
git clone https://github.com/heznpc/skillbridge.git
```

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right)
3. Click **Load unpacked** → select the cloned folder
4. Visit [academy.anthropic.com](https://academy.anthropic.com/) and start learning!

> Chrome Web Store listing coming soon.

## Architecture

```
skillbridge/
├── manifest.json              # Chrome MV3 manifest
├── _locales/                  # Chrome i18n (en, ko, ja, zh_CN)
├── src/
│   ├── background/
│   │   └── background.js      # Google Translate API proxy
│   ├── content/
│   │   ├── content.js         # DOM translation + sidebar UI + font injection
│   │   └── content.css        # Language font stacks + UI styles
│   ├── popup/
│   │   ├── popup.html         # Extension popup
│   │   └── popup.js           # Popup logic
│   ├── lib/
│   │   ├── translator.js      # 3-tier translation engine + Gemini verify
│   │   ├── page-bridge.js     # Main-world bridge for Puter.js AI
│   │   └── youtube-subtitles.js
│   └── data/
│       ├── ko.json            # Korean dictionary (560+ entries)
│       ├── ja.json / zh-CN.json / es.json / fr.json / de.json
└── assets/
    └── icons/                 # Extension icons
```

### Translation Flow

```
Page text
  │
  ├─ Static dict match? ───→ Apply instantly
  │
  ├─ IndexedDB cache? ─────→ Apply instantly
  │
  └─ Google Translate ─────→ Apply (~200ms)
       │
       └─ Complex prose (80+ chars)?
            ├─ YES → Gemini 2.0 Flash verifies → update if improved → cache
            └─ NO  → Done
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Page Translation | Google Translate API |
| Quality Verification | Gemini 2.0 Flash via [Puter.js](https://docs.puter.com/) |
| AI Tutor | Claude Sonnet 4 via Puter.js |
| Static Dictionaries | Hand-curated JSON (560+ × 6 languages) |
| Translation Cache | IndexedDB |
| CJK Font Rendering | Google Fonts Noto Sans |

## Contributing

We welcome contributions of all kinds — translation fixes, new premium languages, code improvements, and screenshots.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide, [Good First Issues](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) to get started, and [ROADMAP.md](ROADMAP.md) for where this project is heading.

## Copyright & Disclaimer

SkillBridge is a personal translation tool, similar to your browser's built-in translate feature. Text is translated on-the-fly in your browser — never stored or redistributed.

> **SkillBridge for Anthropic Academy** is an unofficial community project. It is not affiliated with, endorsed by, or sponsored by Anthropic. "Anthropic", "Claude", and "Skilljar" are trademarks of their respective owners.

## License

[MIT](LICENSE)

---

<div align="center">

**Made for the global AI learning community.**

</div>
