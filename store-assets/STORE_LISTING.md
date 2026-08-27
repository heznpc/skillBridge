# Chrome Web Store — Store Listing (v4.0.0 candidate)

This copy describes only the bundled Chrome Web Store package. It must stay in
sync with the uploaded ZIP, the CWS Privacy tab, and `PRIVACY_POLICY.md`.

## What's New — paste into the CWS "What's new" field after version assignment

**Baseline: v1.0.1, not the 3.5.x candidates.** Every installed user is on
v1.0.1 (uploaded 2026-03-10) — the 2.x/3.x versions were tagged in the
repository but never published, so no user has ever run them. Copy written
against a 3.5.x baseline reads as nonsense here: it announces the AI Tutor as
new (v1.0.1 already had a Claude tutor), and words like "continues", "remains",
and "repaired" point at builds the reader never received. Keep this field
relative to v1.0.1 until a v4 build is actually live.

- 🌐 32 languages, up from a single Google Translate pass. 12 of them ship 1,100+ curated entries for AI/technical terms, and a protected-term step re-fixes known mistranslations after translation and on cache hits.
- 🔗 Paragraphs that mix links, inline code, and emphasis keep their structure and link destinations instead of being flattened into plain text.
- 🃏 New local study tools: spaced-repetition flashcards, bookmarks, Continue/Recent lessons, a progress dashboard, an in-lesson outline, reading progress, and PDF export. All of it stays in your browser.
- 🎓 New exam and certification safety: quiz answer choices are left in English so they still match the canonical answers, and recognized proctored certification routes disable the extension entirely.
- 💻 The AI Tutor can now run on your own device. Point it at Ollama or another OpenAI-compatible server on your localhost and tutor text never leaves your machine — or switch the tutor off and use translation only. Cloud remains the default and still needs only a free Puter sign-in, no API key and no SkillBridge account.
- 🔒 Tutor hardening: the bundled Puter client now runs in Chrome's isolated content-script world instead of the page world, tutor traffic uses validated extension ports, and the accepted session is kept in extension storage rather than course-site storage.
- 🧹 Fewer permissions than v1.0.1: YouTube host access, `activeTab`, and `tabs` are all gone. Auto-subtitles still work — SkillBridge asks the embedded player rather than fetching anything from YouTube.
- 📡 Translations are cached locally for up to 30 days, so previously read lessons stay readable offline with a visible offline status instead of a silent failure.
- 🌙 Dark mode, right-to-left layouts, keyboard shortcuts, and panels isolated from course-page styling.
- 🎨 New extension icon.

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

Supported Skilljar courses and Claude Academy course routes are covered by the current compatibility map: all 23 currently-published courses/catalog entries on anthropic.skilljar.com, and course pages on academy.claude.com, Anthropic's own course platform. Public learning and certification-information pages can translate; recognized proctored exam routes remain disabled.

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

Page translation (Google Translate + curated dictionaries) and the local learning tools work with no account. Baseline page translation never calls Puter, Claude, or the Tutor model. Translation Refinement is a separate feature, off by default and with its own consent: only when you enable it AND consent does it send an already-translated paragraph, together with its English source, to the model you selected for post-editing. The optional cloud AI Tutor reaches Claude through a bundled Puter client only when you send a Tutor message; its first use opens a separate free Puter sign-in. The client runs in Chrome's isolated content-script world on the trusted course host, and Tutor network payloads use validated extension ports rather than page-world messaging. The visible Tutor remains in the shared page DOM, so course-page scripts may observe keyboard events and rendered chat text. Puter returns sign-in through browser window messaging, which the course page may also observe; SkillBridge then stores the accepted session only in extension storage. A user-run local engine and an off mode are also available. The extension does not request YouTube host access and uses no analytics, tracking, advertising, SkillBridge account, or user API key. SkillBridge's operator does not receive Puter authentication/session data.

Third-party requests made by the CWS edition:

• Google Translate — visible page text selected for translation and the requested language.
• Puter — cloud Tutor sign-in/session handling, followed by the user's Tutor message and limited lesson context routed to Claude, and, only when optional Translation Refinement is separately enabled and consented, already-translated paragraphs together with their English source routed to Claude for post-editing. The bundled SDK runs in an isolated content-script world and stores the accepted session token and Puter application identifier in extension storage; the CWS build disables automatic User/profile lookups. Puter returns the sign-in result to the HTTPS opener through browser window messaging, which the course page may be able to observe during sign-in. SkillBridge's operator receives none of this data.

Settings, bookmarks, flashcard review state, recent lessons, and scroll positions are stored in `chrome.storage.local`. Original and translated text is cached separately in IndexedDB. Progress summaries are calculated locally from that state rather than separately stored or transmitted.

Sending a cloud Tutor message routes that message and limited lesson context through Puter's free AI gateway to Claude; see Puter's privacy policy. Baseline page translation never sends text to Puter. If you explicitly enable optional Translation Refinement and give its separate consent, translated paragraphs and their English source are sent to the model you selected — Puter/Claude when the cloud engine is chosen, your own server when the local engine is. With the local engine selected, Tutor text goes only to the user's configured local server; with Tutor off, no Tutor request is made.

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

Stores the selected language, display preferences, Tutor engine settings, flashcard review state, bookmarks, recent lessons, and scroll positions in `chrome.storage.local`. After a successful cloud Tutor sign-in, it also stores the accepted Puter session token and application identifier there so the session can resume; SkillBridge's operator never receives them. The IndexedDB translation cache and Tutor conversation history do not depend on this permission, and progress summaries are calculated rather than separately stored.

### alarms

Schedules periodic translation-cache cleanup without keeping the service worker alive. This is the permission's only use; v4.0.0 removed the earlier periodic release check.

### Host permission: *.skilljar.com

Allows SkillBridge to run on supported AI-course pages hosted on Skilljar and translate the visible course content requested by the user.

### Content-script match: claude.com/resources/tutorials

Allows translation to run only on Claude tutorial paths, rather than across all of `claude.com`.

### Content-script match: academy.claude.com/courses, academy.claude.com/*/courses

Allows translation and the AI Tutor to run on Anthropic's Claude Academy, the successor course platform to the Skilljar tenant. Scoped to course routes — the second pattern is the same routes under a locale prefix, which is how Academy serves its non-English locales — so the learner's account, settings and catalog pages are outside the extension's reach entirely. Academy assessment pages are detected from the live page — route, heading, and the ARIA radiogroup — and their answer choices are excluded from translation, so answer text is never sent to Google Translate, never cached, and never reaches the AI Tutor. Academy also publishes its own official locales; where a page is already in one of them SkillBridge preserves the official copy, sending only identifiable English residue for Korean, Japanese and Chinese, and nothing at all for Spanish and French where residue cannot be told apart. The Tutor transport is admitted on this host and on `anthropic.skilljar.com` only, and on Academy it additionally requires a course unit path.

### Host permission: translate.googleapis.com

Allows page text selected for translation to be sent to Google Translate. No account credential or learning-tool state is included.

### Optional host permission: http://localhost/*, http://127.0.0.1/*

Not requested at install time. It is requested only if the user selects the optional on-device AI Tutor engine, so the extension can reach an OpenAI-compatible AI server the user runs on their own machine (for example Ollama). In that mode the tutor question and its lesson context go only to that local address, never to a remote AI service. Declining the prompt leaves the tutor on its previous engine.
