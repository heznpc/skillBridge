# SkillBridge TODO

> Strategy & scope: see [POSITIONING.md](POSITIONING.md).
> Last refreshed: 2026-06-01 (v3.5.39 — learning companion shipped; bridge/tutor scoped to anthropic.skilljar.com)

Items below are concrete engineering / ops work. Anything strategic — what
markets we enter, what we charge, what features we accept — belongs in
POSITIONING.md, not here.

The "Now" section tracks the [Blockers before outreach](POSITIONING.md#blockers-before-outreach)
gate — these have to clear before any Korea / Japan growth push or
Ambassador submission is worth the user-facing effort.

## Learning companion — local-only & free (shipped: v3.5.36–3.5.39)

Native Academy tracks enrollment/completion but skips learner conveniences:
no global resume, course-level bookmark only (with no list view anywhere),
no notes, no in-lesson navigation. Everything below is client-side,
`chrome.storage.local` only — no server, no paid API. Consequence: state is
device-local (no cross-device sync, which would need a server). Unlike
translation, these help **all** learners incl. English — audience isn't
narrowed.

- [x] **SRS scheduling for flashcards** (v3.5.36). Per-card due dates
  (box 0→1d / 1→3d / 2→7d) + "Review due (N)" mode. `chat-flashcards.js`.
- [x] **Lesson / position bookmarks** (v3.5.36). Mark a specific lesson +
  scroll position; bookmark list in the sidebar. `bookmarks.js`.
- [x] **Global resume ("이어보기")** (v3.5.36). Last-visited lesson + exact
  position tracked across courses (SPA-safe URL poll); Continue/Recent
  launcher in the sidebar. `resume.js`.
- [x] **"My learning" overlay** (v3.5.36). Bookmarks + Continue + Recent are
  grouped under the single "Tools" menu in the tutor header. `sidebar-chat.js`.
- [x] **In-lesson TOC + reading-progress bar** (v3.5.36). DOM-only, no storage.
  `reading-aid.js`.
- [ ] **Highlights / notes.** Per-lesson, local.
- [ ] (optional) **"Report wrong term"** — local queue + export. GitHub
  auto-link deferred (learner audience ≠ GitHub users).

### Excluded by the free + local-only constraint
- Cross-device sync of bookmarks/notes (needs a server) — device-local only.
- Multi-model picker via user API keys (breaks free / no-key). Claude via
  Puter.js stays the only model; free fallback only.
- Any server-side feature.

### Release / ops (v3.5.36–3.5.39)
- [x] Icon redesign (v3.5.35, on `main`) — distinct mark.
- [x] Bundle the features above into releases (v3.5.36–3.5.39, all on `main`):
  version bumps + `npm run docs` resync + PRs + `npm run build:bundle:zip`.
  `store-assets/skillbridge-bundled.zip` rebuilt at 3.5.39.
- [ ] **Upload the built zip to the CWS dashboard** (human-only). Store is
  stuck at 1.0.1; everything since is repo-only. See
  [store-assets/RELEASE_CHECKLIST.md](store-assets/RELEASE_CHECKLIST.md).

## Now (Ambassador / outreach blockers)

- [x] **Wire `ai-fluency-for-small-businesses` (18th course)** (v3.5.39).
  Mapped in `FLASHCARD_COURSE_MAP` to the shared `aiFluency` deck — the AI
  Fluency series share terminology, so it reuses the existing deck rather than
  a new `aiFluencySmallBiz` section (no dict gap). `check:academy` +
  `check:dict-coverage` both pass; the 12h drift cron is re-enabled.
- [ ] **CWS listing refresh — upload to dashboard.** Repo-side copy is ready:
  `store-assets/STORE_LISTING.md` rewritten on a global + engineering-craft
  framing (v3.5.39). **English-only, single listing** — localized ko/ja
  listings were dropped (every locale falls back to EN; hand-maintaining
  parallel copies caused course-count drift, see #158). Remaining work is
  human-only: paste summary/description, refresh screenshots, write the
  "What's new" entry, fix the privacy-tab items (see RELEASE_CHECKLIST 3b).
- [ ] **Trademark resolution.** We've been contacted about the name.
  Until either safe use is confirmed or we rebrand, public outreach is on
  hold. **Blocks Ambassador application and Korea-language blog posts** —
  a takedown after a growth push erases the acquisition we paid for.
  *(Owner: human, not engineering. Once decision is made, reflect in
  POSITIONING.md "Blockers before outreach" #2.)*
- [ ] **Ambassador application.** Drafted; submission blocked on
  trademark resolution. Free, single-audience, traction-demonstrated — we
  fit the program profile.
- [ ] **Anonymized opt-in telemetry** (promoted from Later). Marketing
  ROI is unmeasurable without it. Hard constraints from POSITIONING.md:
  off by default, explicit opt-in toggle in popup, error stacks only (no
  PII, no user content, no full URLs, no learning history), 30-day
  retention, user-purgeable. **Design proposal**:
  [docs/TELEMETRY_DESIGN.md](docs/TELEMETRY_DESIGN.md) — open for review
  before any code lands. Implementation is a separate PR. Blockers
  documented in the design doc itself (trademark, Cloudflare ownership,
  independent privacy review).
- [ ] **Smoke-test the latest CWS bundle in an actual Chrome.** The 16-
  scenario Playwright suite covers every documented README feature except
  YouTube subtitles (real iframe needed) and dark mode toggle (UI-only).
  A real-tab eyeball test on `dist/bundled` before each CWS push is still
  valuable for CSS / visual regressions the assertion-based suite doesn't
  see.

## Next (this month)

- ~~**CWS listing — multilingual translations.**~~ Dropped (v3.5.39): the CWS
  listing is English-only. Every locale falls back to EN, and hand-maintaining
  parallel localized listings caused drift (#158) for marginal per-market gain.
  The extension UI stays localized in 11 languages; only the store metadata is
  EN-only.
- [ ] **YouTube `_BG_YT_CLIENT_VERSION` auto-bump GH Action.** Currently
  manual every few weeks (see comment in `src/background/background.js`).
  Cron workflow that pings InnerTube and opens a PR when stale. Same
  pattern as the shipped `selectors-drift.yml` and `academy-courses-
  drift.yml` — easy to copy.
- [ ] **Performance budget E2E.** Measure time from page load → fully
  translated H1. Sets a regression detector for any future refactor that
  degrades cold-start. ~1h add to the suite.
- [ ] **Head-to-head comparison content** (post-trademark, post-CWS-
  refresh). Specifically: AI terminology fidelity and certification
  pass-rate impact vs Chrome built-in translate. Anchors the
  "certificate accessibility" framing with evidence. Blocked on telemetry
  for the pass-rate half.

## Later (when we have a real signal)

- [ ] **Memory leak profiling on long-running tabs.** v3.5.9 (stream
  cleanup) and v3.5.10 (timer leak) found two; the pattern suggests more.
  SPA navigation churn + Chrome heap snapshot diff. Probably needs a
  dedicated harness; the current E2E suite is functional, not memory-
  oriented.
- [ ] **`tsconfig` strict ratchet.** Currently `strict: false` to avoid
  surfacing pre-existing nullability warnings. Tighten file-by-file as
  JSDoc gets added.
- [ ] **Puter.js fallback layer** (only triggered by sunset condition,
  see POSITIONING.md). If Puter signals instability, we revisit the "no
  API key" rule. Design exists in head only; not started.

## Done — shipped this cycle (2026-05-11 → 05-15)

A burst of 18+ PRs cleared most of what the v3.5.6 → 3.5.12 hotfix train
had been signaling as missing infrastructure. The current state is "all
README-documented features locked by E2E, all v3.5.X regression classes
covered, all sidebar-chat big files split, positioning rewritten around
certificate-accessibility and Korea-first weighting."

**Refactors:**
- `sidebar-chat.js`: 1224 → 559 lines (–54%) split across 4 modules
  (`chat-render.js`, `chat-history.js`, `chat-flashcards.js`, plus core
  panel infrastructure)
- `content.js`: 1222 → ~869 lines, GT pipeline extracted to `gt-queue.js`
- Dead `_sb` namespace exports removed

**Tests (E2E):** Playwright suite from 0 → **16 scenarios across 11
specs**: `golden-translation` (4), `exam-mode` (2), `spa-navigation` (2),
`tutor-chat` (1), `stream-cancel` (1), `protected-terms` (1),
`chat-history` (1), `pdf-export` (1), `rapid-switch` (1), `code-comments`
(1), `idb-cache` (1), `lazy-translate` (1).

**Tests (unit):** +50 (336 → 386). Sanitizer (gemini-block.test.js, 25
cases), protected-terms hardening (+6), gt-queue, dict-coverage self-test,
etc.

**CI:** added `e2e` job (parallel workers — wall time ~1m for 16
scenarios). Added `selectors-drift` watcher (6h cron + auto-issued GitHub
issue on Skilljar DOM change). Added `academy-courses-drift` watcher (12h
cron + auto-issued issue when a new course slug appears on
`anthropic.skilljar.com/` that isn't wired into `FLASHCARD_COURSE_MAP` —
closes the last gap in POSITIONING.md pillar #3's 48-hour SLA). Added
`check-dict-coverage` + `check-i18n-keys` validators.

**Performance:** v3.5.32 IntersectionObserver-driven lazy translation
(X-style read-depth-proportional savings); v3.5.32-hotfix observer
generation closure-capture race fix.

**Strategy:** POSITIONING.md rewritten 2026-05-15 — certificate-
accessibility framing replaces translator framing, Korea-first
operational definition added, telemetry promoted from Later to Now as
marketing prerequisite, Puter.js fragility added to sunset triggers.

**Production fix:** v3.5.16 — `const sb = window._sb` hoisting bug that
386 unit tests had let through three releases. Found by the first run of
the new E2E suite.

## Explicit not-doing (see POSITIONING.md for reasoning)

- ❌ Multi-LMS / general course-platform support
- ❌ Premium / paid tier
- ❌ User-supplied API key
- ❌ Server-side features that break client-side privacy
- ❌ Full TypeScript migration — `tsconfig + checkJs` + JSDoc captures
  the 80% benefit; full migration cost outweighs the marginal compile-
  time gain for an MV3 extension with direct unpacked-load workflow

## Production bottlenecks to remember

- **Firefox AMO publishing** — `cd-firefox.yml` ready; needs `AMO_API_KEY`
  + `AMO_API_SECRET` in GitHub Secrets.
- **CWS reviewer expectations** — raw `src/` zip submission keeps reviews
  fast. If we ever switch to bundled-only output, expect slower reviews.
- **Anthropic Academy DOM stability** — selectors live in
  `src/lib/selectors.js`. `scripts/check-selectors.js` runs on every PR
  (`validate` job) AND on a 6h cron (`selectors-drift` workflow) — auto-
  opens an issue if Skilljar changes their DOM out from under us.
- **Anthropic Academy catalog drift** — the live course list at
  `anthropic.skilljar.com/` is the source of truth for which slugs need
  terminology coverage. `scripts/check-academy-courses.js` runs on a 12h
  cron (`academy-courses-drift` workflow) and auto-opens an issue listing
  any slug on the live page that isn't in `FLASHCARD_COURSE_MAP`. When
  you see this issue: add the per-language dictionary section first, THEN
  the map row — `check-dict-coverage` will fail otherwise.
- **MV3 extension content-script CSP** — forbids `eval` / `new Function`
  inside content scripts. The E2E harness bridges into the isolated world
  via a hard-coded menu of diagnostic ops (see `tests/e2e/helpers/
  extension.js`) — if you add a new op, add it to that switch, don't try
  to pass arbitrary functions through.
- **Puter.js single point of failure** — the tutor pillar depends on a
  third party we don't control. No mitigation today (would violate the
  "no API key" rule). Sunset trigger in POSITIONING.md covers what
  happens if Puter changes terms.
