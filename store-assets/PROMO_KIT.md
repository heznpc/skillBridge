# SkillBridge v3.5.42 Promotion Kit

Status: **release candidate — not yet live in the Chrome Web Store**

This kit is derived from the same no-AI `dist/bundled` artifact used for the
CWS candidate. Until the public listing itself shows v3.5.42, do not use
“available now”, “released”, or equivalent launch-complete wording.

## Runtime and capture boundary

The unpacked v3.5.42 bundle was also exercised on the signed-in live Skilljar
site on 2026-07-24. Lesson translation, language switching, the tools menu, and
the learning dashboard worked while the host header remained unchanged.

The committed CWS screenshots and generated demo video are deterministic
artwork: they execute the real bundle against neutral local fixtures so they can
be rebuilt without a Skilljar login or third-party branding. They are not proof
of the live site's appearance. Local live-site debug captures are deliberately
excluded from Git and public publishing inputs.

## Positioning

**One line:** Learn supported AI courses in your language while keeping
technical terminology intact.

**Proof points:**

- 32 interface languages.
- Curated dictionaries for premium languages and protected-term restoration.
- Local progress, bookmarks, recent lessons, and spaced-repetition flashcards.
- Exam mode translates the question but leaves answer choices unchanged.
- The CWS bundle exposes no AI Tutor and omits the Puter SDK and page bridge.

## Claim evidence

| Claim | Repository proof | Visual proof |
|---|---|---|
| 32 languages | `_locales/`, `README.md` generated language count | `02-language-select.png` |
| Lesson translation | `manifest.json`, `src/content/` | `01-translate.png` |
| Local learning tools | `src/content/dashboard.js`, `src/content/chat-flashcards.js` | `03-learning-dashboard.png`, `04-flashcards.png` |
| Exam-safe answers | `src/content/content.js`, `tests/e2e/exam-mode.spec.js` | `05-exam-safe.png` |
| No AI runtime in CWS | `src/shared/build-config.js`, `scripts/check-rhc.js` | `promo-media-manifest.json` source record |

## Pre-launch copy

### Korean

SkillBridge v3.5.42 Chrome Web Store 후보를 준비했습니다.

지원되는 AI 강의를 32개 언어로 읽고, 기술 용어는 보호하며, 학습 현황과
플래시카드는 기기 안에서 관리합니다. 시험 모드에서는 질문만 번역하고 답안
선택지는 원문으로 유지합니다. 이번 CWS 번들은 AI Tutor와 Puter/page bridge를
포함하지 않습니다.

현재 최종 등록 전 검증 단계입니다.

### English

SkillBridge v3.5.42 is ready as a Chrome Web Store release candidate.

Translate supported AI courses across 32 languages, keep technical terms
intact, use local progress and flashcards, and leave quiz answers untranslated
in exam mode. The CWS bundle contains no AI Tutor, Puter SDK, or page bridge.

Final listing review is still pending.

## Launch-line lock

Use this sentence only after the CWS listing visibly reports v3.5.42:

> SkillBridge v3.5.42 is now available on the Chrome Web Store.

Before that proof exists, retain the release-candidate wording above.

## Asset map

### Chrome Web Store

- `01-translate.png` through `05-exam-safe.png` — five 1280×800 product screenshots.
- `promo-tile-440x280.png` — CWS small promo tile.
- `demo.webm` — deterministic fixture capture using the actual CWS bundle.

### Social and press

- `promo-social-landscape-1200x675.png` — LinkedIn/X landscape card.
- `promo-social-square-1080x1080.png` — square feed card.
- `promo-social-portrait-1080x1350.png` — portrait feed card.
- `promo-video-thumbnail-1280x720.png` — landscape video thumbnail/title card.
- `promo-short-thumbnail-1080x1920.png` — Shorts/Reels thumbnail/title card.
- `skillbridge-v3.5.42-demo-landscape.mp4` — landscape demo.
- `skillbridge-v3.5.42-demo-short.mp4` — vertical short.
- `promo-media-manifest.json` — source hash, output hashes, dimensions, durations,
  and allowed claims.

Run `npm run promo:build` to rebuild the full set from the current production
bundle. Videos are local publishing artifacts and remain ignored by Git; their
hashes are committed in the media manifest.

## Video structure

1. Release-candidate title card.
2. The actual bundled extension running against a neutral deterministic fixture:
   translate a lesson, open local progress, then show flashcards.
3. Return to the title card. No mocked extension UI or AI Tutor footage.

The videos are silent by design; the visual captions and title cards carry the
message without a narration or music-license dependency.
