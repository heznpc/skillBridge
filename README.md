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

[Install from Chrome Web Store](#installation) · [Report Bug](../../issues) · [Request Feature](../../issues)

</div>

---

## Why SkillBridge?

[Anthropic Academy](https://academy.anthropic.com/) offers world-class courses on Claude, prompt engineering, and AI safety — **but only in English.**

You might think: *"I'll just use Google Translate."* Here's why that falls short:

| | Google Translate (page) | SkillBridge |
|---|---|---|
| AI terminology | ❌ "Prompt" → "신속한" (wrong) | ✅ "Prompt" → "프롬프트" (correct) |
| Technical accuracy | ❌ Generic machine translation | ✅ 560+ hand-curated terms per language + protected terms auto-fix + Gemini AI verification |
| Context-aware help | ❌ None | ✅ AI tutor (Claude Sonnet 4) answers questions about the lesson |
| Video subtitles | ❌ Separate manual toggle | ✅ Auto-translated subtitles in your language |
| UI preservation | ❌ Breaks checkboxes, progress bars | ✅ Preserves all interactive elements |
| Cost | Free | Free — no API keys needed |

> **No API keys. No cost. Just install and learn.**

## How It Works

SkillBridge uses a **five-tier translation engine** that prioritizes speed and accuracy:

```
Page text
  │
  ├─ 560+ curated term dictionary ──→ Instant (AI terms translated correctly)
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

**Protected Terms** — Each language defines known GT mistakes (e.g., GT translates "Claude" → "클로드" in Korean). After GT runs, the extension auto-corrects these back to the proper form. Brand names, technical terms, and product hierarchy stay in English — matching [Anthropic's official multilingual docs](https://docs.anthropic.com).

All translation happens **in your browser** — nothing is stored or sent to third-party servers.

## Features

**🌐 Full Page Translation** — Every text element on the page is translated, with AI-specific terms handled correctly via curated dictionaries.

**🤖 AI Tutor** — A sidebar chatbot powered by Claude Sonnet 4 via [Puter.js](https://docs.puter.com/). It knows which course and lesson you're on. Ask questions in your language, get streaming answers.

**🎬 Auto-Subtitles** — Course videos automatically activate translated subtitles when you play them.

**🔍 Smart Detection** — Detects your browser language on first visit and offers to translate. No setup needed.

**✨ Faithful UI** — Progress checkboxes, icons, and navigation all stay intact. CJK fonts are matched to the original design.

## Supported Languages

### Premium — Curated Dictionary + Google Translate + AI Verification

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

> Want to add your language as Premium? Contribute a curated dictionary — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Installation

<!-- **Chrome Web Store** (recommended): [Install SkillBridge](https://chrome.google.com/webstore/) — coming soon -->

**Manual install** (developer mode):

```bash
git clone https://github.com/heznpc/skillbridge.git
```

1. Open `chrome://extensions/` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the cloned folder
4. Visit [academy.anthropic.com](https://academy.anthropic.com/) and start learning!

## Architecture

```
skillbridge/
├── manifest.json              # Chrome MV3 manifest
├── _locales/                  # Chrome i18n (en, ko, ja, zh_CN)
├── src/
│   ├── background/            # Google Translate API proxy
│   ├── content/               # DOM translation + sidebar UI + fonts
│   ├── popup/                 # Extension popup UI
│   ├── lib/                   # Translation engine, AI bridge, subtitles
│   └── data/                  # Curated dictionaries (6 languages × 560+)
└── assets/icons/
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Page Translation | Google Translate API |
| Inline Tag Translation | Gemini 2.0 Flash (preserves `<strong>`, `<a>`, `<code>`) |
| Quality Verification | Gemini 2.0 Flash via [Puter.js](https://docs.puter.com/) |
| Protected Terms | Auto-correction of GT brand/tech term errors per language |
| AI Tutor | Claude Sonnet 4 via Puter.js |
| Curated Dictionaries | Hand-tuned JSON (560+ × 6 languages) |
| Translation Cache | IndexedDB |
| CJK Font Rendering | Google Fonts Noto Sans |

## Contributing

**Native speakers wanted!** The single most impactful way to contribute is improving the translation dictionary for your language — no code required, just edit a JSON file. Even fixing one bad translation helps every learner using that language.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide, [Good First Issues](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) to get started, and [ROADMAP.md](ROADMAP.md) for where this project is heading.

## Disclaimer

SkillBridge is a personal translation tool, similar to your browser's built-in translate feature. Text is translated on-the-fly in your browser — never stored or redistributed.

> **SkillBridge for Anthropic Academy** is an unofficial community project. It is not affiliated with, endorsed by, or sponsored by Anthropic. "Anthropic", "Claude", and "Skilljar" are trademarks of their respective owners.

## License

[MIT](LICENSE)
