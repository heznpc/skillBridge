# Chrome Web Store — Store Listing (next version pending)

This copy describes only the bundled Chrome Web Store package. It must stay in
sync with the uploaded ZIP, the CWS Privacy tab, and `PRIVACY_POLICY.md`.

## What's New — paste into the CWS "What's new" field after version assignment

- 🔒 Privacy-focused CWS runtime: AI gateway disabled, no AI-service requests, and Puter/page bridge omitted.
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
Course-quiz answer choices are never translated, so they remain aligned with the canonical English answers. On recognized proctored certification routes, SkillBridge disables translation and injected UI entirely.

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

The Chrome Web Store runtime disables the AI gateway, exposes no AI Tutor, and makes no Gemini, Claude-model, or Puter request. The Puter SDK and page bridge are omitted. Dormant AI-related helpers or labels from shared source may remain as non-executing strings in the compiled content bundle. The extension does not request YouTube host access and uses no analytics, tracking, advertising, account, email, password, or user API key.

Third-party requests made by the CWS edition:

• Google Translate — visible page text selected for translation and the requested language.
• GitHub Releases API — a periodic public update check; no course text or learning-tool data.

Settings, bookmarks, flashcard review state, recent lessons, and scroll positions are stored in `chrome.storage.local`. Original and translated text is cached separately in IndexedDB. Progress summaries are calculated locally from that state rather than separately stored or transmitted.

The public repository also retains an optional Puter-based AI gateway for unpacked developer builds. In the CWS build that gateway cannot initialize, and its Puter SDK and page-bridge files are omitted; it is not a feature advertised by this listing.

Full privacy policy: https://heznpc.github.io/skillBridge/privacy

📖 OPEN SOURCE
https://github.com/heznpc/skillbridge

⚠️ DISCLAIMER
SkillBridge is an unofficial, independent community project. It is not affiliated with, endorsed by, or sponsored by Anthropic or Skilljar. Third-party names and URLs are used descriptively to explain compatibility. All trademarks remain the property of their respective owners.

## Category

Education

## Language

All languages

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
