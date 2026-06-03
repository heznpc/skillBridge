# skillbridge-academy-terms — Claude Code plugin

A small [Claude Code](https://docs.claude.com/en/docs/claude-code) plugin that
re-exposes [SkillBridge](https://github.com/heznpc/skillBridge)'s curated
**Anthropic Academy terminology dictionary** as a study companion you can use
directly inside Claude Code.

It is the plugin counterpart to the SkillBridge browser extension. The
extension translates Anthropic Academy course pages in the browser; this plugin
brings the same curated, drift-free terminology into Claude Code so you can
translate, explain, and self-quiz on the course material from the terminal.

## What it does

The bundled `academy-terms` skill instructs Claude to:

- **Translate / explain** Anthropic Academy and Claude course terms (Claude
  Code, MCP, agent skills, subagents, the Claude API, extended thinking, cloud
  deployment, AI Fluency, …) using the curated dictionary instead of ad-hoc
  machine translation, across 11 languages.
- **Keep brand and API terms untranslated** — `Claude`, `Anthropic`,
  `SKILL.md`, `frontmatter`, `subagent`, `Cowork`, and friends stay in English,
  with known bad renderings actively rejected.
- **Know the course catalog** — map course slugs to courses and answer "which
  course covers X".
- **Quiz / flashcard** the learner in their own language.

## Languages

`de`, `es`, `fr`, `it`, `ja`, `ko`, `pt-BR`, `ru`, `vi`, `zh-CN`, `zh-TW`
(~1000 curated term pairs each, plus the shared protected-term guardrails).

## Structure

```
claude-plugin/
  .claude-plugin/plugin.json        # plugin manifest
  skills/academy-terms/
    SKILL.md                        # the skill
    data/
      index.json                    # generation manifest
      courses.json                  # derived course catalog
      terms.<lang>.json             # per-language dictionary (11 files)
```

## The data is generated, not hand-written

Everything under `skills/academy-terms/data/` is **derived** from the
extension's canonical assets by `scripts/build-plugin.js` (in the repo root):

- `src/data/*.json` — the curated language dictionaries (course term pairs +
  `_protected` guardrails)
- `src/lib/constants.js` — `FLASHCARD_COURSE_MAP` (course slug → content block)

Regenerate after editing those:

```bash
npm run build:plugin          # rewrite the bundled data
npm run check:plugin          # CI check: fail if the committed data is stale
```

Do not edit the `data/` files by hand — they will be overwritten.

## Install (local / dev)

This plugin lives in a subdirectory of the SkillBridge repo. To try it in
Claude Code, add the repo as a plugin marketplace source and install from it,
or point a local marketplace entry at this `claude-plugin/` directory. See the
Claude Code plugin docs for the current `/plugin` workflow.

You can sanity-check the plugin structure with:

```bash
claude plugin validate claude-plugin
```

## Submitting to the community marketplace (manual)

Listing this in
[`anthropics/claude-plugins-community`](https://github.com/anthropics/claude-plugins-community)
is a **manual step performed by the repository owner** — it is intentionally
not automated here. To submit:

1. Open <https://claude.ai/settings/plugins/submit>.
2. Point the `source` at this plugin directory in the SkillBridge repo
   (`heznpc/skillBridge`, path `claude-plugin/`).
3. Follow the submission flow; it lands as a PR against
   `anthropics/claude-plugins-community`.

## License

MIT — see the repository [`LICENSE`](../LICENSE).
