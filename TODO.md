# SkillBridge TODO

> Strategy & scope: see [POSITIONING.md](POSITIONING.md).
> Last refreshed: 2026-05-14 (v3.5.30)

Items below are concrete engineering / ops work. Anything strategic — what
markets we enter, what we charge, what features we accept — belongs in
POSITIONING.md, not here.

## Now

- [ ] **Smoke-test the latest CWS bundle in an actual Chrome.** The 16-scenario Playwright suite (`tests/e2e/`) covers every documented README feature except YouTube subtitles (real iframe needed) and dark mode toggle (UI-only). But a real-tab eyeball test on `dist/bundled` before each CWS push is still valuable for catching CSS/visual regressions the assertion-based suite doesn't see.
- [ ] **CWS listing refresh.** Store metadata likely still shows an older version. Update description, screenshots, and "What's new" text to reflect v3.5.30 (sidebar split complete, full E2E suite, IDB cache E2E, selectors drift watcher).

## Next (this month)

- [ ] **YouTube `_BG_YT_CLIENT_VERSION` auto-bump GH Action.** Currently manual every few weeks (see comment in `src/background/background.js`). Cron workflow that pings InnerTube and opens a PR when stale. Same pattern as the new `.github/workflows/selectors-drift.yml` — easy to copy.
- [ ] **48-hour SOP for new Academy courses** (POSITIONING.md pillar #1). The dict-coverage check now enforces per-course parity ONCE a course is added to `FLASHCARD_COURSE_MAP`, but there's no automation that NOTIFIES us when a new Academy course goes live. RSS / sitemap scrape + GitHub Action that opens a "translate course X to 11 languages" issue with the per-language section skeleton pre-filled.
- [ ] **Performance budget E2E.** Measure time from page load → fully translated H1. Sets a regression detector for any future refactor that degrades cold-start. ~1h add to the suite.

## Later (when we have a real signal)

- [ ] **Memory leak profiling on long-running tabs.** v3.5.9 (stream cleanup) and v3.5.10 (timer leak) found two; the pattern suggests more. SPA navigation churn + Chrome heap snapshot diff. Probably needs a dedicated harness; the current E2E suite is functional, not memory-oriented.
- [ ] **Anonymized error telemetry.** Currently every regression is found by a user filing a GitHub issue. Even a minimal "anonymous stack-trace, 30-day retention, off by default with explicit opt-in" loop would shorten time-to-fix significantly. Must respect the [POSITIONING.md](POSITIONING.md) client-side-privacy promise; design carefully.
- [ ] **`tsconfig` strict ratchet.** Currently `strict: false` to avoid surfacing pre-existing nullability warnings. Tighten file-by-file as JSDoc gets added.

## Done — shipped this cycle (2026-05-11 → 05-14)

A burst of 18 PRs cleared most of what the v3.5.6 → 3.5.12 hotfix train had been signaling as missing infrastructure. The current state is "all README-documented features locked by E2E, all v3.5.X regression classes covered, all sidebar-chat big files split."

**Refactors:**
- `sidebar-chat.js`: 1224 → 559 lines (–54%) split across 4 modules (`chat-render.js`, `chat-history.js`, `chat-flashcards.js`, plus core panel infrastructure)
- `content.js`: 1222 → ~869 lines, GT pipeline extracted to `gt-queue.js`
- Dead `_sb` namespace exports removed

**Tests (E2E):** Playwright suite from 0 → **16 scenarios across 11 specs**: `golden-translation` (4), `exam-mode` (2), `spa-navigation` (2), `tutor-chat` (1), `stream-cancel` (1), `protected-terms` (1), `chat-history` (1), `pdf-export` (1), `rapid-switch` (1), `code-comments` (1), `idb-cache` (1).

**Tests (unit):** +50 (336 → 386). Sanitizer (gemini-block.test.js, 25 cases), protected-terms hardening (+6), gt-queue, dict-coverage self-test, etc.

**CI:** added `e2e` job (parallel workers — wall time ~1m for 16 scenarios). Added `selectors-drift` watcher (6h cron + auto-issued GitHub issue on Skilljar DOM change). Added `check-dict-coverage` + `check-i18n-keys` validators.

**Strategy:** POSITIONING.md committed (locks the "canonical Anthropic Academy extension" angle); `_sb-typedef.js` documents the cross-module namespace contract.

**Production fix:** v3.5.16 — `const sb = window._sb` hoisting bug that 386 unit tests had let through three releases. Found by the first run of the new E2E suite.

## Explicit not-doing (see POSITIONING.md for reasoning)

- ❌ Multi-LMS / general course-platform support
- ❌ Premium / paid tier
- ❌ User-supplied API key
- ❌ Server-side features that break client-side privacy
- ❌ Full TypeScript migration — `tsconfig + checkJs` + JSDoc captures the 80% benefit; full migration cost outweighs the marginal compile-time gain for an MV3 extension with direct unpacked-load workflow

## Production bottlenecks to remember

- **Firefox AMO publishing** — `cd-firefox.yml` ready; needs `AMO_API_KEY` + `AMO_API_SECRET` in GitHub Secrets.
- **CWS reviewer expectations** — raw `src/` zip submission keeps reviews fast. If we ever switch to bundled-only output, expect slower reviews.
- **Anthropic Academy DOM stability** — selectors live in `src/lib/selectors.js`. `scripts/check-selectors.js` runs on every PR (`validate` job) AND on a 6h cron (`selectors-drift` workflow) — auto-opens an issue if Skilljar changes their DOM out from under us.
- **MV3 extension content-script CSP** — forbids `eval` / `new Function` inside content scripts. The E2E harness bridges into the isolated world via a hard-coded menu of diagnostic ops (see `tests/e2e/helpers/extension.js`) — if you add a new op, add it to that switch, don't try to pass arbitrary functions through.
