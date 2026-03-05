# Chrome Web Store — Store Listing

## Title (max 75 chars)
SkillBridge — Translate Anthropic Academy (30+ Languages + AI Tutor)

## Summary (max 132 chars)
Translate Anthropic Academy into 30+ languages with curated AI dictionaries, auto-subtitles, and a Claude-powered AI Tutor.

## Description (for Store listing)

Anthropic Academy offers world-class free courses on Claude, prompt engineering, and AI safety — but only in English.

SkillBridge translates the entire site into 30+ languages with accurate AI terminology. Unlike Google Translate, SkillBridge uses 560+ hand-curated terms per language so "Prompt" becomes "프롬프트" (Korean) — not "신속한" (a common mistranslation).

🌐 FULL PAGE TRANSLATION
Every text element on the page is translated. Progress checkboxes, icons, and interactive elements stay intact.

🤖 AI TUTOR (Claude Sonnet 4)
A sidebar chatbot that knows which course and lesson you're on. Ask questions in your language, get streaming answers — powered by Claude via Puter.js.

🎬 AUTO-SUBTITLES
Course videos automatically activate translated subtitles. No manual toggle needed.

🔍 SMART DETECTION
Detects your browser language on first visit and offers to translate. Zero setup.

✨ PROTECTED TERMS
Brand names (Anthropic, Claude) and technical terms stay correct. SkillBridge auto-corrects known Google Translate errors per language.

━━━━━━━━━━━━━━━━━━━

PREMIUM LANGUAGES (Curated Dictionary + Google Translate + AI Verification):
🇰🇷 한국어 · 🇯🇵 日本語 · 🇨🇳 中文简体 · 🇪🇸 Español · 🇫🇷 Français · 🇩🇪 Deutsch

STANDARD LANGUAGES (Google Translate + AI Verification):
中文繁體 · Português (BR/PT) · Italiano · Nederlands · Русский · Polski · Українська · Čeština · Svenska · Dansk · Suomi · Norsk · Türkçe · العربية · हिन्दी · ภาษาไทย · Tiếng Việt · Bahasa Indonesia · Bahasa Melayu · Filipino · বাংলা · עברית · Română · Magyar · Ελληνικά

━━━━━━━━━━━━━━━━━━━

HOW IT WORKS
1. Curated dictionary lookup (560+ terms) → instant
2. Local cache (IndexedDB) → instant
3. Inline HTML tags? → Gemini 2.0 Flash translates with tag preservation
4. Plain text → Google Translate (~200ms)
5. Protected Terms auto-fix → restores brand/tech terms

All translation happens in your browser. No data is stored or sent to third-party servers.

━━━━━━━━━━━━━━━━━━━

🔒 PRIVACY
No API keys needed. No accounts. No data collection. Everything runs in your browser.

📖 OPEN SOURCE
https://github.com/heznpc/skillbridge
MIT License — contributions welcome!

⚠️ DISCLAIMER
SkillBridge is an unofficial community project. Not affiliated with, endorsed by, or sponsored by Anthropic.

## Category
Education

## Language
All languages

## Permission Justifications

### storage
Saves user preferences such as selected language and translation settings locally in the browser.

### activeTab
Accesses the current tab's page content to translate text elements on Anthropic Academy pages.

### tabs
Detects page navigation events to automatically trigger translation when the user navigates between lessons.

### Host permission: *.skilljar.com
Required to inject content scripts that translate Anthropic Academy (hosted on skilljar.com) page content.

### Host permission: *.youtube.com
Required to auto-activate translated subtitles on course videos embedded from YouTube.

### Host permission: translate.googleapis.com
Required to send page text to Google Translate API for translation.
