# Release Checklist — v3.5.40 re-publication

> Refreshed 2026-06-10 for v3.5.40 (post shadow-DOM migration + live-debug fixes). Since the last revision: the non-infringing
> icon shipped (v3.5.35), the learning-companion features + Tools menu landed
> (v3.5.36–3.5.39), and the page bridge / AI tutor was scoped to
> anthropic.skilljar.com. This is the source of truth for the next dashboard upload.

CWS listing status:
- Published: **v1.0.1** (uploaded 2026-03-10)
- Local: **v3.5.40**
- Many PRs (#135–#194) have landed since the published version — none have reached users yet
- `npm run check:cws-drift` intentionally fails until the dashboard is updated

The remaining publish steps cross trust boundaries the automation can't cross
(your hands on the dashboard, the icon design decision, the public-variable toggle).
Everything code-side is ready and pre-built.

## What's already prepared (no further action needed)

- ✅ `manifest.json` v3.5.40 + `package.json` + 11 `src/data/*.json` `_meta.version` all bumped
- ✅ `CHANGELOG.md` v3.5.34–3.5.40 sections written (PRs #135–#194 consolidated)
- ✅ `store-assets/skillbridge-bundled.zip` (minified, **rebuilt at v3.5.40** via `npm run build:bundle:zip`) — **this is the CWS upload artifact**
- ⚠️ `store-assets/skillbridge.zip` (raw source) — fallback only if the bundled
  build is rejected in review. **Run `npm run build:zip` immediately before
  uploading it** — this artifact is gitignored, is not rebuilt by
  `build:bundle:zip`, and will otherwise lag behind `manifest.json` (it was
  found stale at 3.5.38 once while the bundle was 3.5.39).
- ✅ All 11 Premium `_locales/*/messages.json` have `extDescription` nominative form
- ✅ Nominative-use sweep clean (`SkillBridge — AI Course Translator`, no Anthropic-as-product-modifier)
- ✅ Privacy URL is `https://heznpc.github.io/skillBridge/privacy` — **capital "B"**.
  GitHub Pages repo-path segments are case-sensitive: the lowercase
  `/skillbridge/privacy` returns **404** (verified 2026-06-02), which the CWS
  dashboard rejects with "개인정보처리방침 링크에 연결할 수 없습니다 / Cannot
  connect to the privacy policy link". `github.com` links are case-insensitive,
  so the homepage/support URLs are fine lowercase — only the `github.io` URL
  must be capital-B.
- ✅ Tests 520/520 + 19 e2e, ESLint + Prettier clean, all check-* scripts clean (incl. `check:academy`)
- ✅ AI-content gate wired into `manifest.json:content_scripts[].js` (PR #145 hotfix)
- ✅ CWS-drift watcher will keep this from drifting 3 months again
- ✅ Italian dictionary live (PR #140) — timed with Anthropic Milan office opening 2026-05-27

## What needs your hands

### 1. Icon — resolved

Status: **resolved**. The non-infringing icon shipped in v3.5.35 (a rising
half-sun over the SkillBridge bridge — no Claude-mark / radial spark). The
`assets/icons/icon{16,32,48,128}.png` on `main` are the current set; upload
`assets/icons/icon128.png` in step 3. Because the icon changed, re-capture the
screenshots in step 2.

### 2. Regenerate store screenshots (one command)

Don't hand-capture. `npm run capture:store` drives the **built bundle** with
Playwright and regenerates the full CWS set into `store-assets/`:

- `01-translate.png` … `05-exam-safe.png` (1280×800) — translate before/after,
  language picker, in-page AI tutor, flashcards, exam-safe answers
- `promo-tile-440x280.png` — small promo tile
- `demo.webm` — demo screencast (CWS takes a YouTube link, not a file — upload it and paste the URL)
- `description.md` — copy/paste Title / Summary / Description / What's new

Edit which states are captured in `store.config.js`, and the listing copy in
`store-assets/STORE_LISTING.md`. The run doubles as a real-bundle smoke test (a
screenshot only appears if that feature rendered). Captures are login-free and
deterministic — a frozen Korean translation map, neutral "Academy" fixtures (no
Anthropic logo), and a composited "unofficial / not affiliated" disclaimer band
on every shot. (`assets/screenshots/*` README/marketing images are separate and
still hand-made.)

### 3. Upload to CWS dev console

Open https://chrome.google.com/webstore/devconsole/a4725d38-81e7-41f5-bf21-5c11fb825074

| Field | Value |
|---|---|
| Package upload | `store-assets/skillbridge-bundled.zip` ← drag this in |
| Listing title | `SkillBridge — AI Course Translator with in-page AI tutor` |
| Summary | paste from `store-assets/STORE_LISTING.md` "Summary" section |
| Description | paste from `store-assets/STORE_LISTING.md` "Description" section |
| Privacy policy URL | `https://heznpc.github.io/skillBridge/privacy` |
| Locale | **English only** — single CWS listing, shown to every user regardless of browser language (localized ko/ja listings were dropped to avoid drift) |
| Icon (128×128) | upload current `assets/icons/icon128.png` (half-sun + bridge). ⚠️ the **live listing still shows the OLD coral radial-spark icon** — the store-listing graphic is a separate asset from the package and must be re-uploaded here, or the infringing mark stays live. |
| Promo tile + screenshots | `store-assets/promo-tile-440x280.png` + `store-assets/01-translate.png`…`05-exam-safe.png` (regenerate with `npm run capture:store`) |

### 3b. Privacy tab (this is what blocked the last submit)

Open the "개인정보 보호 / Privacy practices" tab. The published v1.0.1 answers are
stale against v3.5.40 — fix these:

- **Privacy policy URL** — must be the **capital-B** `github.io` URL (see the
  Privacy-URL note above). The lowercase form 404s and the dashboard refuses to
  submit ("개인정보처리방침 링크에 연결할 수 없습니다").
- **"Are you using remote code?" → NO.** v1.0.1 loaded Puter.js from
  `https://js.puter.com/v2/` (remote code → MV3 detailed review / delay).
  v3.5.39+ bundles it as `src/bridge/puter.js` and loads it via
  `chrome.runtime.getURL` (`translator.js` sets `script.dataset.puterUrl =
  chrome.runtime.getURL('src/bridge/puter.js')`); there is no remote fallback
  (`page-bridge.js`: `if (!_puterUrl) reject`). So no remote code is loaded.
  **Only flip this to NO after the v3.5.40 package is uploaded** — answering NO
  while the published build still loads remote Puter would be a false statement.
  (Puter's runtime calls to `api.puter.com` are data transfer, not remote code —
  disclosed under data usage below.)
- **Data usage → check "Website content".** Page text is sent to Google
  Translate and lesson context (≤2,000 chars) is sent via Puter to Gemini/Claude.
  Leaving it unchecked while the description says page text is sent off-device is
  an inconsistency reviewers reject. Local-only data (bookmarks, resume,
  flashcards, settings — `chrome.storage.local`, never leaves the device) is
  NOT "collected", so location / browsing history / user activity stay unchecked.
  Keep the three confirmations checked (transfer to a service provider to perform
  the requested feature is an approved use case, not a sale).
- **Permission justifications** — paste from `STORE_LISTING.md` "Permission
  Justifications". v3.5.40 declares `storage` + `alarms` + four hosts
  (`*.skilljar.com`, `*.youtube.com`, `translate.googleapis.com`,
  `api.github.com`). The old `activeTab` / `tabs` justification fields disappear
  after upload (those permissions are no longer in the manifest); `alarms` and
  `api.github.com` are new and need a line each.

### 4. Flip CWS_PUBLICATION_PAUSED off (only if currently set)

```
gh variable list | grep CWS_PUBLICATION_PAUSED && gh variable delete CWS_PUBLICATION_PAUSED
```

The flag was added in PR #133 to prevent the CD workflow from publishing while
the trademark complaint was unresolved. If it's still set, CD will skip the
upload step; deleting it re-enables CD's CWS upload path on the next push.

If the variable is already absent, skip.

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

If Tracer / Anthropic IP enforcement files another complaint against v3.5.40:
1. Check whether it cites the icon (then return to step 1 option B/C) or the
   listing copy (then re-sweep `store-assets/STORE_LISTING*.md` for any
   residual brand-as-product-modifier phrasing).
2. Consider deeper rename (`SkillBridge — Skilljar AI-Course Translator` with
   `anthropic.skilljar.com` only in body, not title).
3. Open `chore/trademark-deeper-rename` branch and iterate.

## SNS launch (separate session, after listing is live)

SNS launch drafts are kept outside this repo (internal). Do not post until the
CWS listing reflects v3.5.40 — posting before would point users at a listing
missing all the work the post talks about.
