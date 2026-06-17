# SkillBridge — Positioning (locked 2026-05-25)

This document is the decision baseline for what SkillBridge is and is not.
When a feature request, dependency choice, or scope expansion lands, check
it against this file first. Update only with deliberate strategic shifts —
not for individual feature debates.

## Update 2026-06-02 — first-party data + market-pulse (supersedes conflicts below)

First-party CWS data (full ~12-week curve since the 2026-03-09 launch) and a
market-pulse inform this update. The first-party numbers below are verified
directly against the CWS console CSV exports (2026-06-02); the external market
claims (security environment, plugin directory) are from the market-pulse's web
sources and are **not yet independently re-verified in-repo** — treated as
directional, flagged inline. Where this block conflicts with sections below,
**this block wins** until the doc is re-locked. (Raw install/active numbers are
REDACTED — internal only, never on any public surface.)

- **Global, not Korea-first** (verified vs CSV). The base is **globally
  distributed with no dominant market**: top install regions are Italy, the **US**,
  France, Japan, Brazil, then Korea, Germany, Spain (top install *language* is
  en-US). It is accelerating (the most recent month was the biggest). So the
  "Korea-first operational definition" below is **demoted to a watch-list** — but
  note the earlier "Europe-led / Korean ~0 / US minor" read was **wrong**: the US
  is a **top-2 market** and Korea is mid-pack (~#6), not negligible. Default
  framing is global / English-default — a single English CWS listing (ko/ja store
  listings were dropped; the in-product UI stays localized in 11 languages). If a
  localized listing is ever revisited, Japanese and Korean (each ~#6 by
  language/region) are the first candidates — not a priority now.
- **Why Italy is #1 — a verified organic-referral mechanism** (web-verified
  2026-06-02). Italy's top install rank traces to an external, multilingual
  developer blog whose Anthropic-Academy article explicitly recommends SkillBridge
  and links the store (article published 2026-03-12 = Italy's first-install date;
  a living article — page metadata `dateModified` is 2026-06-02, body text reads
  "Updated April 2026"; both confirmed by raw-HTML re-fetch, not a summary; the
  site publishes in the same ~10 languages as the
  non-English install long-tail). The replicable lever this proves: **non-English
  Academy content → "great, but it's English-only" demand → SkillBridge as the
  linked solution → sustained installs** (Italy shows sustained growth, not a
  launch burst). This is the highest-confidence growth signal in the data. Source
  person / URL is **REDACTED** — internal & outreach use only, never on a public
  surface.
- **Security / privacy as a first-class differentiator** (was a "safety
  footnote"). *Primary-verified 2026-06-02 — sources read directly this session,
  not inherited from a prior session:* Anthropic's own Claude-in-Chrome extension
  shipped the **"ClaudeBleed"** flaw — any extension (even zero-permission) could
  hijack the agent and exfiltrate Gmail / Drive / GitHub; only **partially** patched
  in **v1.0.70 (2026-05-06)**, the origin-trust boundary stays exploitable in
  privileged mode (LayerX, pub. 2026-05-07). Separately, Snyk's **ToxicSkills**
  audit (scan 2026-02-05) found **13.4%** of 3,984 skills carry a critical issue
  (36.8% any flaw, 76 confirmed malicious) — but the scope is **ClawHub + skills.sh
  (the OpenClaw / Claude Code / Cursor skill supply chain), explicitly NOT
  Anthropic's plugin marketplace**. Do **not** phrase this as "Anthropic 13%" — that
  would be a factual error. Either way, SkillBridge's posture — free, client-side,
  no API key, **no agentic action**, exam-disable — is a real trust edge and a fit
  for an "Anthropic Verified"–type review bar. Pursue that bar with the
  client-side-integrity posture intact (no server, stays free).
- **Distribution is multi-channel; CWS is one of N** (verified vs CSV). The
  US-locale trademark removal (2026-05-12) cut the US install rate by roughly half
  (US is a top-2 market, so this was a **real loss**, not negligible), yet
  **aggregate** growth kept accelerating because other markets carried it —
  single-channel risk is proven but was not existential. Track-1 first surface =
  the official plugin directory (submit via clau.de/plugin-directory-submission;
  reviewed into **anthropics/claude-plugins-official** — Anthropic-curated, ~29k★,
  repo created 2025-11-20 per gh-api, *not* the secondary-sourced "launched
  2026-05-22"; broader pool in -community, created 2026-03-20); CWS re-publication — **including US
  re-listing, which has real upside given the US is top-2** — is worthwhile but
  **parallel-not-gating**.
- **ChatGPT / Claude surface is real, not hypothetical.** chatgpt.com referrers
  show up in first-party page-view data. Treat the cross-assistant surface as a
  first-class channel in repositioning rather than assuming Chrome is the only home.
- **Competitor landscape = different layers.** Claude-in-Chrome (1st-party,
  agentic browser agent) and Skill Viewer / SkillKit (skill authoring & viewing)
  are adjacent layers; there is still **no direct competitor** to "Academy in-page
  translation + in-course tutor". Don't chase their lanes (authoring pivot,
  any-MOOC translation, paid tiers) — those violate the non-goals below.
- **Stale facts corrected:** the non-infringing icon (half-sun + bridge) shipped
  on `main` (v3.5.35); the CWS removal is **US-locale-only** (not a global
  delisting, not "registry-side stale"); the privacy-policy URL is
  **case-sensitive, capital-B** `https://heznpc.github.io/skillBridge/privacy`
  (the lowercase form 404s).

## Market snapshot (2026-05-15)

- Anthropic Academy launched **2026-03-02**. 18 free courses (catalog watcher
  flagged `ai-fluency-for-small-businesses` as the latest, 2026-05-14), all
  English only.
- "Tens of thousands" of learners worldwide and growing — most outside
  English-native markets. **Korea is the disproportionate share**: Claude.ai
  Korean MAU was reported at ~268K with +70% MoM in Q1 2026, the fastest-
  growing non-English region. Anthropic established a Korea legal entity in
  Q1 and is hiring locally.
- Anthropic has **not** announced official translation. The Skilljar platform
  supports localization but no roadmap is public. (See sunset triggers.)
- Anthropic is running Code with Claude in SF / London (2026-05-19) / Tokyo,
  plus a new global Claude Ambassador program — actively cultivating
  community tools.
- Direct competitors: **none**. Generic translators (Trancy, Language
  Reactor, Sabi, Nano Immersive) target Netflix / YouTube / Coursera — not
  AI training.
- The dominant fallback is Chrome's built-in translate (with Gemini Nano
  on-device since 2025). Free, ubiquitous, but no AI terminology fidelity,
  no tutor, no exam mode.
