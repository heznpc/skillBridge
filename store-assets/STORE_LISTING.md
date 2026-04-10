# Chrome Web Store — Store Listing (v3.5.4)

## Title (max 75 chars)
SkillBridge — AI Course Translator (32 Languages + AI Tutor)

## Summary (max 132 chars)
Translate all 16 Anthropic Academy courses into 32 languages with curated AI dictionaries, flashcards, and a Claude-powered AI Tutor.

## Description (for Store listing)

Anthropic Academy offers world-class free courses on Claude, prompt engineering, and AI safety — but only in English.

SkillBridge translates all 16 courses into 32 languages with accurate AI terminology. Unlike generic translators, SkillBridge uses 570+ hand-curated translation entries per language so "Prompt" stays "프롬프트" (Korean) — not "신속한" (a common mistranslation).

🌐 FULL PAGE TRANSLATION
Every text element on the page is translated — headings, paragraphs, lists, navigation, course cards, and progress labels. Interactive elements stay intact.

🤖 AI TUTOR (Claude Sonnet 4)
A sidebar chatbot that knows which course and lesson you're on. Ask questions in your language, get streaming answers. Powered by Claude via Puter.js.

🃏 VOCABULARY FLASHCARDS
Course-specific flashcard decks generated from the curated dictionary. Track progress with a 3-box system (New → Learning → Mastered). Cards match the course you're currently viewing.

🎬 AUTO-SUBTITLES
Course videos automatically activate translated subtitles when you play them. No manual toggle needed.

💻 CODE COMMENT TRANSLATION
Translate comments inside code blocks while preserving the code itself. Supports Python, JavaScript, HTML, Bash, and more.

🔍 SMART DETECTION
Detects your browser language on first visit and offers to translate — including an onboarding guide for English-speaking users. Handles SPA navigation: when you move between lessons, the new page translates automatically without a reload.

✨ PROTECTED TERMS
570+ curated entries per premium language. Brand names (Anthropic, Claude, Cowork, Dispatch, Computer Use, Subagent) and technical AI terms stay correct. Auto-corrects known mistranslations per language.

📝 TEXT SELECTION → ASK TUTOR
Select any text on the page and click "Ask Tutor" to get an explanation in your language. The AI tutor sees the full lesson context.

💬 CONVERSATION HISTORY
Chat history is saved locally in your browser (IndexedDB), grouped by chapter. Review past Q&A across sessions.

🎓 EXAM MODE & CERTIFICATION SAFETY
Course quizzes (e.g., Claude 101 completion quiz): answer choices are NOT translated to preserve accuracy. The AI Tutor switches to exam-safe mode.

Proctored certification exams (e.g., Claude Certified Architect): the extension disables itself entirely — no translation, no UI, no AI tutor — so it cannot be mistaken for a cheating tool.

📡 OFFLINE SUPPORT
When you lose internet, SkillBridge switches to cached translations and shows an offline banner. The AI Tutor displays a friendly offline notice instead of failing silently.

⌨️ KEYBOARD SHORTCUTS
Ctrl+Shift+S (toggle tutor), Ctrl+Shift+F (flashcards), Ctrl+Shift+L (dark mode), Ctrl+Shift+/ (help), Escape (close), / (focus chat).

🌙 DARK MODE
Full dark theme for the entire Academy site — header, sidebar, lesson content, and tutor. Toggle with one click.

🔄 RTL SUPPORT
Full right-to-left layout for Arabic and Hebrew — sidebar, chat, flashcards, and all UI elements adapt automatically.

📱 MOBILE FRIENDLY
Sidebar adapts to small screens with full-width layout on mobile devices.

💡 ONBOARDING
First-time visitors see a welcome banner with quick setup. The AI Tutor shows example questions to get you started.

━━━━━━━━━━━━━━━━━━━

SUPPORTED COURSES (all 16 Anthropic Academy courses):
Claude 101 · Claude Code in Action · Introduction to Claude Cowork · Introduction to Agent Skills · Introduction to Subagents · Building with the Claude API · Introduction to MCP · MCP: Advanced Topics · Claude with Amazon Bedrock · Claude with Google Vertex AI · AI Fluency: Framework & Foundations · AI Fluency for Students · AI Fluency for Educators · Teaching AI Fluency · AI Fluency for Nonprofits · AI Capabilities and Limitations

━━━━━━━━━━━━━━━━━━━

PREMIUM LANGUAGES (Curated Dictionary + Google Translate + AI Verification):
🇰🇷 한국어 · 🇯🇵 日本語 · 🇨🇳 中文简体 · 🇹🇼 中文繁體 · 🇪🇸 Español · 🇫🇷 Français · 🇩🇪 Deutsch · 🇧🇷 Português (BR) · 🇷🇺 Русский · 🇻🇳 Tiếng Việt

STANDARD LANGUAGES (Google Translate + AI Verification):
Português (PT) · Italiano · Nederlands · Polski · Українська · Čeština · Svenska · Dansk · Suomi · Norsk · Türkçe · العربية · हिन्दी · ภาษาไทย · Bahasa Indonesia · Bahasa Melayu · Filipino · বাংলা · עברית · Română · Magyar · Ελληνικά

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
