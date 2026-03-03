# Skilljar i18n Assistant

**Anthropic Skilljar 강의를 15개 이상의 언어로 학습하세요!**

> Translate Anthropic's free Skilljar courses into 15+ languages with an AI-powered learning assistant. No API keys. No costs. Just learning.

---

## The Problem

[Anthropic's Skilljar courses](https://anthropic.skilljar.com/) offer excellent free training on Claude, prompt engineering, and AI safety — but they're only available in English. This creates a barrier for millions of non-English speakers who want to learn.

## The Solution

A Chrome extension that:

- **Translates** course pages into 15+ languages in real-time
- **AI Tutor** answers your questions about course material in your language
- **Zero cost** — powered by [Puter.js](https://puter.com) + GLM-4-Flash (no API key needed)
- **Respects copyright** — translates on-the-fly only, never stores or redistributes content

## Supported Languages

| Language | Code | Language | Code |
|----------|------|----------|------|
| 한국어 | ko | Español | es |
| 日本語 | ja | Français | fr |
| 中文(简体) | zh-CN | Deutsch | de |
| 中文(繁體) | zh-TW | Português (BR) | pt-BR |
| Tiếng Việt | vi | ภาษาไทย | th |
| Bahasa Indonesia | id | العربية | ar |
| हिन्दी | hi | Русский | ru |
| Türkçe | tr | | |

## Installation

### From Source (Developer Mode)

1. Clone this repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/skilljar-i18n-assistant.git
   ```

2. Open Chrome and go to `chrome://extensions/`

3. Enable **Developer mode** (toggle in top right)

4. Click **Load unpacked** and select the cloned folder

5. Navigate to [anthropic.skilljar.com](https://anthropic.skilljar.com/) — you'll see the globe icon!

## How It Works

### Translation
1. Click the globe icon (bottom-right) or the extension popup
2. Select your target language
3. Click "Translate Page" — content translates in real-time
4. Toggle "Auto-translate" to translate automatically on each page

### AI Tutor
1. Open the sidebar → switch to "AI Tutor" tab
2. Ask questions about the course material in any language
3. Get explanations, summaries, and help in your preferred language

## Architecture

```
skilljar-i18n-assistant/
├── manifest.json              # Chrome Extension manifest v3
├── _locales/                  # i18n locale files
│   ├── en/messages.json
│   ├── ko/messages.json
│   ├── ja/messages.json
│   └── zh_CN/messages.json
├── src/
│   ├── background/            # Service worker
│   ├── content/               # Content script + styles
│   ├── popup/                 # Extension popup UI
│   └── lib/                   # Translation engine (Puter.js + GLM-4-Flash)
├── assets/icons/              # Extension icons
└── docs/                      # Landing page & docs
```

## How Translation Works (Copyright-Safe)

This extension does NOT copy, store, or redistribute any Skilljar content. Here's the approach:

1. **On-the-fly only**: Text is translated in the user's browser in real-time
2. **No permanent cache**: Translations are cached in memory only during the session
3. **No content extraction**: Original content stays on Skilljar's servers
4. **Personal use**: Functions like a personal translation tool (similar to Google Translate)
5. **No scraping**: Does not download or archive any course material

This is analogous to using your browser's built-in translation feature — a personal accessibility tool.

## Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| AI Engine | [Puter.js](https://puter.com) + GLM-4-Flash | Free, no API key, instant setup |
| Extension | Chrome Manifest V3 | Modern, secure extension platform |
| UI | Vanilla CSS + JS | Zero dependencies, fast loading |
| i18n | Chrome i18n API | Native multilingual support |

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Key areas where help is needed:

- **Translation quality** improvements for specific languages
- **Skilljar selector updates** if the site structure changes
- **New language** additions
- **Accessibility** improvements
- **Firefox/Edge** port

## FAQ

**Q: Is this free?**
A: Yes, completely. Puter.js provides free AI inference with GLM-4-Flash.

**Q: Do I need an API key?**
A: No. Puter.js handles everything — no signup, no keys, no billing.

**Q: Is this official Anthropic software?**
A: No. This is a community-built tool to improve accessibility of Anthropic's free courses.

**Q: Does this violate Skilljar's terms?**
A: This extension functions like a personal translation tool (similar to Google Translate). It only translates displayed content in your browser and never stores, redistributes, or scrapes content.

**Q: What about translation quality?**
A: GLM-4-Flash provides good general translation. Technical terms are kept in English for accuracy. Quality may vary by language.

## License

MIT License — see [LICENSE](LICENSE)

---

**Made with care for the global AI learning community.**

*If Anthropic's courses helped you learn, help others learn too — star this repo and share it!*
