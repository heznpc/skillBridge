<div align="center">

🌐 [English](../../README.md) · **한국어** · [日本語](README_JA.md) · [中文](README_ZH-CN.md) · [Español](README_ES.md) · [Français](README_FR.md) · [Deutsch](README_DE.md)

</div>

---

<div align="center">

<img src="../../assets/icons/icon128.png" alt="SkillBridge" width="80" />

# SkillBridge for Anthropic Academy

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](../../LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Extension_MV3-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](../../CONTRIBUTING.md)

**Anthropic 무료 AI 강의의 언어 장벽을 허물다.**

[설치하기](#설치) · [버그 신고](../../issues) · [기능 요청](../../issues)

</div>

---

<div align="center">

<img src="../../assets/screenshots/skillbridge-demo.gif" alt="SkillBridge Demo — 실시간 Anthropic Academy 번역" width="720" />

*SkillBridge를 설치하고, Anthropic Academy에 접속하면 전체 페이지가 즉시 번역됩니다.*

</div>

---

## SkillBridge를 선택해야 하는 이유

[Anthropic Academy](https://anthropic.skilljar.com/)는 Claude, 프롬프트 엔지니어링, AI 안전성에 대한 최고 수준의 무료 교육을 제공합니다. **하지만 영어로만 제공됩니다.**

*"그냥 Google 번역을 쓰면 되지 않나?"* 라고 생각할 수 있지만, 여기가 한계입니다:

| | Google 번역 (페이지) | SkillBridge |
|---|---|---|
| AI 용어 | ❌ "Prompt" → "신속한" (오류) | ✅ "Prompt" → "프롬프트" (정확) |
| 기술 정확도 | ❌ 일반 기계 번역 | ✅ 언어당 560+ 수동 검수 용어 + 보호 용어 자동 수정 + Gemini AI 검증 |
| 상황 인식 도움 | ❌ 없음 | ✅ AI 튜터 (Claude Sonnet 4) 강의 내용에 대한 질문 답변 |
| 동영상 자막 | ❌ 별도 수동 토글 | ✅ 자동 번역 자막 (선택한 언어) |
| UI 유지 | ❌ 체크박스, 진행률 표시줄 손상 | ✅ 모든 인터랙티브 요소 유지 |
| 비용 | 무료 | 무료 — API 키 필요 없음 |

> **API 키 없음. 비용 없음. 설치하고 바로 학습하세요.**

### 보호 용어 실제 사례

일반 페이지 번역 도구는 **브랜드명과 기술 용어를 자주 잘못 번역합니다**. 예를 들어, Google 번역은 "Anthropic Courses"를 "인류학적 과정"으로 번역합니다 — 완전히 잘못된 것입니다.

SkillBridge의 **보호 용어** 엔진은 번역 후 자동으로 이러한 오류를 수정하여 "Anthropic", "Claude" 같은 브랜드명과 기술 용어를 정확하게 유지합니다:

<div align="center">

| 이전 (Google 번역만 사용) | 이후 (SkillBridge 보호 용어) |
|:---:|:---:|
| ❌ 인류학적 과정 | ✅ Anthropic 과정 |
| ❌ 클로드 | ✅ Claude |
| ❌ 신속한 공학 | ✅ 프롬프트 엔지니어링 |

</div>

<div align="center">
<img src="../../assets/screenshots/catalog-translated.png" alt="한국어로 번역된 Anthropic Academy 카탈로그 페이지 (올바른 용어)" width="720" />
<br/>
<em>한국어로 번역된 강의 카탈로그 — 브랜드명과 AI 용어가 정확하게 유지됩니다.</em>
</div>

## 실제 작동 방식 확인

### 전체 페이지 번역

페이지의 모든 텍스트 요소가 번역되며, AI 관련 용어는 수동 검수된 사전을 통해 정확하게 처리됩니다. 진행률 체크박스, 아이콘, 네비게이션은 모두 그대로 유지됩니다.

<div align="center">
<img src="../../assets/screenshots/01-lesson-translated.png" alt="커리큘럼이 완전히 번역된 강의 페이지" width="720" />
<br/>
<em>커리큘럼이 완전히 번역된 강의 페이지 — UI 요소가 보존됩니다.</em>
</div>

### AI 튜터

**Claude Sonnet 4**로 구동되는 사이드바 챗봇으로 [Puter.js](https://docs.puter.com/)를 사용합니다. 현재 강의와 수업을 파악합니다. 선택한 언어로 질문하면 스트리밍 답변을 받습니다.

<!-- TODO: ai-tutor.png 추가 후 주석 해제
<div align="center">
<img src="../../assets/screenshots/ai-tutor.png" alt="한국어 질문에 답하는 AI 튜터 사이드바" width="720" />
<br/>
<em>강의에 대해 AI 튜터에게 질문하세요 (언어 선택 가능) — Claude Sonnet 4로 구동됩니다.</em>
</div>
-->

### 자동 자막

강의 영상을 재생하면 자동으로 선택한 언어의 번역 자막이 활성화됩니다 — 수동 토글이 필요 없습니다.

<!-- <div align="center">
<img src="../../assets/screenshots/subtitles.png" alt="자동 번역된 한국어 자막이 있는 YouTube 동영상" width="720" />
<br/>
<em>동영상 자막이 선택한 언어로 자동 번역됩니다.</em>
</div> -->

## 작동 원리

SkillBridge는 **5단계 번역 엔진**을 사용하여 속도와 정확도를 우선합니다:

```
페이지 텍스트
  │
  ├─ 560+ 수동 검수 용어 사전 ──→ 즉시 (AI 용어 정확 번역)
  │
  ├─ 로컬 캐시 (IndexedDB) ───────→ 즉시 (이전 검증된 번역)
  │
  ├─ 인라인 HTML 태그 포함? (<strong>, <a>, <code>...)
  │     └─ 네 → Gemini 2.0 Flash가 태그 유지하며 번역
  │
  └─ 일반 텍스트 → Google 번역 ─→ ~200ms
       │
       ├─ 보호 용어 자동 수정 ─→ GT가 잘못 번역한 브랜드/기술 용어 복구
       │
       └─ 복잡한 문장? → Gemini 2.0 Flash 검증 → 필요시 수정
```

**보호 용어** — 각 언어는 GT의 알려진 오류를 정의합니다 (예: GT가 한국어로 "Claude" → "클로드" 번역). GT 실행 후 확장 프로그램이 자동으로 올바른 형태로 수정합니다. 브랜드명, 기술 용어, 제품 계층은 영어로 유지됩니다 — [Anthropic의 공식 다국어 문서](https://docs.anthropic.com)와 일치합니다.

모든 번역은 **사용자의 브라우저 내에서 발생합니다** — 제3자 서버에 저장되거나 전송되지 않습니다.

## 기능

**🌐 전체 페이지 번역** — 페이지의 모든 텍스트 요소가 번역되며, AI 관련 용어는 수동 검수된 사전으로 정확하게 처리됩니다.

**🤖 AI 튜터** — [Puter.js](https://docs.puter.com/)를 통해 Claude Sonnet 4로 구동되는 사이드바 챗봇입니다. 현재 강의와 수업을 파악합니다. 선택한 언어로 질문하면 스트리밍 답변을 받습니다.

**🎬 자동 자막** — 강의 영상을 재생하면 선택한 언어의 번역 자막이 자동으로 활성화됩니다.

**🔍 스마트 감지** — 첫 방문 시 브라우저 언어를 감지하고 번역을 제안합니다. 설정이 필요 없습니다.

**✨ 충실한 UI** — 진행률 체크박스, 아이콘, 네비게이션은 모두 그대로 유지됩니다. CJK 폰트는 원본 디자인과 일치합니다.

## 지원 언어

### 프리미엄 — 수동 검수 사전 + Google 번역 + AI 검증

| 언어 | 코드 | 사전 |
|------|------|------|
| 🇰🇷 한국어 (Korean) | `ko` | 560+ 항목 |
| 🇯🇵 日本語 (Japanese) | `ja` | 560+ 항목 |
| 🇨🇳 中文简体 (Chinese Simplified) | `zh-CN` | 560+ 항목 |
| 🇪🇸 Español (Spanish) | `es` | 560+ 항목 |
| 🇫🇷 Français (French) | `fr` | 560+ 항목 |
| 🇩🇪 Deutsch (German) | `de` | 560+ 항목 |

### 스탠다드 — Google 번역 + AI 검증

🇹🇼 中文繁體 · 🇧🇷 Português (BR) · 🇵🇹 Português (PT) · 🇮🇹 Italiano · 🇳🇱 Nederlands · 🇷🇺 Русский · 🇵🇱 Polski · 🇺🇦 Українська · 🇨🇿 Čeština · 🇸🇪 Svenska · 🇩🇰 Dansk · 🇫🇮 Suomi · 🇳🇴 Norsk · 🇹🇷 Türkçe · 🇸🇦 العربية · 🇮🇳 हिन्दी · 🇹🇭 ภาษาไทย · 🇻🇳 Tiếng Việt · 🇮🇩 Bahasa Indonesia · 🇲🇾 Bahasa Melayu · 🇵🇭 Filipino · 🇧🇩 বাংলা · 🇮🇱 עברית · 🇷🇴 Română · 🇭🇺 Magyar · 🇬🇷 Ελληνικά

> 언어를 프리미엄으로 추가하고 싶으신가요? 수동 검수 사전을 기여하세요 — [CONTRIBUTING.md](../../CONTRIBUTING.md)를 참고하세요.

## 설치

<!-- **Chrome 웹 스토어** (권장): [SkillBridge 설치](https://chrome.google.com/webstore/) — 곧 출시 -->

**수동 설치** (개발자 모드):

```bash
git clone https://github.com/heznpc/skillbridge.git
```

1. Chrome에서 `chrome://extensions/` 열기
2. **개발자 모드** 활성화 (우측 상단 토글)
3. **압축해제된 확장 프로그램을 로드합니다** → 클론한 폴더 선택
4. [anthropic.skilljar.com](https://anthropic.skilljar.com/)에 방문하고 학습 시작!

## 아키텍처

```
skillbridge/
├── manifest.json              # Chrome MV3 manifest
├── _locales/                  # Chrome i18n (en, ko, ja, zh_CN)
├── src/
│   ├── background/            # Google Translate API 프록시
│   ├── content/               # DOM 번역 + 사이드바 UI + 폰트
│   ├── popup/                 # 확장 프로그램 팝업 UI
│   ├── lib/                   # 번역 엔진, AI 브릿지, 자막
│   └── data/                  # 수동 검수 사전 (6개 언어 × 560+)
└── assets/icons/
```

## 기술 스택

| 구성 요소 | 기술 |
|-----------|------|
| 페이지 번역 | Google Translate API |
| 인라인 태그 번역 | Gemini 2.0 Flash (`<strong>`, `<a>`, `<code>` 유지) |
| 품질 검증 | [Puter.js](https://docs.puter.com/)를 통한 Gemini 2.0 Flash |
| 보호 용어 | 언어별 GT 브랜드/기술 용어 오류 자동 수정 |
| AI 튜터 | Puter.js를 통한 Claude Sonnet 4 |
| 수동 검수 사전 | 수동 조정 JSON (560+ × 6개 언어) |
| 번역 캐시 | IndexedDB |
| CJK 폰트 렌더링 | Google Fonts Noto Sans |

> **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)로 개발되었습니다.**
> 이 프로젝트는 아키텍처 설계와 기능 구현부터 CI/CD 파이프라인 설정, 단위 테스트, 디버깅, 심지어 데모 GIF까지 Claude Code를 AI 페어 프로그래밍 파트너로 사용하여 개발되었습니다.

## 번역 철학

각 언어의 사전은 모국어 사용자에게 자연스럽게 들리도록 수동으로 선별됩니다. 현재 [Anthropic의 공식 다국어 문서](https://docs.anthropic.com)와 맞추고 있지만, 커뮤니티 관례도 중요합니다 — 한국 개발자들이 "프롬프트" 대신 "prompt"라고 말하면, 그것이 우리가 사용하는 표현입니다.

용어 선택에 동의하지 않으신가요? 바로 그런 PR을 원합니다 — [CONTRIBUTING.md](../../CONTRIBUTING.md)에서 언어별 사전 개선 방법을 참고하세요.

## 기여하기

**모국어 사용자를 찾습니다!** 가장 영향력 있는 기여 방법은 언어 번역 사전을 개선하는 것입니다 — 코드가 필요 없고, JSON 파일만 편집하면 됩니다. 한 가지 잘못된 번역을 수정하는 것만으로도 해당 언어를 사용하는 모든 학습자에게 도움이 됩니다.

전체 가이드는 [CONTRIBUTING.md](../../CONTRIBUTING.md)를 참고하고, [Good First Issues](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)에서 시작하고, 프로젝트 방향은 [ROADMAP.md](../../docs/ROADMAP.md)를 참고하세요.

## 면책

SkillBridge는 개인용 번역 도구로, 브라우저의 내장 번역 기능과 유사합니다. 텍스트는 브라우저에서 실시간으로 번역되며 — 절대 저장되거나 재배포되지 않습니다.

> **SkillBridge for Anthropic Academy**는 비공식 커뮤니티 프로젝트입니다. Anthropic과 제휴되어 있지 않으며, Anthropic에서 승인하거나 후원하지 않습니다. "Anthropic", "Claude", "Skilljar"은 각 소유자의 상표입니다.

## 라이선스

[MIT](../../LICENSE)
