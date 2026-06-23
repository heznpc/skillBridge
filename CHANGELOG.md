# Changelog

All notable changes to SkillBridge are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [3.5.41] - 2026-06-23

### Fixed
- Protected-term restoration now also runs on IndexedDB cache hits and before verified translations are cached or sent to DOM update callbacks. A stale or un-restored cached Google Translate result can no longer reintroduce brand/technical-term mistranslations on repeat visits.

### Changed
- Firefox builds now copy only extension runtime assets (`_locales`, `src`, and `assets/icons`) instead of the whole repository. This keeps tests, scripts, coverage, Playwright artifacts, and package metadata out of `dist/firefox` and the Firefox zip.
- Chrome Web Store release copy and checklist were refreshed for v3.5.41, 12 Premium dictionaries, and the current 19 live-course catalog check.

## [3.5.40] - 2026-06-10

### Fixed
- **Italian locale was ~51% Spanish.** `src/data/it.json` had been built from `es.json` and only partially re-translated — 632 of its long strings were byte-identical Spanish, and the `_protected` brand map mistranslated `Claude → Claudio`, `Anthropic → Antropico`, `Claude Code → Codice Claudio`, silently breaking runtime brand-term restoration for Italian (our #1 install market). Re-translated every contaminated string from the English source via the same Google Translate endpoint the extension uses, restored brand/technical terms to canonical English, and rebuilt `_protected` with the correct Italian wrong-forms. Italian↔Spanish overlap is now 0.1% (parity with the other 10 locales). (#166, #167)
- **Protected-term restoration corrupted correct CJK prose.** Across ko/ja/zh-CN/zh-TW, common words were mapped as brand "wrong-forms" (클라우드→Claude, 인류→Anthropic, 企业→Enterprise, …), so `restoreProtectedTerms` rewrote correct translations into wrong English (e.g. "클라우드 컴퓨팅" → "Claude 컴퓨팅"). Removed the ambiguous common-word wrong-forms; intended brand restoration (클로드→Claude, etc.) still works. (#172)
- **AI tutor spinner could hang forever** when the Puter bridge wasn't ready — `chatStream` resolved to a discarded error string instead of throwing, so the caller never rendered the error+retry. It now rejects on bridge-not-ready. (#174)
- **Gemini verify could render a non-translation as the translation.** A short affirmation ("Okay", "OK입니다", "OK?") or whitespace reply fell through and was cached/shown in place of the correct translation (an empty reply blanked the element). Added a length guard so anything far shorter than the source keeps the Google translation. (#175, #176)
- **The AI-Tutor floating button rendered as a blank circle.** The host page's SVG sizing reset collapsed the chat-bubble icon to 0px wide (presentation attributes have specificity 0). Pinned an explicit icon size; the FAB now also lives in the shadow root (see Added), which makes this whole leak class impossible. (#182, #183)
- **The flashcards "Reset Progress" button rendered in Skilljar's blue.** `.si18n-history-clear` had no base rule, so the host's `button { background: #0164cc }` leaked through. Grouped it with the sibling header icon-button rules (transparent, brand-neutral). (#185)
- **Translated brand terms could render as "Claude(Claude)".** Google Translate appends an English gloss in parens for proper nouns; protected-term restoration then turned the transliteration back to English, duplicating it. Exact self-duplicates now collapse via a backreference (ASCII + fullwidth parens); legitimate parentheticals and code are untouched. (#187)
- **Tutor suggestion chips were misaligned with the greeting bubble** — the chip row sat flush to the messages gutter while the bubble is indented past the avatar. Indented the chips by the same 36px (logical property, RTL-safe). (#191)

### Added
- **Locale cross-contamination guard** (`scripts/check-locale-contamination.js`, `npm run check:locales`, wired into CI). Fails when any locale shares >8% of its long strings with another — the bug class the key/shape checks (`check-i18n`, `check-dict-coverage`) cannot see because they only verify structure, not language. Clean locales sit at ≤2.1%; the contaminated Italian file was 51%. (#166)
- **`skillbridge-academy-terms` companion Claude Code plugin** (`claude-plugin/`) re-exposing the curated Academy terminology dictionary for Claude Code / Cowork. Its data is generated from `src/data/*.json` and kept in sync by CI (`npm run check:plugin`). (#170)
- **Shadow-root style isolation for injected overlay UI.** The floating tutor button, the tutor sidebar, and the reading-aid TOC now live in an open shadow root (`#skillbridge-root`) the host page's stylesheet cannot reach — making the host-CSS-leak bug class (the FAB icon and reset-button bugs above) structurally impossible. `content.css` is fetched once, its ancestor theme selectors are rewritten to `:host(...)` form, and the result is adopted into the root; dark/locale state is mirrored onto the shadow host. Header controls (language selector, dark toggle) stay in the light DOM **by design** — they borrow Skilljar's own header classes to blend in. A new E2E suite injects hostile host CSS and proves it cannot reach the shadowed UI. (#188, #189, #190, #192)

### Changed
- **build-plugin generator** now reads `FLASHCARD_COURSE_MAP` via the same evaluation the sibling checkers use (was a fragile regex parse of the source); `--check` also detects orphan output files. (#171)
- **jest** no longer warns about a Haste name collision from `dist/` builds (`modulePathIgnorePatterns`). (#179)
- **Privacy policy** permission table realigned with the manifest (removed the stale `tabs` entry, disclosed `api.github.com`); language count corrected to 32. (#180)
- **README telemetry wording aligned with reality** — nothing is collected, not even opt-in error reports (the old line implied an opt-in error reporter exists; none is implemented). (#186)
- **`npm run capture:store` repoints at `@starter-series/shotkit`**, the extracted store-asset generator, after the in-repo harness copy was removed. (#192)

## [3.5.39] - 2026-06-01

### Security
- **Page bridge + AI tutor scoped to `anthropic.skilljar.com`.** The Puter postMessage bridge (Gemini verification + Claude tutor) uses a nonce that any page-world script can read, so it must not run on Skilljar tenants we don't control. The bridge and the tutor sidebar now initialize only on the trusted Anthropic host; other AI-detected Skilljar tenants still get the dictionary + Google Translate, just not the bridge.

### Fixed
- Example-question chips lost their click handlers after opening and closing a sub-panel (History / Flashcards / Bookmarks / Continue) — `closeSubPanel` now re-binds them alongside the chat input.

### Changed
- Wired `ai-fluency-for-small-businesses` (18th live course) into `FLASHCARD_COURSE_MAP`, clearing the Academy course-drift check, and re-enabled the 12-hour drift cron (the catalog scraper parses correctly again).
- Store listing updated to 18 courses; `RELEASE_CHECKLIST.md` refreshed for the current state (icon resolved, v3.5.39 artifacts).

## [3.5.38] - 2026-06-01

### Fixed — translation rendering & dark-mode polish (from a live debugging pass on anthropic.skilljar.com)
- **No more duplicated text on inline lead-ins** — a paragraph like `<strong>Estimated time:</strong> 15 minutes` rendered as "Estimated time:예상 시간: 15분" (English original + translation side by side). `safeReplaceText` now writes the translation into the first descendant text node and clears every other one (code/pre preserved, inline elements like `<strong>`/`<a>` kept so links stay clickable), so any block with a bold/linked lead-in translates cleanly.
- **Dark-mode floating button is visible again** — the AI Tutor launcher was `#1a1a1a` on a near-black page and effectively disappeared; it now uses a lightened accent with a white icon and a soft ring.
- **"Course roadmap" widget translates** — the embedded `.crm-title` / `.crm-card-h` blocks were not in the translatable selector set (heading and step cards stayed English); they are now covered, and the `.crm` wrapper is re-skinned in dark mode instead of staying bright cream.
- **No uncaught exception after an extension update** — `resume.js` now guards its `chrome.storage.local` calls against an invalidated context ("Extension context invalidated"), which previously surfaced as an uncaught error when a visit was recorded right after a reload/update.
- **Language switch re-localizes the whole sidebar** — switching language after the Tutor sidebar was built left the Tools button, the tools-menu items and the example-question chips frozen at their build-time language; `updateLocalizedLabels` now re-applies all of them.

## [3.5.37] - 2026-06-01

### Fixed — learning-companion robustness (from code review)
- **No more duplicate UI on SPA navigation** — `reading-aid.js` and `resume.js` now guard against re-injection (content scripts can fire multiple times), so the reading-progress bar / TOC and the visit listeners are created only once.
- **Continue / Recent now tracks in-app navigation** — `resume.js` polls the URL (like reading-aid) and records lessons reached via Skilljar's client-side navigation, not just full reloads; scroll position is kept per-lesson (keyed to the URL at scroll time) so resuming returns to where you left off.
- **Flashcards de-duplicate by term** — a term appearing in multiple sections no longer produces colliding cards (box/due state is keyed by the English term).

## [3.5.36] - 2026-06-01

### Added — Learning companion (local-only, free)
- **Spaced-repetition flashcards** — per-card due dates (Leitner box 0→1d / 1→3d / 2→7d) and a "Review due (N)" mode that shows only cards due now.
- **Bookmarks** — bookmark a lesson at its scroll position; list and jump back from the Tools menu.
- **Continue / Recent** — auto-tracks visited lessons + scroll position across courses; resume from the Tools menu.
- **In-lesson reading aid** — a top reading-progress bar and a table of contents built from the lesson's headings.
- All client-side (`chrome.storage.local`); no server, no paid API, device-local.

### Changed — Tutor sidebar
- Consolidated the five header icons (history / flashcards / PDF / bookmarks / continue) into a single **Tools** menu so the chat is the focus.

## [3.5.35] - 2026-06-01

### Changed — Extension icon redesign
- Replaced `assets/icons/icon{16,32,48,128}.png` with a new mark: a rising half-sun over the SkillBridge bridge. Solid semicircle sun (no radiating rays), distinct palette. Tightened framing so the bridge and sun read clearly at 16px.

## [3.5.34] - 2026-05-29

### Added — Italian as 11th Premium language (PR #140)
- `src/data/it.json` (NEW, ~1100 entries) — derived from `src/data/es.json` via Spanish→Italian regex transformation (Romance proximity ~80%). `_meta.translation_provenance` discloses derivation; native Italian review welcome. **Timing context**: Anthropic Milan office opened 2026-05-27 (Italian enterprise/research/dev focus). Italian was the #2 install language in the CWS dashboard pull (2026-05-23) despite no curated dictionary — this addresses that gap.
- `src/lib/constants.js` — `PREMIUM_LANGUAGES` 10 → 11, `it` removed from Standard list.
- `_locales/it/messages.json` — `extDescription` nominative form for the CWS Italian listing.
- `tests/constants.test.js` / `tests/translator.test.js` — count assertions bumped 10 → 11 + presence checks for `it`.

### Added — AI-content gate for non-anthropic Skilljar tenants (PR #142 + #145)
- `src/lib/platform.js` — `detectAITrainingContent(doc, loc)`. Fast path: `anthropic.skilljar.com` (or trailing-dot / `www.` aliases) unconditionally activates. Slow path: scans title / h1 / breadcrumb / first 500 chars of body for ≥2 AI keywords, with word-boundary checks for the 3-char tokens (`mcp`, `llm`, `rag`) so they don't substring-match `McPherson` / `Hellman` / `drag` / `fragment` / `storage`.
- `src/content/content.js` — gate runs after the cert-exam kill-switch. Non-AI tenants (Calendly Academy, Atlassian Academy etc. that fall into our `*.skilljar.com` host pattern but aren't our audience) are short-circuited with a `console.warn` notice. Fail-open on detector error.
- `tests/platform.test.js` + `tests/platform.handshake.test.js` (NEW, jsdom env, +14 cases total) — pins the production handshake (`window._sbPlatform` populated by content-script load) so a future manifest re-order can't silently regress the gate.
- **Wiring fix** (PR #145): the initial #142 PR shipped without adding `src/lib/platform.js` to `manifest.json:content_scripts[].js`, so `window._sbPlatform` was never defined and the gate was a permanent no-op. Manifest entry added; regression-guard test now reads manifest from disk and asserts load order.

### Added — Trademark / nominative-use sweep (PR #138)
- Product name renamed `SkillBridge for Anthropic Academy` → `SkillBridge — AI Course Translator`. All store-listing copy, in-extension UI strings, README, and `_locales/*/messages.json` updated to use Anthropic / Claude / Skilljar only as descriptive references, never as product-noun modifiers. Privacy URL path normalized to lowercase `/privacy`.

### Added — Adversarial 2nd-pass audit fixes (PR #135 → #137)
- `src/background/background.js` — `_inflightGT` Map gains TTL (`_GT_INFLIGHT_TTL_MS = 30s`); batch dedup uses sync-populated `seenInBatch` Map; `parseGTResponse` enforces strict `typeof string` checks.
- `src/lib/page-bridge.js` — payload guard via `_fieldChars` using `String(v ?? '').length` (prevents array-bypass); `_CHAT_STREAM_BRIDGE_TIMEOUT_MS = 90s` watchdog with cancellation; cancelled check between `loadPuter` and `_puterChat`.
- `src/lib/translator.js` — `_postAbort()` helper shared by `onAbort` and timeout path so a stream that hangs past the watchdog is genuinely aborted.
- `src/lib/log.js` wired into `manifest.json` content_scripts (was dead code in v3.5.33).
- Private vulnerability reporting enabled. Popup URL check hardened (extracted `isSkilljarHost()` via URL parse + hostname suffix). Test `execSync` replaced with `spawnSync` array-form.

### Tests (totals)
- Unit (jest): **482/482** (was 398 — 84 new tests across the audit + AI-gate + Italian-dictionary work).

## [3.5.33] - 2026-05-15

### Added — Academy course catalog drift watcher (POSITIONING pillar #1)
- `scripts/check-academy-courses.js` — fetches the public Anthropic Academy catalog (`anthropic.skilljar.com`), extracts every course slug it links to, and cross-references against `FLASHCARD_COURSE_MAP` in `src/lib/constants.js`. Exits 1 if any live slug is unknown to the extension, and writes `academy-courses-report.txt` in CI mode for the workflow to attach to an issue.
- `.github/workflows/academy-courses-drift.yml` — 12-hour cron + idempotent issue (mirrors `selectors-drift.yml`). Auto-opens `🆕 New Anthropic Academy course detected — terminology update needed` with the per-language follow-up checklist; skips re-open if an open issue with the same title already exists.
- `tests/academy-courses-checker.test.js` — 12 unit tests covering the slug parser (absolute + relative href forms, multi-segment rejection, template-literal sanitization, sort stability) and the CLI (fixture-driven exit codes + CI report file).
- `npm run check:academy` wired into `package.json`.
- **Why this matters**: closes the last gap in the POSITIONING.md pillar #1 SLA ("new Academy course → terminology update within 48h"). Before this, the 48h window was honor-system; a new course could ship on Monday and we'd learn from a user issue days later. The previously-shipped `check-dict-coverage` enforces per-course parity ONCE a slug is added to `FLASHCARD_COURSE_MAP` — but until now, nothing notified us that a new slug existed on the live catalog.
- **First-run catch (2026-05-14)**: the new script run against the live catalog detected `ai-fluency-for-small-businesses` (the 18th course, launched after the prior dict update). That slug is now the first follow-up issue the workflow will open.

### Tests (totals)
- Unit (jest): 398/398 (was 386 + 12 new for the academy checker).

## [3.5.32] - 2026-05-14

### Performance — Lazy translation via IntersectionObserver
- `gt-queue.js` `processOffscreenChunked` (idle-time chunked traversal of every offscreen element) replaced with `observeLazyTranslation` — an IntersectionObserver that defers each offscreen element until it nears the viewport (`rootMargin: '50% 0px'` half-viewport lookahead). Inspired by the same pattern Immersive Translate / Brendan Chia's real-time page translation article documents, and by X.com's auto-translate-on-scroll behavior shipped April 2026.
- **Cost model change**: previously a 150-element lesson translated all 150 elements upfront (visible first via Phase 1, offscreen via idle-time chunks). If the user only read the first 30%, the other ~105 GT calls were waste — they consumed the per-tab rate-limiter, filled the IDB cache with content that may never display, and slowed the initial above-the-fold render.
  - **After v3.5.32**: Phase 1 (visible) unchanged. Phase 2 now only translates offscreen elements as they cross the 50%-viewport-lookahead threshold during scroll. For partial-read sessions, GT calls drop in proportion to read depth — a user reading 30% of a long lesson pays ~30% of the previous GT budget.
- **Generation safety**: `_lazyObserver` is disconnected in both `sb._gt.reset()` (called on language switch) and `sb._gt.bumpGeneration()`. The intersect callback also re-checks `gtGeneration` before queueing, so a stale callback from before the language switch can't write into the new generation's DOM.
- **Per-element lang capture**: each observed element gets stored in a `WeakMap` with its target language, so the intersect handler always knows what to translate to. WeakMap means DOM-removed elements get GC'd without manual cleanup.
- **rootMargin tuning**: `50% 0px` was chosen because typical Academy lesson scroll-and-read pacing makes 360px (50% of default 720px viewport) enough lookahead to keep content ready before the eye reaches it. Fast scrollers may briefly see English flash; the alternative `100% 0px` would eliminate flash but also eliminate most savings on long pages.

### Tests (E2E — lazy translation horizon)
- `tests/e2e/lazy-translate.spec.js` (new) — locks in the savings claim. Fixture gains a 1800px-tall spacer + a `#p-below-fold` paragraph well outside the lookahead window. Spec asserts:
  1. After `switchLanguage('ko')` settles, the below-fold paragraph **stays English** (lazy horizon held).
  2. After explicit `scrollIntoView`, the same element becomes Korean (observer triggered translation on intersect).
- New diagnostic op `scrollToBelowFold` + `pageText` reads `#p-below-fold`.

### Tests (totals)
- Unit (jest): 386/386 unchanged.
- E2E (Playwright): **17/17** (was 16/16) — adds lazy translation horizon.

## [3.5.31] - 2026-05-14

### Docs — TODO.md + POSITIONING.md freshness pass
- After 18 PRs in 4 days, the strategy doc and the engineering backlog had drifted from reality. This release reconciles both.
- **TODO.md** rewritten:
  - The previous `Next` list claimed 4 in-flight items — 3 of them are now shipped (`scripts/check-dict-coverage.js`, gt-queue extraction, Playwright E2E). The lone remaining item (`_BG_YT_CLIENT_VERSION` auto-bump GH Action) stays in `Next`.
  - The previous `Later` list claimed `chat-flashcards.js` extraction was pending — shipped in v3.5.27, moved to `Done`.
  - The `Done` section had two entries (v3.5.13 + .14). Now lists the full v3.5.13 → v3.5.30 shipped work, grouped by refactor / tests / CI / strategy / production-fix.
  - New `Now` reflects actual current state (CWS listing refresh + real-browser smoke).
  - Added a fourth bullet under "Production bottlenecks": MV3 content-script CSP forbids `eval` / `new Function` — the E2E harness uses a hard-coded diagnostic-op menu, not arbitrary function passing. Documenting so the next person extending the harness doesn't relive the v3.5.16 CSP debug session.
- **POSITIONING.md** "Quality investments that compound" section:
  - Item 1 (48-hour course-launch SOP): still open, expanded note on what's now in place (dict-coverage enforces parity ONCE a course is in `FLASHCARD_COURSE_MAP`; what's missing is the new-course detection signal).
  - Item 2 (dict coverage check): marked shipped, references v3.5.18 with the five-check shape.
  - Item 3 (Playwright E2E): marked shipped, references v3.5.16 → v3.5.30 (16 scenarios, way past the original 6), notes that the first run caught the v3.5.15 hoist regression.
  - New item 4: selectors drift watcher (v3.5.29) — closes the "Skilljar redeploys mid-week and we don't notice for days" gap.

No production code changes in this release; docs only.

## [3.5.30] - 2026-05-14

### Tests (E2E — translator IDB cache round-trip)
- `tests/e2e/idb-cache.spec.js` (new) — locks in the last untested production path: `translator.cachedLookup` + `_cacheTranslation` are what make repeat translations zero-network. Without them every page load would re-hit Google Translate, blowing through the per-tab rate limiter and slowing the UX. v3.5.6 fixed a bug in the alarm-driven cleanup path; the cache helpers have unit tests in isolation but no end-to-end proof of the full lifecycle.
- The spec exercises three transitions in one test:
  1. **Cold miss → GT**: first `translator.translate(TEXT, 'ko')` returns `{source: 'google'}`.
  2. **Warm hit → cache**: after the verify queue drains and writes the cache (polled with a 6s deadline), the second call returns `{source: 'cache'}`.
  3. **Cross-language miss**: same `TEXT` with `lang: 'ja'` returns `{source: 'google'}` — proves the cache key includes lang (`${lang}\t${text}` per `_cacheTranslation`).
- Test text is 100+ chars with a semicolon — required because `queueGeminiVerify` filters out shorter / simpler text (`GEMINI_MIN_TEXT=80`, `MIN_COMPLEX_TEXT=120`). The verify queue is what writes the cache, so anything below those thresholds never caches by design.
- Two new diagnostic ops in `helpers/extension.js`:
  - `translateOnce({text, lang})` — calls `sb.translator.translate` and returns `{text, source}`.
  - `cacheState` — reads `translator._db` count + `_verifyQueue.length` + `isReady` + `_langGeneration` for debugging.
- Puter stub's non-streaming path now returns `"OK"` instead of the chat-streaming Korean chunks. Non-streaming is only used by Gemini verify; returning `"OK"` makes `_verifySingle` cache the GT result verbatim (rather than caching the chat-stream greeting as an "improved" translation). Tutor-chat is unaffected — it uses `stream: true`.

### Tests (totals)
- Unit (jest): 386/386 unchanged.
- E2E (Playwright): **16/16** (was 15/15) — adds translator IDB cache round-trip.

## [3.5.29] - 2026-05-14

### Build / Ops — Selectors drift watcher (6h cron + auto-issue)
- `.github/workflows/selectors-drift.yml` (new) runs `scripts/check-selectors.js` against the live Skilljar pages every 6 hours. Same script runs on every PR's `validate` job, but PR cadence doesn't catch the **Skilljar-redeploys-without-us** scenario: Skilljar can ship a DOM change on a Monday and our PR queue is closed until Wednesday, during which the extension silently fails to translate parts of the page for every user.
- On failure the workflow auto-opens a GitHub issue (idempotent — skips create if one is already open under the same title, so a persistent drift doesn't spawn a new issue every 6 hours). The issue body includes the truncated `dom-check-report.txt` plus a `Workflow run:` link, with a brief action checklist (run script locally → identify failures → update `src/lib/selectors.js` → re-run E2E).
- Manual `workflow_dispatch` trigger included so the cron can be re-run on demand from the Actions UI.
- Failure detection latency: was *"user opens GitHub issue → we see it"* (potentially days). Now: *"auto-opened issue within 6h of drift"*. Production-quality monitoring at zero ops cost.

## [3.5.28] - 2026-05-14

### Tests (E2E — code-comment translation, last README feature without E2E coverage)
- `tests/e2e/code-comments.spec.js` (new) — locks in the path that runs when the user toggles "Translate code comments" in the popup. v3.5.11 fixed an XSS-class bug here (GT output is untrusted and was previously spliced into `<code>` innerHTML without `escapeHtml` — a jailbroken/MITM'd response containing raw HTML would have XSS'd the lesson page). The path has had no end-to-end coverage until now.
- The lesson fixture gains a Python code block with one comment + 2 lines of real code. The spec asserts BOTH halves of the code-comment contract:
  1. **English comment translates** — `# This is a Claude prompt example` → `# Claude 프롬프트 예시`. Leading `# ` is preserved by the regex; only the trimmed comment text reaches GT.
  2. **Code keywords preserved verbatim** — `def hello():` and `return "world"` survive untouched. Translating Python keywords would break the user's ability to copy + run the snippet, which is the whole reason this feature exists.
- New diagnostic ops in `helpers/extension.js`:
  - `translateCodeComments` — awaits `sb.translateCodeComments(currentLang)`, mirroring what the popup's `toggleCommentTranslation` handler does on enable.
  - `readCodeFencePython` — returns the `#code-fence-python code` element's textContent so the spec can grep for both the translated comment and the preserved code keywords.

### Coverage status
With this spec, **every documented README feature has an E2E lock-in** except for YouTube subtitle activation (genuinely needs a real iframe — deferred) and dark mode toggle (UI-only, low risk). All v3.5.6 → 3.5.12 hotfix-train regression classes are covered.

### Tests (totals)
- Unit (jest): 386/386 unchanged.
- E2E (Playwright): **15/15** (was 14/14) — adds code-comment translation.

## [3.5.27] - 2026-05-14

### Refactor — `chat-flashcards.js` extracted from `sidebar-chat.js`
- Completes the v3.5.13 sidebar-chat split that was deferred for "1 release of `_sb._chat.state` running in production without regressions". 13 PRs later (14 versions of production stability + an E2E suite that exercises the panel state machinery), the pattern is well-validated; safe to extract.
- `src/content/sidebar-chat.js`: **816 → 559 lines** (–257, –31%). Last big-file in the chat surface to split.
- `src/content/chat-flashcards.js` (new, 328 lines) — owns:
  - Per-course flashcard deck building (URL slug → `FLASHCARD_COURSE_MAP` → static-dict section lookup)
  - Leitner-box state (each card → 0/1/2: new/learning/mastered) + auto-advance on grade
  - Render + bind events for the flashcard sub-panel UI
  - Persistence under `fc_<slug>_<lang>` chrome.storage keys, serialized through a single promise chain (last-click-wins under rapid box-up/box-down clicks)
- Reads sub-panel state machinery from `_sb._chat.state.{savedChatHTML,flashcardPanelOpen,historyPanelOpen}` + calls `sb._chat.closeSubPanel`. Mirrors the chat-history.js extraction shape.
- Public surface: `sb.toggleFlashcardPanel` (back-compat — `keyboard-shortcuts.js` was already reading through this handle) + `sb._chat.toggleFlashcardPanel` (parallel to `sb._chat.toggleHistoryPanel`).
- `manifest.json` `content_scripts.js`: `chat-flashcards.js` loads after `chat-history.js` and before `keyboard-shortcuts.js`. Order matters because the SidebarHTML's `si18n-fc-btn` click handler in sidebar-chat now does `sb._chat.toggleFlashcardPanel?.()` (optional-chained for load-order safety, but practically always populated by the time the user clicks).
- Local state hoisted with the functions: `flashcardCards`, `flashcardIndex`, `flashcardBoxes`, `_matchedCourseSlug`, `_rawSectionsCache`, `_rawSectionsLang`, `_flashcardSaveQueue`. All previously top-of-file in sidebar-chat.js; now scoped to the module that uses them.

### Tests (totals)
- Unit (jest): 386/386 unchanged.
- E2E (Playwright): 14/14 unchanged — proves the refactor preserved sidebar / sub-panel state behavior end-to-end.

## [3.5.26] - 2026-05-14

### Tests (E2E — rapid language-switch race lock-in, v3.5.7 regression class)
- `tests/e2e/rapid-switch.spec.js` (new) — locks in v3.5.7's race-condition class. The `gtGeneration` counter exists specifically to invalidate in-flight GT batch + verifier callbacks when the user switches language mid-pipeline. Every call-site reads its generation at queue time and bails if it doesn't match on resolution. Until now: zero coverage of the case where a language switch actually fires WHILE a translation pipeline is still working.
- Spec triggers `switchLanguage('ko')` → 80ms pause (long enough for GT queue to start, short enough to not complete) → `switchLanguage('en')` → immediately `switchLanguage('ko')` again. Asserts:
  1. Final `currentLang === 'ko'`.
  2. `gtGeneration` bumped **at least twice** from start — once per switch via `sb._gt.reset()`. If reset were silently broken the counter would lag.
  3. Every fixture translation target (H1, p1, li1) is fully Korean — no English leftover where Korean should be (would indicate the second ko pipeline didn't complete after the rapid switches).
  4. H1 specifically does NOT contain `Introduction` — defends against partial-leak shape where the first ko run wrote a fragment and then bailed.

### Tests (totals)
- Unit (jest): 386/386 unchanged.
- E2E (Playwright): **14/14** (was 13/13) — adds rapid language switch.

## [3.5.25] - 2026-05-14

### Build / CI — parallel E2E workers
- `playwright.config.js` now uses `workers: process.env.CI ? 2 : 1` instead of always 1. The `workers: 1` comment claimed the extension's user-data dir couldn't be shared — but `launchExtension` already builds a fresh per-launch temp dir (both for the user-data dir and the patched-manifest copy), so cross-file parallelism is safe. `fullyParallel: false` keeps within-file specs sequential (chat-history.spec.js depends on its beforeAll setup ordering).
- **Motivation**: e2e job time was climbing fast as specs accumulated — PR #105 (1 spec): 52s; PR #110 (5 specs): 1m48s; PR #112 (7 specs): 2m23s; PR #113 (8 specs): **7m9s**. Each spec carries a ~15s cold-start tax (Chromium launch + extension install + service-worker registration + bridge ready). Sequentially, those costs accumulate; with two workers they overlap.
- Local runs stay at workers=1 so the reporter output is readable while debugging. ubuntu-latest's 2-vCPU / 7GB runners can handle two parallel Chromium instances without OOM but more than that hits memory ceilings.

## [3.5.24] - 2026-05-14

### Tests (E2E — PDF export XSS lock-in, v3.5.9 regression class)
- `tests/e2e/pdf-export.spec.js` (new) — locks in v3.5.9's fix for the PDF-export XSS. Before that fix, `exportLessonPDF` wrote `lessonContent.innerHTML` directly into a new `window.open('', '_blank')`-spawned popup via `document.write`, then tried to remove `<script>` / `<iframe>` AFTER `document.close()` — by which point inline scripts had already executed in the new about:blank context. Skilljar lessons are third-party content, so any attacker-influenced lesson body could execute JS in the print popup.
- The lesson fixture gains four attacker-shaped elements (each marked with the `pdf-xss-*` id pattern):
  - `<script>` element that would set `window.__pdfExportXssRan = true`
  - `<iframe>`
  - `<p onclick="...">` event-handler attribute
  - `<a href="javascript:...">` URL
  - Plus a benign `<p id="p-pdf-marker">` to confirm lesson body content still makes it through.
- Spec clicks `#si18n-pdf-btn`, captures the `window.open` popup via Playwright's `waitForEvent('popup')`, and asserts:
  1. **`window.__pdfExportXssRan` is undefined in the popup** — the hard XSS invariant. The fixture's `<script>` runs at main-page load (browser default), so the marker exists on the main page; v3.5.9's regression shape was that the SAME script ALSO ran in the popup. The popup-only check is the right boundary.
  2. **No `<script>` / `<iframe>` tag in the popup HTML** (regex, case-insensitive).
  3. **No `onclick=` attribute in the popup HTML**.
  4. **No `href="javascript:"` in the popup HTML**.
  5. **Lesson body text (`Introduction to Claude`, `Anthropic`, `Printable content survived sanitization.`) IS in the popup** — proves sanitization is surgical, not a wholesale wipe.

### Tests (totals)
- Unit (jest): 386/386 unchanged.
- E2E (Playwright): **13/13** (was 12/12) — adds PDF export sanitization.

## [3.5.23] - 2026-05-14

### Tests (E2E — chat history IDB persistence round-trip)
- `tests/e2e/chat-history.spec.js` (new) — the v3.5.6 + v3.5.9 hotfixes both touched IDB resilience (history quota retry, prune+retry cascade). Unit tests cover each helper in isolation but only an end-to-end test proves the full round-trip works: `sidebar-chat.sendChatMessage` → `translator.chatStream` → `saveConversation(q, a, lang)` → `openHistoryDb().add(entry)` → later → `toggleHistoryPanel` → `loadHistoryList()` cursor read → re-render → `openHistoryDetail(id)` primary-key read. A regression anywhere along that chain is silent data loss for the user.
- The spec sends two chats, waits for each to complete (saveConversation fires after the stream ends), opens the history panel, asserts both questions appear in the list (cursor read works), then clicks one entry and asserts the detail view shows both the saved user question AND the saved bot answer (single-record read by primary key works).
- New diagnostic ops in `helpers/extension.js`:
  - `readHistoryList` — returns every `.si18n-history-item` with its `data-id` (IDB primary key) and question preview text.
  - `openHistoryDetail(id)` — clicks the item with matching `data-id`, triggering `showConversationDetail` → `tx.objectStore(HISTORY_STORE).get(Number(id))`.
  - `readHistoryDetail` — returns the user + bot bubble text from the rendered detail view.

### Tests (totals)
- Unit (jest): 386/386 unchanged.
- E2E (Playwright): **12/12** (was 11/11) — adds chat history persistence.

## [3.5.22] - 2026-05-14

### Tests (E2E — Protected Terms restoration in production pipeline)
- `tests/e2e/protected-terms.spec.js` (new) — `protected-terms.js`'s 24 unit tests cover the function in isolation, but the function only matters if `gt-queue.js` actually invokes it on every GT result before the DOM write. A silent refactor that bypassed the restoration step would pass every unit test and ship. This spec closes that gap.
- The lesson fixture gains a sentence chosen because Google Translate has historically mistranslated both "Anthropic" (→ "인류학적", "anthropological") and "Claude" (→ "클로드") in Korean — these are exactly the wrong forms `src/data/ko.json` `_protected` map exists to fix. The GT stub deliberately returns the wrong-form translation; the spec asserts the user-facing DOM shows the corrected English brand names, NOT the mistranslation.
- Three layers of assertion:
  1. **Wrong forms NOT in DOM** — `expect(text).not.toContain('인류학적')`, `not.toContain('클로드')`. The hard invariant.
  2. **Correct forms ARE in DOM** — `Anthropic` + `Claude` both verbatim. Proves restoration succeeded.
  3. **Surrounding Korean intact** — `프런티어 모델로` (frontier model translation) survives. Proves the restoration is surgical, not a wholesale GT-bypass.
- Cross-check: other paragraphs without protected-term content still translate normally (H1 → "Claude 소개", p1 contains "프롬프트 엔지니어링").

### Tests (totals)
- Unit (jest): 386/386 unchanged.
- E2E (Playwright): **11/11** (was 10/10) — adds Protected Terms restoration.

## [3.5.21] - 2026-05-13

### Tests (E2E — stream cancel lock-in)
- `tests/e2e/stream-cancel.spec.js` (new) — locks in the INTERRUPT path of the tutor chat. Stream lifecycle has been the single most recurring bug class across v3.5.6 → 3.5.12 (timer/listener cleanup, stream cancel, YouTube subtitle timer leak). The tutor-chat spec verified the happy path; this verifies what happens when `sb.cancelActiveStream()` fires mid-stream — the same path that triggers on sidebar close / SPA nav / sub-panel switch.
- Asserts after a mid-stream cancel:
  - The bot bubble contains chunk 1 (`안녕하세요`) but **NOT** chunk 3 (`주는 입력입니다`) — proves cancel actually stopped the stream rather than passively letting it finish.
  - The `si18n-streaming-cursor` class is gone — proves the catch block's cleanup ran.
  - No `role="alert"` error bubble — proves AbortError took the early-return branch, not the error-render branch.
  - A second `sendChat` succeeds — proves `isSending` was correctly reset by the `finally` even on the AbortError early-return (regression-class shape for v3.5.9).
- Two harness pieces enable the test:
  - Puter stub paced at 150ms/chunk (was 20ms) — slow enough for the test to interrupt between chunks but still well under the tutor-chat spec's 10s deadline. Configurable via `window.__sbE2eChunkDelayMs` for future tests that need different pacing.
  - New diagnostic op `cancelStream` — triggers `sb.cancelActiveStream()`, the same single entry point every interrupt source funnels through.

### Tests (totals)
- Unit (jest): 386/386 unchanged.
- E2E (Playwright): **10/10** (was 9/9) — golden translation + exam mode + SPA navigation + tutor chat happy path + tutor chat cancel.

## [3.5.20] - 2026-05-13

### Tests (E2E — tutor chat lock-in, 3rd POSITIONING pillar)
- `tests/e2e/tutor-chat.spec.js` (new) — locks in the third POSITIONING.md pillar ("contextual AI tutor with zero friction"), the one the README + CWS listing lead with. v3.5.9 fixed a stream-cancel bug here and v3.5.11 fixed a sanitizer XSS along the same path; v3.5.13's chat-render / sidebar-chat / chat-history split refactored every component the chat traverses. Until now: zero automated coverage of:
  - `sidebar-chat.sendChatMessage` → `translator.chatStream` → `postMessage({type:'CHAT_REQUEST',stream:true})` → page-bridge (main world) → `puter.ai.chat(prompt, {stream:true})` → `for await` async iterable → `CHAT_STREAM_CHUNK` × N → `onChunk` callback → `chat-render.formatResponse(fullText)` → `bubble.innerHTML` → `CHAT_STREAM_END`.
- The spec asserts: user bubble has the typed text, bot bubble accumulates all 3 streamed chunks verbatim, the final HTML is wrapped in `<p>…</p>` (proving formatResponse ran), and **no `role="alert"` error bubble exists** (a CHAT_ERROR_LABELS render would mean the stream threw silently).
- Three test-harness pieces unlock this:
  1. **`src/bridge/puter.js` REPLACED in the patched extension dir** — not stubbed at `https://js.puter.com/**`. The production manifest sends `chrome.runtime.getURL('src/bridge/puter.js')` to page-bridge as the Puter URL — a `chrome-extension://` path, not external — so external URL route handlers never fire. The stub puter returns a real async-iterable yielding 3 Korean chunks paced at 20ms each, matching the real SDK's streaming contract.
  2. **URL-pattern tab query** replaces `chrome.tabs.query({active:true})` in `evalInContentWorld` — Playwright's persistent context occasionally loses "current window" focus when page-bridge injects its `<script>`, and the active-tab query then returned a tab in a window the extension lacks host permission for. Matching on the fixture URL (`http://localhost:*/*`) is unambiguous.
  3. **`host_permissions` port wildcards** (`http://localhost:*/*` instead of `http://localhost/*`) in the patched manifest — chrome.scripting.executeScript silently refuses to inject without a host_permissions entry covering the active tab's port, and ephemeral local servers never run on port 80.
- New diagnostic ops in `helpers/extension.js`: `bridgeReady` (checks `translator.isReady`), `sendChat` (sets input + clicks send button — exercises the full sidebar-chat path, not just the API), and `readChatLog` (returns per-bubble `{role, text, html}`).

### Tests (totals)
- Unit (jest): 386/386 unchanged.
- E2E (Playwright): **9/9** (was 8/8) — golden translation + exam mode + SPA navigation + tutor chat.

## [3.5.19] - 2026-05-13

### Tests (E2E — SPA navigation race coverage)
- `tests/e2e/spa-navigation.spec.js` (new, 2 steps) — covers the bug class that the v3.5.6 → 3.5.12 hotfix train kept finding in production: race conditions around Skilljar's pjax-style intra-course navigation, where `content.js` stays loaded across the transition and `onRouteChange` is the path that has to re-translate the swapped-in DOM. None of the existing E2E specs exercise that path.
  - **Step A** (baseline): /lesson, switchLanguage('ko'), assert H1 translated to `"Claude 소개"`.
  - **Step B**: atomically swap body HTML with lesson-2 content + push `/lesson-2` via `history.pushState` (which content.js wraps to fire `onRouteChange`). Assert: new H1 translates to `"고급 프롬프트 엔지니어링"`, paragraph + bullet also translate, and crucially **lesson-1 stale text (`Claude 소개`, the original Korean translation of the prior lesson) does NOT leak into the new DOM** — the regression shape that v3.5.7 fixed and could re-appear under future refactors. `currentLang` stays `ko` (we didn't switch languages, just navigated), `gtGeneration` stays consistent.
- New diagnostic ops in `helpers/extension.js`:
  - `replaceBodyAndPushState({ html, path })` — atomic body swap + pushState, isolating the SPA transition into one bridge call so timing doesn't drift between the two.
  - `bodyTextSnapshot()` — full body text + H1/first-P snapshot, used for the stale-leak assertion.
- New `GT_KO` entries for the lesson-2 content. Strings chosen so the H1 swap from `"Introduction to Claude"` → `"Advanced prompt engineering"` gives a clean assertion target and the chain-of-thought paragraph proves the GT batch ran end-to-end on the new content.

### Tests (totals)
- Unit (jest): 386/386 unchanged.
- E2E (Playwright): **8/8** (was 6/8) — golden translation + exam mode + SPA navigation.

## [3.5.18] - 2026-05-13

### Added — `scripts/check-dict-coverage.js` (POSITIONING.md "48h SLA" enforcement)

Mechanical defense for the first product pillar from POSITIONING.md — "AI terminology fidelity, new Academy course → 11 languages within 48 hours." Until now that commitment was honor-system; the script now fails CI when any of five integrity invariants drift:

1. **Section parity** — every `src/data/<lang>.json` has the same top-level section set. A new course landing in one language but missing from the others is the most common failure mode.
2. **English-key parity within each section** — for every section (excluding `_meta` and `_protected`), the set of English source keys must be identical across all 10 dictionaries. Catches a translator updating one language with a new term but forgetting the others. `_protected` is excluded by design — each language has its own mistranslation patterns (e.g. ko's `클로드` → `Claude` has no equivalent in de).
3. **`FLASHCARD_COURSE_MAP` referential integrity** — every section name referenced by the constants.js course map must exist in the dictionaries.
4. **Orphan section detection** — every course-shaped section in the dictionaries must be referenced by at least one slug in `FLASHCARD_COURSE_MAP`; otherwise users can't reach its flashcards / term preview.
5. **`_meta.version` sync** — every dictionary's `_meta.version` matches `manifest.json`. `generate-docs.js` already auto-syncs these on `npm run docs`, but the check catches drift before a CWS push if docs weren't regenerated.

Wired into the CI `validate` job and exposed as `npm run check:dict-coverage`. Honors `SB_DICT_DIR_OVERRIDE` env var so the new self-test suite can point it at fault-injected fixture dirs.

### Added — `tests/dict-coverage-checker.test.js` (5 cases)

Self-test for the script itself — without coverage of the checker, a silent regression in the checker would void the SLA defense. Cases:
- Happy path: real `src/data/` passes
- Check 1 fault injection: a dropped section in `ja.claude101` triggers exit 1 with `ja` + `claude101` in the message
- Check 2 fault injection: an extra English key in `ko.claude101` (not in other languages) triggers exit 1 with the section name
- Check 5 fault injection: a `_meta.version` set to `0.0.1-wrong` triggers exit 1 and surfaces the `npm run docs` recovery hint
- Negative control: `_protected` key divergence is allowed (intentionally per-language) and does NOT trigger exit 1

### Tests (totals)
- Unit (jest): 386/386 (was 381, +5)
- E2E (Playwright): 6/6 unchanged

## [3.5.17] - 2026-05-13

### Tests (E2E — exam-mode lock-in)
- `tests/e2e/exam-mode.spec.js` (new, 2 steps) — locks in the "exam awareness" pillar from POSITIONING.md. If this contract silently breaks (translated answer-option labels reach students), SkillBridge gets flagged as a cheating tool — existential brand risk. The spec asserts:
  - `detectExamPage()` flips `_sb.isExamPage = true` on the `/quiz` fixture (URL pattern hits `EXAM_URL_PATTERNS`, DOM also has the `.quiz-form` + `.answer-option` shape as a redundancy).
  - After `switchLanguage('ko')`, the quiz title and question text translate to Korean BUT every `.answer-option` label stays in English. Verified both by absence-of-Hangul on each label AND verbatim presence of the original English phrases ("Claude Opus", "Claude Haiku", "Claude Sonnet", "None of the above") — defends against partial translation (e.g. only the descriptive tail being translated).
- `tests/e2e/fixtures/skilljar-quiz.html` (new) — minimal Skilljar-shaped quiz DOM with 4 answer options.
- `tests/e2e/helpers/network-stubs.js` — fixture server is now path-aware: `/quiz` / `/exam` / `/assessment` serve the quiz fixture; everything else serves the lesson fixture. Keeps both specs in one process under one Playwright launch.
- `tests/e2e/helpers/extension.js` — two new diagnostic ops in the isolated-world bridge: `quizText` (returns the quiz title, question, and per-`.answer-option` label texts with whitespace normalized) and `examStatus` (returns `{ isExamPage }`).
- New GT stub entries for the quiz fixture's question text. Answer-option strings deliberately NOT in `GT_KO` — if the EXAM_SKIP_SELECTORS path ever regresses they'd hit the stub as untranslated markers (`[UNTRANSLATED:...]`) and the assertions would fail cleanly.

### Tests (totals)
- Unit (jest): 381/381 unchanged.
- E2E (Playwright): **6/6** (was 4/4) — golden translation + exam mode.

## [3.5.16] - 2026-05-13

### Fixed (caught by the new E2E suite)
- `src/content/content.js` declared `const sb = window._sb` at the very top of its IIFE — before `window._sb = {...}` ran on line 142. `sb` captured `undefined` permanently, so every later `sb._gt.X` / `sb._chat.X` / `sb.safeReplaceText = ...` call would throw `Cannot set properties of undefined`. This was a real regression from the v3.5.15 gt-queue extraction (the regex-pass that introduced the `sb._gt.X` rewrites also inserted the early `const sb`). 381 unit tests passed through three releases (v3.5.13 → 14 → 15) without catching it; the very first run of the new E2E spec did. Fixed by moving the declaration to immediately AFTER the `window._sb = {...}` assignment.

### Tests (E2E — new suite)
- `tests/e2e/golden-translation.spec.js` (new, 4 sequential steps under Playwright + chromium with `--load-extension`):
  - **Step A** — every cross-module `_sb` surface (`_gt.*`, `_chat.*`, `sb.switchLanguage`, `sb.isLikelyEnglish`, `sb.safeReplaceText`, etc.) is present after the manifest's content scripts all load. Catches manifest-order regressions.
  - **Step B** — `switchLanguage('ko')` triggers the static dict + GT batch path; page H1 / paragraph text actually swap to Korean (stubbed GT response); `_gt.gtGeneration` moves off 0. Catches breaks in the gt-queue.js extraction.
  - **Step C** — `injectSidebar` + `toggleSidebar` + `toggleHistoryPanel` + `closeSubPanel`; assert `_sb._chat.state.{savedChatHTML,historyPanelOpen,flashcardPanelOpen}` transitions correctly through the sub-panel lifecycle. Catches breaks in the sidebar-chat / chat-history split.
  - **Step D** — `switchLanguage('en')` restores original text and bumps `gtGeneration` again. Catches breaks in `restoreOriginal`'s v3.5.15 delegation to `sb._gt.reset()`.
- Test harness in `tests/e2e/helpers/`:
  - `extension.js` — launches headless Chromium via `chromium.launchPersistentContext` with `--load-extension=dist/bundled`. Patches a temp copy of the bundled manifest to add `http://localhost:*/*` to content_scripts.matches and the `scripting` permission (the production manifest is untouched). Bridges into the content-script isolated world via `chrome.scripting.executeScript` from the SW, using a hard-coded menu of seven diagnostic operations (`snapshot` / `switchLanguage` / `injectSidebar` / `toggleSidebar` / `toggleHistoryPanel` / `closeSubPanel` / `pageText`) — MV3 content-script CSP forbids `eval` / `new Function`, so arbitrary user-function bridging from Playwright's main world wasn't an option.
  - `network-stubs.js` — local HTTP server serves the Skilljar lesson fixture (Playwright's `route().fulfill()` doesn't trigger MV3 content-script injection, so the fixture must come from a real origin); `context.route()` interceptors stub `translate.googleapis.com`, `api.github.com`, `js.puter.com`, and `api.puter.com` so no test traffic leaves the runner and translations are deterministic.
  - `fixtures/skilljar-lesson.html` — minimal Skilljar-shaped DOM with a known set of English strings the GT stub knows how to translate.

### Build / CI
- `@playwright/test@^1.60.0` + `jest-environment-jsdom@^30.4.1` (already in v3.5.14) are the new devDependencies.
- New `npm run test:e2e` (builds the bundle, then runs Playwright) and `npm run e2e:install` (`playwright install chromium`).
- New CI job `e2e` in `.github/workflows/ci.yml`: installs xvfb + Playwright Chromium, builds the bundle, runs the suite under `xvfb-run -a npx playwright test`. Uploads `playwright-report/` + `test-results/` as a GitHub artifact on failure. The job runs in parallel with `test` so it doesn't block the fast jest path; if E2E flakes intermittently in the future we keep the option to mark it non-blocking.

### Tests (totals)
- Unit (jest): 381/381 unchanged.
- E2E (Playwright): 4/4 new — covers cross-module wiring that unit tests cannot reach.

## [3.5.15] - 2026-05-13

### Refactor
- Extracted `src/content/gt-queue.js` (new, 537 lines) from `src/content/content.js` (1222 → 869 lines, –29%). gt-queue.js now owns the static-dictionary lookup pass, the Google Translate batch queue, the language-generation counter (`gtGeneration`), the offline-deferred items list, viewport-first chunked scheduling, and the verify-spinner helpers. Cross-module access goes through a new `window._sb._gt` sub-namespace (`applyStaticTranslations`, `queueForGoogleTranslate`, `processOneElement`, `pruneDetachedEntries`, `reset`, `bumpGeneration`, `flushOfflinePending`, `removeVerifySpinner`, plus a `get gtGeneration` view); the four mutable state variables that used to live in `content.js` are now encapsulated inside the gt-queue IIFE so the only way for an external module to mutate them is through the public surface.
  - `content.js` keeps the page-translation entry points (`translatePage`, `switchLanguage`, `restoreOriginal`), the DOM observer (which delegates to `sb._gt.processOneElement` / `sb._gt.queueForGoogleTranslate`), exam detection, and the per-lesson term preview UI.
  - `restoreOriginal` simplifies from a five-line state reset to `sb._gt.reset()`.
  - The `online` event handler simplifies from inline state inspection to `sb._gt.flushOfflinePending(currentLang)` with a boolean return that says whether a flush actually happened.
  - `isLikelyEnglish` moved to gt-queue.js (it was only called from inside the GT section), and re-attached on `sb.isLikelyEnglish` so `code-comments.js` (the one external caller) keeps working unchanged.
  - `content.js` exposes `safeReplaceText` / `updateLangClass` / `detectExamPage` / `showTermPreview` plus `mapSizeCap` and the prebuilt `translatableSelector` / `excludeSelector` strings via `_sb` so gt-queue.js can use them without re-importing the Skilljar selector dictionary.
  - `manifest.json` `content_scripts.js` order updated to load `gt-queue.js` right after `content.js` (and before the rest of the content modules) so `_sb._gt` is ready by the time `init()` runs.

### Strategy
- POSITIONING.md "90-day growth moves" section replaced with "Quality investments that compound" — keeps the three load-bearing engineering items (course-launch SOP, dictionary coverage check, Playwright E2E) and drops the marketing speculation (Ambassador program — the program is community-organizer-focused and didn't match SkillBridge's profile; Code with Claude Tokyo timing; Class Central outreach; Twitter outreach). Strategy doc is now strictly about what the product defends, not how it grows.
- TODO.md `Now` section trimmed accordingly: dropped Ambassador application (mismatch) and CWS listing refresh (marketing, not engineering).

### Tests
- `tests/gt-queue.test.js` (new, 13 cases) — pins `isLikelyEnglish`'s majority-Latin threshold behaviour: Hangul / Kana / Hanzi / Cyrillic correctly classified as not English; code-mixed strings classified by whose characters dominate; whitespace excluded from the denominator (so tab-and-newline noise doesn't flip results); empty / numeric-only / exactly-50% inputs all return false. Extracted via regex from gt-queue.js source so production code stays the source of truth.

### Tests (totals)
- Suite: **381/381** pass (was 368, +13).

## [3.5.14] - 2026-05-13

### Strategy
- `POSITIONING.md` committed — locks SkillBridge as "the canonical translation + AI tutor extension for Anthropic Academy". Records the three pillars (AI terminology fidelity, exam awareness, contextual tutor) the product defends, the explicit not-doings (multi-LMS, paid tier, user API key, server-side features), and the sunset triggers that would re-open the decision. Written off a 2026-05-13 market sweep (Academy launched 2026-03-02, no announced localization, Anthropic Ambassador program just opened, no direct competitors — generic translators target Netflix/YouTube/Coursera).
- `TODO.md` rewritten from scratch — purged stale items (v3.4.0-era multi-LMS exploration, paid-tutor monetization) that conflict with the locked positioning, separated strategy (now in POSITIONING.md) from concrete eng / ops work, and seeded a fresh Now / Next / Later split.

### Tests
- `tests/gemini-block.test.js` (new, 25 tests) — locks in the Gemini-translated-HTML sanitizer's security invariants under `jest-environment-jsdom`. Covers: placeholder restoration (`<xN>`, `<cN/>`) and unmatched-placeholder cleanup; SAFE_TAGS allowlist (strips `<script>` / `<iframe>` / `<img>` / `<object>` / `<embed>` while preserving safe inline tags + child text nodes); per-tag attribute allowlist (`formaction`, `srcdoc`, `is=` strip on `<a>`; `on*` strip everywhere); `javascript:` / `data:` URL rejection on `<a href>` including case-insensitive + control-char-prefixed variants; fragment + `https:` href preservation; reverse-tabnabbing defense (`target="_blank"` forces `rel="noopener noreferrer"`, `target="_self"` doesn't add `rel`); `hasInlineTags` mixed-content detection; `escapeHtml` idempotence under double-encoding and `undefined` coercion. Adds `_xmlToHtml` to `window._geminiBlock` as a test-only handle (clearly commented; no production callers).
- `jest-environment-jsdom@^30.4.1` added as a devDependency to support the new DOM-dependent sanitizer tests. Used per-file via `@jest-environment jsdom` pragma so the rest of the suite stays on the faster Node environment.

### Refactor
- Removed dead `_sb` exports landed in v3.5.13: `sb._chat.applyInline`, `sb._chat.bindChatInputEvents`, `sb._chat.cancelActiveStream`, and the back-compat `sb.formatResponse` shim. Grep confirmed zero external callers — they were namespace pollution that would have invited "where is this used?" hunts on future edits. `sb.cancelActiveStream` (the real public handle) and `sb._chat.closeSubPanel` (used by chat-history.js) are retained.

### Tests (totals)
- Suite: **368/368** pass (was 343). New `gemini-block.test.js` is the largest single addition (+25).

## [3.5.13] - 2026-05-11

### Refactor
- Split `src/content/sidebar-chat.js` (1224 → 815 lines, –33%) into three modules with a shared `window._sb._chat` namespace:
  - `src/content/chat-render.js` (new) — `formatResponse`, `applyInline`, `sanitizeHtml`. Pure DOM-free markdown→HTML + the trusted-structure HTML sanitizer used by both the live chat bubble and the history detail view.
  - `src/content/chat-history.js` (new) — IndexedDB conversation store, history sub-panel, detail view. Owns `chat-history` IDB store + the panel UI; calls back into sidebar-chat through `_sb._chat.{closeSubPanel,formatResponse,sanitizeHtml}`.
  - `src/content/sidebar-chat.js` keeps panel infrastructure (sidebar inject, chat input, sub-panel state machinery, focus trap, flashcards, PDF export, send-chat stream).
  - Sub-panel state (`savedChatHTML`, `historyPanelOpen`, `flashcardPanelOpen`) hoisted to `_sb._chat.state` so history and flashcard modules share one source of truth instead of duplicating local flags.
  - `manifest.json` `content_scripts.js` order updated to load `chat-render.js` before `sidebar-chat.js` (which now exposes the `_sb._chat` panel helpers) and `chat-history.js` after (which consumes them).
  - `tests/format-response.test.js` follows `formatResponse`/`applyInline` to its new home in `chat-render.js`.

### Added
- `src/lib/_sb-typedef.js` — JSDoc-only contract for the `window._sb` shared namespace and the `_chat`/`ProtectedTermsApi`/`GeminiBlockApi` sub-namespaces. Not loaded at runtime (no manifest entry); picked up by IDEs and `tsc --noEmit` via the new `tsconfig.json`.
- `tsconfig.json` — `allowJs` + `checkJs` for IDE/local type checking against existing JSDoc. `strict: false` so the rollout doesn't surface a wave of pre-existing nullability warnings; tighten incrementally as files migrate.
- `scripts/check-i18n-keys.js` + `npm run check:i18n` — validates (1) every locale under `_locales/` matches the English `messages.json` key set so Chrome doesn't silently fall back, and (2) every `*_LABELS` / `*_GREETINGS` / `*_PLACEHOLDERS` dictionary in `src/lib/constants.js` is shape-consistent across the 11 premium languages, both for flat `{ en, ko, … }` maps and section-outer `{ key: { en, ko, … } }` maps. Wired into the CI `validate` job.
- `docs/E2E_PLAN.md` — working spec for the deferred Playwright suite. Records the 6 priority coverage targets (golden translation, SPA mid-stream, cache-cleanup alarm, stream-cancel, protected-terms, panel switch) so the next person who picks it up doesn't restart from zero.

### Fixed
- `restoreProtectedTerms(text)` now defends against three production-realistic edge cases that previously corrupted output or crashed: `null`/`undefined`/non-string input (returned safe fallback instead of throwing on `.includes`); empty-string wrong-forms in the dictionary (`String.prototype.replaceAll('', x)` would have inserted the correct form between every char); and self-mapping entries where a wrong-form equals its correct form (silent no-op cycle bloating the hot loop on long pages).
- Background SW + content-script handlers gain a `_logMisroutedMessage` defensive log: if a `{ action: ... }`-shaped message reaches the background (or a `{ type: ... }` reaches a content script) it warns loudly with the discriminator. Catches the v3.5.6 cache-cleanup class of bug at first occurrence in dev rather than silently falling through "Unknown action".

### Build
- `scripts/build-bundle.js` esbuild now passes `pure: ['console.debug', 'console.info']` to the content + background bundles. With `minify: true` already on, those calls get tree-shaken from production output (verified 0 occurrences in `dist/bundled/*.bundle.js`). `console.warn` / `console.error` deliberately preserved so real degradation/errors still reach DevTools.

### Tests
- `tests/protected-terms.test.js` (+6 tests): null/undefined/non-string input safety, idempotence (`f(f(x)) == f(x)`), empty-wrong-form skip, self-mapping skip, non-string-array-element skip. Total now 24 tests against the protected-terms helper.

## [3.5.12] - 2026-05-11

### Fixed
- Background SW removed a dead chrome.storage.local self-healing path for the YouTube InnerTube client version. The hydration block read `sb_yt_client_version` on every SW wake but **no code anywhere ever wrote that key** — the comment claimed the maintenance alarm refreshed it, but the alarm only sends `version-check` against GitHub. The runtime override never triggered; `_BG_YT_CLIENT_VERSION` was effectively a const all along. Replaced the let + hydration block with a plain const + comment explaining the manual-bump workflow (in sync with `src/lib/constants.js` + `src/shared/constants.json` via `check-bg-sync.js`). Also removes the fire-and-forget storage race on every SW wake.
- `FETCH_URL` proxy handler now routes through `fetchWithRetry` instead of raw `fetch`. Previously a transient YouTube/InnerTube 5xx propagated straight to the content script while `GOOGLE_TRANSLATE_BATCH` got the retry contract — inconsistency the v3.5.8 fix was supposed to eliminate.
- `handleVersionCheck` (GitHub API call) likewise routes through `fetchWithRetry`. Anonymous GitHub quota is 60/h per IP; with users converging on residential ranges, 403s are common, and the previous code silently dropped them with a single attempt. The 4xx fail-fast contract still prevents pointless retries on 403/404.

### Changed
- Added `https://api.github.com/*` to `host_permissions` in `manifest.json`. SW `fetch` to undeclared origins works in MV3 but CWS reviewers flag undeclared hostnames; explicit declaration matches what the code actually does.

## [3.5.11] - 2026-05-07

### Security / Hardening
- `gemini-block.js` sanitizer switched from open-by-default attribute filtering to a per-tag allowlist. The previous version stripped only `on*`, `style`, and unsafe `href`s — every other attribute was copied verbatim onto safe inline tags. That left `target="_blank"` (reverse tabnabbing), `formaction`, `srcset`, `srcdoc`, `is="x-element"`, and similar carry-overs open. New allowlist enumerates the actually-meaningful attrs per tag (`href`/`title`/`lang`/`target` on `<a>`, `datetime` on `<time>`, etc.); everything else falls through to a tiny default set (`title`, `lang`). Also force `rel="noopener noreferrer"` on any `<a target="_blank">` produced by the translator.
- `code-comments.js` now escapes Google Translate output before splicing it back into `el.innerHTML`. GT doesn't normally return raw HTML, but a jailbroken / MITM'd / proxied response could — and we'd `innerHTML` it. Escaping also correctly normalizes legitimate `&` / `<` characters in translations (e.g., "AT&T").

### Fixed
- `escapeHtml` no longer throws `TypeError: Cannot read properties of null` when called with a non-string. Out-of-tree callers in `sidebar-chat.js` (flashcard `card.en`, history `chapter` titles) can pass null/undefined; the helper now coerces via `String(text ?? '')`.
- `queueGeminiBlockTranslation` deduplicates concurrent calls. MutationObserver-driven SPA navs could re-fire for the same element while a previous Gemini call was in flight, double-spending Gemini quota and racing two `innerHTML` writes with stale `tagInfo`. Early-returns now if `si18n-verifying` is already set.
- Tighter Gemini bad-output detection. The previous `result.includes('SOURCE') || 'RULES:'` check missed Gemini refusals that omit those marker tokens (e.g., "I cannot translate this content"), letting the English error string render mid-page. Added: when the original element had `<xN>`/`<cN>` placeholder tags, the response must too — otherwise bail.

### Added (test lock-in)
- `tests/content-helpers.test.js` (+3 tests): `escapeHtml` null/undefined/number coercion.

## [3.5.10] - 2026-05-07

### Fixed
- YouTube subtitle manager no longer leaks per-iframe load-event timers. `_enableAutoSubtitles` schedules 500/1500/3000 ms postMessage chains on every `load`, plus an 800 ms chain inside `_sendCaptionCommands`; previously `destroy()` only cleared `_retryTimers` (the init-time 2 s/5 s pair) and these per-iframe timers fired and early-returned for up to 3 s after teardown. They're now tracked in a `_pendingTimers` set via a `_trackTimer` helper and cleared on both `destroy()` and `setLanguage()` (rapid lang toggles otherwise stacked stale postMessage spam targeting the previous language).

### Added (test lock-in for v3.5.7 / v3.5.8 helpers)
The recent rounds added `_puterChat`, `_isValidTranslation`, and `_kickVerifyQueue` without test coverage; a future regression would have silently undone the fixes. New tests cover the contracts:
- `tests/page-bridge-fallback.test.js` (new file, 11 tests): validates the `_MODEL_FALLBACKS` chain (Sonnet 4.6 → 4.5, Opus 4.7 → 4.6, etc.) and `_isModelError`'s deprecation-vs-network-error discrimination via regex extraction (page-bridge.js can't be loaded whole because it references the page-world `puter` global).
- `tests/translator.test.js` (+7 tests): `_isValidTranslation` rejects HTML payloads, length-bombed strings, and mostly-ASCII output for non-Latin targets; accepts plausible CJK / Cyrillic translations and short Latin proper-nouns.
- `tests/translator-queue.test.js` (+3 tests): `_kickVerifyQueue` deduplicates concurrent kicks via the lock, self-restarts when items arrive during the teardown window (the actual v3.5.7 race fix), and refuses to re-kick when `isReady` flips false mid-run.
- `tests/youtube-subtitles.test.js` (+3 tests): timer cleanup on `destroy()`, timer cleanup on `setLanguage()`, and `_trackTimer` self-removes ids after fire.

Total: +24 tests against code paths that had zero coverage.

## [3.5.9] - 2026-05-07

### Fixed
- **PDF export was vulnerable to lesson-content XSS.** `exportLessonPDF` wrote `lessonContent.innerHTML` straight into a new window via `document.write`, then tried to remove `<script>`/`<iframe>` tags — but cleanup ran after `document.close()`, so inline scripts had already executed in the new about:blank context. Skilljar lessons are third-party content. Now clones the lesson DOM, strips `<script>`, `<iframe>`, `<object>`, `<embed>`, `<style>`, `<link rel="import">`, all `on*` event-handler attributes, and `javascript:` URLs *before* serializing into the new window.
- Tutor chat streams are now cancellable. Previously the stream's message handler stayed live for up to 60 s after the user closed the sidebar / switched sub-panel / SPA-navigated, writing chunks into a detached DOM bubble and saving abandoned conversations to history. `chatStream` now accepts an `AbortSignal`; sidebar-chat aborts on close, sub-panel switch, and starts a fresh stream when the user re-sends. content.js calls `cancelActiveStream` from `onRouteChange`.
- `historyDb` connection now closes on `versionchange`. Without the handler, an extension auto-update or a parallel tab schema bump would block the upgrade indefinitely and every subsequent transaction would throw `InvalidStateError`.
- Chat-history quota recovery now bounded-retries with cursor-error tracking. The previous prune was a "best-effort" cursor that ignored per-delete failures and reported success even when no space was actually freed; one retry then failed permanently and the conversation was dropped silently. New version returns the actually-deleted count, retries with double the prune target if the first attempt didn't free enough, and gives up after two attempts to prevent infinite loops on a sticky quota.
- Flashcard progress writes are now serialized through a single promise chain. `chrome.storage.local.set` is async with no ordering guarantee, so rapid box-up/box-down clicks could interleave and resurrect already-cleared boxes.
- PDF export popup-blocker rejection now surfaces a localized alert instead of failing silently. Also guards `printWindow.print()` against the user closing the popup before the 500 ms timer fires.
- Removed `style` from `sanitizeHtml`'s allowed attribute set. No internal template required it; allowing it created a sharp edge for future rendering paths (CSS exfil, clickjack overlays).

## [3.5.8] - 2026-04-30

### Fixed
- `fetchWithRetry` no longer retries 4xx client errors. The comment said "Don't retry client errors (4xx) except 429" but the throw on a 4xx was caught by the same `try/catch` and the loop kept going for the full retry budget. So a single 400/403/404 caused 4 calls to GT/GitHub — exactly the abusive pattern the comment claimed we avoided. The throw now escapes the function on the first attempt; only 429s and network errors retry.
- Streaming-chat fallback model in `page-bridge.js` was `gpt-4o-mini`, which is wrong-brand for a Claude-focused extension if `data.model` is ever missing. Switched to `claude-haiku-4-5` (cheap, fast, correct brand).

### Changed (test integrity — found by audit, not user-visible behavior change)
- `tests/protected-terms.test.js` (14 tests): rewritten from a parallel re-implementation of the production functions into an actual loader of `src/lib/protected-terms.js`. Previously, the tests would all stay green even if production was completely broken. Now the IIFE is sourced via `new Function` (same pattern as `tests/selectors.test.js`) and tests exercise the real `window._protectedTerms` API.
- `tests/content-helpers.test.js`: `escapeHtml` now loaded from `src/lib/gemini-block.js` instead of being re-defined inline. Removed 9 tautological tests (`t()` reimplementation, offline-queue cap, Map size cap, storage-quota eviction) — they all asserted on test-local logic, not production code paths. The exam/cert URL pattern tests stay (they already operated on the real constants), plus a new false-positive guard for prefix-only matches like `/quizlet`.
- `tests/background.test.js`: the "does not retry on 4xx" test was asserting `toHaveBeenCalledTimes(4)` and the comment admitted this codified the bug. Now asserts `toHaveBeenCalledTimes(1)` and is paired with new tests for 403 and 404 to guard the contract.

## [3.5.7] - 2026-04-27

### Fixed
- Verify-queue tail items no longer sit un-verified forever. The lock-clear and queue-empty checks had a brief race window: items pushed between `_runVerifyQueue`'s exit and the `.finally` clearing `_verifyLock` got queued but never scheduled (on a quiet page that meant "never"). Extracted `_kickVerifyQueue` and self-restart from `.finally` if items arrived during teardown.
- Mid-flight verify items targeting a previous language no longer write stale-language text into the now-current page. Translator now stamps `_langGeneration` on each queued item and the runner re-checks before calling `_notifyUpdate` (the await fence is seconds long; the user can switch language during it).
- `_cacheTranslation` now resolves on `tx.oncomplete` instead of returning the moment `store.put()` is queued. Callers that `await` the call now actually wait for the write to commit.
- IndexedDB cache rejects suspicious payloads before persisting them for 30 days: HTML-shaped strings, length ratios over 10×, and >95% ASCII responses for non-Latin target languages (typical refusal/error string).
- Bridge injection now retries up to 2× with exponential backoff before giving up. Single CDN hiccups, slow networks, and one-shot CSP transients no longer kill the AI tutor for the whole session. The `skillbridge:bridgeunavailable` banner only fires after the retry budget is exhausted.

### Changed
- Page bridge wraps all `puter.ai.chat` calls with a model-fallback chain (`claude-sonnet-4-6` → `claude-sonnet-4-5`, `claude-opus-4-7` → `4-6`, `gemini-2.0-flash` → `1.5-flash`). If Puter or Anthropic deprecates a model name, the tutor falls back rather than 500-erroring at the user.

## [3.5.6] - 2026-04-26

### Fixed
- AI features no longer fail silently when the Puter.js bridge fails to confirm `BRIDGE_READY` within 20 s. The translator now flips a `bridgeFailed` flag and dispatches `skillbridge:bridgeunavailable`; content.js shows a persistent banner asking the user to refresh.
- `history.pushState` / `history.replaceState` wrappers are now idempotent. Extension reloads (auto-update, dev refresh) used to capture the previous wrapper as the "original" and stack handlers, doubling `onRouteChange` calls per SPA nav and amplifying GT load.
- Cache-cleanup alarm now actually runs in active tabs. Background sent `{ type: 'CACHE_CLEANUP' }` but the content-script handler keys on `request.action`, so the 24 h alarm was dead code. Unified on `{ action: 'cacheCleanup' }` with a matching switch case.
- Google Translate rate-limit overflow no longer leaves elements in English. `_rateLimiter` now exposes an `acquire()` method that paces the batch instead of returning the source text (which content.js silently skips); the GT batch-item failure path also returns `null` for consistency.
- Translation progress bar and verify spinners are no longer stuck when the user switches language mid-batch. `processGTQueue` is now wrapped in `try/finally` so `hideTranslationProgress`, `pruneDetachedEntries`, and the gemini-block flush always run.
- Chat history is no longer silently dropped on `QuotaExceededError`. `saveConversation` now retries the `add()` once after `pruneOldHistory` deletes the oldest 20 entries, and `pruneOldHistory` resolves on the transaction's `oncomplete` so the retry sees the freed space.

### Changed
- Drop the `tabs` permission from `manifest.json`. Both `chrome.tabs.query` and `chrome.tabs.sendMessage` rely on `host_permissions` matching the active tab — the broader `tabs` permission was unused. Removes the "read your browsing history" warning string in the CWS install prompt.

## [3.5.5] - 2026-04-19

### Added
- Claude Code 101 course support (flashcard mapping + store listing)

### Changed
- Migrate AI tutor model from Claude Sonnet 4 to Claude Sonnet 4.6 (deprecation June 15)
- Refactor DOM health check to load selectors from source-of-truth, parallelize page fetches

### Fixed
- Update stale Skilljar course-page selectors (`.lesson-row` → `li.lesson-modular`, `.section-title` → `li.section`, `.course-title` → `.dp-summary-wrapper h1, h1.break-word`), with legacy selectors kept as fallback so the fix is backwards-compatible
- Exclude lesson-page-only `lessonMain` from catalog/course DOM health check (requires auth to verify — covered by manual lesson-page QA)
- Add fallback DOM selectors for Skilljar courseTime and courseOverview changes
- Add missing course slug `model-context-protocol-advanced-topics` to flashcard map
- Update YouTube InnerTube client version to 2.20260415.01.00

## [3.4.0] - 2026-04-02

### Added
- Full course coverage across all 17 Anthropic Academy modules
- DX tooling improvements for local development

### Changed
- Architecture hardening for long-term maintainability
- Apply Prettier formatting to all source files
- Update store listing metadata

## [3.3.0] - 2026-04-02

### Added
- Flashcard mode for vocabulary review
- 4 new premium languages (pt-BR, ru, vi, zh-TW)
- Code comment translation support
- Dictionary expansion with broader term coverage

### Fixed
- Resolve memory leaks and concurrency issues

### Security
- Fix XSS vulnerabilities

## [2.1.0] - 2026-03-25

### Added
- Certification safety guards — extension fully disables on proctored exams
- New course support (Claude Cowork, Subagents, MCP Advanced)
- UX overhaul
- 6 new test suites (+750 tests)

### Changed
- QA checklist and contributing guide

## [2.0.0] - 2026-03-17

### Added
- Keyboard shortcuts (Ctrl+Shift+S/L/?)
- Firefox and Edge browser support
- Exam mode for course quizzes (skip answer choice translation)
- Maintenance automation via Chrome Alarms (cache cleanup, version check)
- Glossary checker tool
- Chrome Web Store CD workflow

### Changed
- Centralize Skilljar selectors into `selectors.js`
- Extract hardcoded values to constants
- Refine AI Fluency Korean terminology

### Fixed
- Performance and CWS compliance fixes
- Accessibility improvements for WCAG 2.1 AA compliance

### Security
- Security hardening — nonce on all postMessage, UUID request IDs
- Exam prompt guard for AI tutor

## [3.0.0] - 2026-03-04

### Added
- Major rebrand and rewrite as SkillBridge for Anthropic Academy
- Block-level translation with inline tag preservation (Gemini)
- Tutor conversation history with IndexedDB storage
- Drag-to-ask tutor — select text to ask the AI tutor
- YouTube auto-translated subtitles via InnerTube API
- Privacy policy and GDPR compliance

### Fixed
- Korean font rendering
- YouTube subtitle reliability
- XSS sanitization hardening

## [2.1.0-alpha] - 2026-03-03

### Changed
- Static JSON translation system replacing LLM-based pipeline (instant, 0ms lookups)

## [2.0.0-alpha] - 2026-03-03

### Added
- Persistent translation cache (IndexedDB)
- Dynamic tutor language selection

### Fixed
- IME (Input Method Editor) composition handling
- Rewrite translation pipeline for correct API calls and speed

## [1.0.0] - 2026-03-03

### Added
- Initial release of Skilljar i18n Assistant
- Puter.js bridge for in-page AI translation
- Multi-language support via Google Translate + LLM verification
