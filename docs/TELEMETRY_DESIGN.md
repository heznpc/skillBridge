# Anonymous opt-in telemetry — design proposal

**Status**: design proposal, not implemented. Open for review before any code lands.
**Owner**: heznpc
**Drafted**: 2026-05-15
**Position**: outreach blocker #4 in [POSITIONING.md](../POSITIONING.md#blockers-before-outreach)

## Why this exists

Two operational gaps make this a marketing prerequisite, not a nice-to-have:

1. **Marketing ROI is unmeasurable**. POSITIONING.md commits to a Korea-first outreach push (Velog / Brunch / GeekNews / Disquiet → note.com / atmarkit). Without telemetry, we can't tell which channel converts, which post sticks, or whether the certificate-accessibility framing is actually changing behavior vs the old translator framing. We'll be running outreach blind.
2. **Bug discovery latency is bad**. Every regression caught between v3.5.6 → v3.5.16 was discovered by a user filing a GitHub issue. The v3.5.16 hoist bug shipped to all users for 3 releases before E2E caught it on its first run. Even with the 16-scenario E2E suite locking in everything README-documented, novel regressions in the wild are still issue-driven, which is the slowest possible feedback loop.

Neither of those is solved by reading the GitHub issue tracker harder.

## Non-negotiable constraints

From POSITIONING.md "Things we will not do" and the new "Blockers before outreach" #4:

| Constraint | Why |
|---|---|
| **Off by default**, explicit opt-in only | "Free, no API key, no analytics" is the brand promise |
| **Error stacks only** — no PII | Privacy policy currently says "No analytics, telemetry, or tracking of any kind" |
| **No user content** (no chat messages, no selected text, no translated text bodies) | Same |
| **No full URLs** — only course slug + lesson hash | URL paths can leak lesson identifiers in titles |
| **No learning history** (no completion %, no quiz answers, no flashcard state) | Could be reconstructed to identify users in small populations |
| **30-day server retention** | Compliance simplicity; anything longer requires GDPR DSR plumbing we don't have ops for |
| **User-purgeable** | One button in popup that wipes the local outbox + sends a delete-request beacon |
| **Visible in source** | Open-source repo; what we collect must be auditable by any user |

If we can't meet *all* of these simultaneously, we don't ship this.

## Two product surfaces

The constraints make this awkward but not impossible. Two telemetry surfaces are needed:

### Surface 1 — anonymized error reporter (the bug-discovery half)

**Trigger**: any uncaught error in service worker or content script.

**Payload**:
- `version` — extension version string (e.g. `"3.5.34"`)
- `error_class` — `error.name` (e.g. `"TypeError"`)
- `error_message` — `error.message`, sanitized: regex-strip anything matching `/[A-Za-z0-9+/]{40,}/` (long base64-like blobs that could be user content) and any sequence longer than 200 chars
- `stack` — first 5 frames of `error.stack`, with file paths stripped of everything before `chrome-extension://*/`
- `module_tag` — which content-script module the error fired in (`gt-queue` / `sidebar-chat` / `content` / etc.) — read from a top-of-file constant, not from the stack
- `lang` — selected target language (e.g. `"ko"`)
- `slug_hash` — SHA-256 of the course slug, first 8 hex chars (`"a3f9b127"`) — lets us correlate regressions to specific courses without leaking which user was on which slug
- `client_id` — random UUID generated on opt-in, stored in `chrome.storage.local`, never sent except in telemetry events; rotated on opt-out

**Excluded explicitly**: user agent string (fingerprinting), screen dimensions, IP address (we use HTTPS POST with `mode: 'cors'`, server logs IP for normal HTTP reasons — see "Server-side" below), lesson body content, chat content, page URL beyond slug-hash.

### Surface 2 — install/uninstall lifecycle pings (the marketing-ROI half)

**Trigger**:
- `install` event from `chrome.runtime.onInstalled` (one ping, lifetime)
- `uninstall` URL set via `chrome.runtime.setUninstallURL` (one ping, lifetime)
- *Nothing else*. No daily heartbeats, no MAU/DAU events, no feature-usage events.

**Payload (install)**:
- `version`
- `lang` — `chrome.i18n.getUILanguage()` (browser locale, not in-product target lang — used to confirm "did Korea outreach work")
- `referrer_tag` — optional `?ref=` query param on the CWS link, set by outreach channels (e.g. `velog`, `brunch`, `geeknews`)
- `client_id`

**Payload (uninstall)**:
- `version`
- `client_id`
- `install_age_days` — number of whole days since the install event (let us tell "uninstalled in <1 day after install" — UX problem — from "uninstalled after 3 weeks" — different problem)

The install/uninstall pair lets us measure conversion-from-outreach without measuring anything in between. That deliberately gives up MAU/DAU; that's the trade.

## Opt-in UX

```
┌─────────────────────────────────────────────────────────┐
│ SkillBridge — Settings                                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ Help improve SkillBridge?                               │
│ ☐ Send anonymous error reports                          │
│   (Crash details only, no personal data,                │
│    no learning history. Off by default.)                │
│                                                          │
│ ☐ Tell us where you came from                           │
│   (Install / uninstall pings + your browser locale.     │
│    Helps us focus on regions that need translation.)    │
│                                                          │
│ [What we collect →]  [Delete my data]                   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

- Both toggles **default to off**.
- Two separate toggles because someone might consent to "tell me when it crashes" but not "tell me what region installs convert."
- "What we collect →" deep-links to `privacy.html#telemetry` (new anchor — see Privacy policy co-requirement below).
- "Delete my data" wipes local `client_id` + sends a one-shot delete beacon to the server (server matches on `client_id`, deletes everything, returns 204).

