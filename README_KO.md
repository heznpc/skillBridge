# Skilljar i18n Assistant

**Anthropic Skilljar 강의를 15개 이상의 언어로 학습하세요!**

---

## 문제

[Anthropic의 Skilljar 강의](https://anthropic.skilljar.com/)는 Claude, 프롬프트 엔지니어링, AI 안전성에 대한 훌륭한 무료 교육을 제공하지만, 영어로만 제공됩니다. 이는 배우고 싶은 수백만 명의 비영어권 사용자에게 장벽이 됩니다.

## 해결책

다음 기능을 제공하는 Chrome 확장 프로그램:

- **실시간 번역** — 강의 페이지를 15개 이상의 언어로 번역
- **AI 튜터** — 강의 내용에 대한 질문에 원하는 언어로 답변
- **완전 무료** — [Puter.js](https://puter.com) + GPT-4o-mini 기반 (API 키 불필요)
- **저작권 준수** — 실시간 번역만 수행, 콘텐츠 저장/재배포 없음

## 설치 방법

1. 이 저장소를 클론합니다:
   ```bash
   git clone https://github.com/YOUR_USERNAME/skilljar-i18n-assistant.git
   ```

2. Chrome에서 `chrome://extensions/` 접속

3. **개발자 모드** 활성화 (우측 상단 토글)

4. **압축해제된 확장 프로그램을 로드합니다** 클릭 → 클론한 폴더 선택

5. [anthropic.skilljar.com](https://anthropic.skilljar.com/)에 접속하면 지구본 아이콘이 보입니다!

## 사용 방법

### 번역
1. 지구본 아이콘(우측 하단) 또는 확장 프로그램 팝업 클릭
2. 대상 언어 선택
3. "Translate Page" 클릭 — 실시간으로 콘텐츠 번역
4. "Auto-translate" 토글로 페이지 로드 시 자동 번역 설정

### AI 튜터
1. 사이드바 열기 → "AI Tutor" 탭 전환
2. 강의 내용에 대해 아무 언어로 질문
3. 원하는 언어로 설명, 요약, 도움 받기

## 기여하기

기여를 환영합니다! [CONTRIBUTING.md](CONTRIBUTING.md)를 참고해주세요.

도움이 필요한 주요 영역:
- 특정 언어의 **번역 품질** 개선
- Skilljar 사이트 구조 변경 시 **셀렉터 업데이트**
- **새로운 언어** 추가
- **접근성** 개선
- **Firefox/Edge** 포팅

## 라이선스

MIT License — [LICENSE](LICENSE) 참고

---

**전 세계 AI 학습 커뮤니티를 위해 만들었습니다.**

*Anthropic 강의가 도움이 되셨다면, 다른 사람들도 배울 수 있도록 이 레포에 스타를 눌러주세요!*
