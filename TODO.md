# SkillBridge TODO

> Last refreshed: 2026-07-11 (next CWS release, version pending)

Items below are concrete engineering / ops work. Anything strategic — what
markets we enter, what we charge, what features we accept — is an owner
decision made directly, not tracked here.

The top board tracks the remaining work before a newly versioned CWS candidate
can replace the live legacy v1.0.1. The existing `v3.5.41` tag predates the
current privacy/package changes and must not be reused for the upload.

## Service completion board (next CWS version pending)

### P0 — must close before public release

- [x] **Raw developer path: Gemini verification model record.**
  Audited 2026-06-24: `gemini-2.0-flash` (the runtime default in
  `src/lib/constants.js`, used for verify/translate) is still **active** on Puter,
  not retired (Puter's own model page shows no deprecation). The original framing
  here — "retired primary, swap it" — was an *unverified premise* (its own DoD
  said "after a real Puter acceptance smoke confirms the exact model id", and no
  such smoke had run). The real defect was the **fallback**: `gemini-1.5-flash`
  (in the page-bridge allowlist + `_MODEL_FALLBACKS`) was shut down — the whole
  Gemini 1.5/1.0 line 404s now — so it gave zero resilience if the primary were
  ever rejected. Fixed by pointing the fallback at the live same-generation
  `gemini-2.0-flash-lite`; primary stays `gemini-2.0-flash`. This is historical
  evidence for the optional raw developer path, not CWS release evidence: the
  next CWS package disables the AI gateway and omits Puter.

- [ ] **Optional raw-developer Puter smoke (not a CWS release gate).** The CWS
  E2E suite loads only `dist/bundled`, where AI is disabled and Puter/page bridge
  files are omitted. If the raw AI path is maintained later, give it a separate,
  explicit remote-code-aware harness that sends only synthetic prompts and
  classifies auth/network/model failures. Do not use that path as CWS evidence.

- [~] **PR the E2E runner stabilization.** The five-stable-batch runner in
  `scripts/run-e2e.js` is now PR'd (#241, runner-only); local `npm run test:e2e`
  is green. Awaiting CI `e2e` job + merge.
  - DoD: runner-only PR, local `npm run test:e2e` green, `git diff --check`
    green, GitHub `e2e` job green.

- [ ] **Run pre-release dictionary QA.** Before every store submission, run one
  reviewer pass per 12 premium dictionaries, verify findings against
  `src/data/*.json`, fix only confirmed semantic errors, stamp
  `_meta.lastAudited`, and run `npm run docs`.
  - DoD: README QA table reflects the refreshed audits; structural gates still
    pass after semantic fixes.
  - Verify: `npm run glossary`, `npm run validate`,
    `npm run check:dict-coverage`, `npm run check:locales`, `npm run docs`.

- [ ] **Build, smoke, and freeze the upload artifact.** Regenerate the bundled
  extension immediately before upload, then run the real-bundle release smoke.
  - DoD: `dist/bundled` is fresh, first-user smoke passes, bundled zip is
    rebuilt, and generated store assets match the current icon/listing state.
  - Verify: `npm run release:smoke`, then `npm run release:verify` before the
    final upload window.

- [ ] **Assign a new version, upload the bundled CWS candidate, and fix the
  privacy tab.** The public listing is still legacy `v1.0.1`; `v3.5.41` cannot
  identify the current change set. After external scope approval, bump to a new
  version, run `npm run release:verify`, generate only
  `store-assets/skillbridge-bundled.zip`, refresh listing copy/media, set the
  capital-B privacy URL, answer remote code = NO only after inspecting that exact
  uploaded package, check Website content, and paste current permission
  justifications.
  - Owner-only: CWS dashboard access, privacy-practices form, review wait.
  - DoD: CWS review submitted/accepted and `npm run check:cws-drift` no longer
    fails for version drift.

### P1 — quality gates before/around submission

- [ ] **Regenerate and inspect store assets.** Run `npm run capture:store` or
  the "Capture store assets" workflow, inspect screenshots/promo tile/listing
  description, then upload the media to the store listing.
- [ ] **Manual real-tab bundled-extension smoke.** Load `dist/bundled` in
  Chrome and check popup startup, translation, language switch, flashcards,
  bookmarks/recent/dashboard, exam-safe disable, dark mode, the known manual
  YouTube-caption gap, and that no Tutor/Puter request or page bridge appears.
- [ ] **Keep the publication pause.** Do not remove
  `CWS_PUBLICATION_PAUSED` during code cleanup or dashboard draft preparation.
  Only after external scope approval, a newly versioned ZIP passes all gates,
  and listing/media/privacy fields match should the owner set
  `CWS_DASHBOARD_READY_VERSION` and separately authorize unpausing publication.
- [x] **CWS CD upload action on the current pinned path.** The workflow uses
  `mnao305/chrome-extension-upload` v6.0.0 with the dashboard-ready and
  target-listing guards still in place. Re-check this only when the action or
  Chrome Web Store API announces a new migration window.

### P2 — service quality after the store build is live

- [ ] **Telemetry / feedback-loop decision.** The telemetry doc is still a
  proposal, and the sink decision is unresolved because server-side telemetry
  conflicts with the public no-backend constraint. Decide between local export,
  opt-in error reporting, or no telemetry; update privacy copy in the same PR
  if anything ships.
- [x] **Performance budget E2E.** Measure visible H1/body translation and
  below-fold lazy translation against declared CI-safe budgets
  (`tests/e2e/performance-budget.spec.js`).

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
  grouped under the single "Tools" menu in the sidebar header. `sidebar-chat.js`.
- [x] **In-lesson TOC + reading-progress bar** (v3.5.36). DOM-only, no storage.
  `reading-aid.js`.
- [ ] **Highlights / notes.** Per-lesson, local.
- [ ] (optional) **"Report wrong term"** — local queue + export. GitHub
  auto-link deferred (learner audience ≠ GitHub users).

### Excluded by the free + local-only constraint
- Cross-device sync of bookmarks/notes (needs a server) — device-local only.
- Multi-model picker via user API keys (breaks free / no-key). The next CWS
  candidate exposes no Tutor or AI model. The optional Puter path remains only
  in raw developer source and is outside the CWS product boundary.
- Any server-side feature.

### Release / ops (feature train)
- [x] Icon redesign (v3.5.35, on `main`) — distinct mark.
- [x] Bundle the features above into releases (v3.5.36–3.5.41, all on `main`):
  version bumps + `npm run docs` resync + PRs + `npm run build:bundle:zip`.
  `store-assets/skillbridge-bundled.zip` rebuilt at 3.5.41.
- [ ] **Complete the service-completion board above before dashboard upload.**
  Store is stuck at 1.0.1; everything since is repo-only. See
  [store-assets/RELEASE_CHECKLIST.md](store-assets/RELEASE_CHECKLIST.md).

## Outreach blockers (after store refresh)

- [ ] **Trademark resolution.** We've been contacted about the name.
  Until either safe use is confirmed or we rebrand, public outreach is on
  hold. **Blocks Ambassador application and Korea-language blog posts** —
  a takedown after a growth push erases the acquisition we paid for.
  *(Owner: human, not engineering.)*
- [ ] **Ambassador application.** Drafted; submission blocked on
  trademark resolution. Free, single-audience, traction-demonstrated — we
  fit the program profile.

## Next (this month)

- ~~**CWS listing — multilingual translations.**~~ Dropped (v3.5.39): the CWS
  listing is English-only. Every locale falls back to EN, and hand-maintaining
  parallel localized listings caused drift (#158) for marginal per-market gain.
  The in-product UI stays localized in 12 premium languages (and the browser-facing
  extension name/description in the 33 `_locales/` Chrome-metadata locales); only the
  Chrome Web Store *listing copy* (screenshots / long description) is EN-only.
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
- [ ] **Raw-developer Puter fallback decision** (only if that optional path is
  maintained). This cannot broaden the CWS candidate: any replacement must stay
  behind the developer build boundary unless its code, privacy, and store-policy
  implications are reviewed as a separate product-scope decision.

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
closes the last gap in the 48-hour terminology SLA). Added
`check-dict-coverage` + `check-i18n-keys` validators.

**Performance:** v3.5.32 IntersectionObserver-driven lazy translation
(X-style read-depth-proportional savings); v3.5.32-hotfix observer
generation closure-capture race fix.

**Strategy:** POSITIONING.md rewritten 2026-05-15 (doc removed 2026-07-02 — strategy is owner-decided, not doc-tracked) — certificate-
accessibility framing replaces translator framing, Korea-first
operational definition added, telemetry promoted from Later to Now as
marketing prerequisite, Puter.js fragility added to sunset triggers.

**Production fix:** v3.5.16 — `const sb = window._sb` hoisting bug that
386 unit tests had let through three releases. Found by the first run of
the new E2E suite.

## Explicit not-doing

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
- **CWS reviewer expectations** — upload only the output of
  `npm run build:bundle:zip` (`store-assets/skillbridge-bundled.zip`). The raw
  developer ZIP is deliberately separate and is never a CWS artifact.
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
- **Puter.js developer-path risk** — the optional raw developer AI path depends
  on a third party and contains lazy remote-code paths. It is disabled and
  omitted from the next CWS package; do not let it re-enter the CWS artifact.
