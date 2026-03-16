# PROMOTION_STRATEGY.md 리뷰

> 리뷰 대상: `/docs/PROMOTION_STRATEGY.md`
> 리뷰 관점: 1인 개발자의 실행 가능성, 현실성, 누락 사항
> 작성일: 2026-03-07

---

## 종합 평가

| 항목 | 점수 | 코멘트 |
|------|:----:|--------|
| 구조/가독성 | 9/10 | 목차, 테이블, 체크리스트 활용 우수 |
| 채널 커버리지 | 9/10 | 영어/한국/일본/중국 채널 폭넓게 커버 |
| 실행 가능성 | 5/10 | **1인 기준 과부하**. 현실적 축소 필요 |
| KPI 현실성 | 5/10 | 니치 프로젝트 대비 목표치 공격적 |
| 리스크 분석 | 7/10 | 핵심 리스크 커버, 일부 누락 |
| 콘텐츠 제작 계획 | 4/10 | 제작 일정/리소스 고려 없음 |

**한 줄 요약**: 전략 자체는 탄탄하지만, **1인 개발자가 4주 안에 15개 채널 + 블로그 4편 + 영상 + GIF를 모두 소화하는 것은 비현실적**. 우선순위를 좁혀야 한다.

---

## 1. 강점

### 메시지 설계가 좋다
- "순환 구조" 앵글 (Anthropic 수강 → Claude로 개발 → Anthropic 접근성 향상)은 바이럴 포텐셜이 높음
- Google Translate "신속한" vs SkillBridge "프롬프트" 비교는 즉각적인 문제 인식을 유발 — 모든 채널에서 재사용 가능한 킬러 비주얼

### 채널-앵글 매칭이 정확하다
- HN → 기술, Reddit → 스토리, Product Hunt → 비주얼로 구분한 것은 각 플랫폼 문화를 잘 이해한 설계
- r/anthropic과 r/ClaudeAI를 다른 앵글로 분리한 것도 적절

### 체크리스트가 실행 가능하다
- 부록의 런칭 전/후 체크리스트는 그대로 TODO로 쓸 수 있는 수준

---

## 2. 문제점 및 개선 제안

### 2-1. 1인 실행 과부하 (Critical)

**문제**: Week 1에 7개 채널, Week 2-3에 8개 채널 추가. 각 채널에 맞는 글 작성 + 댓글 대응 + 콘텐츠 제작을 1인이 감당 불가.

**개선안**: 3단계로 축소하고, 검증 후 확장

| 우선순위 | 채널 | 이유 |
|:--------:|------|------|
| Must | Reddit r/anthropic + Anthropic Discord | 코어 타겟, 가장 높은 전환율 |
| Must | X/Twitter 스레드 1회 | 확산력, Anthropic 직원 태그 가능 |
| Should | Hacker News Show HN | 개발자 인지도, 하지만 반응 예측 불가 |
| Should | GeekNews | 한국 개발자 커뮤니티, 작성 부담 적음 |
| Could | Product Hunt | 준비 부담 큼 (영상, 스크린샷, 메이커 코멘트). Week 3 이후로 연기 |
| Could | Dev.to 블로그 | 초기 러시보다 런칭 후 안정기에 작성이 효과적 |
| Defer | Zenn, V2EX, Juejin | 해당 언어로 직접 작성 가능한지 먼저 확인 필요 |

### 2-2. KPI 현실성 (High)

**문제**: 6개월 Stars 1,000+, CWS 설치 1,000+는 니치 프로젝트 기준 공격적.

**비교 데이터** (유사 규모 Chrome Extension 오픈소스):
- Anthropic Academy 전용이라는 극히 좁은 타겟
- 대상 사용자: Anthropic Academy를 수강하는 비영어권 사용자 (매우 작은 풀)
- 비슷한 니치 번역 확장은 보통 6개월에 Stars 50-300 범위

**개선안**:

| 기간 | 지표 | 현재 목표 | 수정 제안 | 근거 |
|------|------|:---------:|:---------:|------|
| 1개월 | Stars | 100 | **50** | 니치 프로젝트 첫 달 평균 |
| 1개월 | PH 순위 | Top 10 | **Top 30** 또는 삭제 | Top 10은 대형 프로젝트 경쟁 |
| 3개월 | Stars | 500 | **150-200** | Anthropic 멘션 시 300 가능 |
| 6개월 | Stars | 1,000 | **300-500** | Anthropic 공식 인정 시 상한 |
| 6개월 | CWS 설치 | 1,000 | **200-300** | 타겟 풀 자체가 작음 |

