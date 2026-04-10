<div align="center">

🌐 [English](../../README.md) · **한국어** · [日本語](README_JA.md) · [中文](README_ZH-CN.md) · [Español](README_ES.md) · [Français](README_FR.md) · [Deutsch](README_DE.md)

</div>

---

<div align="center">

<img src="../../assets/icons/icon128.png" alt="SkillBridge" width="90" />

# SkillBridge for Anthropic Academy

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](../../LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Extension_MV3-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![GitHub stars](https://img.shields.io/github/stars/heznpc/skillbridge?style=social)](https://github.com/heznpc/skillbridge/stargazers)
[![GitHub contributors](https://img.shields.io/github/contributors/heznpc/skillbridge)](https://github.com/heznpc/skillbridge/graphs/contributors)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](../../CONTRIBUTING.md)

**Anthropic Academy를 당신의 언어로 번역하세요 — 즉시.**

Anthropic 무료 AI 강의의 언어 장벽을 허물다.

[설치하기](#설치) · [버그 신고](https://github.com/heznpc/skillbridge/issues) · [기능 요청](https://github.com/heznpc/skillbridge/issues)

</div>

---

<div align="center">

<img src="../../assets/screenshots/skillbridge-demo.gif" alt="SkillBridge Demo — 실시간 Anthropic Academy 번역" width="720" />

*SkillBridge를 설치하고, Anthropic Academy에 접속하면 전체 페이지가 즉시 번역됩니다.*

</div>

---

## 문제점

[Anthropic Academy](https://anthropic.skilljar.com/)는 Claude, 프롬프트 엔지니어링, AI 안전성을 배울 수 있는 최고의 무료 교육 플랫폼입니다. SkillBridge는 언어에 관계없이 모든 사람이 이 강의를 이용할 수 있게 합니다.

하지만 강의는 **영어로만 제공되며**, 일반 번역기로는 한계가 있습니다:

| | Google 번역 (페이지) | SkillBridge |
|---|---|---|
| AI 용어 | ❌ "Prompt" → "신속한" (오류) | ✅ "Prompt" → "프롬프트" (정확) |
| 기술 정확도 | ❌ 일반 기계 번역 | ✅ 570+ 수동 검수 용어 + AI 검증 |
| 상황 인식 도움 | ❌ 없음 | ✅ AI 튜터가 강의 내용에 대한 질문에 답변 |
| 동영상 자막 | ❌ 별도 수동 토글 | ✅ 자동 번역 자막 |
| UI 유지 | ❌ 체크박스, 진행률 표시줄 손상 | ✅ 모든 인터랙티브 요소 유지 |
| 비용 | 무료 | 무료 — API 키 필요 없음 |

> **API 키 없음. 비용 없음. 설치하고 바로 학습하세요.**

## 빠른 시작

1. 확장 프로그램 설치 ([아래 참고](#설치))
2. [Anthropic Academy](https://anthropic.skilljar.com/) 방문
3. SkillBridge가 전체 페이지를 자동으로 번역

이게 전부입니다.

## 기능

### 🌐 전체 페이지 번역

페이지의 모든 텍스트 요소가 번역되며, AI 관련 용어는 수동 검수된 사전을 통해 정확하게 처리됩니다. 진행률 체크박스, 아이콘, 네비게이션, CJK 폰트 모두 그대로 유지됩니다.

<div align="center">
<img src="../../assets/screenshots/01-lesson-translated.png" alt="커리큘럼이 완전히 번역된 강의 페이지" width="720" />
<br/>
<em>커리큘럼이 완전히 번역된 강의 페이지 — UI 요소가 보존됩니다.</em>
</div>

### 🤖 AI 튜터

[Puter.js](https://docs.puter.com/)를 통해 **Claude Sonnet 4**로 구동되는 사이드바 챗봇입니다. 현재 강의와 수업을 파악합니다. 선택한 언어로 질문하면 스트리밍 답변을 받습니다.

### 🎬 자동 자막

강의 영상을 재생하면 자동으로 번역 자막이 활성화됩니다 — 수동 토글이 필요 없습니다.

### 🔍 스마트 감지

첫 방문 시 브라우저 언어를 감지하고 번역을 제안합니다. 설정이 필요 없습니다.

### 🛡️ 보호 용어

일반 번역 도구는 **브랜드명과 기술 용어를 자주 잘못 번역합니다**. SkillBridge는 번역 후 이러한 오류를 자동으로 수정합니다:

<div align="center">

| 이전 (Google 번역) | 이후 (SkillBridge) |
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

## 설치

> Chrome 웹 스토어 등록 준비 중 — 이 저장소에 스타를 눌러 알림을 받으세요.

**수동 설치** (개발자 모드):

```bash
git clone https://github.com/heznpc/skillbridge.git
```

1. Chrome에서 `chrome://extensions/` 열기
2. **개발자 모드** 활성화 (우측 상단 토글)
3. **압축해제된 확장 프로그램을 로드합니다** → 클론한 폴더 선택
4. [anthropic.skilljar.com](https://anthropic.skilljar.com/)에 방문하고 학습 시작!

Edge, Brave, Arc 등 기타 Chromium 기반 브라우저에서도 작동합니다.

## 작동 원리

SkillBridge는 **5단계 번역 엔진**을 사용하여 속도와 정확도를 우선합니다:

```
페이지 텍스트
  │
  ├─ 570+ 수동 검수 용어 사전 ──→ 즉시 (AI 용어 정확 번역)
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

번역 요청은 [Puter.js](https://docs.puter.com/)를 통해 Google 번역 및 Gemini/Claude API로 전송됩니다 — 저희 서버에 데이터가 저장되지 않으며, 계정이나 API 키가 필요 없습니다.

## 지원 언어

### 프리미엄 — 수동 검수 사전 + Google 번역 + AI 검증

| 언어 | 코드 | 사전 |
|------|------|------|
| 🇰🇷 한국어 (Korean) | `ko` | 570+ 항목 |
| 🇯🇵 日本語 (Japanese) | `ja` | 570+ 항목 |
| 🇨🇳 中文简体 (Chinese Simplified) | `zh-CN` | 570+ 항목 |
| 🇹🇼 中文繁體 (Chinese Traditional) | `zh-TW` | 570+ 항목 |
| 🇪🇸 Español (Spanish) | `es` | 570+ 항목 |
| 🇫🇷 Français (French) | `fr` | 570+ 항목 |
| 🇩🇪 Deutsch (German) | `de` | 570+ 항목 |
| 🇧🇷 Português (Brazilian) | `pt-BR` | 570+ 항목 |
| 🇷🇺 Русский (Russian) | `ru` | 570+ 항목 |
| 🇻🇳 Tiếng Việt (Vietnamese) | `vi` | 570+ 항목 |

### 스탠다드 — Google 번역 + AI 검증

🇵🇹 Português (PT) · 🇮🇹 Italiano · 🇳🇱 Nederlands · 🇵🇱 Polski · 🇺🇦 Українська · 🇨🇿 Čeština · 🇸🇪 Svenska · 🇩🇰 Dansk · 🇫🇮 Suomi · 🇳🇴 Norsk · 🇹🇷 Türkçe · 🇸🇦 العربية · 🇮🇳 हिन्दी · 🇹🇭 ภาษาไทย · 🇮🇩 Bahasa Indonesia · 🇲🇾 Bahasa Melayu · 🇵🇭 Filipino · 🇧🇩 বাংলা · 🇮🇱 עברית · 🇷🇴 Română · 🇭🇺 Magyar · 🇬🇷 Ελληνικά

> 언어를 프리미엄으로 추가하고 싶으신가요? 수동 검수 사전을 기여하세요 — [CONTRIBUTING.md](../../CONTRIBUTING.md)를 참고하세요.

## 아키텍처

```
skillbridge/
├── manifest.json              # Chrome MV3 manifest
├── _locales/                  # Chrome i18n (en, ko, ja, zh_CN)
├── src/
│   ├── background/            # Google Translate API 프록시
│   ├── bridge/                # Puter.js AI 브릿지 (Gemini, Claude)
│   ├── content/               # DOM 번역 + 사이드바 UI + 폰트
│   ├── popup/                 # 확장 프로그램 팝업 UI
│   ├── lib/                   # 번역 엔진, 자막, 상수
│   └── data/                  # 수동 검수 사전 (10개 언어 × 570+)
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
| 수동 검수 사전 | 수동 조정 JSON (570+ × 10개 언어) |
| 번역 캐시 | IndexedDB |
| CJK 폰트 렌더링 | Google Fonts Noto Sans |

> **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)로 개발되었습니다.**
> 이 프로젝트는 아키텍처 설계와 기능 구현부터 디버깅과 데모 GIF까지 Claude Code를 AI 페어 프로그래밍 파트너로 사용하여 개발되었습니다.

## 번역 철학

각 언어의 사전은 모국어 사용자에게 자연스럽게 들리도록 수동으로 선별됩니다. [Anthropic의 공식 다국어 문서](https://docs.anthropic.com)와 맞추고 있지만, 커뮤니티 관례도 중요합니다 — 한국 개발자들이 "프롬프트"라고 말하면, 그것이 우리가 사용하는 표현입니다.

용어 선택에 동의하지 않으신가요? 바로 그런 PR을 원합니다 — [CONTRIBUTING.md](../../CONTRIBUTING.md)를 참고하세요.

> [!IMPORTANT]
> **이 저장소에 스타를 눌러** 새로운 기능과 언어 업데이트 알림을 받으세요.

## 기여하기

**모국어 사용자를 찾습니다!** 가장 영향력 있는 기여 방법은 언어 번역 사전을 개선하는 것입니다 — 코드가 필요 없고, JSON 파일만 편집하면 됩니다. 한 가지 잘못된 번역을 수정하는 것만으로도 해당 언어를 사용하는 모든 학습자에게 도움이 됩니다.

전체 가이드는 [CONTRIBUTING.md](../../CONTRIBUTING.md)를 참고하고, [Good First Issues](https://github.com/heznpc/skillbridge/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)에서 시작하세요.

## 면책

SkillBridge는 개인용 번역 도구로, 브라우저의 내장 번역 기능과 유사합니다. 텍스트는 브라우저에서 실시간으로 번역되며 — 절대 저장되거나 재배포되지 않습니다.

> **SkillBridge for Anthropic Academy**는 비공식 커뮤니티 프로젝트입니다. Anthropic과 제휴되어 있지 않으며, Anthropic에서 승인하거나 후원하지 않습니다. "Anthropic", "Claude", "Skilljar"은 각 소유자의 상표입니다.

## 라이선스

[MIT](../../LICENSE)
