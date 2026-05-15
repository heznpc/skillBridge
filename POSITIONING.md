# SkillBridge — Positioning (locked 2026-05-13)

This document is the decision baseline for what SkillBridge is and is not.
When a feature request, dependency choice, or scope expansion lands, check
it against this file first. Update only with deliberate strategic shifts —
not for individual feature debates.

## Market snapshot (2026-05-13)

- Anthropic Academy launched **2026-03-02**. 17 free courses, all English only.
- "Tens of thousands" of learners worldwide and growing — most outside English-native markets.
- Anthropic has **not** announced official translation. The Skilljar platform supports localization but no roadmap is public.
- Anthropic is running Code with Claude in SF / London (2026-05-19) / Tokyo, plus a new global Claude Ambassador program — actively cultivating community tools.
- Direct competitors: **none**. Generic translators (Trancy, Language Reactor, Sabi, Nano Immersive) target Netflix/YouTube/Coursera — not AI training.
- The dominant fallback is Chrome's built-in translate (with Gemini Nano on-device since 2025). Free, ubiquitous, but no AI terminology fidelity, no tutor, no exam mode.
- SkillBridge CWS: 710 users, ★5.0 / 3 reviews, last visible store update 2026-03-10.

## Position (one sentence)

**SkillBridge is the canonical translation + AI tutor extension for Anthropic Academy. We do not translate other course platforms — by choice.**

## Why this position (three reasons)

1. **Timing window**. Academy is 2 months old. The narrative "if you want Academy in your language, install SkillBridge" is still up for grabs. In 3–6 months it gets harder to dislodge an incumbent.
2. **Defensible moat**. 570+ hand-curated terms × 11 premium languages is the asset competitors won't replicate. They optimize for breadth (any-site translation); we optimize for a niche they have no incentive to serve. The moat compounds with every new Academy course.
3. **Anthropic optionality**. The Ambassador program is open right now. If Anthropic later runs official localization, SkillBridge is the obvious acquisition / endorsement / data-source target — but only if our positioning stays focused. A "general AI course translator" has no such option.

## Three pillars (the product promise)

1. **AI terminology fidelity** — every premium language has a hand-curated dictionary. New Academy course → terminology update within 48 hours.
2. **Exam awareness** — quiz answer choices are never translated; proctored certification exams disable the extension entirely. Cannot be mistaken for a cheating tool.
3. **Contextual AI tutor with zero friction** — Claude via Puter.js, knows the current course, answers in the user's language, no API key, no signup.

## Things we will not do

- **Add other Skilljar customers** (Calendly Academy, Atlassian Academy, etc.). Different terminology dilutes the moat.
- **Add Coursera / edX / Udemy translation**. Trancy / Language Reactor own that space.
- **Add a paid tier or "pro" features**. "Free, no API key" is the brand promise.
- **Require an API key for any feature**. Same reason.
- **Add features that need server-side infrastructure**. Breaks the client-side privacy promise; introduces ops cost we can't fund without monetization (see above).

## Quality investments that compound

These are the work items the positioning *makes load-bearing* — they're the
mechanisms that defend the three pillars above. Marketing / outreach moves
are out of scope for this document; pick those up only when product
quality is no longer the bottleneck.

1. ~~**48-hour SOP for new Academy courses**~~ — **shipped 2026-05-14** as
   `scripts/check-academy-courses.js` + `.github/workflows/academy-
   courses-drift.yml`. A 12-hour cron fetches the public catalog at
   `anthropic.skilljar.com/`, extracts every course slug, and cross-
   references against `FLASHCARD_COURSE_MAP` in `src/lib/constants.js`.
   When a live slug is unknown to the map, the workflow auto-opens an
   idempotent issue with the per-language follow-up checklist. Pillar #1
   is now mechanically enforced end-to-end: dict-coverage catches missing
   sections within a course (after the slug lands in the map), and this
   new watcher catches missing slugs entirely. The 48-hour SLA is no
   longer honor-system. **First-run catch (the same day)**: the script
   flagged `ai-fluency-for-small-businesses` (Academy's 18th course) as
   unknown — the very gap the workflow exists to surface.
2. ~~**Per-language × per-course dictionary coverage check**~~ — **shipped
   in v3.5.18** as `scripts/check-dict-coverage.js`. Fails CI if any of the
   10 premium languages is missing terminology for any course referenced
   from `FLASHCARD_COURSE_MAP`. Five-check shape: section parity, English-
   key parity, FLASHCARD_COURSE_MAP referential integrity, orphan section
   detection, and `_meta.version` sync with manifest.
3. ~~**Playwright E2E suite**~~ — **shipped** across v3.5.16 → v3.5.30,
   currently 16 scenarios across 11 specs (was originally scoped for 6 in
   `docs/E2E_PLAN.md`). Covers every documented README feature except
   YouTube subtitle activation (real iframe required) and dark mode toggle
   (UI-only, low risk). Caught a real production regression on its very
   first run (v3.5.16 fixed the `const sb = window._sb` hoist bug that
   386 unit tests had let through three releases).

Also worth tracking but lower priority:

4. **Selectors drift watcher** — shipped in v3.5.29 as a 6h cron that runs
   `check-selectors.js` against the live Skilljar pages and auto-opens an
   idempotent issue when it fails. Closes the "Skilljar redeploys mid-week,
   our PR queue is closed, users see broken pages for days" gap.

## Sunset triggers (re-open this document)

- Anthropic ships official translation → translation becomes commoditized. Re-position around the tutor + flashcards + exam mode (still differentiated).
- CWS install count crosses 10,000 and plateaus for 6 months → maybe the Anthropic-only niche is capped; re-evaluate Skilljar-platform expansion.
- Anthropic proposes acquisition / formal partnership → immediate strategic conversation; this doc is the starting point.

## Operating principles (for day-to-day decisions)

- If a PR makes us better at Anthropic Academy specifically, default ship.
- If a PR opens us to other platforms, default reject and link this doc.
- If a PR adds a dependency on a paid service or API key, default reject.
- If a PR meaningfully improves the AI tutor's contextual awareness of the current lesson, default ship.
- If a PR ships a new feature without updating the relevant `_LABELS` dict to cover all 11 premium languages, default reject (we don't ship English-only UI in a "translate this for non-English speakers" product).
