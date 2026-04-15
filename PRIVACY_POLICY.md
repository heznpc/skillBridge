# Privacy Policy — SkillBridge

**Last updated:** April 11, 2026

## Overview

SkillBridge is a browser extension that translates [Anthropic Academy](https://anthropic.skilljar.com/) course pages into 30+ languages and provides an AI-powered learning assistant. It is designed with privacy in mind — SkillBridge does not operate any servers, does not require accounts, and does not use analytics or tracking.

## Data Stored Locally (Never Leaves Your Device)

- **User preferences** — Selected language, dark mode, auto-translate settings are saved in `chrome.storage.local`.
- **Translation cache** — Previously translated text is cached in your browser's IndexedDB (`skillbridge-cache`) for up to 30 days to improve performance. This data never leaves your device.
- **Conversation history** — AI Tutor chat history is stored in IndexedDB (`skillbridge-tutor`) on your device. This data never leaves your device.
- **Curated dictionaries** — 570+ hand-curated translation entries per premium language are bundled within the extension package itself.

## Data Sent to Third-Party Services

To provide translation and AI features, SkillBridge sends data to the following third-party services. **SkillBridge does not operate or control any of these services.**

| Service | What is sent | Purpose | Privacy Policy |
|---------|-------------|---------|----------------|
| Google Translate API | Page text to be translated | Primary translation for plain text | [Google Privacy Policy](https://policies.google.com/privacy) |
| Gemini 2.0 Flash (via Puter.js) | Text with inline HTML tags; original + translated text pairs for quality verification | Tag-preserving translation of complex HTML; background quality checks | [Puter.js Privacy Policy](https://puter.com/privacy) |
| Claude Sonnet 4 (via Puter.js) | User's chat message + lesson context (page title, headings, and up to 2,000 characters of lesson body) | AI Tutor sidebar chatbot | [Puter.js Privacy Policy](https://puter.com/privacy) |

All requests to Gemini and Claude are routed through [Puter.js](https://docs.puter.com/), a third-party client-side AI gateway. Please review Puter's privacy policy for details on how they process data.

## Data NOT Collected

- No personal information (name, email, etc.)
- No browsing history outside of Anthropic Academy pages
- No analytics, telemetry, or tracking of any kind
- No advertising or marketing data

## Permissions

| Permission | Purpose |
|---|---|
| `storage` | Save user preferences (selected language, dark mode, auto-translate) and cached translations |
| `tabs` | Detect navigation events for auto-translation and send language-change messages from the popup |
| `alarms` | Run periodic maintenance (24h cache cleanup, 7d update check) without waking the user |
| `*.skilljar.com` | Translate Anthropic Academy pages |
| `*.youtube.com` | Auto-activate translated subtitles on course videos |
| `translate.googleapis.com` | Send text to Google Translate API |

## Data Retention

- **Translation cache:** Stored locally for 30 days, then automatically expired. Can be cleared anytime via browser settings.
- **Conversation history:** Stored locally with no automatic expiration. Can be cleared via browser settings (clear site data for `*.skilljar.com`).
- **Third-party services:** SkillBridge does not control data retention by Google, Puter.js, or their upstream AI providers. Please review their respective privacy policies.

## GDPR and International Users

SkillBridge does not operate servers or maintain user databases. All user-generated data (cache, chat history, preferences) is stored exclusively on your local device and can be deleted at any time through your browser settings.

However, by using SkillBridge's translation and AI features, page text and chat messages are transmitted to third-party services (Google, Puter.js) as described above. These services may process data in jurisdictions outside your country. Please review their privacy policies for GDPR-specific information.

## Children's Privacy

SkillBridge does not knowingly collect any information from children under 13.

## Changes to This Policy

Any changes to this privacy policy will be posted in this file and reflected in the extension update.

## Contact

For questions about this privacy policy, please open an issue on [GitHub](https://github.com/heznpc/skillbridge/issues).
