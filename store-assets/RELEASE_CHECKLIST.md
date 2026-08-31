# Archived / frozen CWS v4.0.0 draft — do not upload

> **Frozen archive. Do not upload or reuse this v4.0.0 bundle, copy, assets,
> hashes, or dashboard fields.** Source v4.1.1 is a GitHub-only checkpoint, not
> a CWS submission candidate. Assign the final CWS version and regenerate its
> artifact, assets, copy, evidence, and dashboard fields only after the ongoing
> code-development phase is complete.

> Historical record: refreshed 2026-07-30 for the v4.0.0 CWS build. The upload
> artifact keeps
> translation and local learning tools AND ships the AI Tutor: the AI gateway is
> pinned ON and the bundled Puter client runs in Chrome's ISOLATED content-script
> world on the trusted course host, connected through validated extension ports;
> `src/lib/page-bridge.js` is
> not shipped. Tutor requests happen only after the user signs in to Puter (free). An
> optional on-device engine (a user-run OpenAI-compatible server on localhost)
> is selectable in the popup. This is the source of truth for the next dashboard
> upload **as it was documented at that time**; it is retained only as historical
> evidence and is no longer a current upload source of truth.

CWS listing status:
- Published: **v1.0.1** (uploaded 2026-03-10)
- GitHub source checkpoint: **v4.1.1** — GitHub-only; not a CWS candidate
- Archived local candidate: **v4.0.0** — frozen; do not upload or reuse
- Final CWS candidate: **unassigned** until ongoing code development is complete
- Archived v4.0.0 release identity: **assigned** — the existing `v3.5.41` tag
  remains immutable
  and is not reused for this v4.0.0 CWS change set
- Many PRs have landed since the published version — none have reached users yet
- `npm run check:cws-drift` intentionally fails until the dashboard is updated

After code development is complete, the remaining publish steps will cross
trust boundaries the automation cannot cross (dashboard fields, external
permission confirmation, and the publication toggle).
Do not treat this archived checklist as code-side green. Create a fresh checklist,
run `npm run release:verify` in the final release checkout, and regenerate the
upload artifact immediately before dashboard upload.

## Archived v4.0.0 code-side state

- ✅ Final ZIP release identity is `4.0.0` across `manifest.json`,
  `package.json`, versioned dictionary metadata, and `CHANGELOG.md`.
