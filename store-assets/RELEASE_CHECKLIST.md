# Release Checklist — Re-publication after icon redesign

Code-side prep is finished in this PR. The remaining steps require your hands (icon design + CWS dashboard + repo variable toggle) because they cross trust boundaries the automation can't cross.

## What this PR already does

- ✅ Extension name: `SkillBridge — AI Course Translator` (no "Anthropic" in name)
- ✅ All 33 `_locales/<lang>/messages.json` `extDescription` rewritten to nominative-use form (URL `anthropic.skilljar.com` + descriptive nouns; no brand-as-product-modifier)
- ✅ `README.md`, `store-assets/STORE_LISTING*.md` (en/ko/ja), `docs/index.html`, `docs/privacy.html`, `PRIVACY_POLICY.md`, `CONTRIBUTING.md`, source-file headers — all swept to nominative use
- ✅ Privacy URL in store listings updated to `https://heznpc.github.io/skillBridge/privacy` (verified 200 OK from Googlebot UA)
- ✅ Disclaimer expanded: "independent project, not affiliated with Anthropic or Skilljar, all trademarks belong to respective owners"
- ✅ Code audit follow-ups landed (V1/V3/V5/V9/V14/V15 + test quality)
- ✅ Tests 446/446, eslint clean, prettier clean

## What you need to do before flipping the publish switch

### 1. Replace the icon (4 PNGs in `assets/icons/`)

Current files contain the design that triggered the trademark complaint (Anthropic Claude logo similarity). Replace all four:

- `assets/icons/icon16.png` (16×16)
- `assets/icons/icon32.png` (32×32)
- `assets/icons/icon48.png` (48×48)
- `assets/icons/icon128.png` (128×128) — the one CWS shows in the listing

**Design constraints**:
- Zero similarity to Claude's design mark: avoid orange (#cc785c family), 8-point star, octagonal frame, minimal geometric mark
- Distinct identity rooted in "translation / bridge / education" motifs (book + globe, two halves bridging, multilingual letterforms, etc.)
- Same file paths; the build script reads from these names

### 2. Recapture / blur screenshots (`assets/screenshots/` + `store-assets/`)

Files that may visually contain the Claude logo or "Anthropic Academy" branding in the page chrome being demonstrated:

- `assets/screenshots/01-lesson-translated.png` — likely shows the Anthropic Academy header
- `assets/screenshots/catalog-translated.png` — likely shows the course catalog header
- `assets/screenshots/skillbridge-demo.gif` — animation; whatever it captures
- `store-assets/screenshot-01-lesson.png`, `store-assets/screenshot-02-catalog.png` — same review

**Two options per screenshot**:
- (a) Blur or crop out the Anthropic logo in the page chrome; keep the lesson/catalog body visible
- (b) Re-capture against a placeholder page (e.g., a forked Skilljar sandbox without the header logo)

Option (a) is faster; (b) is cleanest.

### 3. Update CWS dev console fields

Open https://chrome.google.com/webstore/devconsole/a4725d38-81e7-41f5-bf21-5c11fb825074

| Field | New value |
|---|---|
| Listing title | `SkillBridge — AI Course Translator with in-page AI tutor` |
| Summary | (paste from `store-assets/STORE_LISTING.md` "Summary" section) |
| Description | (paste from `store-assets/STORE_LISTING.md` "Description" section) |
| Privacy policy URL | `https://heznpc.github.io/skillBridge/privacy` ← **fix the 404 here** |
| Korean listing | (paste from `store-assets/STORE_LISTING-ko.md`) |
| Japanese listing | (paste from `store-assets/STORE_LISTING-ja.md`) |
| Icon (128×128) | upload new `assets/icons/icon128.png` |
| Promo tile + screenshots | upload new versions |

### 4. Bump version + push

Once icon + dashboard updates are in, bump `manifest.json` `version` (e.g., `3.5.33` → `3.5.34`), push to `main`. The release workflow will auto-tag and the CD workflow will...

### 5. Flip CWS_PUBLICATION_PAUSED off

CD is currently gated by repo variable `CWS_PUBLICATION_PAUSED=true` (the guard added in PR #133). Re-enable:

```
gh variable delete CWS_PUBLICATION_PAUSED
```

Next push (or manual `gh workflow run cd.yml`) will then upload to CWS.

### 6. After upload — CWS review wait

Typical 1-3 business days. Track at the dev console "Status" tab.

## If trademark complaint comes back

If Tracer or Anthropic IP enforcement files another complaint against the new version, **the issue is probably not the icon anymore** — it's the name or copy. In that case:
- Review `store-assets/STORE_LISTING*.md` for any remaining brand-claim language
- Consider deeper rename (e.g., to `SkillBridge — Skilljar Course Translator`, dropping the `anthropic.skilljar.com` URL from the title and moving it to body-only)
- Open a `chore/trademark-deeper-rename` branch and iterate

## SNS launch (separate session)

After CWS is live again, draft SNS posts in a separate session. Targets you mentioned:
- Velog / Disquiet / GeekNews (Korean)
- X.com (English)
- Anthropic Ambassador application (now eligible since the listing is back)

Anthropic's Claude account does amplify developer stories. Tag `@AnthropicAI` / `@claudeai` and use `#Claude` `#ClaudeCode` `#AnthropicAcademy` hashtags judiciously.
