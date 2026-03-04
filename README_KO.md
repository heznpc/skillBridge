<div align="center">

🌐 [English](README.md) · **한국어** · [日本語](README_JA.md) · [中文](README_ZH-CN.md) · [Español](README_ES.md) · [Français](README_FR.md) · [Deutsch](README_DE.md)

</div>

---

<div align="center">

<img src="assets/icons/icon128.png" alt="SkillBridge" width="80" />

# SkillBridge for Anthropic Academy

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Extension_MV3-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**Anthropic 무료 AI 강의의 언어 장벽을 허물다.**

</div>

[Anthropic Academy](https://anthropic.skilljar.com/)는 Claude, 프롬프트 엔지니어링, AI 안전성에 대한 최고 수준의 무료 교육을 제공합니다. 하지만 영어로만 제공되죠. **SkillBridge**는 커뮤니티가 만든 Chrome 확장 프로그램으로, 전체 학습 경험을 30개 이상의 언어로 번역하고, AI 튜터가 실시간으로 질문에 답합니다.

> API 키 불필요. 비용 없음. 설치하고 바로 학습하세요.

---

## 주요 기능

### 3단계 번역 엔진

1. **정적 사전** — 언어별 559개 이상의 수동 튜닝된 번역이 지연 없이 즉시 적용
2. **IndexedDB 캐시** — 이전에 검증된 번역을 로컬에서 즉시 불러옴
3. **Google 번역 + Gemini 검증** — 나머지 텍스트는 Google 번역 후, 복잡한 문장만 Gemini 2.0 Flash가 백그라운드 검증

### AI 튜터 (Claude Sonnet 4)

[Puter.js](https://docs.puter.com/) 기반 Claude Sonnet 4 챗봇. 현재 페이지 맥락을 파악한 스트리밍 응답을 제공합니다.

### YouTube 자막 자동 번역

임베디드 강의 영상의 자막이 선택한 언어에 맞게 자동 활성화됩니다.

---

## 지원 언어

### 프리미엄 (정적 사전 + Google 번역 + AI 검증)

한국어, 日本語, 中文简体, Español, Français, Deutsch — 각 559개 항목의 정적 사전 포함

### 스탠다드 (Google 번역 + AI 검증)

中文繁體, Português, Italiano, Nederlands, Русский, Polski, Українська, Čeština, Svenska, Dansk, Suomi, Norsk, Türkçe, العربية, हिन्दी, ภาษาไทย, Tiếng Việt, Bahasa Indonesia 외 7개 언어

---

## 설치

1. 저장소 클론: `git clone https://github.com/heznpc/skillbridge.git`
2. Chrome → `chrome://extensions/` → **개발자 모드** 활성화
3. **압축해제된 확장 프로그램을 로드합니다** → 클론한 폴더 선택
4. [anthropic.skilljar.com](https://anthropic.skilljar.com/) 접속!

## 기술 스택

| 구성 요소 | 기술 | 역할 |
|-----------|------|------|
| 페이지 번역 | Google Translate API | 빠른 1차 번역 |
| 품질 검증 | Gemini 2.0 Flash (Puter.js) | 백그라운드 정확도 검증 |
| AI 튜터 | Claude Sonnet 4 (Puter.js) | 대화형 학습 어시스턴트 |
| AI 게이트웨이 | [Puter.js](https://docs.puter.com/) | Claude, Gemini 무료 접근 |

## 저작권에 대하여

SkillBridge는 브라우저의 내장 번역 기능과 유사한 개인용 번역 도구입니다. 텍스트는 브라우저에서 실시간으로 번역되며, 어떤 콘텐츠도 저장되거나 배포되지 않습니다. 정적 사전에는 UI 문자열만 포함되어 있으며, 강의 콘텐츠는 포함되지 않습니다.

> **면책:** SkillBridge for Anthropic Academy는 비공식 커뮤니티 프로젝트입니다. Anthropic과 제휴되어 있지 않으며, Anthropic에서 승인하거나 후원하지 않습니다. 이 확장 프로그램은 개인 학습을 위해 콘텐츠를 실시간으로 번역할 뿐 원본 강의 콘텐츠를 저장하거나 배포하지 않습니다. "Anthropic", "Claude", "Skilljar"은 각각의 소유자의 상표입니다.

## 기여하기

SkillBridge는 커뮤니티가 만들고, 커뮤니티를 위한 프로젝트입니다. 모든 종류의 기여를 환영합니다!

- **번역 개선** — 잘못된 번역 수정 또는 정적 사전에 항목 추가
- **새 언어 추가** — 표준 언어 추가 또는 큐레이션 사전으로 프리미엄 승격
- **코드 기여** — 번역 엔진, AI 튜터, YouTube 기능 개선
- **문서화** — README 개선, 튜토리얼 작성, 스크린샷 추가

자세한 가이드는 [CONTRIBUTING.md](CONTRIBUTING.md)를 참고하세요. [Good First Issues](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)에서 시작해보세요.

프로젝트 방향은 [ROADMAP.md](ROADMAP.md)를 참고하세요.

## 라이선스

MIT — [LICENSE](LICENSE)

---

**전 세계 AI 학습 커뮤니티를 위해 만들었습니다.**