- ✅ Historical `CHANGELOG.md` sections through v3.5.41 remain immutable. One
  section was **added**, not rewritten: `[1.0.1] - 2026-03-10` had no entry at
  all despite being the only build users are running. Reconstructed from the
  `v1.0.0..v1.0.1` commit range (PRs #30–#34) and the `v1.0.1` manifest, so the
  "What's new" copy has a real baseline to be written against.
- ✅ Final v4.0.0 upload artifact rebuilt 2026-08-07 with `npm run build:bundle:zip`
  from `main` @ `f51a8fc` (through PR #280, includes the post-#276 defect fixes
  in #278 and the CWS-token tooling in #279): **69 files, 719,339 bytes**, SHA-256
  `79ff75499ed13a15f9207efff5b877f9e17bacfe1b28f02c8db87304dddab8ff`.
  The extracted ZIP was diffed against `dist/bundled` and is byte-for-byte
  identical, and `scripts/check-rhc.js` reports zero findings against BOTH the
  built directory and the extracted archive. It includes the
  isolated Puter content broker, sanitized `src/bridge/puter.js`, third-party
  notices/licenses, and the bundled HTML-GT path, and does not include
  `src/lib/page-bridge.js`. This bundled ZIP is the **only** CWS upload artifact;
  the compatibility alias `npm run build:zip` resolves to the same safe command.
  Note: `zip` records mtimes, so rebuilding yields a different hash for identical
  content — verify this hash against the file you actually submit rather than
  rebuilding after reading it here.
  - Superseded stamps, kept only to identify what they were: `d6541a8` (PR #276)
    at **715,243 bytes** / `2750797c…`, which predates the local-engine probe fix;
    the 2026-07-29 candidate `4315e09a…`, which predates the pre-merge security
    review fixes; and the 2026-07-30 candidate `380d3ca3…` (same 719,339 bytes —
    identical content, different mtime), which predates PRs #278–#280. None may
    be uploaded.
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
- ✅ `npm run release:verify` (full pipeline, not a partial gate) re-run
  2026-08-07 from a clean `npm ci` on `main` @ `f51a8fc`: lint, format,
  **711 unit tests**, translation/glossary/i18n/dictionary checks, live
  selector and 22-course map checks, first-user/popup smoke, store-asset
  regeneration, ZIP integrity (69 files verified), and the **full 52-test
  Chromium E2E suite across eight resource-bounded batches — 50 passed, 2
  skipped**. The live CWS check still reports v1.0.1, updated 2026-03-10.
  - Batch 5 (`chat-history`, `stream-cancel`, `tutor-chat`, `tutor-offline`)
    had shown a batch-only flake: `_getAiEngine`/`_currentEngine` awaited
    `chrome.storage.local.get('sb_ai_engine')` with no bound, so a slow IPC
    under load could stall the very first branch every chat send takes. Fixed
    by racing that read against a 1.5s timeout that falls back to the default
    engine (`src/lib/translator.js`, `src/content/sidebar-chat.js`); re-ran the
    batch 5-of-5 clean afterward, then 9/9 clean again inside this full run.
  - The 2 skipped are the live-Ollama batch (`local-engine-live.spec.js`):
    self-skips when no local Ollama server is reachable at test time — expected
    on a machine not currently running `OLLAMA_ORIGINS='chrome-extension://*'
    ollama serve`. Verified for real against `gemma3:4b` on 2026-07-30 (see
    below); the machinery is unchanged since.
- ✅ Local-engine reachability probe corrected 2026-07-30. Chrome omits `Origin`
  on a bodyless GET and attaches `Origin: chrome-extension://<id>` to the JSON
  POST the tutor sends, so probing only `GET /v1/models` returned 200 against a
  default Ollama and the popup reported "Connected to local server" — then the
  user's first question failed with an untranslated English error, because the
  13-language `OLLAMA_ORIGINS` guidance sits behind the probe's 403 branch and
  was unreachable. The probe now re-checks with the POST's shape (deliberately
  invalid body: 400 on a permitted origin without loading a model, 403 when
  blocked). This makes the shipped behavior match what the `[4.0.0]` changelog
  entry already claimed — a probe that classifies connected / CORS-blocked /
  not-found. Verified in all three states against a real server.
  Dictionary freshness reports the recruiting-state dictionaries as
  review-needed; that is not a native review stamp. Rerun the gate immediately
  before dashboard upload if the artifact changes.
- ✅ Promo media regenerated 2026-07-30 from the current `demo.webm`: all five
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

The release identity and changelog are now fixed at v4.0.0. The permission
scope is unchanged since PR #278 and is machine-verified on every push (see
"Keep publication paused" below); rerun all gates and regenerate the bundled
ZIP immediately before each dashboard upload attempt regardless. Never reuse
the existing `v3.5.41` release identity.

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
    Baseline page translation never invokes Puter, Claude, or the Tutor model in
    any mode. Optional Translation Refinement is a separate feature, off by
    default and separately consented; when a user turns it on it does send
    already-translated paragraphs to the selected model.
  Keep the three confirmations checked (transfer to a service provider to perform
  the requested feature is an approved use case, not a sale).
- **Permission and site-access justifications** — paste from `STORE_LISTING.md`
  "Permission Justifications". The v4.0.0 candidate declares `storage` + `alarms` + **two**
  explicit `host_permissions` (`*.skilljar.com`, `translate.googleapis.com`),
  the scoped
  `https://claude.com/resources/tutorials/*` content-script match, **and the
  optional** `http://localhost/*` + `http://127.0.0.1/*` host permissions
  (requested at runtime only when the user picks the on-device Tutor engine —
  justify it as reaching a local AI server the user runs themselves). The old
  `activeTab` / `tabs` justification fields disappear
  after upload (those permissions are no longer in the manifest); `alarms` and
  the Claude tutorial match each need an accurate line.
  - `api.github.com` is **gone** as of v4.0.0: the weekly GitHub Releases poll
    that badged the toolbar icon was removed, since the Chrome Web Store already
    updates installed extensions. If a justification field for it survives from
    the v1.0.1 listing, clear it — do not re-justify a permission the manifest
    no longer requests.

### 4. Keep publication paused

Do **not** delete `CWS_PUBLICATION_PAUSED` during code cleanup or dashboard
draft preparation. Set `CWS_DASHBOARD_READY_VERSION` and remove the pause only
after the final ZIP passes `npm run release:verify` and steps 3 and 3b are
complete. Listing copy, icon, screenshots, promo tile, privacy URL,
privacy-practices answers, and permission justifications must all match this
checklist.

(The permission scope itself is no longer a separate open question — it has
not changed since PR #278 and `npm run check:permission-docs` verifies it
against the manifest on every push, including in CI's `validate` job. Steps 3
and 3b are the only remaining action, and they are the human dashboard work,
not a scope re-review.)

> ⚠️ **CD has never uploaded anything.** Treat the automated path as unproven,
> not as a fallback. A `CWS_REFRESH_TOKEN` was never issued, and the workflow's
> readiness step only checks that the secrets are **non-empty** — so the gap
> stayed invisible until a manual dispatch on 2026-07-31 reached the upload step
> and failed with a bare `HTTP 400` from Google's token endpoint. There is no
> `cws-v*` tag in the repository, which is the durable evidence: every published
> build to date, including v1.0.1, was uploaded by hand in the dashboard.
>
> Before relying on CD, run `npm run cws:auth` (see `scripts/cws-auth.js`). It
> mints a refresh token, **proves it against the live listing**, and only then
> writes the repo secrets — so a bad credential fails on your machine with a
> named cause instead of in CI with a status code. `npm run cws:auth:verify`
> answers "are the current secrets actually good?" without minting anything.
>
> Three prerequisites from the
> [official API guide](https://developer.chrome.com/docs/webstore/using-api)
> that are easy to miss:
>
> - The publishing account needs 2-Step Verification enabled.
> - The Store listing and Privacy tabs must be filled in **before** the API can
>   publish an item. The API is not a way around steps 3 and 3b.
> - Items publish with their **existing** visibility settings. If visibility was
>   changed by hand in the dashboard, the API cannot publish until you have
>   manually published once under the new visibility.
>
> For a CI path that does not hinge on a user token that can be revoked or
> expire, the API also supports a service account. That is the sturdier option
> if CD is ever meant to be load-bearing.

While the pause remains set, CD skips the live upload step. Removing it later
would enable the CWS upload path on the next eligible push — assuming a working
token exists by then. The workflow builds and uploads the same bundled artifact
named in step 3: `store-assets/skillbridge-bundled.zip`.

Safety rails in the CD workflow:

- `CWS_EXTENSION_ID` must match the SkillBridge listing used by
  `scripts/check-cws-drift.js`, so a cross-project secret cannot upload the zip
  to the wrong listing. This rail fired for real on 2026-07-31: the stored
  secret did not match `oancfldkbnajdadgekkjpdnhepjjcdln` and the run refused to
  upload. The secret was reset to that value — a public identifier that already
  appears in the listing URL and in the tracked drift script, so it is not a
  credential. The other three CWS secrets predate any successful upload and
  should be treated as unverified until `npm run cws:auth:verify` passes.
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

- `scripts/check-permission-docs.js` (`npm run check:permission-docs`, and a
  required CI step) compares `manifest.json` against the three documents CWS
  review reads: the `Candidate Permissions` tables in `PRIVACY_POLICY.md` and
  `docs/privacy.html`, and the `Permission Justifications` headings in
  `STORE_LISTING.md`. Set equality, so both directions fail — a granted host no
  document discloses, and a document claiming a permission the manifest does not
  request. It also holds a list of retired capabilities (currently
  `api.github.com` and `GitHub Releases`) that must appear in no document at all,
  because that stale claim lived in a third-party services table and in prose
  where a permission-table comparison would never look. **When you remove a
  network capability, add it to `RETIRED` in that script** — that is the moment
  every document describing it goes stale. The legacy v1.0.1 sections are
  excluded by design so that record can stay while publication is paused.
- `scripts/check-cws-drift.js` runs against the live listing weekly (Monday 06:30
  UTC) + on every `main` push that touches `manifest.json`. Opens a single
  GitHub issue when drift exceeds 5 patches OR the published version is older
  than 60 days. Idempotent — only one issue at a time.

## SNS launch (separate session, after listing is live)

SNS launch drafts are kept outside this repo (internal). Do not post until the
CWS listing reflects the newly assigned release version — posting before would point users at a listing
missing all the work the post talks about.
