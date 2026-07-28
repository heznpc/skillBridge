# Chrome Web Store — Store Listing (v4.0.0 candidate)

This copy describes only the bundled Chrome Web Store package. It must stay in
sync with the uploaded ZIP, the CWS Privacy tab, and `PRIVACY_POLICY.md`.

## What's New — paste into the CWS "What's new" field after version assignment

- 🤖 AI Tutor: ask about the lesson you are reading. Uses a free Puter sign-in — no API key, no SkillBridge account.
- 💻 New on-device option: run the tutor against Ollama or another compatible OpenAI-style server on your own localhost so tutor text never leaves your machine — or turn the tutor off and use translation only.
- 🔗 Better translation of mixed content: paragraphs containing links, inline code, and emphasis keep their structure and destinations intact instead of being flattened.
- 🔒 No SkillBridge account: translation and learning tools need no sign-in at all.
- 🌐 Translation continues through packaged dictionaries, local cache, and Google Translate.
- 🃏 Local learning tools include spaced-repetition flashcards, bookmarks, Continue/Recent, progress dashboard, outline, and PDF export.
- 🎬 Auto-subtitles remain available without requesting YouTube host access.
- 🧹 Removed an unused YouTube network proxy and its host permission.
- 🪟 Repaired the extension popup and added final-bundle browser coverage.
- 🎨 Updated extension icon and isolated panels from host-page styles.

## Title (max 75 chars)

SkillBridge — AI Course Translator

## Summary (max 132 chars)

Translate AI courses into 32 languages with curated terminology, local flashcards, bookmarks, reading tools, and exam safeguards.

## Description (for Store listing)

SkillBridge translates supported AI-course pages into 32 languages directly inside the page. It combines packaged terminology dictionaries, a 30-day local cache, and Google Translate so learners can follow lessons without copying text between tabs.

🌐 COURSE-PAGE TRANSLATION
Translate headings, paragraphs, lists, navigation, course cards, progress labels, and supported code comments while keeping course controls usable. Translation follows single-page navigation as you move between lessons.

✨ CURATED AI TERMINOLOGY
Premium languages include 1,100+ packaged entries for technical terms and product names. Protected-term restoration corrects known machine-translation errors after translation and when cached results are reused.

🧰 LOCAL LEARNING TOOLS
Use spaced-repetition flashcards, bookmarks, Continue/Recent links, a progress dashboard, an in-lesson outline, reading progress, and PDF export. Preferences and learning-tool state stay in the browser.

🎓 EXAM AND CERTIFICATION SAFETY
On recognized course-quiz pages, answer choices are skipped by translation so they remain aligned with the canonical English answers. On recognized proctored certification routes, SkillBridge disables translation and injected UI entirely. Detection is pattern-based, so learners should still turn the extension off for any proctored exam.

🎬 AUTO-SUBTITLES
For supported embedded course videos, SkillBridge asks the existing player to enable translated subtitles. It does not fetch captions and does not request YouTube host permission.

📡 CACHE AND OFFLINE FALLBACK
Previously translated text is cached locally for up to 30 days. If the network drops, cached translations remain available and the extension shows an offline status instead of silently failing.

🌙 ACCESSIBLE STUDY SURFACE
Dark mode, right-to-left layout, keyboard shortcuts, responsive panels, language onboarding, and protected course controls are included.

━━━━━━━━━━━━━━━━━━━

SUPPORTED COURSES

All 22 currently-published courses/catalog entries on anthropic.skilljar.com are covered by the current compatibility map. Public learning and certification-information pages can translate; recognized proctored exam routes remain disabled.

━━━━━━━━━━━━━━━━━━━

LANGUAGES

PREMIUM LANGUAGES — Packaged curated dictionary + Google Translate:
한국어 · 日本語 · 中文简体 · 中文繁體 · Español · Français · Italiano · Deutsch · Português (BR) · Русский · Tiếng Việt · Bahasa Indonesia

