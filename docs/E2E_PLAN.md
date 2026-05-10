# E2E Test Plan (Deferred)

Status: **planned**, not yet implemented. Tracked from the v3.5.13 quality
pass on 2026-05-10. The current Jest suite covers pure functions and message
shapes well, but never exercises the real load order / inter-module wiring
(content.js → banners.js → chat-render.js → sidebar-chat.js → chat-history.js,
plus the page-bridge / background trip).

This file is the working spec for what to add when we get there. Update it
when scope changes; do not let it bit-rot silently.

## Why we need this

The recent v3.5.6 → v3.5.12 hotfix train surfaced a recurring class of bug
that no unit test could catch:

- v3.5.6 cache-cleanup `action` vs `type` discriminator mismatch
- v3.5.7 translator + bridge race during SPA navigation
- v3.5.8 `fetchWithRetry` 4xx fail-fast bug
- v3.5.9 sidebar stream cancel / IDB resilience
- v3.5.10 YouTube subtitle timer leak

All of these required a real extension load + a real Skilljar-shaped page to
reproduce. We've been catching them in production. Playwright + a minimal
fixture page would close that gap.

## Stack

- **Playwright** (`@playwright/test`) — Chromium + Firefox launchers, native
  extension loading via `--load-extension=<dist/firefox>` / `--disable-extensions-except`.
- **Local fixture pages** under `tests/e2e/fixtures/` — static HTML that
  mimics the Skilljar DOM shape (lesson body, quiz form, header, video
  container) without depending on a live skilljar.com URL.
- **Network stubbing** via Playwright `route()` for:
  - `https://translate.googleapis.com/*` — return canned translations
  - `https://api.github.com/*` — return canned latest-release JSON
  - `https://api.puter.com/*` (or whatever the page-bridge fetches) — return
    canned Gemini stream chunks

## Coverage targets (priority order)

1. **Golden page translation** — load fixture, set language=ko in popup,
   assert visible body text becomes Korean and the cache hit path works on
   second visit.
2. **SPA navigation mid-translation** — start translating, push a new URL via
   `history.pushState`, assert no stale translation lands in the new page
   (verifies `_langGeneration` invariant).
3. **Cache cleanup alarm** — fast-forward Chrome `alarms` to fire
   `cache-cleanup` after a stale entry is in IDB, assert it's purged.
4. **Stream cancel on sidebar close** — open chat, start a (stubbed) stream,
   close sidebar, assert `AbortController.signal.aborted === true` and no
   half-saved IDB entry.
5. **Protected Terms restoration** — fixture page with "클로드" in body,
   target=Korean, assert it ends as "Claude" after the verify step.
6. **History panel + flashcard panel switch** — open history, then open
   flashcards from chat without restoring chat first; assert we don't blow
   away `savedChatHTML` (this was a near-miss bug during the v3.5.13 split).

## File layout (when implemented)

```
tests/e2e/
  fixtures/
    skilljar-lesson.html
    skilljar-quiz.html
    youtube-embed.html
  helpers/
    extension.ts          — launch helper (loads dist/firefox into Playwright)
    network-stubs.ts      — GT / GitHub / Puter route handlers
  golden-translation.spec.ts
  spa-navigation.spec.ts
  cache-cleanup.spec.ts
  stream-cancel.spec.ts
  protected-terms.spec.ts
  panel-switch.spec.ts
playwright.config.ts
```

Add `e2e:install` (`playwright install chromium`) and `e2e` (`playwright test`)
scripts to `package.json`. Wire into a separate CI job — keep the fast `test`
job under 30 s by not running E2E on every push.

## Open questions

- Do we ship a real Skilljar lesson HTML snapshot, or hand-craft a minimal
  fixture? Real snapshot catches more selector regressions; minimal fixture
  is cheaper to maintain.
- Service worker lifecycle in Playwright — Chromium suspends it; we may need
  `chrome.runtime.getBackgroundPage()` (deprecated in MV3) replacement via
  Playwright's `serviceWorkers()` API.
- Firefox MV3 differences — separate spec file or per-test guards?
