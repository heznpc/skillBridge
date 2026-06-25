# Chrome Web Store — Store Listing (v3.5.41)

This is the single Chrome Web Store listing (English / default locale — shown to
every user regardless of browser language). The store copy is intentionally
English-only to avoid listing drift; the extension UI itself is localized in 12
premium languages.

## What's New (v3.5.41) — paste into the CWS "What's new" field

- 🌏 Indonesian is now a Premium language with the curated dictionary.
- 🛡️ Protected terms are restored on cached translations too, so brand and technical terms stay correct on repeat visits.
- 🃏 Spaced-repetition flashcards — a new "Review due" mode shows only the cards due now (cards come back at the right time).
- 🔖 Bookmarks — save a lesson at your exact scroll position and jump back anytime.
- ⏩ Continue / Recent — resume across courses right where you left off.
- 📑 In-lesson outline + reading-progress bar for long lessons.
- 🧰 Tidier tutor — history, flashcards, bookmarks, Continue, and PDF export are grouped in one "Tools" menu.
- 🛠️ Polish — the AI-tutor button icon renders on every page, suggestion chips line up with the chat, and brand terms no longer show up doubled like "Claude(Claude)".
- 🧱 Sturdier UI — SkillBridge's panels are now isolated from the host site's styles, so Academy site updates can't visually break them.
- 🎨 New extension icon.

## Title (max 75 chars)

SkillBridge — AI Course Translator with in-page AI tutor

## Summary (max 132 chars)

Take Anthropic's free AI courses in 32 languages — accurate AI terminology, an in-page AI tutor, exam-safe. Free, no API key.

## Description (for Store listing)

Anthropic's free AI courses at anthropic.skilljar.com — prompt engineering, AI safety, the Claude API, MCP, and more — are world-class, but English-only. SkillBridge translates them into 32 languages, right inside the page, so you can actually follow along and finish.

This is not generic page-translate. SkillBridge ships hand-curated AI terminology dictionaries so the words that matter stay correct — "Prompt" stays a prompt, not the literal mistranslation machine translators produce in most languages — then verifies tricky sentences with an LLM in the background. On top sits an in-page AI tutor that knows the exact lesson you're on: get stuck, ask in your own language, and the answer fits the slide in front of you.

🎓 FINISH IN YOUR LANGUAGE
Every text element on the page is translated — headings, paragraphs, lists, navigation, course cards, progress labels, video subtitles, and code comments. Interactive elements stay intact so progress tracking and quiz submission keep working. (Blocks that mix inline formatting — bold, links, code — are AI-translated and fill in after you sign in to the optional free tutor; plain text needs no account.)

🤖 IN-PAGE AI TUTOR (powered by Claude Sonnet 4.6 via Puter.js)
A sidebar chatbot that knows which course and lesson you're on. Ask questions in your language; get streaming answers grounded in the current lesson. Powered by Puter.js's free tier — no API key; the first time you open the tutor, Puter may show a quick "verify you're human" window.

🃏 SPACED-REPETITION FLASHCARDS
Vocabulary decks generated from the curated dictionary for the course you're viewing. Spaced-repetition scheduling means a card you mark comes back at the right time (1 / 3 / 7 days), and a "Review due" mode shows only the cards due now. Saved locally.

📝 SELECT-AND-ASK
Select any text in the lesson and click "Ask Tutor" for an explanation in your language. The tutor sees the full lesson context.

💬 CONVERSATION HISTORY
Chat history is saved locally (IndexedDB), grouped by chapter. Review past Q&A across sessions without losing context.

🔖 BOOKMARKS & CONTINUE
Bookmark any lesson at the exact spot you stopped, and pick up across courses with "Continue" — SkillBridge remembers the lessons you've visited and your scroll position, so you jump straight back. All local.

📑 IN-LESSON OUTLINE & READING PROGRESS
A table of contents built from the lesson's headings (jump to any section) plus a reading-progress bar, so you always know how far you've read — handy on long lessons.

🎓 EXAM MODE & CERTIFICATION SAFETY (the rule that makes this safe to use)
Course quizzes: answer choices are NEVER translated, so your selection matches the canonical English answer. The AI Tutor switches to exam-safe mode.

Proctored certification exams (e.g., Claude Certified Architect): the extension disables itself entirely — no translation, no UI, no AI tutor — so it cannot be mistaken for a cheating tool.

✨ PROTECTED TERMS
570+ curated entries per premium language. Brand names (Anthropic, Claude, Cowork, Dispatch, Computer Use, Subagent) and technical AI terms stay correct — these are descriptive references to third-party brands, not our claim of association. Auto-corrects known mistranslations per language. New courses on the platform get terminology coverage within 48 hours, mechanically enforced by our open-source drift watcher.

💻 CODE COMMENT TRANSLATION
Comments inside code blocks get translated; the code itself stays intact. Supports Python, JavaScript, HTML, Bash, and more.

🎬 AUTO-SUBTITLES
Course videos automatically activate translated subtitles when you play them. No manual toggle needed.

🔍 SMART DETECTION
Detects your browser language on first visit and offers to translate — including an onboarding guide for English-speaking users. Handles SPA navigation: when you move between lessons, the new page translates automatically without a reload.

