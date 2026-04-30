# Changelog

All notable changes to SkillBridge are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