STANDARD LANGUAGES — Google Translate:
Português (PT) · Nederlands · Polski · Українська · Čeština · Svenska · Dansk · Suomi · Norsk · Türkçe · العربية · हिन्दी · ภาษาไทย · Bahasa Melayu · Filipino · বাংলা · עברית · Română · Magyar · Ελληνικά

━━━━━━━━━━━━━━━━━━━

HOW TRANSLATION WORKS

1. Packaged curated-dictionary lookup — local
2. IndexedDB cache lookup — local
3. Google Translate for remaining visible text — external service
4. Protected-term restoration — local
5. Result cache — local, up to 30 days

SkillBridge does not operate a translation server. Page text that is not already covered locally is sent to Google Translate when translation is requested.

━━━━━━━━━━━━━━━━━━━

🔒 CWS PRIVACY AND PACKAGE BOUNDARY

Page translation (Google Translate + curated dictionaries) and the local learning tools work with no account. Translation never calls Puter, Claude, or the Tutor model. The optional cloud AI Tutor reaches Claude through a bundled Puter client only when you send a Tutor message; its first use opens a separate free Puter sign-in. The client runs in an isolated extension-origin frame, not the course page's JavaScript world. A user-run local engine and an off mode are also available. The extension does not request YouTube host access and uses no analytics, tracking, advertising, SkillBridge account, or user API key. SkillBridge's operator does not receive Puter authentication/session data.

Third-party requests made by the CWS edition:

• Google Translate — visible page text selected for translation and the requested language.
• GitHub Releases API — a periodic public update check; no course text or learning-tool data.
• Puter — cloud Tutor sign-in/session handling, followed by the user's Tutor message and limited lesson context routed to Claude. Inside its isolated extension frame, the bundled SDK stores a session token and Puter application identifier; the CWS build disables automatic User/profile lookups. SkillBridge's operator receives none of this data.

Settings, bookmarks, flashcard review state, recent lessons, and scroll positions are stored in `chrome.storage.local`. Original and translated text is cached separately in IndexedDB. Progress summaries are calculated locally from that state rather than separately stored or transmitted.

Sending a cloud Tutor message routes that message and limited lesson context through Puter's free AI gateway to Claude; see Puter's privacy policy. Translating a page never sends text to Puter. With the local engine selected, Tutor text goes only to the user's configured local server; with Tutor off, no Tutor request is made.

Full privacy policy: https://heznpc.github.io/skillBridge/privacy

📖 OPEN SOURCE
https://github.com/heznpc/skillbridge

⚠️ DISCLAIMER
SkillBridge is an unofficial, independent community project. It is not affiliated with, endorsed by, or sponsored by Anthropic or Skilljar. Third-party names and URLs are used descriptively to explain compatibility. All trademarks remain the property of their respective owners.

## Category

Education

## Language

English (single listing locale; the extension UI supports 32 languages)

## Permission Justifications

### storage

Stores the selected language, display preferences, flashcard review state, bookmarks, recent lessons, and scroll positions in `chrome.storage.local`. The IndexedDB translation cache does not depend on this permission, and progress summaries are calculated rather than separately stored.

### alarms

Schedules periodic cache cleanup and public release checks without keeping the service worker alive.

### Host permission: *.skilljar.com

Allows SkillBridge to run on supported AI-course pages hosted on Skilljar and translate the visible course content requested by the user.

### Content-script match: claude.com/resources/tutorials

Allows translation to run only on Claude tutorial paths, rather than across all of `claude.com`.

### Host permission: translate.googleapis.com

Allows page text selected for translation to be sent to Google Translate. No account credential or learning-tool state is included.

### Host permission: api.github.com

Used only for a read-only request to the public Releases API so the extension can display an update badge. No user, lesson, or learning-tool content is sent.

### Optional host permission: http://localhost/*, http://127.0.0.1/*

Not requested at install time. It is requested only if the user selects the optional on-device AI Tutor engine, so the extension can reach an OpenAI-compatible AI server the user runs on their own machine (for example Ollama). In that mode the tutor question and its lesson context go only to that local address, never to a remote AI service. Declining the prompt leaves the tutor on its previous engine.
