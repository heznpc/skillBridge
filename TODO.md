# SkillBridge 상용화 TODO

> 2026-04-03 기준 | v3.4.0 | 완성도 ~90%

## 버그/기술 부채

- [x] ~~package.json Jest `^30.2.0` — Jest 30 릴리즈 확인 (npm latest: 30.3.0)~~
- [x] ~~tests/format-response.test.js — 22개 전부 PASS (262/262 전체 통과)~~
- [x] ~~IndexedDB 쿼터 관리 — estimate() API + 자동 eviction + 사용자 알림 배너~~
- [x] ~~플래시카드 상태 영속성 — 코스+언어별 키, 카드 텍스트 기반 안정 매핑, 위치 복원~~

## 배포

- [x] ~~Firefox Add-ons — cd-firefox.yml 워크플로우 추가 (AMO_API_KEY/SECRET 시크릿 설정 필요)~~
- [x] ~~Chrome i18n `_locales/` — 33개 언어 전체 커버 (11 기존 + 22 신규)~~
- [x] ~~CHANGELOG.md — v1.0.0 ~ v3.4.0 실제 커밋 날짜 기준 작성~~

## 기능

- [x] ~~Per-Lesson Term Preview — 하단 플로팅 카드, 코스별 6개 용어, 15초 자동닫힘, 다크모드~~
- [x] ~~Offline Translation Cache 강화 — 오프라인 시 GT 스킵 + 캐시만 적용 + 온라인 복귀 시 자동 재시도~~
- [x] ~~PDF Export — window.print() 기반, 사이드바 헤더 버튼, 깔끔한 인쇄 스타일~~
- [ ] Multi-LMS 지원 탐색 (Anthropic Academy 종속 탈피 → 일반 교육 플랫폼)

## 수익화

- [ ] 프리미엄 AI 튜터 (무제한 대화, 고급 설명) 유료화 탐색
- [ ] 수익모델 확정 (현재 완전 무료)

## 제작 병목 주의

- **Firefox AMO 퍼블리싱**: cd-firefox.yml 준비 완료. GitHub Secrets에 `AMO_API_KEY` + `AMO_API_SECRET` 설정 필요
- **Multi-LMS 피봇**: DOM 셀렉터가 Skilljar 전용. 다른 LMS 지원 시 셀렉터 추상화 레이어 필요 → 설계 먼저
- **PDF Export**: @react-pdf 또는 jsPDF 단일 구현. 복잡한 레이아웃 피하기