## Server-side

This is the hard part. POSITIONING.md says "we do not add server-side infrastructure." Telemetry by definition requires a receiver. Options, in order of POSITIONING-compatibility:

### Option A — Cloudflare Worker + D1 (recommended)

- Single Worker route, single D1 SQLite table.
- Free tier: 100k requests/day, 5GB D1. At 710 users today and even 100k installs in 12 months, we're nowhere near the cap.
- Schema:
  ```sql
  CREATE TABLE telemetry (
    id INTEGER PRIMARY KEY,
    event_type TEXT CHECK (event_type IN ('error', 'install', 'uninstall', 'delete')),
    client_id TEXT,
    payload_json TEXT,
    received_at INTEGER,
    expires_at INTEGER  -- received_at + 30 days
  );
  CREATE INDEX idx_expires ON telemetry(expires_at);
  ```
- 30-day retention: cron Worker runs nightly, `DELETE FROM telemetry WHERE expires_at < unixepoch();`.
- Server logs IP at Cloudflare edge (standard HTTP). Worker code itself **does not store the IP** in D1 — only the sanitized payload above. Cloudflare's edge logs roll over per their retention.
- DSR (delete-my-data): user hits "Delete my data" → POST with `client_id` → `DELETE FROM telemetry WHERE client_id = ?`. Server returns 204. We never had a name/email tied to the client_id, so this is sufficient.
- Cost: $0/mo at our scale.

**Open question**: who owns the Cloudflare account? Personal account = bus-factor of 1; org account requires a legal entity SkillBridge doesn't have. Leaning: personal account with credentials documented in the repo as a recovery process. Re-evaluate if Anthropic Ambassador formalizes the project.

### Option B — Anthropic-hosted (hypothetical, not committed)

If Anthropic Ambassador formalizes the relationship, they may offer to host telemetry. POSITIONING sunset triggers cover this — re-open the doc then. Until that happens: Option A.

### Option C — Don't ship Surface 2, ship only Surface 1

If the server-side ownership question stays unresolved, we could ship only error reporting (Surface 1) — bug discovery is solved, marketing ROI stays unmeasured. Better than nothing. The CWS listing v3.5.4 → v3.5.33 refresh (PR #124) at least removes the staleness signal that's been hurting installs; we can measure Korea outreach indirectly via CWS install-count deltas before/after each post.

**Recommendation**: try Option A; fall back to Option C if Cloudflare ownership unresolved at implementation time.

## Privacy policy co-requirement

`docs/privacy.html` currently says, verbatim:

> No analytics, telemetry, or tracking of any kind

Shipping any version of this design **requires updating that line in the same PR**. Proposed replacement:

```
Anonymous error reporting and install / uninstall pings are
available as opt-in features. They are off by default. When
enabled, they send only the data listed in "Telemetry (opt-in)"
below, with 30-day server retention and a one-click delete in
the extension popup. No personal information, learning history,
or page content is ever included.
```

Plus a new `#telemetry` section in the policy listing exactly what each surface sends (the payloads above), what is excluded explicitly, retention, the delete-my-data flow, and the server hosting (Cloudflare Worker + D1). Auditable in source by anyone.

## What the implementation PR will look like

Approximate scope when this is approved:

1. `src/lib/telemetry.js` (~80 lines): payload builders for both surfaces; sanitizer regex; `client_id` lifecycle; POST helper with retry-once-then-drop. Pure functions where possible, easy to unit-test.
2. `src/background/background.js`: wire `chrome.runtime.onInstalled` + `chrome.runtime.setUninstallURL`, hook the global `self.addEventListener('error', ...)` for service worker errors.
3. `src/content/content.js`: hook `window.addEventListener('error', ...)` and `window.addEventListener('unhandledrejection', ...)` — gated behind opt-in flag.
4. `src/popup/popup.html` + `popup.js`: two new toggles, "Delete my data" button, "What we collect" link to privacy policy.
5. `_locales/*/messages.json`: 11 premium-language strings for the new popup copy. **POSITIONING operating-principle gate**: "default reject" for new UI without all-11-language coverage.
6. `docs/privacy.html`: the rewrite above.
7. `tests/lib/telemetry.test.js`: ~10 unit tests covering payload sanitization, regex stripping, slug-hash determinism, opt-out clears `client_id`.
8. `tests/e2e/telemetry.spec.js`: 1 scenario — toggle on, trigger an error, intercept the POST, assert payload shape and excluded-fields.

**Not yet included**: Cloudflare Worker source (in this repo or a sibling). Decision deferred to the implementation PR.

## Blockers before the implementation PR can land

- [ ] Trademark resolution (POSITIONING blocker #2) — if rebrand is forced, the Cloudflare Worker domain and `client_id` namespace would have to migrate; better to know now.
- [ ] Cloudflare account ownership decision (Option A vs Option C above).
- [ ] One independent privacy review of the design doc — ideally not me (drafter).
- [ ] Mock the server in E2E so the new spec doesn't require a live endpoint.

## Out of scope (don't expand this design without re-opening POSITIONING)

- ❌ Any feature-usage telemetry (clicks, panel opens, language switches) — would let us reconstruct learning behavior
- ❌ Performance telemetry (timing histograms) — measure in E2E instead
- ❌ A/B testing infrastructure
- ❌ Crash-free-sessions metrics — would need MAU/DAU events
- ❌ Selling, sharing, or routing the data to any third party — period