📡 OFFLINE SUPPORT
When you lose internet, SkillBridge switches to cached translations and shows an offline banner. The AI Tutor displays a friendly offline notice instead of failing silently.

⌨️ KEYBOARD SHORTCUTS
Ctrl+Shift+S (toggle tutor), Ctrl+Shift+F (flashcards), Ctrl+Shift+L (dark mode), Ctrl+Shift+/ (help), Escape (close), / (focus chat).

🌙 DARK MODE · 🔄 RTL SUPPORT · 📱 MOBILE FRIENDLY
Full dark theme for the course site. Full right-to-left layout for Arabic and Hebrew. Sidebar adapts to mobile.

━━━━━━━━━━━━━━━━━━━

SUPPORTED COURSES
All 19 currently-published courses on anthropic.skilljar.com, with terminology coverage for any new course added within 48 hours (mechanically enforced by an open-source drift watcher that auto-opens an issue when a new slug appears). Course names referenced descriptively for compatibility:
Claude 101 · Claude Platform 101 · Claude Code 101 · Claude Code in Action · Introduction to Claude Cowork · Introduction to Agent Skills · Introduction to Subagents · Building with the Claude API · Introduction to MCP · MCP: Advanced Topics · Claude with Amazon Bedrock · Claude with Google Vertex AI · AI Fluency: Framework & Foundations · AI Fluency for Students · AI Fluency for Educators · Teaching AI Fluency · AI Fluency for Nonprofits · AI Fluency for Small Businesses · AI Capabilities and Limitations

━━━━━━━━━━━━━━━━━━━

PREMIUM LANGUAGES (Curated Dictionary + Google Translate + AI Verification):
🇰🇷 한국어 · 🇯🇵 日本語 · 🇨🇳 中文简体 · 🇹🇼 中文繁體 · 🇪🇸 Español · 🇫🇷 Français · 🇮🇹 Italiano · 🇩🇪 Deutsch · 🇧🇷 Português (BR) · 🇷🇺 Русский · 🇻🇳 Tiếng Việt · 🇮🇩 Bahasa Indonesia

STANDARD LANGUAGES (Google Translate + AI Verification):
Português (PT) · Nederlands · Polski · Українська · Čeština · Svenska · Dansk · Suomi · Norsk · Türkçe · العربية · हिन्दी · ภาษาไทย · Bahasa Melayu · Filipino · বাংলা · עברית · Română · Magyar · Ελληνικά

━━━━━━━━━━━━━━━━━━━

HOW IT WORKS
1. Curated dictionary lookup (570+ entries) → instant, fully local
2. Local cache (IndexedDB) → instant, stays on your device
3. Inline HTML tags → Gemini 2.0 Flash translates with tag preservation (via Puter.js — needs a one-time Puter human-check)
4. Plain text → Google Translate API (~200ms)
5. AI quality check → Gemini 2.0 Flash verifies complex sentences in the background
6. Protected Terms auto-fix → restores brand and technical terms

No data is stored on SkillBridge servers. Translation uses Google Translate and Puter.js — see Privacy Policy below for details.

━━━━━━━━━━━━━━━━━━━

🔒 PRIVACY & DATA
No API keys needed. No account, email, or password to translate (the optional AI tutor may open a Puter human-check window). No analytics or tracking by default.

SkillBridge does NOT operate any servers. To provide translation and AI features, data is sent to third parties:

• Google Translate — Page text is sent to Google's translation endpoint. Google's privacy policy applies.
• Puter.js → Gemini 2.0 Flash — Translation text is sent via Puter.js for quality verification of complex sentences. Puter's privacy policy applies.
• Puter.js → Claude Sonnet 4.6 — Chat messages and lesson context (up to 2,000 characters) are sent via Puter.js for AI tutoring. Puter's privacy policy applies.

All settings, translation cache, and conversation history are stored locally in your browser (chrome.storage and IndexedDB). This data never leaves your device.

Full privacy policy: https://heznpc.github.io/skillBridge/privacy

📖 OPEN SOURCE
https://github.com/heznpc/skillbridge
MIT License — contributions welcome. Strategy, scope, and the "things we will not do" list are public in POSITIONING.md.

⚠️ DISCLAIMER
SkillBridge is an unofficial, independent community project. It is not affiliated with, endorsed by, or sponsored by Anthropic or Skilljar. References to "Anthropic", "Claude", "Skilljar", and the URL anthropic.skilljar.com are nominative — they describe the third-party platform and content this extension translates. All trademarks remain the property of their respective owners.

## Category
Education

## Language
All languages

## Permission Justifications

### storage
Saves user preferences such as selected language, dark mode, and auto-translate settings locally in the browser.

### alarms
Schedules background maintenance tasks (cache trim, YouTube client version refresh) without keeping the service worker alive unnecessarily.

### Host permission: *.skilljar.com
Required to inject content scripts that translate the course pages at anthropic.skilljar.com (and other Skilljar-hosted course content if extended in the future).

### Host permission: *.youtube.com
Required to auto-activate translated subtitles on course videos embedded from YouTube.

### Host permission: translate.googleapis.com
Required to send page text to Google Translate API for translation.

### Host permission: api.github.com
Used only by the in-extension update notifier to check for newer published versions of SkillBridge. Read-only, no auth.
