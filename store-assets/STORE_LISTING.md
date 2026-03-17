# Chrome Web Store — Store Listing

## Title (max 75 chars)
SkillBridge — AI Course Translator (30+ Languages + AI Tutor)

## Summary (max 132 chars)
Translate Anthropic Academy into 30+ languages with curated AI dictionaries, auto-subtitles, and a Claude-powered AI Tutor.

## Description (for Store listing)

Anthropic Academy offers world-class free courses on Claude, prompt engineering, and AI safety — but only in English.

SkillBridge translates the entire site into 30+ languages with accurate AI terminology. Unlike generic translators, SkillBridge uses 570+ hand-curated translation entries per language so "Prompt" stays "프롬프트" (Korean) — not "신속한" (a common mistranslation).

🌐 FULL PAGE TRANSLATION
Every text element on the page is translated — headings, paragraphs, lists, navigation, course cards, and progress labels. Interactive elements stay intact.

🤖 AI TUTOR (Claude Sonnet 4)
A sidebar chatbot that knows which course and lesson you're on. Ask questions in your language, get streaming answers. Powered by Claude via Puter.js.

🎬 AUTO-SUBTITLES
Course videos automatically activate translated subtitles when you play them. No manual toggle needed.

🔍 SMART DETECTION
Detects your browser language on first visit and offers to translate. Zero setup.

✨ PROTECTED TERMS
570+ curated entries per premium language. Brand names (Anthropic, Claude) and technical AI terms stay correct. Auto-corrects known mistranslations per language.

📝 TEXT SELECTION → ASK TUTOR
Select any text on the page and click "Ask Tutor" to get an explanation in your language. The AI tutor sees the full lesson context.

💬 CONVERSATION HISTORY
Chat history is saved locally in your browser (IndexedDB), grouped by chapter. Review past Q&A across sessions.

🌙 DARK MODE
Full dark theme for the entire Academy site — header, sidebar, lesson content, and tutor. Toggle with one click.

━━━━━━━━━━━━━━━━━━━

PREMIUM LANGUAGES (Curated Dictionary + Google Translate + AI Verification):
🇰🇷 한국어 · 🇯🇵 日本語 · 🇨🇳 中文简体 · 🇪🇸 Español · 🇫🇷 Français · 🇩🇪 Deutsch

STANDARD LANGUAGES (Google Translate + AI Verification):
中文繁體 · Português (BR/PT) · Italiano · Nederlands · Русский · Polski · Українська · Čeština · Svenska · Dansk · Suomi · Norsk · Türkçe · العربية · हिन्दी · ภาษาไทย · Tiếng Việt · Bahasa Indonesia · Bahasa Melayu · Filipino · বাংলা · עברית · Română · Magyar · Ελληνικά

━━━━━━━━━━━━━━━━━━━

HOW IT WORKS
1. Curated dictionary lookup (570+ entries) → instant, fully local
2. Local cache (IndexedDB) → instant, stays on your device
3. Inline HTML tags? → Gemini 2.0 Flash translates with tag preservation (via Puter.js)
4. Plain text → Google Translate API (~200ms)
5. AI quality check → Gemini 2.0 Flash verifies complex sentences in background
6. Protected Terms auto-fix → restores brand/tech terms

No data is stored on SkillBridge servers. Translation uses Google Translate and Puter.js — see our Privacy Policy for details.

━━━━━━━━━━━━━━━━━━━

🔒 PRIVACY & DATA
No API keys needed. No accounts. No analytics or tracking.

SkillBridge does NOT operate any servers. However, to provide translation and AI features, the following data is sent to third-party services:

• Google Translate — Page text is sent to Google's translation endpoint for translation. Google's privacy policy applies.
• Puter.js → Gemini 2.0 Flash — Translation text is sent via Puter.js for quality verification of complex sentences. Puter's privacy policy applies.
• Puter.js → Claude Sonnet 4 — Chat messages and lesson context (up to 2,000 characters) are sent via Puter.js for AI tutoring. Puter's privacy policy applies.

All settings, translation cache, and conversation history are stored locally in your browser (chrome.storage and IndexedDB). This data never leaves your device.

Full privacy policy: https://heznpc.github.io/skillbridge/privacy.html

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
Saves user preferences such as selected language, dark mode, and auto-translate settings locally in the browser.

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
