---
name: store-update
description: >
  SkillBridge-specific store listing updater. Extends the generic browser-extension
  store-update skill with SkillBridge project context (Anthropic Academy, protected terms,
  course list, etc.). Triggers on: store update, CWS listing, 스토어 업데이트, 스크린샷 갱신,
  "릴리즈 했으니 스토어도 바꿔줘", "스토어 설명 업데이트" and similar.
---

# SkillBridge Store Listing Updater

This is a project-specific overlay for the generic `store-update` skill. It adds SkillBridge context on top of the base workflow.

## Base Skill

First, read and follow the generic store-update workflow. The base skill handles the full Phase 1 → 2 → 3 pipeline.

## SkillBridge-Specific Context

### Project Layout
```
store-assets/
├── STORE_LISTING.md    ← Source of truth (English)
├── screenshot-*.png    ← Current screenshots
└── *.zip               ← Built packages
CHANGELOG.md            ← Release notes
manifest.json           ← Version (currently 3.5.4)
_locales/               ← i18n messages (reference for Korean tone)
src/lib/protected-terms.js ← Brand/tech term dictionary
```

### Screenshot Subjects
When capturing screenshots for SkillBridge, prioritize these screens on Anthropic Academy (`*.skilljar.com`):

1. **Lesson page with translation** — main value prop, show Korean or Japanese translation active
2. **Course catalog** — translated course cards showing breadth of coverage
3. **AI Tutor sidebar** — open with a conversation in non-English language
4. **Flashcard mode** — vocabulary review in action
5. **Dark mode** — full dark theme on a lesson page
6. **Popup settings** — extension popup showing language selector

### Tone Guidelines
- Informative but enthusiastic, emoji section headers
- Short punchy paragraphs
- Emphasize: accuracy of AI terminology translation (570+ curated entries), not just "another translator"
- Key differentiator: "Prompt" stays "프롬프트" not "신속한"
- For Korean translation, reference `_locales/ko/messages.json` for tone consistency

### Numbers to Keep Updated
When generating text, verify these numbers against the codebase:
- Course count (check `src/data/` or CHANGELOG for latest)
- Language count (premium + standard)
- Dictionary entry count per premium language
- Model names (currently Claude Sonnet 4 for tutor, Gemini 2.0 Flash for verification)

### Protected Terms
SkillBridge uses a curated protected-terms dictionary. When writing Korean (or other language) store descriptions, these brand/tech terms must NOT be translated:
- Anthropic, Claude, Cowork, Dispatch, Computer Use, Subagent
- SkillBridge, Skilljar, Puter.js
- Any new Anthropic product names (Glasswing, Mythos, Managed Agents, etc.)