- SkillBridge CWS (corrected 2026-06-02): the listing is **live (v1.0.1)**; only
  the **US locale** was removed (2026-05-12, trademark — the old radial-spark icon),
  not a global delisting. The non-infringing icon (half-sun + bridge) has since
  shipped on `main`. Re-publication of v3.5.39 + US re-listing is worthwhile but
  **parallel-not-gating** — first-party data shows *aggregate* growth continued
  straight through the US removal (carried by a globally-distributed base; the US
  itself is top-2 and lost ~half its install rate). CWS is one channel of several
  (see the 2026-06-02 update block; plugin directory is the track-1 first surface).

## Position (one sentence)

**SkillBridge is the canonical way for non-English learners to earn an
Anthropic Academy certificate in their own language. We do not translate
other course platforms — by choice.**

Why "certificate" instead of "translation": translation is the means, the
certificate is the outcome learners actually want. Framing the product
around the outcome makes the value legible to users who don't think of
themselves as needing a translator (e.g. learners who *can* read English
slowly but lose comprehension on dense terminology and run out of time on
the exam). It also keeps us honest — every feature has to defensibly move
the needle on completion, not just translation surface area.

## Why this position (three reasons)

1. **Timing window**. Academy is 2.5 months old. The narrative "if you want
   to finish Academy in your language, install SkillBridge" is still up
   for grabs. In 3–6 months it gets harder to dislodge an incumbent.
2. **Defensible moat**. 1,100+ hand-curated terms × 12 premium languages,
   plus mother-language AI tutoring that knows the current lesson, is the
   asset competitors won't replicate. They optimize for breadth (any-site
   translation); we optimize for a niche they have no incentive to serve.
   The moat compounds with every new Academy course.
3. **Anthropic optionality**. The Ambassador program is open right now. If
   Anthropic later runs official localization, SkillBridge is the obvious
   acquisition / endorsement / data-source target — but only if our
   positioning stays focused. A "general AI course translator" has no such
   option.

## Three pillars (the product promise)

Order matters: this is the order users experience value, and the order in
which we make trade-off decisions.

1. **Certificate accessibility** — a non-English speaker who installs
   SkillBridge can realistically *finish* an Anthropic Academy course and
   pass the certification exam. Every other pillar serves this one. If a
   feature doesn't move completion or pass-rate, it's decoration.
2. **Mother-language AI tutor** — Claude via Puter.js, knows the current
   course, answers in the learner's language, no API key, no signup. This
   is what makes the certificate *achievable* (not just legible) for a
   learner whose English comprehension floor is below the course content
   ceiling.
