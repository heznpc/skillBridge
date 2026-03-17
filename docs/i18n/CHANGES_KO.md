# 다국어 README 업데이트 요약

## 개요

6개 언어의 i18n README 파일을 영문 README 구조와 동기화했습니다.

대상 파일: `README_KO.md`, `README_JA.md`, `README_ZH-CN.md`, `README_ES.md`, `README_FR.md`, `README_DE.md`

---

## 변경 사항

### 1. 구조 재배치

기존 구조가 영문 README와 일치하지 않아 전면 재배치했습니다.

| 기존 | 변경 후 |
|------|---------|
| Why SkillBridge? | 문제점 (The Problem) |
| 보호 용어 사례 (독립 섹션) | 기능 > 보호 용어 (하위 섹션으로 통합) |
| 실제 작동 방식 확인 (스크린샷) | 기능 (Features) 섹션에 통합 |
| 작동 원리 | 작동 원리 (위치 변경: 설치 뒤로) |
| 기능 (중복 요약 리스트) | 삭제 (위의 기능 섹션과 중복) |
| 지원 언어 → 설치 | 설치 → 지원 언어 (순서 교체) |
| *(없음)* | 빠른 시작 (Quick Start) 추가 |
| *(없음)* | 스타 알림 callout 추가 |

### 2. 수치 수정

- `560+` → `570+` (실제 사전 항목 수: 572~596개)

### 3. 배지 추가

```
기존: MIT License, Chrome MV3, PRs Welcome
추가: GitHub Stars, GitHub Contributors
```

### 4. 태그라인 개선

각 언어에 "Anthropic Academy를 당신의 언어로 번역하세요 — 즉시." 형태의 태그라인 추가 (영문 README와 동일한 2줄 구성)

### 5. 아키텍처 트리 수정

`bridge/` 디렉토리 추가, `lib/` 설명을 "번역 엔진, 자막, 상수"로 수정 (실제 코드 구조 반영)

### 6. 개인정보 관련 문구 수정

| 기존 (부정확) | 변경 후 (정확) |
|--------------|---------------|
| "브라우저 내에서 발생 — 제3자 서버에 전송되지 않음" | "Puter.js를 통해 Google 번역 및 Gemini/Claude API로 전송 — 서버에 데이터 저장 없음" |

### 7. Claude Code 기여 문구 축소

| 기존 | 변경 후 |
|------|---------|
| "아키텍처 ~ CI/CD 파이프라인, 단위 테스트, 디버깅, 데모 GIF" | "아키텍처 ~ 디버깅, 데모 GIF" |

프로젝트에 CI/CD 파이프라인과 단위 테스트가 없으므로 삭제.

### 8. 크롬 웹 스토어 안내

기존: HTML 주석 내 숨김 처리 (`<!-- ... -->`)
변경: 보이는 blockquote로 변경 ("Chrome 웹 스토어 등록 준비 중 — 스타를 눌러 알림 받기")

### 9. Chromium 브라우저 호환성

"Edge, Brave, Arc 등 기타 Chromium 기반 브라우저에서도 작동" 문구 추가

### 10. 링크 정규화

- `../../issues` → `https://github.com/heznpc/skillbridge/issues` (전체 URL)
- Good First Issues 링크도 전체 URL로 변경

### 11. 기타

- 아이콘 크기: `width="80"` → `width="90"`
- TODO 주석 및 주석 처리된 HTML 블록 전체 삭제
- "충실한 UI" (Faithful UI) 중복 기능 항목 삭제
- `> [!IMPORTANT]` GitHub callout으로 스타 알림 추가 (Contributing 섹션 직전)
