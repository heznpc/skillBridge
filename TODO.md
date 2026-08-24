# SkillBridge TODO

> Last refreshed: 2026-08-24 (next CWS release: v4.0.0)

Items below are concrete engineering / ops work. Anything strategic — what
markets we enter, what we charge, what features we accept — is an owner
decision made directly, not tracked here.

The top board tracks the remaining work before a newly versioned CWS candidate
can replace the live legacy v1.0.1. The existing `v3.5.41` tag predates the
current privacy/package changes and must not be reused for the upload.

## Service completion board (next CWS version: v4.0.0)

### P0 — must close before public release

- [x] **Raw developer path: Gemini verification model record.**
      Audited 2026-06-24: `gemini-2.0-flash` (the runtime default in
      `src/lib/constants.js`, used for verify/translate) is still **active** on Puter,
      not retired (Puter's own model page shows no deprecation). The original framing
      here — "retired primary, swap it" — was an _unverified premise_ (its own DoD
      said "after a real Puter acceptance smoke confirms the exact model id", and no
      such smoke had run). The real defect was the **fallback**: `gemini-1.5-flash`
      (in the page-bridge allowlist + `_MODEL_FALLBACKS`) was shut down — the whole
      Gemini 1.5/1.0 line 404s now — so it gave zero resilience if the primary were
      ever rejected. Fixed by pointing the fallback at the live same-generation
      `gemini-2.0-flash-lite`; primary stays `gemini-2.0-flash`. This is historical
      evidence for the optional raw developer path, not CWS release evidence: the
      v4.0.0 CWS package ships the AI Tutor and the bundled Puter client.

- [x] **Separate raw-developer Puter evidence from the CWS runtime.** The v4 CWS
      E2E suite now exercises the bundled Tutor through its isolated content broker;
      the retired page-world bridge and extension-origin frame are absent from
      `dist/bundled`. The repository's
      raw vendored SDK remains maintenance input, not an upload artifact or CWS
      runtime-evidence substitute.

- [x] **PR the E2E runner stabilization.** PR #241 merged as `e36008b` with its
      `e2e` and other required checks green. The current runner now covers all specs
      in eight resource-bounded batches; local `npm run test:e2e` is green.
  - DoD: runner-only PR, local `npm run test:e2e` green, `git diff --check`
    green, GitHub `e2e` job green.

- [x] **Run pre-release dictionary QA.** _(12 of 12 done 2026-07-28)_
      A rule-based `subagent` term pass plus the four confirmed reviewer fixes
      landed across all 12 locales, and every structural gate passes. Full
      per-entry semantic review is complete for **pt-BR, ru, vi, id, ko, ja,
      zh-CN, zh-TW, es, fr, it, and de**; all 12 carry
      `_meta.lastAudited = 2026-07-28` after confirmed findings were applied.
  - DoD: README QA table reflects the refreshed audits; structural gates still
    pass after semantic fixes.
  - Verify: `npm run glossary`, `npm run validate`,
    `npm run check:dict-coverage`, `npm run check:locales`, `npm run docs`.

- [x] **Build, smoke, and freeze the upload artifact.** _(Refreshed 2026-08-11
      — the 2026-07-29 freeze below predates this session's `notes.js` /
      `term-reports.js` additions and was stale.)_ `npm run release:verify`
      re-run clean: full Jest suite + all 8 E2E batches green (incl. the new
      `notes.spec.js`/`term-reports.spec.js`, the malicious Puter-query
      stored-token regression, and the live-Ollama batch skipping as expected
      with no local server). The ZIP is now **114 files / 724,597 bytes /
      SHA-256 `a1c6803b0a63e1eb463e0c75623a393590c0c1f821fd9e8e18f0b5db920f91eb`**
      — file count moved from 69 to 114 because this recount includes the
      per-locale directory entries the earlier count skipped, not new
      content; the actual new content is the two feature modules plus their
      manifest/constants/CSS wiring. Extracted archive still diffs
      byte-for-byte against `dist/bundled`, `check-rhc` clean on both. Promo
      assets were not regenerated this pass (no visual/listing change since
      2026-07-29) — re-run `npm run capture:store` only if screenshots need
      to show the new Notes/Reports panels before upload.
  - DoD: `dist/bundled` is fresh, first-user smoke passes, bundled zip is
    rebuilt, and generated store assets match the current icon/listing state.
  - Verify: `npm run release:smoke`, then `npm run release:verify` before the
    final upload window.

- [ ] **Upload the v4.0.0 bundled CWS candidate and fix the privacy tab.** The
      public listing is still legacy `v1.0.1`; `v3.5.41` does not identify the
      current change set. After external scope approval, run `npm run release:verify`, generate only
      `store-assets/skillbridge-bundled.zip`, refresh listing copy/media, set the
      capital-B privacy URL, answer remote code = NO only after inspecting that exact
      uploaded package, select every data category listed in
      `store-assets/RELEASE_CHECKLIST.md`, and paste current permission
      justifications.
  - Owner-only: CWS dashboard access, privacy-practices form, review wait.
  - DoD: CWS review submitted/accepted and `npm run check:cws-drift` no longer
    fails for version drift.

### P1 — quality gates before/around submission

- [x] **Regenerate and inspect store assets.** Run `npm run capture:store` or
      the "Capture store assets" workflow, inspect screenshots/promo tile/listing
      description, then upload the media to the store listing. Regenerated and
      visually inspected the five screenshots and promo tile on 2026-07-29; upload
      remains part of the dashboard step.
- [ ] **Manual real-tab bundled-extension smoke.** _(Partially done 2026-08-11
      — real Chrome, real logged-in Skilljar account, real Puter-backed
      response, driven live via claude-in-chrome.)_ Confirmed working: page
      translation (Claude 101, full Korean), sidebar Tutor open, all 8
      Tools-menu items render correctly localized including the two new
      ones (**Notes** and **Reports** — composed, saved, listed, exported,
      removed, end to end on the real account, test data cleaned up
      afterward), Bookmarks panel opens, dark mode toggles the whole
      surface including the sidebar, and a real chat message got a real
      streamed Claude response with course-context injection (mentioned
      the actual 85%-complete progress) and correct markdown rendering.
      Still not checked: flashcards, dashboard, recent-lessons, PDF export
      detail behavior, exam-safe disable, the known manual YouTube-caption
      gap, local/off Tutor engine switching, and the host-page transport-
      forgery check (that one has automated E2E coverage already —
      `tutor-chat.spec.js` — but not a fresh manual pass this session).
      Load `dist/bundled` in Chrome to close out the rest.
- [ ] **Keep the publication pause.** Do not remove
      `CWS_PUBLICATION_PAUSED` during code cleanup or dashboard draft preparation.
      Only after external scope approval, a newly versioned ZIP passes all gates,
      and listing/media/privacy fields match should the owner set
      `CWS_DASHBOARD_READY_VERSION` and separately authorize unpausing publication.
- [x] **CWS CD upload action on the current pinned path.** The workflow uses
      `mnao305/chrome-extension-upload` v6.0.0 with the dashboard-ready and
      target-listing guards still in place. Re-check this only when the action or
      Chrome Web Store API announces a new migration window.

### P1.5 — post-4.0.0 follow-ups (accepted at submission, 2026-07-30)

Residual gaps from the pre-merge review (PR #276). None are release blockers —
each failure mode converges on a visible tutor error, not silent data loss —
but they are the honest boundary of what was verified.

- [ ] **Live first-run sign-in verification.** The on-device round trip used an
      already-signed-in Puter session. Verify the full first-run path on the shipped
      build (sign-in card → popup → token persist → streamed answer), including one
      deliberately slow (>90s) sign-in to exercise the keepalive relay for real.
- [ ] **Forced-401 recovery drill.** Revoke the token mid-session (Puter
      dashboard) and confirm the broker's re-sign-in loop and the init capture
      filter behave against the _real_ SDK's 401 auth dialog, not the test fakes.
- [x] **v3.5.41 → 4.0.0 upgrade-path test.** _(Verified 2026-08-10 — already
      resolved, this entry was stale.)_ `tests/e2e/upgrade-from-legacy.spec.js`
      covers this, deliberately against 1.0.1 instead of the literal 3.5.41:
      the CWS listing has served 1.0.1 since 2026-03-10 and 3.5.41 was never
      published (see the changelog header note), so 1.0.1 → 4.0.0 is the path
      every real install takes. Confirmed passing (`npx playwright test
  tests/e2e/upgrade-from-legacy.spec.js`, 5/5): legacy settings survive
      and the welcome banner stays suppressed (no re-onboarding into
      SkillBridge itself), the page-world `puter.*` localStorage keys v1.0.1
      left behind are scrubbed without touching unrelated host keys, the v1
      cache is dropped via the version-2 schema bump rather than silently
      reused, and — by design, not oversight — no Puter tutor session is
      inherited from the scrubbed legacy token, so the upgrader meets the
      sign-in card once on their first tutor question rather than the
      untrusted page-readable token being trusted.
- [x] **Sidebar `_currentEngine()` display-only fail-open.** _(Verified
      2026-08-10 — already resolved, this entry was stale.)_ Resolved via the
      "document why not" branch, not alignment: the two functions differ in
      one word on purpose (translator's `_getAiEngine()` timeout rejects —
      fail closed, it gates what leaves the machine; the sidebar's
      `_currentEngine()` timeout resolves — fail open, it only picks which
      offline explanation to show, and the send path re-reads the preference
      through the fail-closed gate regardless). `tests/local-engine.test.js`
      ("only the send-path gate fails closed; the offline-notice helper does
      not") locks the asymmetry and asserts the rationale comment is present,
      so aligning them would break a passing test as well as reintroduce the
      cloud-fail-open risk the asymmetry exists to prevent.
- [x] **Local format gate.** _(2026-08-10)_ Added `.githooks/pre-push`
      (mirrors CI's `Check formatting` step: `prettier --check` over the same
      globs) plus a `prepare` script in `package.json` that runs
      `git config core.hooksPath .githooks` on `npm install`, so a
      contributor's push is blocked locally before CI ever sees the drift.

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
- [x] **Notes.** _(2026-08-10)_ One free-text note per lesson (de-duped by
      URL like bookmarks — saving again edits in place, saving blank deletes),
      local-only under `sb_notes`. New "Notes" Tools-menu panel mirrors
      `bookmarks.js`'s panel/list pattern; compose row reuses the chat
      input/send styling. `notes.js`. True inline text-range highlighting
      (anchoring a mark to a DOM range that survives translation-DOM
      reconciliation and SPA re-renders) is a materially harder problem and
      was deliberately not attempted here — this covers the "per-lesson,
      local note-taking" half of the original bullet, not arbitrary passage
      highlighting.
- [x] **"Report wrong term"** _(2026-08-10)_ — append-only local queue under
      `sb_term_reports` (unlike bookmarks/notes, not de-duped by URL: one
      lesson can have several distinct wrong terms flagged). New "Reports"
      Tools-menu panel: compose captures the mistranslated text plus an
      optional correction/note; export downloads the queue as JSON via a
      client-side Blob + `<a download>` (no `chrome.downloads` permission —
      matches `pdf-export.js`'s existing no-extra-permission stance).
      GitHub auto-link stays deferred, as scoped (learner audience ≠ GitHub
      users) — this is a self-serve queue the user reviews/exports
      themselves. `term-reports.js`.

### Excluded by the free + local-only constraint

- Cross-device sync of bookmarks/notes (needs a server) — device-local only.
- User-supplied API keys or a broad multi-model picker (breaks free / no-key).
  The v4 CWS candidate instead offers one bundled cloud Tutor path through
  Puter, one user-run local OpenAI-compatible endpoint, and an off mode.
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
      _(Owner: human, not engineering.)_
- [ ] **Ambassador application.** Drafted; submission blocked on
      trademark resolution. Free, single-audience, traction-demonstrated — we
      fit the program profile.

## Next (this month)

- ~~**CWS listing — multilingual translations.**~~ Dropped (v3.5.39): the CWS
  listing is English-only. Every locale falls back to EN, and hand-maintaining
  parallel localized listings caused drift (#158) for marginal per-market gain.
  The in-product UI stays localized in 12 premium languages (and the browser-facing
  extension name/description in the 33 `_locales/` Chrome-metadata locales); only the
  Chrome Web Store _listing copy_ (screenshots / long description) is EN-only.
- [ ] **Head-to-head comparison content** (post-trademark, post-CWS-
      refresh). Specifically: AI terminology fidelity and certification
      pass-rate impact vs Chrome built-in translate. Anchors the
      "certificate accessibility" framing with evidence. Blocked on telemetry
      for the pass-rate half.

## Claude Academy investigation board (opened 2026-08-22)

Anthropic opened `academy.claude.com` on 2026-08-20 (in the Claude-app
profile menu). Verified 2026-08-22 against the live site and the official
FAQ (`academy.claude.com/help/faq`): it is a separate system from Skilljar
(FAQ's own words), signs in with the Claude account, does NOT auto-carry
Skilljar progress (email-match import, gradual rollout), and partner /
third-party learners stay on Skilljar "for now". Both platforms are live in
parallel; the same courses exist on both. SkillBridge's manifest does not
match `academy.claude.com`, so nothing injects there today.

Measured facts (2026-08-22, laptop + live site — re-verify before relying):

- Official localization: exactly 7 locales — en, es, fr, ja, ko, zh-CN,
  zh-TW (GET probe on `/{locale}/all`; HEAD lies — returns 404 on locales
  that GET serves. zh-TW was misreported as unsupported this way once).
- Locale-prefixed pages are CSR shells (~16 KB); the UNPREFIXED paths are
  SSR (~645 KB for `/all`) and negotiate on Accept-Language. Snapshot /
  scraping work must use unprefixed + `Accept-Language: en`, then verify
  the response really is English (fail closed — negotiation policy can
  change).
- Lesson bodies sampled on /ko are officially localized; lesson titles and
  several course-page sections are still English (mixed pages).
- Displayed totals are NOT stable contracts: same catalog shows
  "289 resources" (SSR), "357 resources" (hydrated DOM), 22 courses
  (filter). Vertex course card says "66 lessons · 9 quizzes" while its DOM
  has 67 lesson units + 8 quiz units. Never assert on displayed counts;
  diff course/section/unit structure instead.
- `building-with-the-claude-api` vs Skilljar `claude-with-the-anthropic-api`:
  core lessons are 1:1 down to kebab-cased slugs; Academy PRUNED the intro
  section (3), all exercises (5), the satisfaction survey, "MCP review",
  and the wrap-up. Nothing new added. Sibling courses diverge though —
  Vertex has `the-batch-tool` / `tools-for-structured-data`, absent from
  the API course.
- ko dictionary (1,087 keys, all sections flattened by translator.js):
  0% exact hit on 116 Academy body blocks (expected — it is a title/phrase
  memory, not a body dictionary), but only 10% hit on the 67 CURRENT lesson
  titles, which are the same strings Skilljar shows today. The curated
  course sections were already stale against live Skilljar — this is
  translation-memory drift, not an Academy migration problem. 28% of body
  blocks contain protected terms; masking + pipeline is the durable asset.

### Now — concrete, not blocked on any decision

- [x] **Skilljar curriculum snapshot, captured NOW.** _(v2, 2026-08-24 —
      `snapshots/skilljar/anthropic.skilljar.com-2026-08-24.json`: 21 courses,
      453 units, numericId on 453/453, plus `sources/` holding all 21 reduced
      curricula so the JSON is re-derivable without the live site. `scripts/capture-skilljar-snapshot.js` + a committed HTML fixture and parser regression tests, so the parser
      stays verifiable after the source is gone. Note for the migration
      matcher: `ai-fluency-for-creative-work` exists on Skilljar but NOT in
      Academy's 22, and unit counts differ a lot per course — Skilljar's API
      course has 85 units vs Academy's 76.)_ Time-sensitive:
      Skilljar lesson URLs are numeric (`/course-slug/287728` — the shape
      `resume.js` LESSON_PATH matches). Any future migration of stored
      notes/bookmarks/recent to canonical lesson identity needs the
      numericId ↔ title/order mapping, and Skilljar is the side that can
      disappear. Capture all course curricula (sections, unit titles,
      numeric ids, order) into a committed JSON snapshot while the site is
      up. This is insurance even if Academy support is declined.
      _Review verdict (external, 2026-08-24, post-#318): the DATA is accepted
      as the archival baseline. Remaining issues are capture-tool robustness,
      tracked below — none require another re-capture while the snapshot
      still re-derives from `sources/`._
- [ ] **Snapshot capture: transactional publish.** _(P1 follow-up from the
      #318 review.)_ "Unexpected failure writes nothing" is only true of the
      JSON today: `sources/*.html` are overwritten mid-loop, per course, so a
      failed re-run can leave `sources/` half-updated (capture B) next to a
      kept JSON (capture A) in the working tree — breaking the "JSON is
      re-derivable from the committed archive" invariant locally, before any
      commit. Write JSON + sources into a temp dir, validate the whole set
      (including the reparse-equality cross-check), then atomically swap into
      place. Build this as a SHARED transactional-writer helper: the Academy
      extractor must use the same failure semantics from day one instead of
      copying #318's shape.
- [ ] **`parseSlugs` host coupling vs `--tenant`.** _(P2 follow-up.)_ The
      shared catalog parser hard-codes `anthropic.skilljar.com` for absolute
      URLs, while the capture CLI advertises a generic `--tenant`. A tenant
      that renders absolute links would silently lose its courses. Either
      make `parseSlugs(html, expectedHost)` host-parametric (preferred —
      anthropic-partners.skilljar.com is a plausible future capture) or drop
      the `--tenant` flag and name the script Anthropic-only.
- [ ] **Archive checksum vs fetch fingerprint.** _(P3 follow-up.)_
      `sourceFingerprint` is the sha256 of the FULL fetched HTML, but the
      committed archive is `reduceFixture(html)` — different bytes, so the
      recorded hash is a fetch provenance, not the archive's checksum, and
      the code comment currently implies otherwise. Add `archiveFingerprint`
      (sha256 of the reduced file) beside it, keep both. Semantic integrity
      is already covered by the reparse-equality test; this closes byte-level
      provenance.
- [ ] **Academy curriculum snapshot extractor.** Same JSON shape as above,
      platform: claude-academy. Observation only — slugs/titles/sections/
      unit kind/order as the site shows them; NO canonical ids inside the
      snapshot (identity policy belongs to the mapper, not the extractor).
      Unprefixed URL + `Accept-Language: en` + fail-closed English check
      (html lang + a known sentinel string). Diff on structure changes
      (course/section/unit add/remove/rename/move/kind-change), never on
      displayed totals. Golden fixtures: the API course (76 units) and the
      Vertex course (76 units, catalog card disagrees — good negative
      fixture for the "no displayed counts" rule). Structure it as
      fetch → temp archive → parse → full validation → snapshot → archive
      cross-check → atomic publish on success only, on top of the shared
      transactional writer above — do NOT copy #318's write-as-you-go loop.
- [ ] **67-title GT quality experiment.** Decides whether lesson-title
      translation memory survives at all. Send the API course's 67 titles
      through the real GT path (masking applied, standalone strings — the
      way the extension actually sends them) for the 12 premium locales;
      grade A–F per title (A/B usable, C glossary candidate, D/F must be
      curated). n=67 per locale means ~1.5% resolution — treat thresholds
      as bands, not points, and expect context-free titles ("Temperature",
      "Citations") to be the worst case, since GT gets no course context.
      Outcome shapes the curated-phrase rebuild scope: worst case ~1,300
      strings x 12 locales, best case only catalog/UI/sections + a small
      exception list.

- [ ] **Mixed-localization baseline contract (P2), pinned by E2E.** On an
      officially localized page (academy.claude.com serves Korean lesson
      bodies with English lesson titles and section headers), SkillBridge
      must leave already-target-language DOM untouched and translate ONLY
      the English residue. Today this falls out of `isLikelyEnglish` by
      accident; nothing pins it, so a heuristic tweak could silently start
      re-translating official Korean. The behavior contract is testable NOW
      with a synthetic mixed-language fixture on the existing fixture
      server — it does not need the host-support decision, and having it
      green first de-risks that decision.
- [ ] **67-title GT experiment, Phase 2 (conditional).** Only if Phase 1
      (API course) reads well: a stratified sample across the 22 Academy
      courses — ambiguous one-worders ("Temperature", "Citations",
      "Diligence"), product names, generic-noun headings, technical
      phrases, education/business phrasing (AI Fluency, K-12, nonprofit
      tracks have a very different register from developer courses). One
      course cannot carry the external validity for "drop lesson-title
      translation memory"; two good samples can.

### Blocked on an owner decision

Strategy is decided by the owner directly, per this file's own policy —
these are listed only so the dependency chain stays visible.

- Support `academy.claude.com` at all? (Adds a host permission → CWS
  re-review + "new permissions" prompt that disables the extension until
  accepted. Batch with a meaningful release if yes. Alternative worth
  costing: `optional_host_permissions` + programmatic registration — no
  update-time disable, but a user-gesture opt-in and injection rework.)
  A yes carries two REQUIRED engineering gates, not nice-to-haves:
  - Exam/quiz safety on Academy's DOM. The current answer-exclusion
    chokepoints are written against Skilljar's quiz markup; Academy's
    quiz pages need their own detection + EXAM_SKIP selectors, or the
    "never translate/transmit/cache answer text" contract silently
    lapses there.
  - Puter broker trust boundary. The Tutor broker and `_isLocalChatPort`
    are gated to exact Skilljar hosts by design. Admitting
    academy.claude.com to ANY AI surface is a threat-model change
    (trusted-host policy, frame/document lifecycle, broker exposure),
    not a hostname append.
- Canonical course/lesson identity + storage migration (P1): notes/
  bookmarks/recent are keyed by exact `location.href` today, so the same
  course re-taken on Academy has none of the user's Skilljar-era data.
  Migration must be lossless (add canonical id, keep legacyUrls, never
  delete old records). P1 is not done at URL identity: bookmarks also
  store an absolute `scrollY`, and Skilljar's Y=3100 is not Academy's
  Y=3100 — without a portable anchor (heading identity + nearby-text
  quote/hash, scroll-ratio fallback) a migrated bookmark opens the right
  lesson at the wrong place.
- Translation-asset split (P3): preserve-English masking and wrong-form
  recovery exist; "preferred target terminology" (glossary) is a THIRD
  mechanism that does not exist yet — policy data + QA validator first,
  automatic enforcement only via a future refinement layer.
- Optional AI refinement layer (P4) — deliberately last; building it on
  top of stale phrase data and URL-keyed identity would gold-plate the
  wrong foundation. Two invariants agreed 2026-08-22..24 must survive
  into any implementation, whoever builds it:
  - Tutor provider and translation-refinement provider are INDEPENDENT
    axes (each Off/Local/Puter/…, plus a Conservative/Balanced/Quality
    policy axis). Every combination is legal — Cloud Tutor + refinement
    Off, Tutor Off + Local refinement, and so on. Collapsing them into
    one "AI engine" setting re-creates the v3.5.x consent bug.
  - Consent is per-axis: agreeing to send a typed question to the Tutor
    is NOT agreeing to stream lesson bodies to background AI. Refinement
    defaults Off, separate opt-in. And "AI Off" means ZERO model calls of
    any kind — the mode the passive-broker E2E already pins for Puter
    must extend to every future provider.
- External Assistant / BYOA — unrepresented use case. A Claude-app user
  reading Claude Academy may want SkillBridge purely as translation +
  terminology + notes/bookmarks/progress, with tutoring done by their own
  Claude/ChatGPT/Gemini subscription (BYOA: their consumer app, no
  SkillBridge API calls — distinct from BYOK, which the not-doing list
  already rejects). Cheapest real form: an "Ask externally" handoff on
  the existing text-selection UI (context bundle + prompt, copy/open).
  Never auto-drive another extension. This also reframes the bundled
  Tutor as "the default for users WITHOUT an AI subscription", which is
  a positioning call, hence owner-decision.
- Partner Skilljar capability policy. `anthropic-partners.skilljar.com`
  already gets translation-only treatment via the tenant fallback, and
  the official FAQ keeps partner learners on Skilljar indefinitely — so
  "partners keep translation-only forever?" is a standing product
  decision, separate from the parser work tracked above.

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
  - `AMO_API_SECRET` in GitHub Secrets.
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
- **Puter.js package risk** — both the CWS and raw developer Tutor paths depend
  on a third party. The raw vendored SDK contains lazy remote-code and unused
  startup paths; only the build-time-sanitized, RHC-scanned copy in
  `dist/bundled` may enter the CWS artifact.
