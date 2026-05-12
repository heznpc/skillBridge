# Changelog

All notable changes to SkillBridge are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