### 2-3. Hacker News 리스크 미고려 (Medium)

**문제**: HN 커뮤니티는 특정 벤더에 종속된 도구에 회의적일 수 있음.

**예상 비판**:
- "왜 Anthropic Academy만? 범용 LMS 번역 도구를 만들지?"
- "Anthropic이 내일 다국어 지원하면 이 프로젝트는 죽는다"
- "Puter.js를 통해 무료 AI 모델 사용 — 이게 지속 가능한가?"

**개선안**: HN 포스트 첫 댓글에 이 질문들에 대한 선제 답변 준비. 특히:
- "이건 PoC이고, v4.0에서 Multi-LMS 확장 예정"
- "Puter.js는 사용자 브라우저에서 실행, 서버 비용 0"
- "Anthropic이 자체 지원하면 미션 성공 — 그게 이 프로젝트의 존재 이유"

### 2-4. 중국 채널 접근성 (Medium)

**문제 3가지**:

1. **GFW (Great Firewall)**: 중국 본토에서 Anthropic Academy 자체가 접근 불가할 가능성 높음. Claude, Google Translate API 모두 차단됨 → 중국 본토 사용자에게 SkillBridge 자체가 무용
2. **계정 요구**: V2EX, Juejin, Zhihu 모두 중국 전화번호 기반 인증 필요
3. **언어 장벽**: 중국어 커뮤니티에 중국어로 기술 포스트 작성 필요

**개선안**:
- 중국 본토 대신 **대만/홍콩/싱가포르** 중국어 사용자 타겟으로 전환
- V2EX/Juejin/Zhihu → **GitHub 중국어 README + X 중국어 트윗** 으로 대체
- 또는 중국어 커뮤니티는 Phase 3에서 완전 제외하고, 기여자가 자발적으로 확산하도록 유도

### 2-5. LAUNCH_POSTS.md 참조 불일치 (Low)

**문제**: 전략서가 `LAUNCH_POSTS.md`를 참조하지만, 해당 파일이 현재 레포에 존재하지 않음.

**개선안**: 전략서 내에 핵심 게시물 초안을 직접 포함하거나, LAUNCH_POSTS.md를 복원

### 2-6. Anthropic DevRel 태그 검증 (Low)

**문제**: `@alexalbert__`, `@aaborovskiy`가 실제 Anthropic DevRel인지 검증 필요. 잘못된 태그는 오히려 부정적 인상.

**개선안**: 런칭 전 Anthropic 공식 계정 팔로워/직원 목록에서 실제 DevRel 담당자 확인 후 업데이트

### 2-7. 콘텐츠 제작 일정 누락 (Medium)

**문제**: 비주얼 에셋 5종 + 블로그 4편을 "준비해야 한다"고만 명시. 제작에 걸리는 시간/순서가 없음.

**개선안**: 런칭 전 준비 일정에 콘텐츠 제작 마일스톤 추가

| 일자 | 콘텐츠 작업 |
|------|------------|
| D-10 | Before/After 스크린샷 6장 캡처 |
| D-8 | 30초 데모 GIF 녹화 (LICEcap 또는 ScreenToGif) |
| D-7 | Chrome Web Store 등록 + og:image 설정 |
| D-5 | 60초 데모 영상 녹화/편집 |
| D-3 | Dev.to 블로그 초안 (1편만, 나머지는 런칭 후) |
| D-1 | Reddit/Discord/X 게시물 텍스트 최종 검토 |

### 2-8. Chrome Web Store 실무 사항 누락

**누락 항목**:
- CWS 개발자 등록 수수료 $5 (일회성)
- 심사 기간: 통상 1-3일, 최대 2주 → **D-7은 촉박**할 수 있음. D-14로 앞당길 것
- 개인정보 처리방침 URL 필수 (privacy.html이 docs/에 존재하므로 호스팅 필요)
- 스크린샷 최소 1장 + 설명 텍스트 필수

### 2-9. "Build in Public" 지속성 (Low)

**문제**: v3.0이 이미 완성 상태 → "build"할 것이 무엇인지 불명확. v3.1 개발이 시작되지 않으면 공유할 콘텐츠 부족.

