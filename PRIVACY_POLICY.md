# Privacy Policy — SkillBridge

**Last updated:** July 28, 2026

## Version Status — Read This First

As of July 28, 2026, the Chrome Web Store still publishes **SkillBridge v1.0.1**. That legacy version includes a bundled Puter client used for Gemini translation review and the Claude-powered AI Tutor, and it declares YouTube host access.

A replacement candidate (**v4.0.0**) is being prepared, but **publication is paused and that candidate is not yet available from the Chrome Web Store**. The candidate keeps the AI Tutor, runs its bundled Puter client in Chrome's isolated content-script world on the trusted course host, removes YouTube host access, and adds an on-device tutor option:

- **AI Tutor (cloud, default):** ships in the candidate. Tutor questions go through the bundled Puter client to Claude, and the user signs in to Puter (free) when they first use it. Translation and the local study tools need no account.
- **AI Tutor (local/on-device, optional):** the user can instead point the Tutor at a local OpenAI-compatible server they run themselves (for example Ollama). In that mode Tutor text goes only to that local server — see "Local AI Engine" below.
- **AI Tutor (off):** the user can disable the Tutor entirely and use translation only.

Use the section below that matches the version you installed. SkillBridge does not operate a backend server and does not use analytics, telemetry, advertising, or tracking in either version. Third-party services can still process the content described below when their features are used.

## Currently Published Chrome Web Store Version: v1.0.1 (Legacy)

### Data Sent to Third-Party Services

