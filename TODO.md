# SkillBridge TODO

> Strategy & scope: see [POSITIONING.md](POSITIONING.md).
> Last refreshed: 2026-05-13 (v3.5.14)

Items below are concrete engineering / ops work. Anything strategic — what
markets we enter, what we charge, what features we accept — belongs in
POSITIONING.md, not here.

## Now (this week)

- [ ] **v3.5.13/14 smoke test in an actual browser** — load `dist/bundled` unpacked in Chrome, run through Skilljar → sidebar → chat → history → flashcards → close. The v3.5.13 split moved `savedChatHTML` / panel flags onto `_sb._chat.state`; unit tests pass but the cross-module wiring hasn't been validated end-to-end. PR #102 and #103 both left this unchecked.

## Next (this month)

- [ ] **Playwright E2E (6 priority scenarios)** — spec in [docs/E2E_PLAN.md](docs/E2E_PLAN.md). Without it the v3.5.6 → 3.5.12 hotfix-train pattern continues. Estimated 4–6 hours.
- [ ] **Extract `gt-queue.js` from `content.js`** — the STATIC TRANSLATIONS + GT QUEUE section (lines ~517–872 of content.js, 9 functions) is the largest remaining content-script chunk. Same `_sb._chat`-style namespace pattern that validated in v3.5.13.
- [ ] **`scripts/check-dict-coverage.js`** — per-language × per-Anthropic-course term coverage check. Today `check-dicts.js` only checks freshness. POSITIONING.md commits us to "new course → 11 languages within 48h"; we need machine enforcement.
- [ ] **YouTube `_BG_YT_CLIENT_VERSION` auto-bump GH Action** — currently manual every few weeks (see comment in `src/background/background.js`). Cron workflow that pings InnerTube and opens a PR when stale.

## Later (when we have a real signal)

- [ ] **Extract `chat-flashcards.js` from `sidebar-chat.js`** — 250 lines, tangled with `savedChatHTML` panel state. Safe to extract once `_sb._chat.state` pattern has run in production for ≥ 1 release without regressions.
- [ ] **Memory leak profiling on long-running tabs** — v3.5.9 (stream cleanup) and v3.5.10 (timer leak) found two; the pattern suggests more. SPA navigation churn + Chrome heap snapshot diff.
- [ ] **Anonymized error telemetry** — currently every regression is found by a user filing a GitHub issue. Even a minimal "anonymous stack-trace, 30-day retention, off by default with explicit opt-in" loop would shorten time-to-fix significantly. Must respect the [POSITIONING.md](POSITIONING.md) client-side-privacy promise; design carefully.
- [ ] **`tsconfig` strict ratchet** — `tsconfig.json` is currently `strict: false` to avoid surfacing a wave of pre-existing nullability warnings. Tighten file-by-file as JSDoc gets added.

## Done — moved out of "Now" recently

- v3.5.13 quality pass (#102): sidebar-chat split, `tsconfig + checkJs`, `_sb-typedef.js`, `scripts/check-i18n-keys.js` + CI, protected-terms hardening, production console strip
- v3.5.14 P1 cleanup (this PR): dead `_sb` exports removed, `tests/gemini-block.test.js` lock-in, TODO.md rewrite, POSITIONING.md committed

## Explicit not-doing (see POSITIONING.md for reasoning)

- ❌ Multi-LMS / general course-platform support
- ❌ Premium / paid tier
- ❌ User-supplied API key
- ❌ Server-side features that break client-side privacy
- ❌ Full TypeScript migration — `tsconfig + checkJs` + JSDoc captures the 80% benefit; the migration cost outweighs the marginal compile-time gain for an MV3 extension with direct unpacked-load workflow

## Production bottlenecks to remember

- **Firefox AMO publishing** — `cd-firefox.yml` ready; needs `AMO_API_KEY` + `AMO_API_SECRET` in GitHub Secrets.
- **CWS reviewer expectations** — raw `src/` zip submission keeps reviews fast. If we ever switch to bundled-only output, expect slower reviews.
- **Anthropic Academy DOM stability** — selectors live in `src/lib/selectors.js`; `scripts/check-selectors.js` runs in CI against the live site. When that turns red, drop everything and fix.
