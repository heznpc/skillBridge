# Release Checklist — CWS v3.5.42

> Refreshed 2026-07-24 for the privacy-focused CWS build. The upload artifact
> keeps translation and local learning tools. Its runtime disables the AI
> gateway and makes no AI requests; Puter SDK and page-bridge files are omitted.
> Dormant shared-source AI strings may remain. This is the source of truth for the next
> dashboard upload.

CWS listing status:
- Published: **v1.0.1** (uploaded 2026-03-10)
- Local candidate: **v3.5.42**
- Release identity: **assigned** — the existing `v3.5.41` tag remains immutable
  and is not reused for this no-AI CWS change set
- Many PRs have landed since the published version — none have reached users yet
- `npm run check:cws-drift` intentionally fails until the dashboard is updated

The remaining publish steps cross trust boundaries the automation cannot cross
(dashboard fields, external permission confirmation, and the publication toggle).
Do not treat this checklist as code-side green until `npm run release:verify`
passes in the release checkout. Regenerate the upload artifact immediately before
dashboard upload.

## Code-side state

- ✅ Final ZIP release identity is `3.5.42` across `manifest.json`,
  `package.json`, versioned dictionary metadata, and `CHANGELOG.md`.
- ✅ Historical `CHANGELOG.md` sections through v3.5.41 remain immutable
- ✅ `npm run release:verify` passed on 2026-07-24 and regenerated
  `store-assets/skillbridge-bundled.zip` after every release gate passed.
  The inspected 63-file ZIP has SHA-256
  `c81fdbe5fac854974f5dc673358918f1e8098368edac375d440750217df600f6`.
  This bundled no-AI ZIP is the **only** CWS upload artifact; the compatibility
  alias `npm run build:zip` resolves to this same safe command.
- ⛔ Never upload `store-assets/skillbridge-developer.zip` (generated only by the
  explicit `npm run build:developer:zip` command), the repository root, or the
  Firefox build to CWS. Raw/developer source retains the optional Puter-based AI
  path and does not represent the CWS product or its privacy disclosures.
- ✅ All 33 `_locales/*/messages.json` descriptions cover translation and local
  learning tools; `npm run check:i18n` enforces the 132-character limit.
- ✅ Nominative-use sweep clean (`SkillBridge — AI Course Translator`, no Anthropic-as-product-modifier)
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
- ✅ Latest local gate snapshot: `npm run release:verify` passed on 2026-07-24,
  including 646 unit tests, the full five-batch Chromium E2E suite, live
  selector/course-map checks, store capture, and ZIP integrity. Dictionary
  freshness reported recruiting-state dictionaries as review-needed warnings;
  that is not a native review stamp. Rerun immediately before dashboard upload
  if this artifact changes.
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

The release identity and changelog are now fixed at v3.5.42. After the external
permission scope is confirmed, rerun all gates and generate the bundled ZIP.
Never reuse the existing `v3.5.41` release identity.

### 1. Icon — resolved

Status: **resolved**. The non-infringing icon shipped in v3.5.35 (a rising
half-sun over the SkillBridge bridge — no Claude-mark / radial spark). The
`assets/icons/icon{16,32,48,128}.png` on `main` are the current set; upload
`assets/icons/icon128.png` in step 3. Because the icon changed, re-capture the
screenshots in step 2.

### 2. Regenerate store screenshots (one command)

Don't hand-capture. `npm run capture:store` drives the **built bundle** with
Playwright and regenerates the full CWS set into `store-assets/` — or run it
with **zero local setup**: Actions → "Capture store assets" → Run workflow →
download the `store-assets` artifact:

- `01-translate.png` … `05-exam-safe.png` (1280×800) — translated lesson,
  language picker, local progress dashboard, flashcards, exam-safe answers
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
- **"Are you using remote code?" → NO for the bundled CWS ZIP.** The CWS builder
  pins the AI gateway off, omits `src/bridge/puter.js` and
  `src/lib/page-bridge.js`, and runs `check:rhc` against the final artifact.
  Inspect the uploaded ZIP itself before answering. The public repository still
  contains the optional Puter-based developer path, so the raw source ZIP must
  never be substituted for the bundled CWS artifact.
- **Data usage → check "Website content".** Page text is sent to Google
  Translate when translation is requested. No lesson context, tutor message, or
  learning-tool state is sent to Puter, Gemini, or Claude by the CWS build.
  Leaving Website content unchecked while the description says page text is
  sent off-device is an inconsistency reviewers reject. Local-only data
  (bookmarks, resume, flashcards, progress, settings) is not collected, so
  location, browsing history, and user activity stay unchecked.
  Keep the three confirmations checked (transfer to a service provider to perform
  the requested feature is an approved use case, not a sale).
- **Permission and site-access justifications** — paste from `STORE_LISTING.md`
  "Permission Justifications". The next candidate declares `storage` + `alarms` + three
  explicit `host_permissions` (`*.skilljar.com`, `translate.googleapis.com`,
  `api.github.com`) plus the scoped
  `https://claude.com/resources/tutorials/*` content-script match. The old
  `activeTab` / `tabs` justification fields disappear
  after upload (those permissions are no longer in the manifest); `alarms` and
  `api.github.com` and the Claude tutorial match each need an accurate line.

### 4. Keep publication paused

Do **not** delete `CWS_PUBLICATION_PAUSED` during code cleanup or dashboard
draft preparation. Set `CWS_DASHBOARD_READY_VERSION` and remove the pause only
after the requested external permission scope is confirmed in writing, the
final no-AI ZIP passes `npm run release:verify`, and steps 3 and 3b are complete.
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
