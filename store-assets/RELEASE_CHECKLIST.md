# Release Checklist — CWS v4.0.0

> Refreshed 2026-07-29 for the v4.0.0 CWS build. The upload artifact keeps
> translation and local learning tools AND ships the AI Tutor: the AI gateway is
> pinned ON and the bundled Puter client runs in Chrome's ISOLATED content-script
> world on the trusted course host, connected through validated extension ports;
> `src/lib/page-bridge.js` is
> not shipped. Tutor requests happen only after the user signs in to Puter (free). An
> optional on-device engine (a user-run OpenAI-compatible server on localhost)
> is selectable in the popup. This is the source of truth for the next dashboard
> upload.

CWS listing status:
- Published: **v1.0.1** (uploaded 2026-03-10)
- Local candidate: **v4.0.0**
- Release identity: **assigned** — the existing `v3.5.41` tag remains immutable
  and is not reused for this v4.0.0 CWS change set
- Many PRs have landed since the published version — none have reached users yet
- `npm run check:cws-drift` intentionally fails until the dashboard is updated

The remaining publish steps cross trust boundaries the automation cannot cross
(dashboard fields, external permission confirmation, and the publication toggle).
Do not treat this checklist as code-side green until `npm run release:verify`
passes in the release checkout. Regenerate the upload artifact immediately before
dashboard upload.

## Code-side state

- ✅ Final ZIP release identity is `4.0.0` across `manifest.json`,
  `package.json`, versioned dictionary metadata, and `CHANGELOG.md`.
- ✅ Historical `CHANGELOG.md` sections through v3.5.41 remain immutable
- ✅ Final v4.0.0 upload artifact recorded 2026-07-29 after the last integrated
  release gates: **69 files, 714,228 bytes**, SHA-256
  `4315e09ac59516f2c7c52aa5fc18d11efb73c0b69c386281fc693ddc0bfa7a1e`. The extracted ZIP was diffed against `dist/bundled` and is byte-for-byte
  identical, and `scripts/check-rhc.js` reports zero findings against BOTH the
  built directory and the extracted archive. It includes the isolated Puter
  content broker, sanitized `src/bridge/puter.js`, third-party notices/licenses, and the
  bundled HTML-GT path, and does not include `src/lib/page-bridge.js`. This
  bundled ZIP is the **only** CWS upload artifact; the compatibility alias
  `npm run build:zip` resolves to this same safe command.
- ⛔ Never upload `store-assets/skillbridge-developer.zip` (generated only by the
  explicit `npm run build:developer:zip` command), the repository root, or the
  Firefox build to CWS. Raw/developer source retains Puter SDK features that the
  CWS build removes and does not represent the scanned upload artifact.
- ✅ All 33 `_locales/*/messages.json` descriptions cover translation and local
  learning tools; `npm run check:i18n` enforces the 132-character limit.
- ✅ Nominative-use sweep clean (`SkillBridge — AI Course Translator`, no Anthropic-as-product-modifier)
- ✅ Bundled Puter dependencies are identified from their npm releases:
  `@heyputer/puter.js@2.2.11` (Apache-2.0) and its bundled
  `@heyputer/kv.js@0.2.1` dependency (MIT). The ZIP includes both license texts,
  `THIRD_PARTY_NOTICES.md`, and a prominent CWS modification notice in the
  sanitized Puter file.
- ✅ Privacy URL is `https://heznpc.github.io/skillBridge/privacy` — **capital "B"**.
  GitHub Pages repo-path segments are case-sensitive: the lowercase
  `/skillbridge/privacy` returns **404** (verified 2026-06-02), which the CWS
  dashboard rejects with "개인정보처리방침 링크에 연결할 수 없습니다 / Cannot
  connect to the privacy policy link". `github.com` links are case-insensitive,
  so the homepage/support URLs are fine lowercase — only the `github.io` URL
  must be capital-B.
- ⏳ While publication is paused, that privacy page must retain separate
  disclosures for live legacy v1.0.1 and the unpublished candidate. Remove or
  archive the legacy section only after the replacement version is confirmed
  live in the CWS dashboard and update the listing/privacy answers together.
