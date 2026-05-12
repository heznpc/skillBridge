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

## 90-day growth moves

1. **Apply to the Anthropic Claude Ambassador program**. The pitch writes itself.
2. **Time a Japanese localized push around Code with Claude Tokyo**. Premium-language already covered; needs landing-page + Product Hunt JP timing.
3. **48-hour SOP for new Academy courses** — automate where possible (RSS poll → GH Action that opens a "translate course X to 11 languages" issue).
4. **Outreach to Class Central / Medium "Anthropic Academy 2026 guide" authors** — they already cover Academy; ask for a "multilingual access" mention with SkillBridge link.
5. **Korean / Japanese AI dev Twitter outreach** — strong communities, premium languages already covered, high ROI vs effort.

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
