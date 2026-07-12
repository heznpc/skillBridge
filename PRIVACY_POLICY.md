# Privacy Policy — SkillBridge

**Last updated:** July 11, 2026

## Version Status — Read This First

As of July 11, 2026, the Chrome Web Store still publishes **SkillBridge v1.0.1**. That legacy version includes a bundled Puter client used for Gemini translation review and the Claude-powered AI Tutor, and it declares YouTube host access.

A privacy-focused CWS candidate is being prepared, but **publication is paused and that candidate is not yet available from the Chrome Web Store**. The candidate disables the AI gateway, removes the Tutor from the CWS surface, omits the Puter SDK and page bridge, and removes YouTube host access.

Use the section below that matches the version you installed. SkillBridge does not operate a backend server and does not use analytics, telemetry, advertising, or tracking in either version. Third-party services can still process the content described below when their features are used.

## Currently Published Chrome Web Store Version: v1.0.1 (Legacy)

### Data Sent to Third-Party Services

| Service | What v1.0.1 sends | Purpose | Privacy policy |
|---|---|---|---|
| Google Translate API | Visible course-page text selected for translation and the requested language | Produce the initial translation | [Google Privacy Policy](https://policies.google.com/privacy) |
| Puter-backed Gemini | Visible course text, the requested language, and, for quality review, the initial Google translation | Review or improve complex translations | [Puter Privacy Policy](https://puter.com/privacy) |
| Puter-backed Claude | The user's Tutor question, any text the user explicitly quotes into that question, the requested response language, the course title, and up to five page headings | Generate an AI Tutor response | [Puter Privacy Policy](https://puter.com/privacy) |

The main Puter SDK file in v1.0.1 is bundled inside the extension package, but that SDK also contains lazy remote JavaScript and WebAssembly import paths, including an unpkg-hosted polyfill and remote `rustls.js`/`rustls.wasm` assets. v1.0.1 therefore must not be described as a fully self-contained or no-remote-code package. When an AI feature is used, the client also connects to Puter services, which route the request to the selected AI model. The unpublished replacement candidate omits the Puter SDK and page bridge entirely.

### YouTube Access in v1.0.1

v1.0.1 declares `https://*.youtube.com/*` host access. Its subtitle feature controls an existing embedded player with iframe `postMessage` commands. The package also contains an unused `FETCH_URL` background proxy; the v1.0.1 subtitle module does not call that proxy, but, if invoked internally for a YouTube URL, it can make a YouTube request and attach one fixed `Cookie` header containing technical `CONSENT` and `SOCS` values. The unpublished candidate removes both the host permission and that handler.

### Data Stored Locally by v1.0.1

- **Preferences** — selected language, auto-translate, dark mode, and onboarding state are stored in `chrome.storage.local`.
- **Translation cache** — original and translated course text is cached in IndexedDB (`skillbridge-cache`).
- **Tutor history** — Tutor questions, AI answers, language, course heading, page URL, and timestamp are stored in IndexedDB (`skillbridge-tutor`) so the user can reopen recent conversations.
- **Curated dictionaries** — packaged with the extension.

The local cache and Tutor history are not sent to the SkillBridge operator. A new Tutor request sends the current question and the limited page context described above, not the saved conversation database.

### v1.0.1 Retention

- **Preferences:** retained until the user clears extension data or removes the extension.
- **Translation cache:** entries older than 30 days are no longer used, but v1.0.1 does not delete the stale IndexedDB record during lookup; it may remain until the user clears the relevant browser/site data.
- **Tutor history:** no automatic expiry; retained locally until the user clears the relevant browser/site data.
- **Third-party processing:** Google, Puter, and the selected AI provider control their own service logs and retention under their respective policies.

### Permissions Declared by v1.0.1

| Permission or site access | v1.0.1 scope |
|---|---|
| `storage` | Save extension preferences |
| `activeTab` | Legacy access to the active course tab |
| `tabs` | Legacy tab/navigation access |
| `*.skilljar.com` | Run on and translate supported Skilljar course pages |
| `*.youtube.com` | Legacy YouTube access described above |
| `translate.googleapis.com` | Send requested course text to Google Translate |

## Next Chrome Web Store Candidate (Unpublished)

### CWS Package Boundary

The candidate runtime disables the AI gateway, does not expose the AI Tutor, and makes no Gemini, Claude-model, or Puter request. The Puter SDK and page bridge are omitted from the candidate package. Dormant AI-related helpers or labels from shared source may remain as non-executing strings in the compiled content bundle; an immutable build flag prevents that path from initializing.

### Data Stored Locally by the Candidate

- **Preferences and interface state (`chrome.storage.local`)** — selected language, dark mode, auto-translate, onboarding state, and related display settings.
- **Learning-tool state (`chrome.storage.local`)** — flashcard review state, bookmarks, recent lessons, and scroll positions.
- **Translation cache (IndexedDB)** — original text, translated text, target language, and a timestamp are cached in `skillbridge-cache` for up to 30 days. This does not depend on the `storage` extension permission.
- **Progress summaries** — calculated locally from stored course state; they are not separately persisted or transmitted.
- **Curated dictionaries** — packaged with the extension.

SkillBridge does not send this locally stored state to its operator or to a third-party analytics service. It can be removed through the browser's extension or site-data controls.

### Data Sent to Third-Party Services by the Candidate

| Service | What is sent | Purpose | Privacy policy |
|---|---|---|---|
| Google Translate API | Visible course-page text selected for translation and the requested language | Translate text not already covered by the packaged dictionary or local cache | [Google Privacy Policy](https://policies.google.com/privacy) |
| GitHub Releases API | A periodic request for the latest public SkillBridge release; no course text or learning-tool state | Display an update badge when a newer release exists | [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) |

The candidate does not transmit course text to YouTube. Auto-subtitles configure an existing embedded player and send it player-control messages; the extension requests no YouTube host permission.

### Data Not Collected by the Candidate

- No name, email address, account credential, or payment information
- No browsing history outside the pages where the extension is configured to run
- No analytics, telemetry, advertising identifier, or marketing profile
- No AI Tutor messages or AI conversation history

### Candidate Permissions

| Permission or site access | Purpose |
|---|---|
| `storage` | Save preferences, flashcard review state, bookmarks, recent lessons, and scroll positions in `chrome.storage.local` |
| `alarms` | Run periodic cache cleanup and public release checks |
| `*.skilljar.com` | Translate supported AI-course pages hosted on Skilljar |
| `claude.com/resources/tutorials` (content-script match) | Translate Claude tutorial pages |
| `translate.googleapis.com` | Send page text to Google Translate when translation is requested |
| `api.github.com` | Check the public Releases API for newer versions; no user or lesson content is sent |

### Candidate Retention

- **Translation cache:** up to 30 days, unless the user clears it sooner.
- **Preferences and learning-tool state:** retained locally until the user clears extension or site data.
- **Third-party processing:** Google and GitHub control their own service logs and retention under their respective policies.

## Raw Source and Developer Builds

The public repository retains an optional Puter-based AI gateway for unpacked development and research. The raw source configuration enables that developer path, which can send translation text or user-requested Tutor context to Puter-backed Gemini or Claude services when those functions are used.

Loading the repository root as an unpacked extension is therefore **not equivalent to the unpublished no-AI CWS candidate**. Developers should review the source and [Puter's privacy policy](https://puter.com/privacy) before using its optional AI functions.

## International Users and Children's Privacy

SkillBridge does not operate a user database. Google and, in v1.0.1 or raw developer builds, Puter and the selected AI provider may process transmitted text in jurisdictions outside the user's country. Users should review the applicable third-party policies for rights and controls.

SkillBridge does not knowingly collect personal information from children under 13.

## Release-Maintenance Note

**TODO:** Keep the v1.0.1 legacy disclosure on this page while publication is paused. Remove or archive it only after the replacement version is confirmed live in the Chrome Web Store, then update this policy and the store listing together.

## Changes

Material changes to this policy will be posted in this file and reflected in the published extension information.

## Contact

For privacy questions, open an issue on [GitHub](https://github.com/heznpc/skillbridge/issues).
