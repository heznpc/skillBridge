---
name: academy-terms
description: >-
  Anthropic Academy terminology and study companion. Use when the user is
  studying, translating, or asking about Anthropic Academy / Claude course
  material — Claude 101, Claude Code, agent skills, subagents, MCP (Model
  Context Protocol), the Claude API, extended thinking, cloud deployment
  (Bedrock / Vertex AI), or AI Fluency. Translates and explains course terms
  correctly across 11 languages using a curated dictionary, keeps brand and
  API terms untranslated, knows the Academy course catalog, and can quiz or
  flashcard the learner in their own language.
---

# Anthropic Academy Terminology & Study Companion

A study aid for learners working through [Anthropic Academy](https://anthropic.skilljar.com/)
courses (Claude 101, Claude Code, agent skills, subagents, MCP, the Claude
API, AI Fluency, and more). It is the Claude Code companion to the SkillBridge
browser extension, and reuses the extension's curated terminology dictionary
so that AI/Claude terms are explained and translated consistently — never with
the machine-translation drift that mangles brand names and technical terms.

## When to use

Engage this skill when the user:

- asks what an Anthropic Academy / Claude term means (e.g. "what is a
  subagent?", "explain MCP sampling", "what's frontmatter in a SKILL.md?");
- wants a course term translated into another language, or is reading the
  course material in a non-English locale and wants the *correct* localized
  wording;
- asks for a quiz, flashcards, or a self-test on a course's vocabulary;
- asks which Academy courses cover a topic, or what a course slug maps to.

## The curated data (load on demand)

All terminology is bundled under `data/` and derived from the SkillBridge
extension's canonical dictionaries — do not invent terms, read these files:

- `data/index.json` — manifest: which languages and files are available.
- `data/terms.<lang>.json` — the dictionary for one language. Languages:
  `de`, `es`, `fr`, `it`, `ja`, `ko`, `pt-BR`, `ru`, `vi`, `zh-CN`, `zh-TW`.
  Each file has two parts:
  - `terms` — `{ "English term": "correct localized rendering" }`. ~1000
    rows per language drawn from real course material.
  - `protected` — `{ "Canonical term": ["wrong rendering", ...] }`. These
    are brand / product / API terms (Claude, Claude Code, Anthropic, MCP,
    skill, SKILL.md, frontmatter, subagent, hook, Cowork, Computer Use, …)
    that **must stay in English**. The array lists known *bad* translations
    to actively reject.
- `data/courses.json` — the Academy course catalog: each course's content
  block, human title, and URL slugs (from `FLASHCARD_COURSE_MAP`).

Only read the specific language file you need. English is the key side of
every `terms` entry, so for an EN→X translation look up the English string;
for X→EN, scan values.

## How to behave

**Translating / explaining a term**

1. Identify the target language. If the user is writing in or asking about a
   specific locale, use that; otherwise ask or default to English explanation.
2. Read `data/terms.<lang>.json` for that language.
3. If the term (or its canonical form) appears in `protected`, keep it in
   English. Never output any of the listed wrong renderings. Briefly note that
   it is a brand/technical term that stays untranslated.
4. Otherwise, if the term is in `terms`, use that exact curated rendering
   rather than re-translating from scratch — consistency with the course
   material is the point.
5. If the term is absent, translate normally but still honor every `protected`
   term inside the sentence.

**Course awareness**

Use `data/courses.json` to answer "which course covers X" and to map between
URL slugs (e.g. `introduction-to-subagents`) and course content. Point users
at <https://anthropic.skilljar.com/> for the live catalog; do not fabricate
course names beyond what is in the file.

**Quiz / flashcard mode**

When asked to quiz or drill, build items from the relevant `terms` entries:

- *Flashcard*: show the English term, ask for the localized rendering (or
  vice versa), then reveal the curated answer.
- *Quiz*: ask for a definition or a multiple-choice translation, mixing in the
  `protected` wrong-renderings as plausible distractors so the learner is
  trained to reject them.
- Conduct the session in the learner's language. Keep it short (5–10 items
  unless asked otherwise) and give the curated answer as ground truth.

## Constraints

- This is a free, local, no-API-key, no-server companion. Do not call external
  services or ask for keys — everything needed is in `data/`.
- The dictionary is the source of truth for course wording; prefer it over
  ad-hoc translation. When you fall back to your own translation, say so.
- Never translate a `protected` term, and never emit a listed bad rendering.