3. **AI terminology fidelity** — every premium language has a hand-curated
   dictionary. New Academy course → terminology update within 48 hours
   (mechanically enforced by `check-academy-courses.js` + `check-dict-
   coverage.js`, see below). Fidelity is what makes the tutor's answers
   match what the slides actually say.

### Safety footnotes (load-bearing but not pillars)

These are non-negotiable invariants — they keep the product from being
mistaken for a cheating tool or a privacy hazard — but they don't drive
user adoption on their own.

- **Exam awareness**: quiz answer choices are never translated; proctored
  certification exams disable the extension entirely.
- **Client-side only**: no server, no telemetry by default, no API key.
  See "Things we will not do" and the telemetry note under "Blockers
  before outreach".

## Korea-first operational definition

Korea is the highest-leverage market right now (largest non-English
Claude.ai user base, fastest growth, Anthropic legal entity present,
language and cultural distance from English big enough that translation is
load-bearing for completion). "Korea-first" is not exclusivity — it's a
weighting:

- **Content priority**: Korean translations of any new Academy course ship
  first when the academy-courses-drift watcher fires. Other premium
  languages follow within the same week.
- **Bug priority**: Korean-specific selector / rendering / GT-pipeline
  regressions are P0; other languages P1 by default unless a similar
  number of users is affected.
- **Feature requests**: when two feature requests conflict on roadmap, the
  one with measurable Korean-user impact wins.
- **Outreach order**: Korea (Velog, Brunch, GeekNews, Disquiet, /r/Korea)
  → Japan (note.com, atmarkit) → others. Reasoning: Anthropic's Korea
  entity makes Korean traction strategically legible inside Anthropic in a
  way that Brazilian or French traction would not (yet) be.

This is reviewed quarterly. If Japanese MAU starts to overtake Korean, or
if Anthropic opens a Japan office, the weighting shifts.

## Things we will not do

- **Add other Skilljar customers** (Calendly Academy, Atlassian Academy,
  etc.). Different terminology dilutes the moat.
- **Add Coursera / edX / Udemy translation**. Trancy / Language Reactor
  own that space.
- **Add a paid tier or "pro" features**. "Free, no API key" is the brand
  promise.
- **Require an API key for any feature**. Same reason.
- **Add features that need server-side infrastructure**. Breaks the
  client-side privacy promise; introduces ops cost we can't fund without
  monetization (see above). Anonymized opt-in error telemetry is the one
  carefully-scoped exception under evaluation — see telemetry note.

## Quality investments that compound

These are the work items the positioning *makes load-bearing* — they're
the mechanisms that defend the three pillars above. Marketing / outreach
moves are listed under "Blockers before outreach" instead; this section is
just the engineering that has to stay green.

