# Claude plugin directory submission — draft

> Submission form: https://clau.de/plugin-directory-submission
>
> Channel: Anthropic-curated marketplace at `anthropics/claude-plugins-community`
> (387 plugins as of 2026-05-29; **0 in the AI-course-translator lane** — first-
> mover window is open).
>
> Status: draft prepared by `/heznpc-market-pulse` 2026-05-29. The form requires
> a manual submit — code-side preparation is what this document captures.

## Why this is a separate channel from CWS

- **CWS** distributes the Chrome extension binary to users who already use a
  browser. Audience: anyone who reads Anthropic Academy in a non-English language.
- **Claude plugin directory** distributes the *skill* to Claude Code users who
  want to author multilingual AI-course glossaries from inside their Claude
  Code workflow. Audience: educators, technical writers, internal-training
  managers at companies running Anthropic Academy cohorts.
- These don't overlap. Submitting to both surfaces is additive, not redundant.

## What we submit

Two artifacts go through this channel:

### 1. `heznpc/ai-course-glossary` (the skill — primary)

- Repo: https://github.com/heznpc/ai-course-glossary
- Status (per `~/.claude/skills/heznpc-app-session/registry.md`): v0.1.0 shipped
  2026-05-28; standalone repo with SKILL.md, LICENSE, .claude-plugin/marketplace.json,
  references/, examples/.
- Funnel: SkillBridge extension is the consumer of the dictionaries this skill
  generates. Cross-link in description.

### 2. `heznpc/skillBridge` (the extension — context-only mention)

- Repo: https://github.com/heznpc/skillBridge
- Not itself a Claude Code plugin (it's a Chrome extension), so it doesn't go
  in the marketplace.json. But the skill's README + plugin directory listing
  should mention it as the downstream consumer so reviewers see the
  ai-course-glossary as part of a complete workflow rather than a one-off
  utility.

## Form fields (draft)

| Field | Value |
|---|---|
| Plugin name | `ai-course-glossary` |
| Author | `heznpc` |
| GitHub URL | `https://github.com/heznpc/ai-course-glossary` |
| Category | `Education / Localization` |
| One-line description | `Build curated multilingual glossaries for free AI courses (Anthropic Academy and other Skilljar-hosted AI curricula).` |
| Long description | (see below) |
| Tags / topics | `claude-skill`, `glossary`, `multilingual`, `ai-education`, `skilljar`, `anthropic-academy`, `translation`, `localization`, `i18n` |

## Long description (paste into form)

> SkillBridge is a Chrome extension that translates Anthropic Academy lessons
> into 11 languages with AI-curated terminology that Google Translate gets
> wrong (Claude, MCP, RAG, fine-tuning — all preserved verbatim instead of
> phonetic-transliterated). The dictionaries that power it are 22 sections,
> ~1,100 keys each.
>
> This skill is the authoring side: it walks Claude through producing one of
> those dictionaries for a new language, using a sibling Premium dictionary as
> a structural scaffold (e.g. Russian → Polish via Slavic proximity). The
> output passes the upstream `scripts/check-dict-coverage.js` invariant
> (identical English key set across all Premium languages), discloses
> translation provenance honestly in `_meta.translation_provenance`, and is
> SkillBridge-PR-ready.
>
> Useful for: educators producing multilingual course materials; technical
> writers localizing AI documentation; internal training managers at
> organizations running Anthropic Academy cohorts in non-English-speaking
> regions.
>
> First-mover note: as of 2026-05-29, 387 plugins are listed in the
> `anthropics/claude-plugins-community` marketplace and none cover the
> AI-course-translation lane. Adjacent: security plugins, legal plugins,
> skill-creator. Empty: localization tooling for AI curricula specifically.

## Submission cadence

- Submit once. The directory team reviews on their own schedule.
- If accepted, expect a PR to `anthropics/claude-plugins-community/.claude-plugin/marketplace.json`
  adding the entry.
- If rejected or no response after 14 days, prepare a direct PR to the
  marketplace.json with a self-contained justification (similar to the
  Italian-Premium-dictionary commit message style: data + scope + non-goals).

## Fallback channel

If `clau.de/plugin-directory-submission` is unreachable or non-responsive, the
marketplace is open-source — direct PR to
`anthropics/claude-plugins-community/.claude-plugin/marketplace.json` is the
documented backup path.
