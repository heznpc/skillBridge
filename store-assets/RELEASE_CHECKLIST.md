# Release Checklist — v3.5.39 re-publication

> Refreshed 2026-06-01 for v3.5.39. Since the last revision: the non-infringing
> icon shipped (v3.5.35), the learning-companion features + Tools menu landed
> (v3.5.36–3.5.39), and the page bridge / AI tutor was scoped to
> anthropic.skilljar.com. This is the source of truth for the next dashboard upload.

CWS listing status:
- Published: **v1.0.1** (uploaded 2026-03-10)
- Local: **v3.5.39**
- Many PRs (#135–#156) have landed since the published version — none have reached users yet
- `npm run check:cws-drift` intentionally fails until the dashboard is updated

The remaining publish steps cross trust boundaries the automation can't cross
(your hands on the dashboard, the icon design decision, the public-variable toggle).
Everything code-side is ready and pre-built.

## What's already prepared (no further action needed)

- ✅ `manifest.json` v3.5.39 + `package.json` + 11 `src/data/*.json` `_meta.version` all bumped
- ✅ `CHANGELOG.md` v3.5.34–3.5.39 sections written (PRs #135–#157 consolidated)
- ✅ `store-assets/skillbridge-bundled.zip` (minified, **rebuilt at v3.5.39** via `npm run build:bundle:zip`) — **this is the CWS upload artifact**
- ⚠️ `store-assets/skillbridge.zip` (raw source) — fallback only if the bundled
  build is rejected in review. **Run `npm run build:zip` immediately before
  uploading it** — this artifact is gitignored, is not rebuilt by
  `build:bundle:zip`, and will otherwise lag behind `manifest.json` (it was
  found stale at 3.5.38 once while the bundle was 3.5.39).
- ✅ All 11 Premium `_locales/*/messages.json` have `extDescription` nominative form
- ✅ Nominative-use sweep clean (`SkillBridge — AI Course Translator`, no Anthropic-as-product-modifier)
- ✅ Privacy URL `/privacy` (lowercase) — verified 200 from Googlebot UA
- ✅ Tests 488/488 + 17 e2e, ESLint + Prettier clean, all check-* scripts clean (incl. `check:academy`)
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

### 2. Re-capture screenshots (only if you re-designed the icon)

If the icon changed, the screenshots that include the toolbar icon need refresh:
- `assets/screenshots/01-lesson-translated.png`
- `assets/screenshots/catalog-translated.png`
- `assets/screenshots/skillbridge-demo.gif`
- `store-assets/screenshot-01-lesson.png`
- `store-assets/screenshot-02-catalog.png`

Lesson body / Skilljar header — no Anthropic logo blur needed; the rename + URL-
anchor sweep handled the trademark exposure on that front.

### 3. Upload to CWS dev console

Open https://chrome.google.com/webstore/devconsole/a4725d38-81e7-41f5-bf21-5c11fb825074

| Field | Value |
|---|---|
| Package upload | `store-assets/skillbridge-bundled.zip` ← drag this in |
| Listing title | `SkillBridge — AI Course Translator with in-page AI tutor` |
| Summary | paste from `store-assets/STORE_LISTING.md` "Summary" section |
| Description | paste from `store-assets/STORE_LISTING.md` "Description" section |
| Privacy policy URL | `https://heznpc.github.io/skillBridge/privacy` |
| Korean listing | paste from `store-assets/STORE_LISTING-ko.md` |
| Japanese listing | paste from `store-assets/STORE_LISTING-ja.md` |
| Icon (128×128) | upload current `assets/icons/icon128.png` |
| Promo tile + screenshots | upload current set (no change unless step 2 ran) |

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

If Tracer / Anthropic IP enforcement files another complaint against v3.5.39:
1. Check whether it cites the icon (then return to step 1 option B/C) or the
   listing copy (then re-sweep `store-assets/STORE_LISTING*.md` for any
   residual brand-as-product-modifier phrasing).
2. Consider deeper rename (`SkillBridge — Skilljar AI-Course Translator` with
   `anthropic.skilljar.com` only in body, not title).
3. Open `chore/trademark-deeper-rename` branch and iterate.

## SNS launch (separate session, after listing is live)

Drafts are queued in `store-assets/promotion/` (see `x-thread-italian.md` and
`plugin-directory-submission.md`). Do not post until the CWS listing reflects
v3.5.39 — posting before would point users at a listing missing all the work
the post talks about.
