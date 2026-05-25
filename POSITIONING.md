# SkillBridge — Positioning (locked 2026-05-25)

This document is the decision baseline for what SkillBridge is and is not.
When a feature request, dependency choice, or scope expansion lands, check
it against this file first. Update only with deliberate strategic shifts —
not for individual feature debates.

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
- SkillBridge CWS: **listing removed pending icon redesign.** Re-publication
  is the gating prerequisite for any growth push (see "Blockers before
  outreach"). Until the new icon ships and the listing is re-approved, all
  marketing motion is on hold by design — installs through the store are
  not available, only the manual / developer-mode path documented in the
  README.

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
2. **Defensible moat**. 570+ hand-curated terms × 11 premium languages,
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

1. **Re-publication after icon redesign**. The CWS listing was removed
   pending an icon redesign. Until the new icon ships and the listing
   is re-approved, there is no store install path and no public landing
   surface to point new users at — every other outreach motion is
   downstream of this. Korean and Japanese localized listings (already
   drafted under `store-assets/`) ship in the same re-publication so the
   Korea-first outreach feels native from day one, rather than racing a
   generic English listing later. **As of 2026-05-25**: the supporting
   work — listing copy nominative-use sweep, name rewrite to
   "SkillBridge — AI Course Translator", privacy URL fix to lowercase
   `/privacy`, audit-followup hardening — has all landed (PRs #137 +
   #138). The remaining blocker is purely the icon design itself, plus
   the dashboard upload steps documented in
   `store-assets/RELEASE_CHECKLIST.md`.
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