- ✅ Integrated release verification passed on 2026-07-29: lint, format, **696 unit
  tests across 38 suites**, translation/glossary/i18n checks, live selector and
  22-course map checks, first-user/popup smoke, Firefox build, store capture,
  ZIP integrity, and **all 52 Chromium E2E tests across eight resource-bounded
  batches** (including the malicious Puter-query stored-token regression and
  the live-Ollama local-engine round trip). The live CWS
  check still reports v1.0.1, updated 2026-03-10.
  Dictionary freshness reports the recruiting-state dictionaries as
  review-needed; that is not a native review stamp. Rerun the gate immediately
  before dashboard upload if the artifact changes.
- ✅ Promo media regenerated 2026-07-29 from the current `demo.webm`: all five
  1280×800 screenshots and the promo tile were recaptured from the current CWS
  bundle and inspected; both v4.0.0 MP4s, thumbnails, and
  `promo-media-manifest.json` hashes match the files on disk.
- ✅ AI-content gate wired into `manifest.json:content_scripts[].js` (PR #145 hotfix)
- ✅ CWS-drift watcher will keep this from drifting 3 months again
- ✅ Italian dictionary live (PR #140) — timed with Anthropic Milan office opening 2026-05-27

## What needs your hands

### 0. Pre-release dictionary audit (LLM) — release convention

Before every store submission, run the full per-locale LLM dictionary audit
(one reviewer per premium locale over all entries; re-verify every finding
against the file before fixing — the 2026-06-10 audit caught `Slack → "Lento"`
-class errors that all structural gates miss). After fixes land, stamp each
dictionary's `_meta.lastAudited` and run `npm run docs` so the README QA table
reflects it. Three-layer QA model: `docs/TRANSLATION_QA.md`.

**Status for this submission (2026-07-28) — COMPLETE:**
- ✅ A rule-based term pass ran across **all 12** locales: the common noun
  `subagent` is now translated per `docs/TRANSLATION_RULES.md` (pt-BR
  subagentes · ru субагент declensions · vi tác tử con · id subagen · ko
  서브에이전트 · ja サブエージェント · zh 子代理 · es subagentes · fr sous-agents ·
  it subagenti · de Subagenten), plus the four confirmed reviewer fixes
  (pt-BR `powered by`, vi `Streaming responses`, id `Enroll in Course`, id
  captions wording). `glossary`, `check:dicts`, `validate`, and `check:locales`
  all pass; `_meta.lastUpdated` is stamped on all 12.
- ✅ Full per-entry semantic review completed for all 12 premium locales:
  pt-BR, ru, vi, id, ko, ja, zh-CN, zh-TW, es, fr, it, and de. Every file
  carries `_meta.lastAudited = 2026-07-28`; confirmed high-confidence semantic
  and terminology findings were applied before the structural gates passed.

The release identity and changelog are now fixed at v4.0.0. After the external
permission scope is confirmed, rerun all gates and generate the bundled ZIP.
Never reuse the existing `v3.5.41` release identity.

### 1. Icon — resolved

Status: **resolved**. The non-infringing icon shipped in v3.5.35 (a rising
half-sun over the SkillBridge bridge — no Claude-mark / radial spark). The
`assets/icons/icon{16,32,48,128}.png` on `main` are the current set; upload
`assets/icons/icon128.png` in step 3. On 2026-07-28 the 128 icon was reframed
mechanically for the store tile — the same mark, scaled to 96×96 and centred on
a transparent 128×128 canvas (16 px margin) instead of bleeding to the canvas
edge. No new artwork was drawn. The toolbar sizes (16/32/48) are unchanged, and
the mark does not appear inside the five page screenshots, so that reframe does
not by itself invalidate them.

### 2. Regenerate store screenshots (one command)

Don't hand-capture. `npm run capture:store` drives the **built bundle** with
Playwright and regenerates the full CWS set into `store-assets/` — or run it
with **zero local setup**: Actions → "Capture store assets" → Run workflow →
download the `store-assets` artifact:

- `01-translate.png` … `05-exam-safe.png` (1280×800) — translated lesson,
  language picker, in-page Tutor, flashcards, exam-safe answers
- `promo-tile-440x280.png` — small promo tile
- `demo.webm` — demo screencast (CWS takes a YouTube link, not a file — upload it and paste the URL)
- `description.md` — copy/paste Title / Summary / Description / What's new

Edit which states are captured in `store.config.js`, and the listing copy in
`store-assets/STORE_LISTING.md`. The run doubles as a real-bundle smoke test (a
screenshot only appears if that feature rendered). Captures are login-free and
deterministic — a frozen Korean translation map, no Puter/AI readiness step,
neutral "Academy" fixtures (no Anthropic logo), and a composited
"unofficial / not affiliated" disclaimer band
on every shot. (`assets/screenshots/*` README/marketing images are separate and
still hand-made.)

### 3. Upload to CWS dev console

Open the [Chrome Web Store developer console](https://chrome.google.com/webstore/devconsole/) and select the SkillBridge publisher (the per-publisher group id is intentionally omitted from this public doc).

| Field | Value |
|---|---|
| Package upload | `store-assets/skillbridge-bundled.zip` ← drag this in |
| Listing title | `SkillBridge — AI Course Translator` |
| Summary | paste from `store-assets/STORE_LISTING.md` "Summary" section |
| Description | paste from `store-assets/STORE_LISTING.md` "Description" section |
| Privacy policy URL | `https://heznpc.github.io/skillBridge/privacy` |
| Locale | **English only** — single CWS listing, shown to every user regardless of browser language (localized ko/ja listings were dropped to avoid drift) |
| Icon (128×128) | upload current `assets/icons/icon128.png` (half-sun + bridge). ⚠️ the **live listing still shows the OLD coral radial-spark icon** — the store-listing graphic is a separate asset from the package and must be re-uploaded here, or the infringing mark stays live. |
| Promo tile + screenshots | `store-assets/promo-tile-440x280.png` + `store-assets/01-translate.png`…`05-exam-safe.png` (regenerate with `npm run capture:store`) |

### 3b. Privacy tab (this is what blocked the last submit)

Open the "개인정보 보호 / Privacy practices" tab. The published v1.0.1 answers are
stale against the next CWS candidate — fix these:

- **Privacy policy URL** — must be the **capital-B** `github.io` URL (see the
  Privacy-URL note above). The lowercase form 404s and the dashboard refuses to
  submit ("개인정보처리방침 링크에 연결할 수 없습니다").
- **"Are you using remote code?" — answer from the artifact, not from memory.**
  v4.0.0 ships the Puter SDK **inside** the package. The build removes its unused
  remote TLS-socket imports and `Function` fallback, then `scripts/check-rhc.js`
  scans the entire artifact for remote imports, scripts, workers, worklets,
  executable fetches/WebAssembly, eval, and Function constructors. The final ZIP
  must pass that gate with zero findings. Answer **No** for remote code only for
  this scanned bundled artifact; never substitute the raw source/developer ZIP.
- **Data usage — v4.0.0 needs FIVE categories, not one.** Chrome's policy treats
  local processing/storage and third-party sign-in as handling too; re-answer
  from the actual v4 data flows:
  - ✅ **Website content** — page text goes to Google Translate when
    translation is requested (in the POST body, not the URL). For inline-mixed
    blocks the block's markup is sent, so link targets and image addresses
    inside it are included.
  - ✅ **Personal communications** — the Tutor is a chat. The user's message,
    plus lesson context (course title, up to 8 section headings, and up to
    2,000 characters of lesson text — a short opening plus the text near their
    current position), is sent to Claude via Puter when they send a Tutor
    message, and the conversation is stored on their device. Chat content is user-authored communication; do not classify
    it as website content only.
  - ✅ **Authentication information** — the cloud Tutor requires a Puter
    sign-in. The Puter SDK holds the resulting auth token and Puter application
    identifier in extension storage, not in the course page's persistent
    storage. Puter returns the sign-in result to the HTTPS opener through
    browser window messaging, which the course page may be able to observe
    during sign-in. The operator does not receive either value, but the bundled
    flow still handles authentication data and must be declared.
  - ✅ **Web history** — recent lessons store the supported lesson URL, title,
    and visit time; bookmarks and Tutor-history records also contain the lesson
    URL. This data stays local, but local handling still requires disclosure.
  - ✅ **User activity** — scroll position, visit/progress timestamps,
    flashcard review state, and bookmark activity are stored locally for the
    visible resume and study features. They are not sent to analytics or the
    SkillBridge operator.
  - ❌ **Personally identifiable information** stays **unchecked** — the CWS
    sanitizer disables the SDK's automatic `/whoami`/`getUser` profile lookups,
    and the Tutor path handles no username, user UUID, email status, or other
    Puter User-object fields. The stored `app_uid` is a Puter application
    identifier, not a user identifier.
  - ❌ Location, financial/payment, and health information also stay **unchecked**.
  - With the local engine selected, Tutor text goes only to the user's own
    localhost server; with the Tutor off, no AI request is made at all.
    Page translation never invokes Puter, Claude, or the Tutor model in any mode.
  Keep the three confirmations checked (transfer to a service provider to perform
  the requested feature is an approved use case, not a sale).
- **Permission and site-access justifications** — paste from `STORE_LISTING.md`
  "Permission Justifications". The v4.0.0 candidate declares `storage` + `alarms` + three
  explicit `host_permissions` (`*.skilljar.com`, `translate.googleapis.com`,
  `api.github.com`), the scoped
  `https://claude.com/resources/tutorials/*` content-script match, **and the
  optional** `http://localhost/*` + `http://127.0.0.1/*` host permissions
  (requested at runtime only when the user picks the on-device Tutor engine —
  justify it as reaching a local AI server the user runs themselves). The old
  `activeTab` / `tabs` justification fields disappear
  after upload (those permissions are no longer in the manifest); `alarms` and
  `api.github.com` and the Claude tutorial match each need an accurate line.

### 4. Keep publication paused

Do **not** delete `CWS_PUBLICATION_PAUSED` during code cleanup or dashboard
draft preparation. Set `CWS_DASHBOARD_READY_VERSION` and remove the pause only
after the requested external permission scope is confirmed in writing, the
final ZIP passes `npm run release:verify`, and steps 3 and 3b are complete.
Listing copy, icon, screenshots, promo tile, privacy URL, privacy-practices
answers, and permission justifications must all match this checklist.

While the pause remains set, CD skips the live upload step. Removing it later
re-enables the CWS upload path on the next eligible push. The workflow builds
and uploads the same bundled artifact named in step 3:
`store-assets/skillbridge-bundled.zip`.

Safety rails in the CD workflow:

- `CWS_EXTENSION_ID` must match the SkillBridge listing used by
  `scripts/check-cws-drift.js`, so a cross-project secret cannot upload the zip
  to the wrong listing.
- Manual `publish=false` runs are draft-only and do not create the live
  `cws-v*` deployed tag; only a successful live publish does.

If the pause variable is unexpectedly absent, restore the publication lock
before continuing release work.

### 5. CWS review wait

Typical 1–3 business days. Track at the dev console "Status" tab.

After the listing goes live, run `npm run check:cws-drift` locally OR trigger
the `cws-drift.yml` workflow via `workflow_dispatch` — it should report `OK`
(drift cleared). The auto-opened drift issue can then be closed.

## What's already automated

- `scripts/check-cws-drift.js` runs against the live listing weekly (Monday 06:30
  UTC) + on every `main` push that touches `manifest.json`. Opens a single
  GitHub issue when drift exceeds 5 patches OR the published version is older
  than 60 days. Idempotent — only one issue at a time.

## If trademark complaint comes back

If a new complaint is filed against the next CWS release:
1. Check whether it cites the icon (then return to step 1 option B/C) or the
   listing copy (then re-sweep `store-assets/STORE_LISTING*.md` for any
   residual brand-as-product-modifier phrasing).
2. Consider deeper rename (`SkillBridge — Skilljar AI-Course Translator` with
   `anthropic.skilljar.com` only in body, not title).
3. Open `chore/trademark-deeper-rename` branch and iterate.

## SNS launch (separate session, after listing is live)

SNS launch drafts are kept outside this repo (internal). Do not post until the
CWS listing reflects the newly assigned release version — posting before would point users at a listing
missing all the work the post talks about.
