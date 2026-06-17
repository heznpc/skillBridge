# Dictionary editing rules — the landmines

This is the **practical rulebook for editing `src/data/<locale>.json`** (the premium
dictionaries). Read it before touching a dictionary. Every rule below exists because
breaking it has silently corrupted real on-page text at least once.

It is written for two audiences:

1. **Human contributors** — native speakers fixing/adding translations.
2. **Automated review passes** (an LLM or a tool like Codex doing a quality pass) —
   §6 is a do-not-reopen list of settled, evidence-backed design decisions so a pass
   doesn't re-litigate them.

For the *assurance model* (what CI / LLM audit / native review each guarantee) see
[`TRANSLATION_QA.md`](TRANSLATION_QA.md). For setup and PR flow see
[`../CONTRIBUTING.md`](../CONTRIBUTING.md).

---

## 0. Edit values, never keys

Every entry is `"<English source string>": "<your translation>"`. The **key is the
match anchor** — the extension looks up on-page English text against it verbatim.
Change a key and the entry stops matching (and CI `check:i18n` fails on key/section
drift). **Only ever edit the value.** Don't add, remove, rename, or reorder keys
unless you are deliberately adding a brand-new source string that appears on a page.

---

## 1. Concept vs. product-name — the line every locale draws

A 12-locale native code-switching probe ([issue #202](https://github.com/heznpc/skillBridge/issues/202))
found that **every language draws the same boundary**, however much it otherwise
translates:

- **Generic concept / capability nouns** → render natively (translate *or*
  transliterate) the way your language normally does: `agent`, `workflow`,
  `reasoning`, `tool call`, `subagent`, `structured output`, `hook`, `plugin`.
- **Branded product / API-feature proper nouns** → **keep English**: `Claude`,
  `Claude Code`, `Anthropic`, `Anthropic Academy`, `Agent Skills`, `Skills`, `MCP`,
  `Model Context Protocol`, `Cowork`, `Computer Use`, `Managed Agents`,
  `Function Calling`, `SDK`, `API`, `SKILL.md`, `CLAUDE.md`, `YAML`, `frontmatter`.

The same sentence keeps `Skills` English while translating `subagent` — that is
**correct**, not an inconsistency. The tell is "is this a named product/API artifact?"
not "does my language have a word for it?".

> **Known caveat — `ru` `Skills`.** Anthropic's official Russian docs translate the
> Skills product to "Навыки агента", but the Russian dev community keeps it English /
> transliterates ("скиллы"). This single cell is genuinely contested — leave it for
> the native reviewer; don't force it either way.

---

## 2. `_protected` is a loaded gun — apply the prose-collision test

`_protected` maps `"<correct term>": ["<wrong form>", ...]`. After Google Translate
runs, **every wrong-form is rewritten to the correct term, everywhere it appears in
the page text** (for CJK, as a raw substring). That power cuts both ways.

**Before adding ANY wrong-form, ask one question:**

> *Can this exact string ever appear in correct <your-language> prose as something
> OTHER than a mangled brand term?*

- **YES → do NOT add it.** It will corrupt legitimate text. Real examples that were
  removed for exactly this reason:
  - `"Claude": ["Claudio"]` — *Claudio* is a common Italian/Spanish given name →
    every real "Claudio" became "Claude".
  - `"skill": ["기술" / "技能" / "スキル"]` — these are the ordinary words for "skill" →
    all skill prose got rewritten to English.
  - `"hook": ["후크" / "钩子"]`, `"Anthropic": ["anthropisch" / "antropico"]`,
    `"Cowork": ["cotravail"]` — all real words.
  - `"subagent": ["subagente" / "sous-agent"]` — these are the dictionary's *own*
    intended translation; "restoring" them reverses your own work.
- **NO → safe to add.** Pure GT artifacts / phonetic transliterations that only ever
  appear as a mangled brand: `克洛德`, `クロード`, `Клод` (Claude), `Código Claude`
  (Claude Code), `Koarbeit` (Cowork).

### Hard rules CI enforces (you will get a build error)

- **Never** make a wrong-form a substring of its own correct term: `"subagent":
  ["subagen"]` rewrites "subagent" → "subagentt". `check:glossary` hard-errors.

### Script-specific behavior (why the test still matters even when "anchored")

- **Latin / Cyrillic / Greek** wrong-forms are matched with a Unicode letter
  boundary, so they won't corrupt a *longer word that merely contains them*. But they
  **still** rewrite a standalone real word/name → the prose-collision test still
  applies.
- **CJK / Kana / Hangul** wrong-forms match as **raw substrings** (these scripts have
  no spaces; a letter boundary would wrongly block legit restoration next to a
  particle, 클로드는 → Claude는). One built-in guard skips a match adjacent to a
  foreign-name interpunct (`·` / `・`), so `克洛德·莫奈` (Claude Monet) survives — but
  **space-separated names** (`클로드 모네`, `Клод Дебюсси`) are *not* guarded. Don't add
  a CJK wrong-form that collides with a real word and hope the guard saves you.

### When GT mangles a brand but every candidate wrong-form fails the test

Use a **self-referential entry** — `"Claude": ["Claude"]`. It keeps the term in the
Gemini "keep-English" list (the *keys* of `_protected` feed that list) without any
risky restore. Self-ref is the safe default for a must-stay-English brand whose only
GT artifact would collide with real prose.

---

## 3. Don't guess nuanced framework terms — escalate instead

Some terms are **framework-specific** and their dictionary meaning ≠ their meaning in
context. The trap:

> The AI Fluency **"4D" competency "Diligence"** means *"due diligence — take informed
> responsibility for outputs: verify facts, check biases, ensure accuracy."* It does
> **not** mean 勤奋 / "industrious". A literal-dictionary swap (`Diligence` → 勤奋) is a
> **regression** — it reads right in isolation but contradicts the framework's own
> definition (which the file itself spells out two lines later).

If a term's correct rendering depends on understanding the source framework, and
you're not certain: **leave it, and flag it on [#202](https://github.com/heznpc/skillBridge/issues/202)
for a native reviewer who knows the framework.** This rule exists because an automated
pass guessed `勤奋` and shipped a regression that only an independent cross-validation
caught. Confidently-wrong is worse than untouched.

---

## 4. After you edit — validate locally

```bash
npm run validate    # JSON structure, _meta, value types
npm run glossary    # _protected structure + substring-of-correct guard
```

Both also run in CI on every PR, along with `check:i18n` / `check:dict-coverage`
(key & section parity, version sync), `check:locales` (cross-locale contamination),
and `tests/protected-terms.test.js` (real-dictionary prose-survival regression).

**What CI cannot catch:** a value that is structurally valid but semantically wrong
(`Slack → "Lento"` passed every structural gate), or a `_protected` form that is a
real word CI doesn't recognize. That's why §2's test and the native-review layer
exist — see [`TRANSLATION_QA.md`](TRANSLATION_QA.md).

---

## 5. Quick checklist for a dictionary PR

- [ ] I edited **values only** — no keys changed.
- [ ] Any product/API proper noun stays **English** (§1); any generic concept reads
      natively.
- [ ] Every new `_protected` wrong-form **passes the prose-collision test** (§2) and
      is not a substring of its correct term.
- [ ] I did **not** guess a framework-specific term I'm unsure of (§3).
- [ ] `npm run validate && npm run glossary` pass locally.
- [ ] I'm a native (or fluent) speaker of the locale, **or** I'm submitting via the
      [Translation Submission](../../issues/new?template=translation-submission.yml)
      issue for a maintainer to integrate.

---

## 6. For automated review passes — do-not-reopen invariants

These are settled, evidence-backed decisions. An LLM/Codex quality pass should treat
them as fixed and **adversarially verify findings against the actual file/engine
before proposing** (don't trust a single pass — that is how today's regressions were
both made *and* caught):

- **CJK/Kana/Hangul `_protected` forms use raw substring matching by design.** A
  letter boundary would block legitimate restoration next to particles
  (클로드는 → Claude는). Do not propose anchoring CJK with `\p{L}`.
- **Phonetic brand transliterations are kept as restores by design** (克洛德/クロード/Клод
  → Claude fixes GT's transliteration of the *product*). The real-person-name
  collision (Claude Monet) is a known, accepted trade-off mitigated by the interpunct
  guard (§2). Do not propose removing these wholesale.
- **The concept-vs-product-name line (§1) is evidence-backed** by the 12-locale #202
  probe. Do not propose translating product names, nor keeping generic concept nouns
  English across the board.
- **Stylistic per-locale word-choice** (which synonym, the canonical form of "agent")
  is the **native reviewer's** call (#202), not an automated pass's. Fix objective
  defects (wrong meaning, garble, untranslated, brand-policy violations); leave
  word-choice.
- **Repo invariants:** `web_accessible_resources` must be origin-level
  (`https://claude.com/*` — path-scoping makes Chrome reject the manifest); CWS upload
  is owner-gated; commits use `heznpc` as sole author with no `Co-Authored-By`
  trailers.

A proposed change that violates one of these is almost certainly wrong — flag it as a
question for a human, don't apply it.