1. ~~**48-hour SOP for new Academy courses**~~ — **shipped 2026-05-14** as
   `scripts/check-academy-courses.js` + `.github/workflows/academy-
   courses-drift.yml`. A 12-hour cron fetches the public catalog at
   `anthropic.skilljar.com/`, extracts every course slug, and cross-
   references against `FLASHCARD_COURSE_MAP` in `src/lib/constants.js`.
   When a live slug is unknown to the map, the workflow auto-opens an
   idempotent issue with the per-language follow-up checklist. Pillar #3
   is now mechanically enforced end-to-end: dict-coverage catches missing
   sections within a course (after the slug lands in the map), and this
   new watcher catches missing slugs entirely. The 48-hour SLA is no
   longer honor-system. **First-run catch (the same day)**: the script
   flagged `ai-fluency-for-small-businesses` (Academy's 18th course) as
   unknown — the very gap the workflow exists to surface.
2. ~~**Per-language × per-course dictionary coverage check**~~ — **shipped
   in v3.5.18** as `scripts/check-dict-coverage.js`. Fails CI if any of
   the 10 premium languages is missing terminology for any course
   referenced from `FLASHCARD_COURSE_MAP`. Five-check shape: section
   parity, English-key parity, FLASHCARD_COURSE_MAP referential integrity,
   orphan section detection, and `_meta.version` sync with manifest.
3. ~~**Playwright E2E suite**~~ — **shipped** across v3.5.16 → v3.5.30,
   currently 16 scenarios across 11 specs (was originally scoped for 6 in
   `docs/E2E_PLAN.md`). Covers every documented README feature except
   YouTube subtitle activation (real iframe required) and dark mode
   toggle (UI-only, low risk). Caught a real production regression on its
   very first run (v3.5.16 fixed the `const sb = window._sb` hoist bug
   that 386 unit tests had let through three releases).
4. ~~**Selectors drift watcher**~~ — shipped in v3.5.29 as a 6h cron that
   runs `check-selectors.js` against the live Skilljar pages and auto-
   opens an idempotent issue when it fails. Closes the "Skilljar
   redeploys mid-week, our PR queue is closed, users see broken pages for
   days" gap.

## Blockers before outreach

These are the gates that have to clear before a Korea / Japan growth push
or an Ambassador application is worth the user-facing effort. Pillars
above are about *what* the product is; this section is about *what has to
be true before we tell anyone*.

1. **Re-publication of v3.5.39 + US re-listing** (downgraded from gating —
   see 2026-06-02 update). The listing is live (only the US locale was removed
   2026-05-12), so there *is* a store install path for most of the world; this is
   no longer a hard gate on all outreach. **As of 2026-06-02**: the supporting
   work is done — non-infringing icon shipped (v3.5.35, half-sun + bridge), listing
   copy reframed global/English-only (ko/ja listings dropped), name is "SkillBridge
   — AI Course Translator". The privacy-policy URL must be the **capital-B**
   `https://heznpc.github.io/skillBridge/privacy` (the lowercase form 404s and
   blocks dashboard submission). Remaining = the dashboard upload + privacy-tab
   steps in `store-assets/RELEASE_CHECKLIST.md` (§3, §3b).
2. **Ambassador application**. Open program, deliberately scoped at
   community builders. SkillBridge fits the profile (free, single-
   audience, demonstrated traction). Application drafted, submission
   blocked on #1 — applying without a live store listing would burn the
   one-shot first impression.
3. **Anonymized opt-in telemetry** (new). Promoted from Later because
   we can't measure marketing ROI without it. Hard constraints: off by
   default, explicit opt-in toggle in popup, error stacks only (no PII,
   no user content, no full URLs, no learning history), 30-day retention,
   user-purgeable. Must respect the client-side-privacy commitment in
   "Things we will not do". Design carefully — get this wrong once and
   it's the only thing reviewers remember about us.

### Marketing readiness sequence

Once #1–#2 are cleared:

- **T+0 to 2 weeks**: CWS multilingual listing live; Ambassador
  submission filed.
- **T+2 to 4 weeks**: Korean content launch (Velog / Brunch / GeekNews /
  Disquiet), Japan reach-out (note.com / atmarkit). Anchor each post on
  the certificate-accessibility framing, not "translator".
- **T+4 weeks onward**: telemetry-informed iteration; head-to-head
  comparison content against Chrome built-in translate (specifically: AI
  terminology fidelity and pass-rate impact).

## Sunset triggers (re-open this document)

- **Anthropic ships official translation** → translation becomes
  commoditized. Re-position around the tutor + flashcards + exam mode
  (still differentiated). *As of 2026-05-25, the path-of-least-
  resistance for "official translation" looks like one of: (a)
  Anthropic enables Skilljar's built-in 11-language pack add-on for
  anthropic.skilljar.com, or (b) Anthropic ports Academy content
  to Coursera — already underway, with 4 courses + 1 Specialization
  live on the [Anthropic Coursera partner page](https://www.coursera.org/partners/anthropic).
  Coursera handles subtitle / audio i18n natively, so courses migrated
  there are out of scope for SkillBridge by design. Watch the Coursera
  catalog quarterly; if it absorbs the Korean-priority courses we
  target, the relative leverage of the Korean-on-Skilljar niche
  shrinks fast.*
- **CWS install count crosses 10,000 and plateaus for 6 months** → maybe
  the Anthropic-only niche is capped; re-evaluate Skilljar-platform
  expansion.
- **Anthropic proposes acquisition / formal partnership** → immediate
  strategic conversation; this doc is the starting point.
- **Puter.js becomes unreliable, paid, or shuts down**. The tutor
  pillar depends on a third party we don't control. Mitigation today is
  zero — if Puter changes terms, the tutor breaks for every user
  overnight. Pre-mitigation work (BYO-key fallback, alternative
  provider abstraction) violates "Things we will not do" today, so the
  trigger is: if Puter signals instability, we revisit those rules.

## Operating principles (for day-to-day decisions)

- If a PR makes a non-English learner more likely to finish an Anthropic
  Academy course, default ship.
- If a PR opens us to other platforms, default reject and link this doc.
- If a PR adds a dependency on a paid service or API key, default reject.
- If a PR meaningfully improves the AI tutor's contextual awareness of
  the current lesson, default ship.
- If a PR ships a new feature without updating the relevant `_LABELS`
  dict to cover all 11 premium languages, default reject (we don't ship
  English-only UI in a "translate this for non-English speakers"
  product).
- If two PRs conflict and one has measurable Korean-user impact, the
  Korean-impact PR wins. (See "Korea-first operational definition".)