**개선안**:
- v3.1 로드맵 항목을 작은 이슈로 분할 → 각 이슈 해결을 "build in public" 콘텐츠로 활용
- 기여자 PR 리뷰/머지 과정도 콘텐츠화
- 새 Premium 언어 추가 과정 공유

---

## 3. 누락된 전략 요소

### 3-1. SEO / 검색 유입 전략

장기적으로 가장 안정적인 유입 채널. 전략서에 없음.

**추가 제안**:
- GitHub README에 "Anthropic Academy translation", "Claude courses Korean/Japanese" 등 검색 키워드 자연 삽입
- Dev.to 블로그 제목을 검색 의도에 맞게 설계: "How to take Anthropic Academy courses in Korean/Japanese/Chinese"
- Chrome Web Store 설명문에 각 언어명 명시 (CWS 내부 검색 최적화)

### 3-2. Anthropic Academy 신규 코스 출시 연동

Anthropic이 새 코스를 출시할 때마다 홍보 기회가 생김. 전략서에 트리거 기반 홍보가 없음.

**추가 제안**:
- Anthropic 블로그/X 모니터링 → 신규 코스 발표 시 24시간 내 "새 코스도 번역 지원합니다" 포스트
- 신규 코스의 번역 커버리지 스크린샷 즉시 제작

### 3-3. 유사 프로젝트/도구와의 교차 홍보

Anthropic 생태계 내 다른 오픈소스 프로젝트와 협력하면 상호 노출 가능.

**추가 제안**:
- awesome-anthropic, awesome-claude 등 목록에 등재
- Anthropic 관련 유튜버/블로거에게 도구 소개 요청
- fireauto (같은 /opensource 폴더) 등 Claude Code 생태계 프로젝트와 상호 링크

### 3-4. 유입 추적 체계

어떤 채널에서 Stars/설치가 발생하는지 측정 불가하면 전략 최적화 불가.

**추가 제안**:
- 각 채널 게시물에 UTM 파라미터 포함한 링크 사용: `github.com/heznpc/skillbridge?utm_source=reddit&utm_campaign=launch`
- 단축 URL 서비스 (Dub.co 등)로 클릭 수 추적
- GitHub Traffic 페이지의 Referring Sites 주간 모니터링

---

## 4. 수정 우선순위

| 순위 | 항목 | 난이도 | 임팩트 |
|:----:|------|:------:|:------:|
| 1 | Week 1 채널을 3-4개로 축소 | 쉬움 | 높음 |
| 2 | KPI 수치 현실적으로 하향 조정 | 쉬움 | 중간 |
| 3 | 콘텐츠 제작 일정 추가 (D-10부터) | 쉬움 | 높음 |
| 4 | CWS 등록을 D-14로 앞당기기 | 쉬움 | 높음 |
| 5 | 중국 본토 채널 제외 or 대만/HK 전환 | 쉬움 | 중간 |
| 6 | HN 선제 답변 준비 | 중간 | 중간 |
| 7 | UTM 추적 체계 추가 | 중간 | 높음 |
| 8 | SEO 키워드 전략 섹션 추가 | 중간 | 높음 (장기) |
| 9 | 신규 코스 출시 연동 트리거 추가 | 쉬움 | 중간 (장기) |
| 10 | DevRel 태그 실제 확인 | 쉬움 | 낮음 |

---

## 5. 최종 권장 실행 플랜 (수정안)

1인 개발자가 현실적으로 실행 가능한 최소 플랜:

### Week 0 (준비)
- CWS 등록 신청 ($5)
- Before/After 스크린샷 + 30초 GIF 제작
- Reddit/Discord 게시물 텍스트 확정

### Week 1 (코어 런칭)
- **화**: Reddit r/anthropic + Anthropic Discord (같은 날, 같은 콘텐츠 변형)
- **목**: X/Twitter 스레드 (@AnthropicAI 태그)
- 나머지 시간: 댓글 대응에 집중

### Week 2 (확장)
- **화**: Hacker News Show HN
- **목**: GeekNews (한국)
- **금**: LinkedIn

### Week 3+ (콘텐츠)
- Dev.to 블로그 1편 작성/게시
- Product Hunt 준비 시작 (영상 제작)

### Week 5+ (추가 채널)
- Product Hunt 런칭
- 일본/중국어 커뮤니티 (가능한 경우)
- awesome-anthropic PR

이 플랜이면 각 채널에 충분한 대응 시간을 확보하면서도 핵심 채널은 모두 커버할 수 있다.