| Service | What v1.0.1 sends | Purpose | Privacy policy |
|---|---|---|---|
| Google Translate API | Visible course-page text selected for translation and the requested language | Produce the initial translation | [Google Privacy Policy](https://policies.google.com/privacy) |
| Puter-backed Gemini | Visible course text, the requested language, and, for quality review, the initial Google translation | Review or improve complex translations | [Puter Privacy Policy](https://puter.com/privacy) |
| Puter-backed Claude | The user's Tutor question, any text the user explicitly quotes into it, the requested response language, the course title, and up to 5 page headings | Generate an AI Tutor response | [Puter Privacy Policy](https://puter.com/privacy) |

The main Puter SDK file in v1.0.1 is bundled inside the extension package, but that SDK also contains lazy remote JavaScript and WebAssembly import paths, including an unpkg-hosted polyfill and remote `rustls.js`/`rustls.wasm` assets. v1.0.1 therefore must not be described as a fully self-contained or no-remote-code package. When an AI feature is used, the client also connects to Puter services, which route the request to the selected AI model. The v4.0.0 build removes those unused TLS-socket imports from the packaged SDK and fails the build if executable remote-code patterns remain in the upload artifact.

The bundled Puter client handles its own sign-in and session state. It stores a Puter session token in the course page's local storage and retrieves a Puter User object to resume the AI session. That object can include a username, UUID, email-confirmation status, storage/subscription fields, and a last-activity timestamp. SkillBridge's operator does not receive the token or User object.

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
- **Puter session:** the token remains in the course page's local storage until Puter signs out/resets it or the user clears that site's data; the retrieved User object is held in memory for the page session.
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

The candidate includes an AI Tutor using Claude — Sonnet 4.6, falling back to Sonnet 4.5 if that model is unavailable — through the bundled Puter client. The client initializes in Chrome's ISOLATED content-script world only on the top-level `anthropic.skilljar.com` and `academy.claude.com` pages — Anthropic's own course platforms — and exchanges Tutor requests through authenticated extension ports. Those two hosts are the entire list, checked by exact hostname in the extension's service worker; no other page, subdomain, or frame can reach the Tutor transport. On an assessment page the Tutor is additionally told not to answer questions, and the lesson body — which is where answer choices live — is withheld from its context entirely. Its SDK object and extension-port payloads are not exposed to the course page's main JavaScript world. The visible Tutor UI remains in the shared page DOM, however, so course-page scripts may observe keyboard events and rendered questions or answers. The CWS build disables the SDK's unused eager network and host-storage initialization, and no Puter authentication or AI request is made until the user sends a cloud Tutor message. The first such use opens a free Puter sign-in. Puter's HTTPS sign-in returns its result to the opener through browser window messaging, so the course page may also observe that authentication event while sign-in is happening; SkillBridge stores the accepted token only in extension storage. Page translation never invokes Puter, Claude, or the Tutor model: it uses curated dictionaries, the local cache, Google Translate, deterministic protected-term restoration, and structure-preserving HTML reconciliation. Selecting the local or off Tutor engine prevents Tutor messages from going to Puter.

### Data Stored Locally by the Candidate

- **Preferences and interface state (`chrome.storage.local`)** — selected language, dark mode, auto-translate, onboarding state, and related display settings.
- **Learning-tool state (`chrome.storage.local`)** — flashcard review state, bookmarks, recent lessons, and scroll positions.
- **Translation cache (IndexedDB)** — original text, translated text, target language, and a timestamp are cached in `skillbridge-cache` for up to 30 days. This does not depend on the `storage` extension permission.
- **AI Tutor chat history (IndexedDB)** — your question, the tutor's answer, the language, the lesson heading, a timestamp, and the lesson URL are stored on your device so the sidebar can show past conversations. This never leaves your device except as the tutor request itself (to Puter, or to your own local server when the on-device engine is selected).
- **Puter session (`chrome.storage.local`)** — after a successful cloud Tutor sign-in, the accepted session token and application identifier are stored in extension storage so the session can resume. They are not stored in the course site's local storage.
- **Progress summaries** — calculated locally from stored course state; they are not separately persisted or transmitted.
- **Curated dictionaries** — packaged with the extension.

SkillBridge does not send this locally stored state to its operator or to a third-party analytics service. It can be removed through the browser's extension or site-data controls.

### Data Sent to Third-Party Services by the Candidate

| Service | What is sent | Purpose | Privacy policy |
|---|---|---|---|
| Google Translate API | Course-page text selected for translation and the requested language. For paragraphs that mix text with links, inline code, or emphasis, the block's **markup** is sent so the structure survives translation — that markup includes the link targets (`href`) and image addresses (`src`) inside the block | Translate text not already covered by the packaged dictionary or local cache | [Google Privacy Policy](https://policies.google.com/privacy) |
| Puter-backed Claude | The user's Tutor question, any text the user explicitly quotes into it, the requested response language, the course title, up to 8 section headings from the page, and up to 2,000 characters of lesson text — a short opening plus the text near your current position in the lesson | Generate an AI Tutor response (cloud engine only; not used when the Tutor is set to local or off) | [Puter Privacy Policy](https://puter.com/privacy) |
| Puter-backed Claude, or the local server you configure | Translated course paragraphs plus their English source, when the optional **translation refinement** setting is on and separately consented to. Off by default; nothing is sent otherwise. The correction is discarded unless every protected term, number, URL, code span and link survives it unchanged | Post-edit a Google Translate result | [Puter Privacy Policy](https://puter.com/privacy) |
| Puter authentication | Sign-in and session data handled by the bundled client in an ISOLATED content-script world. Puter returns the sign-in result to the HTTPS opener through browser window messaging, which the course page may be able to observe during sign-in. SkillBridge validates the result and stores the accepted token and application identifier in `chrome.storage.local`, not course-site storage. The CWS build disables automatic User/profile lookups, so it does not retrieve a username, user UUID, email status, or other User-object fields. SkillBridge's operator does not receive the token or application identifier | Authenticate and resume the cloud Tutor session | [Puter Privacy Policy](https://puter.com/privacy) |
| A local server the user runs (**optional**) | Same Tutor content as the Claude row, sent only to the user's configured address | Generate an AI Tutor response on-device; see "Local AI Engine" below | Controlled by the user |

The candidate does not transmit course text to YouTube. Auto-subtitles configure an existing embedded player and send it player-control messages; the extension requests no YouTube host permission.

### Data Not Received by the SkillBridge Operator

- The operator does not receive your name, email address, Puter session token, Puter application identifier, or payment information. The isolated Tutor broker handles only the authentication/session data described above for the cloud Tutor.
- No browsing history outside the pages where the extension is configured to run
- No analytics, telemetry, advertising identifier, or marketing profile
- Recent-lesson URLs/titles, timestamps, scroll positions, bookmarks, flashcard review activity, and Tutor history are handled locally but are not sent to the operator or an analytics service.
- No AI Tutor conversation is sent to the operator. Tutor chats are kept **on your device** (see "Data Stored Locally"); only the active Tutor request is sent to Puter/Claude or the local server selected by the user.

### Candidate Permissions

| Permission or site access | Purpose |
|---|---|
| `storage` | Save preferences, Tutor engine settings, flashcard review state, bookmarks, recent lessons, scroll positions, and the accepted Puter session token/application identifier in `chrome.storage.local` |
| `alarms` | Run periodic translation-cache cleanup |
| `*.skilljar.com` | Translate supported AI-course pages hosted on Skilljar |
| `claude.com/resources/tutorials` (content-script match) | Translate Claude tutorial pages |
| `academy.claude.com` (content-script match) | Translate lesson pages on Anthropic's Claude Academy. On assessment pages the answer choices are excluded from translation, so their text is never sent anywhere; where the page is already published in one of Academy's own locales, nothing is sent at all |
| `translate.googleapis.com` | Send page text to Google Translate when translation is requested |
| `http://localhost/*`, `http://127.0.0.1/*` (**optional**) | Requested only if the user selects the local (on-device) AI Tutor engine, so the extension can reach an OpenAI-compatible server the user runs on their own machine. Not granted at install time; declining leaves the Tutor on its previous engine. |

### Translation Refinement (Optional, Off by Default)

Separate from the AI Tutor, and separately consented to. The AI Tutor sends what
the user types; refinement would send paragraphs the user is reading, so
agreeing to one is not agreeing to the other and the extension does not treat it
as such. Both a mode (`Off` / `Cloud` / `Local` / `Same as AI Tutor`) and an
explicit consent checkbox must be set before any request is made; **`Same as AI
Tutor` resolves to nothing when the Tutor is off.**

When it is on:

- Google Translate still renders the page first. Refinement never delays or
  replaces that; it edits a paragraph already on screen.
- The translated paragraph and its English source are sent to the selected
  engine — Puter-backed Claude for `Cloud`, or the user's own server for
  `Local`, where nothing leaves the device.
- The result is discarded unless every protected term, number, URL, code span,
  link target and HTML tag survives it unchanged. A discarded result leaves the
  Google Translate text exactly as it was.
- Accepted results are cached under a **separate** storage key. The translation
  cache and the curated dictionaries are never written to by this feature.

### Local AI Engine (Optional, On-Device)

The candidate lets the user run the AI Tutor against a local OpenAI-compatible server (for example Ollama) instead of the cloud. When that engine is selected:

- The Tutor question, the requested response language, and the same lesson context described above are sent **only to the address the user configures** (default `http://localhost:11434/v1`). Nothing is sent to Puter, Claude, or any other remote service for tutor chat.
- The request is made by the extension's service worker because a page context cannot reach `localhost` directly. It carries no credentials and no cookies.
- SkillBridge does not operate, bundle, or control that local server. Whatever the user's own server logs or retains is under the user's control.
- The address and model name are stored locally in `chrome.storage.local` alongside the other preferences.

### Candidate Retention

- **Translation cache:** up to 30 days, unless the user clears it sooner.
- **Preferences and learning-tool state:** retained locally until the user clears extension or site data.
- **Tutor history:** retained locally until the user clears extension or site data; older entries can be pruned if browser storage is exhausted.
- **Puter session:** the token and application identifier remain in `chrome.storage.local` until Puter resets the session, SkillBridge clears a rejected session, or the user clears the extension's data.
- **Third-party processing:** Google, Puter, and any local server selected by the user control their own logs and retention under their respective policies or configuration.

### Chrome Web Store Limited Use

SkillBridge handles user data only to provide or improve its disclosed, user-facing translation, local study, and Tutor features. It transfers user data only when necessary to provide those features, comply with law, address security, or as part of a merger or asset transfer. SkillBridge does not sell user data, use it for credit decisions, or use or transfer it for personalized advertising. The operator does not allow humans to read handled user data except with the user's affirmative agreement for a specific support purpose, when necessary for security, to comply with law, or after aggregation and anonymization for internal operations.

### Data Security

Requests to Google, Puter, and Claude use HTTPS. A user-selected local Tutor server may use HTTP on `localhost` or `127.0.0.1`; that loopback traffic stays on the user's device. Locally retained preferences, lesson activity, cached translations, and Tutor history use browser-managed storage and are not separately encrypted by SkillBridge, so access to the user's unlocked browser profile may also permit access to that local data.

## Raw Source and Developer Builds

Unpacked developer builds contain the same user-invoked Tutor gateway. Sending a cloud Tutor message transmits that request to Claude through Puter; page translation does not invoke Puter or an AI model. The raw vendored Puter source still contains SDK features that the CWS build removes during packaging, so the repository root or developer ZIP must not be substituted for the scanned CWS artifact.

## International Users and Children's Privacy

SkillBridge does not operate a user database. Google and, when the cloud Tutor is used, Puter and the selected AI provider may process transmitted text in jurisdictions outside the user's country. Users should review the applicable third-party policies for rights and controls.

SkillBridge does not knowingly collect personal information from children under 13.

## Release-Maintenance Note

**TODO:** Keep the v1.0.1 legacy disclosure on this page while publication is paused. Remove or archive it only after the replacement version is confirmed live in the Chrome Web Store, then update this policy and the store listing together.

## Changes

Material changes to this policy will be posted in this file and reflected in the published extension information.

## Contact

For privacy questions, open an issue on [GitHub](https://github.com/heznpc/skillbridge/issues).
