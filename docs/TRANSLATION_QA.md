# Translation QA — the three assurance layers

SkillBridge's core promise is AI-terminology fidelity. That promise is backed
by three layers, each catching what the previous one structurally cannot.
This doc is honest about what each layer does **and does not** guarantee.

## Layer 1 — automated, every PR (CI)

| Gate | Catches |
|---|---|
| `check:i18n` / `check:dict-coverage` | Key/section parity across all 11 dictionaries, `_meta.version` sync with the manifest |
| `check:locales` | Cross-locale contamination — any locale sharing >8% of its long strings with another (the bug class behind the 2026-06 "Italian was 51% Spanish" incident) |
| `check:glossary` / `validate` | `_protected` structure, value types, possibly-untranslated heuristics |
| `tests/protected-terms.test.js` | Real-dictionary regression: ordinary prose in **all 11 locales** must survive protected-term restoration uncorrupted |
| Academy drift watcher (cron, 2×/day) | A live course slug missing from `FLASHCARD_COURSE_MAP` — fails the run and auto-opens an issue |

**Does not catch:** a translation that is structurally valid but semantically
wrong ("uniquely wrong" values — e.g. `Slack → "Lento"` survived every
structural gate until Layer 2 found it).

## Layer 2 — full LLM audit, every store release

Before each store submission, every premium dictionary gets a full-depth LLM
review (one reviewer per locale over all ~1,100 entries, findings re-verified
against the file before fixing — reviewer claims are *not* trusted blindly).
The completed audit is stamped machine-readably in each dictionary:
`_meta.lastAudited`. The README QA table is generated from that field by
`npm run docs`, so the public table cannot drift from reality.

The 2026-06-10 audit fixed 89 verified errors across 7 locales (brand-name
mistranslations, a `responsskill` regex scar, "AI Fluency" rendered three
different ways in one file, …) — see PRs #197/#199.

**Does not catch:** native-register subtleties and domain idiom an LLM judges
imperfectly. That's Layer 3.

## Layer 3 — native-speaker review (recruiting)

One native reviewer per locale does a first full pass (~1–2 hours, JSON value
edits only; CI guards the structure so nothing can break). On completion the
locale's `_meta.nativeReview` flips from `"recruiting"` to `"reviewed"` and the
reviewer is credited in the README QA table.

Status and sign-up: [issue #202](https://github.com/heznpc/skillBridge/issues/202).
No locale has completed a native pass yet — the table says so honestly rather
than implying review that hasn't happened.

## Why there is no paid review / API gate

SkillBridge is free forever for both users and the maintainer — no paid
translation-QA API can sit in CI. The layered design above is the strongest
assurance available under that constraint: structure by machine, semantics by
release-time LLM audit, idiom by community native review.
