# Privacy Policy — SkillBridge for Anthropic Academy

**Last updated:** March 5, 2026

## Overview

SkillBridge is a browser extension that translates [Anthropic Academy](https://anthropic.skilljar.com/) course pages into 30+ languages. It is designed with privacy as a core principle.

## Data Collection

**SkillBridge does not collect, store, or transmit any personal data.**

## How Translation Works

All translation processing happens **entirely within your browser**:

- **Google Translate API** — Page text is sent to Google's public translation endpoint and the translated result is returned directly to your browser. No data passes through any SkillBridge-owned server.
- **Gemini 2.0 Flash (via Puter.js)** — Used for inline HTML tag preservation and quality verification of complex sentences. Requests are routed through [Puter.js](https://docs.puter.com/), a third-party client-side AI gateway. SkillBridge does not operate or control Puter.js servers.
- **Claude Sonnet 4 (via Puter.js)** — Powers the AI Tutor sidebar chatbot. Requests are routed through Puter.js. SkillBridge does not operate or control Puter.js servers.
- **Curated dictionaries** — 570+ hand-curated terms per premium language are stored locally within the extension package.
- **Translation cache (IndexedDB)** — Previously translated text is cached locally in your browser's IndexedDB to improve performance. This data never leaves your device.
- **YouTube technical cookies** — To enable auto-subtitles on YouTube-hosted course videos, the extension may set technical consent cookies (`CONSENT`, `SOCS`) required by YouTube's API. No personal browsing data is collected from YouTube.

## Permissions

| Permission | Purpose |
|---|---|
| `storage` | Save user preferences (selected language, settings) |
| `activeTab` | Access the current tab to translate page content |
| `tabs` | Detect navigation events for auto-translation |
| `host_permissions: *.skilljar.com` | Translate Anthropic Academy pages |
| `host_permissions: *.youtube.com` | Auto-activate translated subtitles on course videos |
| `host_permissions: translate.googleapis.com` | Send text to Google Translate API |

## Third-Party Services

| Service | Purpose | Privacy Policy |
|---|---|---|
| Google Translate API | Page text translation | [Google Privacy Policy](https://policies.google.com/privacy) |
| Puter.js | AI gateway for Gemini and Claude | [Puter.js Privacy Policy](https://puter.com/privacy) |

## Data Retention

- **No server-side storage.** SkillBridge does not operate any servers.
- **Local cache only.** Translation cache is stored in your browser's IndexedDB and can be cleared at any time through your browser settings.
- **No analytics or tracking.** SkillBridge does not use any analytics, telemetry, or tracking tools.

## Children's Privacy

SkillBridge does not knowingly collect any information from children under 13.

## Changes to This Policy

Any changes to this privacy policy will be posted in this file and reflected in the extension update.

## Contact

For questions about this privacy policy, please open an issue on [GitHub](https://github.com/heznpc/skillbridge/issues).
