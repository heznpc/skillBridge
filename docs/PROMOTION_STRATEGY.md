# SkillBridge 홍보 전략서

> 목표: 오픈소스 프로젝트를 통한 개발자 인지도 확보
> 작성일: 2026-03-07
> KPI: GitHub Stars, Contributors, Anthropic 공식 인정

---

## 목차

1. [핵심 메시지](#1-핵심-메시지)
2. [홍보 채널별 전략](#2-홍보-채널별-전략)
3. [실행 타임라인](#3-실행-타임라인)
4. [콘텐츠 전략](#4-콘텐츠-전략)
5. [커뮤니티 성장 전략](#5-커뮤니티-성장-전략)
6. [KPI 및 목표 지표](#6-kpi-및-목표-지표)
7. [리스크 대응](#7-리스크-대응)

---

## 1. 핵심 메시지

### 원라이너

> "Anthropic Academy를 모국어로 배우세요 — 무료, 오픈소스, Claude로 만듦"

### 스토리 앵글 (3가지)

| 앵글 | 핵심 | 타겟 |
|------|------|------|
| **순환 구조** | Anthropic 강의 수강 → Claude Code로 개발 → Anthropic 강의 접근성 향상. 루프가 완성됨 | 개발자, AI 커뮤니티 |
| **교육 민주화** | AI 교육의 언어 장벽 제거. 570+ 전문 용어 큐레이션으로 Google 번역 오역 해결 | 비영어권 학습자, 교육 커뮤니티 |
| **기여 초대** | JSON 파일 하나만 편집하면 본인 언어 번역 품질 개선 가능. 코딩 불필요 | 오픈소스 입문자, 다국어 사용자 |

### 차별화 포인트 (홍보 시 반드시 포함)

- Google Translate: "Prompt" → "신속한" (오역) vs SkillBridge: "Prompt" → "프롬프트" (정확)
- API 키 불필요, 비용 0원
- Claude Code로 100% 개발 (모든 커밋에 Co-Authored-By: Claude)

---

## 2. 홍보 채널별 전략

### Phase 1: Anthropic 생태계 (Week 1)

가장 높은 ROI. SkillBridge의 존재 이유와 직결되는 커뮤니티.

#### Anthropic Discord

- **채널**: #community-projects 또는 #general
- **형식**: 짧은 소개 + 데모 GIF + GitHub 링크
- **핵심**: "Anthropic Academy가 영어만 지원해서 만들었습니다"
- **목표**: Anthropic 직원 반응 유도, 핀 등록

#### Reddit r/anthropic

- **형식**: 상세 포스트 (LAUNCH_POSTS.md 활용)
- **타이밍**: 화~목 오전 (PST 기준, 미국 활동 피크)
- **핵심**: 순환 구조 앵글 강조
- **주의**: 과도한 셀프 프로모션 금지, 커뮤니티 기여 관점으로 작성

#### Reddit r/ClaudeAI

- **형식**: "Claude Code로 만든 프로젝트 공유" 관점
- **핵심**: 개발 과정에서 Claude Code 활용 경험 중심
- **차별화**: r/anthropic과 다른 앵글 (도구가 아니라 개발 경험 공유)

### Phase 2: 개발자 커뮤니티 (Week 2)

#### Hacker News (Show HN)

- **제목**: `Show HN: SkillBridge – Translates Anthropic's AI courses into 30+ languages (open source)`
- **핵심**: 기술적 접근 강조 (3-Tier 번역 엔진, MV3, Puter.js)
- **타이밍**: 화~목 오전 6-8시 EST
- **팁**: 첫 댓글로 기술 상세 설명 직접 작성, 질문에 빠르게 응답

#### Product Hunt

- **카테고리**: Chrome Extensions, Education, AI Tools
- **준비물**:
  - 태그라인: "Learn Anthropic's AI courses in your language — free & open source"
  - 4-5장 스크린샷 (번역 전/후, AI 튜터, 자막, 용어 보호)
  - 30초 데모 영상
  - Maker 코멘트 준비
- **타이밍**: 자정 PST (00:01) 런칭, 24시간 투표 주기 활용
- **목표**: Daily Top 5 진입

#### Dev.to / Hashnode 블로그 포스트

- **제목안**: "How I Built a Chrome Extension with Claude Code That Translates AI Courses"
- **구조**:
  1. 문제 발견 (Anthropic Academy 영어 전용)
  2. Google Translate의 AI 용어 오역 사례 (스크린샷)
  3. 3-Tier 번역 엔진 설계
  4. Claude Code 개발 경험 (실제 프롬프트 예시)
  5. 오픈소스 공개 + 기여 초대
- **SEO 태그**: #opensource #chromeextension #ai #anthropic #claudecode

### Phase 3: 다국어 커뮤니티 (Week 3-4)

각 언어권 커뮤니티에 해당 언어로 직접 홍보.

#### 한국어

| 채널 | 형식 | 비고 |
|------|------|------|
| GeekNews (news.hada.io) | Show 포스트 | 한국 HN, 개발자 밀집 |
| 커리어리 | 기술 블로그 포스트 | AI/개발 직장인 타겟 |
| 디스콰이엇 | 사이드 프로젝트 공유 | 메이커 커뮤니티 |
| 클리앙 IT 게시판 | 짧은 소개 | 얼리어답터 |
| 카카오 오픈채팅 (AI/개발) | 링크 공유 | 직접 소통 |

#### 일본어

| 채널 | 형식 | 비고 |
|------|------|------|
| Zenn.dev | 기술 블로그 (일본어) | 일본 Dev.to |
| Qiita | 기술 아티클 | 일본 최대 개발자 플랫폼 |
| X (일본 AI 커뮤니티) | 트윗 스레드 | #Claude #AI학습 태그 |

#### 중국어

| 채널 | 형식 | 비고 |
|------|------|------|
| V2EX | 분享创造 카테고리 | 중국 HN |
| 掘金 (Juejin) | 기술 아티클 | 중국 Dev.to |
| 知乎 (Zhihu) | Q&A + 아티클 | "如何学习Anthropic课程" 질문에 답변 |

#### 스페인어/프랑스어/독일어

- Reddit 각 언어 서브레딧: r/programacion, r/programmation, r/de_EDV
- 해당 언어 README가 이미 존재하므로 바로 공유 가능

### Phase 4: 소셜 미디어 (지속)

#### X/Twitter

- **계정 전략**: 개인 계정에서 빌드 과정 공유 (build in public)
- **콘텐츠 믹스**:
  - 주 2회: 개발 진행 상황, 번역 품질 개선 사례
  - 주 1회: Google Translate vs SkillBridge 비교 (비주얼)
  - PR 머지 시: 기여자 감사 태그
- **태그**: @AnthropicAI @alexalbert__ @aaborovskiy (Anthropic DevRel)
- **해시태그**: #BuiltWithClaude #OpenSource #AIeducation

#### LinkedIn

- **형식**: 프로젝트 스토리텔링 포스트
- **앵글**: "AI 교육 접근성" 사회적 임팩트 강조
- **타겟**: AI/EdTech 리쿠르터, 채용 담당자 노출

### Phase 5: Anthropic 공식 인정 (목표)

최종 목표는 Anthropic이 SkillBridge를 인정하거나 공유하는 것.

**접근 경로:**

1. **Anthropic DevRel 팀 DM**: X/Twitter에서 @alexalbert__ 등에게 정중하게 소개
2. **Anthropic Community Spotlight**: 커뮤니티 프로젝트 소개 프로그램 신청
3. **Claude Code 쇼케이스**: "Built with Claude Code" 사례로 제출
4. **Anthropic Academy 팀 직접 연락**: LinkedIn에서 Anthropic Education/Academy 담당자 찾아 메시지

**인정 받으면 얻는 것:**
- Anthropic 리트윗/멘션 → Star 폭증
- "Anthropic Recognized" 배지 → 포트폴리오 신뢰도
- Anthropic Academy 공식 페이지에 링크 가능성

---

## 3. 실행 타임라인

### 런칭 전 준비 (D-7 ~ D-1)

| 일자 | 작업 | 상태 |
|------|------|------|
| D-7 | Chrome Web Store 등록 신청 | 필수 |
| D-5 | Product Hunt 예약 등록, 스크린샷/영상 준비 | 필수 |
| D-3 | Dev.to 블로그 포스트 작성 완료 | 필수 |
| D-2 | Good First Issues 5개 이상 등록 | 필수 |
| D-1 | GitHub Discussions 활성화, CONTRIBUTING.md 최종 점검 | 필수 |

### 런칭 주 (Week 1)

| 요일 | 채널 | 액션 |
|------|------|------|
| 월 | GitHub | 레포 공개 전환, README 최종 확인 |
| 화 | Reddit r/anthropic | 메인 포스트 게시 |
| 화 | Anthropic Discord | 프로젝트 공유 |
| 수 | Reddit r/ClaudeAI | 개발 경험 공유 포스트 |
| 목 | Product Hunt | 런칭 (자정 PST) |
| 목 | X/Twitter | 스레드 게시 |
| 금 | Hacker News | Show HN 게시 |

### 확산 주 (Week 2-3)

| 주차 | 채널 | 액션 |
|------|------|------|
| W2 월 | Dev.to / Hashnode | 기술 블로그 게시 |
| W2 수 | GeekNews, 디스콰이엇 | 한국 커뮤니티 |
| W2 금 | LinkedIn | 프로젝트 스토리 포스트 |
| W3 월 | Zenn / Qiita | 일본 커뮨니티 |
| W3 수 | V2EX / Juejin | 중국 커뮤니티 |
| W3 금 | r/LanguageLearning | 번역 기여자 모집 |

### 유지 단계 (Week 4+)

- X/Twitter build in public: 주 2회
- 신규 기여자 PR 머지 시 감사 트윗
- 월 1회 릴리즈 노트 + 채널 업데이트

---

## 4. 콘텐츠 전략

### 핵심 비주얼 에셋

| 에셋 | 용도 | 우선순위 |
|------|------|:--------:|
| **Before/After 비교 스크린샷** | Google Translate 오역 vs SkillBridge 정확 번역 | P0 |
| **30초 데모 GIF** | README, Product Hunt, 소셜 미디어 | P0 |
| **60초 데모 영상** | Product Hunt, YouTube, 블로그 | P0 |
| **아키텍처 다이어그램** | HN, Dev.to (기술 청중) | P1 |
| **기여 가이드 인포그래픽** | "JSON 하나만 편집하면 됩니다" 비주얼 | P1 |

### 블로그 시리즈 (Dev.to / 개인 블로그)

1. **"Google Translate가 AI 용어를 망치는 방법"** — 문제 제기 + 해결책
2. **"Claude Code로 Chrome Extension 만들기"** — 개발 과정 회고
3. **"570개 AI 용어를 6개 언어로 큐레이션한 이유"** — 번역 철학
4. **"Puter.js로 API 키 없이 AI 기능 구현하기"** — 기술 딥다이브

### 소셜 미디어 반복 콘텐츠

**주간 시리즈 아이디어:**

- **#TranslationFail 금요일**: Google Translate의 AI 용어 오역 사례 (재미 요소)
- **#ContributorSpotlight**: 기여자 소개 및 감사
- **#TIL (Today I Learned)**: Claude Code 개발 중 배운 것

---

## 5. 커뮤니티 성장 전략

### 기여자 확보

**진입 장벽 최소화:**
- `good first issue` 라벨: 항상 5개 이상 유지
- JSON 사전 편집은 코딩 불필요 → 비개발자도 참여 가능
- CONTRIBUTING.md에 단계별 스크린샷 포함

**기여 동기 부여:**
- README Contributors 섹션에 자동 표시 (all-contributors bot)
- 새 언어 Premium 사전 기여자 → README에 "Language Champion" 표기
- 월간 Top Contributor 소셜 미디어 소개

### 사용자 피드백 루프

- GitHub Discussions 활성화 → 기능 요청, 번역 품질 논의
- Issue 템플릿: Bug Report, Feature Request, Language Request
- 월 1회 커뮤니티 서베이 (Google Form)

### Anthropic 생태계 연결

- `awesome-anthropic` 리스트에 PR 제출
- Anthropic Cookbook / Community 페이지 등재 요청
- Claude Code 공식 쇼케이스 제출

---

## 6. KPI 및 목표 지표

### 1개월 목표

| 지표 | 목표 | 측정 방법 |
|------|------|----------|
| GitHub Stars | 100+ | GitHub Insights |
| 고유 방문자 | 500+ | GitHub Traffic |
| 클론 수 | 50+ | GitHub Traffic |
| Contributors | 5+ | GitHub Contributors |
| Product Hunt 순위 | Daily Top 10 | Product Hunt |

### 3개월 목표

| 지표 | 목표 | 측정 방법 |
|------|------|----------|
| GitHub Stars | 500+ | GitHub Insights |
| Premium 언어 | 10+ (현재 6) | 사전 파일 수 |
| Contributors | 15+ | GitHub Contributors |
| Chrome Web Store 설치 | 200+ | CWS Dashboard |
| Anthropic 공식 멘션 | 1회 이상 | X/Discord/Blog |

### 6개월 목표

| 지표 | 목표 | 측정 방법 |
|------|------|----------|
| GitHub Stars | 1,000+ | GitHub Insights |
| Chrome Web Store 설치 | 1,000+ | CWS Dashboard |
| Contributors | 30+ | GitHub Contributors |
| 블로그 포스트 총 조회 | 10,000+ | Dev.to Analytics |

---

## 7. 리스크 대응

### Anthropic 자체 다국어 지원 시

- **가능성**: 높음 (SK텔레콤 파트너십, 한국어 우선)
- **대응**:
  - 사전에 "커뮤니티 프로젝트"로 명확히 포지셔닝
  - Anthropic이 번역 지원하면 축하 + "우리가 필요성을 증명했다" 내러티브
  - v4.0 Multi-LMS 지원으로 피벗 (Skilljar 외 다른 LMS 플랫폼)
  - 이미 얻은 인지도/Stars/포트폴리오 가치는 유지됨

### 저조한 초기 반응

- **대응**:
  - 홍보 채널 다변화 (영어권 → 각 언어권 순차 확대)
  - 블로그 콘텐츠 SEO 최적화로 검색 유입 확보
  - Anthropic Academy 신규 코스 출시 시점에 맞춰 재홍보

### 부정적 피드백

- **"Anthropic 상표 무단 사용 아닌가?"**
  - Disclaimer 이미 README에 포함
  - "for Anthropic Academy"는 설명적 사용 (descriptive fair use)
  - Anthropic 요청 시 즉시 이름 변경 준비

### Chrome Web Store 심사 거절

- **대응**: host_permissions 최소화, 개인정보 처리방침 준비 완료 확인
- **대안**: GitHub 직접 배포 + 설치 가이드 영상

---

## 부록: 홍보 체크리스트

### 런칭 전

- [ ] Chrome Web Store 등록 신청
- [ ] Product Hunt 예약 (hunter 섭외 or 직접)
- [ ] Good First Issues 5개+ 생성
- [ ] all-contributors bot 설정
- [ ] 데모 GIF 30초 버전 제작
- [ ] 데모 영상 60초 버전 제작
- [ ] Before/After 비교 스크린샷 6장 (각 Premium 언어)
- [ ] Dev.to 블로그 포스트 초안 완성
- [ ] GitHub Discussions 활성화
- [ ] Social preview image 설정 (og:image)

### 런칭 후

- [ ] Reddit r/anthropic 포스트
- [ ] Reddit r/ClaudeAI 포스트
- [ ] Anthropic Discord 공유
- [ ] Product Hunt 런칭
- [ ] X/Twitter 스레드
- [ ] Hacker News Show HN
- [ ] Dev.to 블로그 게시
- [ ] GeekNews 게시
- [ ] 디스콰이엇 게시
- [ ] LinkedIn 포스트
- [ ] awesome-anthropic PR 제출
- [ ] Anthropic DevRel DM

---

## 핵심 원칙

1. **셀프 프로모션이 아닌 커뮤니티 기여로 포지셔닝** — "내가 만들었다"보다 "함께 만들자"
2. **각 채널에 맞는 앵글 사용** — HN은 기술, Reddit은 스토리, PH는 비주얼
3. **일관된 메시지** — 어디서든 "AI 교육의 언어 장벽 제거"
4. **빠른 응답** — 런칭 주간에는 모든 댓글/이슈에 24시간 내 응답
5. **기여자 = 최고의 홍보** — 기여자가 자기 네트워크에 공유하는 것이 가장 효과적
