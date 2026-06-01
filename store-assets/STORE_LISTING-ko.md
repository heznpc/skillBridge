# Chrome Web Store — 스토어 등록 정보 (v3.5.37, 한국어)

원본 영문판: [STORE_LISTING.md](STORE_LISTING.md)

## 새로운 기능 (v3.5.37) — CWS "변경사항" 칸에 붙여넣기

- 🃏 간격 반복 플래시카드 — "복습할 카드" 모드로 지금 복습할 카드만 표시.
- 🔖 책갈피 — 레슨을 보던 스크롤 위치 그대로 저장하고 다시 이어보기.
- ⏩ 이어보기 / 최근 — 코스를 넘나들며 보던 자리에서 바로 재개.
- 📑 레슨 내 목차 + 읽기 진행 바 (긴 레슨에 유용).
- 🧰 정돈된 튜터 — 기록·플래시카드·책갈피·이어보기·PDF를 하나의 "도구" 메뉴로 통합.
- 🎨 새 확장 아이콘.

## 제목 (최대 75자)

SkillBridge — AI 강의 번역기 + 페이지 내 AI 튜터

## 요약 (최대 132자)

anthropic.skilljar.com 의 무료 AI 강의를 한국어로 완주하세요. AI 용어 사전, 페이지 내 AI 튜터, 시험 안전 모드. API 키 불필요.

## 상세 설명

anthropic.skilljar.com 의 무료 AI 강의는 프롬프트 엔지니어링, AI 안전성, Claude API, MCP 등을 다루는 세계 최고 수준의 학습 자료입니다. 단 영어로만 제공됩니다. SkillBridge는 영어 학습자가 아닌 사람이 실제로 과정을 끝까지 듣고 수료증을 받는 가장 빠른 방법입니다.

이것은 범용 번역기가 아닙니다. SkillBridge는 11개 프리미엄 언어용으로 손수 큐레이션한 AI 용어 사전을 탑재해 "Prompt"가 "신속한"이 아니라 "프롬프트"로 정확히 번역됩니다. 또한 모국어로 답하는 AI 튜터가 현재 보고 있는 레슨을 인식해, 막힌 부분을 한국어로 물어보면 슬라이드 내용에 정확히 맞는 답을 받을 수 있습니다.

🎓 한국어로 끝까지
페이지의 모든 텍스트 요소를 번역합니다 — 헤딩, 본문, 목록, 내비게이션, 강의 카드, 진도 라벨, 영상 자막, 코드 주석까지. 진도 추적과 퀴즈 제출 같은 인터랙티브 요소는 그대로 동작합니다.

🤖 페이지 내 AI 튜터 (Puter.js 경유 Claude Sonnet 4.6)
사이드바 챗봇이 현재 강의와 레슨을 알고 있습니다. 한국어로 질문하면, 보고 있는 레슨 내용에 맞춰 스트리밍으로 답변합니다. API 키, 가입, 결제가 전혀 필요 없습니다.

🃏 간격 반복 어휘 플래시카드
큐레이션 사전에서 자동 생성된 강의별 플래시카드 덱. 표시한 카드는 적절한 간격(1 / 3 / 7일)으로 다시 나타나고, "복습할 카드" 모드는 지금 복습할 카드만 보여줍니다. 로컬에 저장됩니다.

📝 텍스트 선택 → 튜터에게 묻기
레슨의 아무 텍스트나 선택하고 "튜터에게 묻기"를 누르면 한국어 해설이 나옵니다. 튜터는 레슨 전체 컨텍스트를 봅니다.

💬 대화 기록
챕터별로 묶인 대화 기록이 IndexedDB에 로컬 저장됩니다. 다른 세션에서도 이전 Q&A를 다시 볼 수 있습니다.

🔖 책갈피 & 이어보기
보던 레슨을 정확한 스크롤 위치에 책갈피로 저장하고, "이어보기"로 코스를 넘나들며 바로 이어서 보세요. 방문한 레슨과 스크롤 위치를 기억합니다. 모두 로컬 저장.

📑 레슨 내 목차 & 읽기 진행
레슨 제목들로 만든 목차(원하는 섹션으로 점프) + 읽기 진행 바로, 긴 레슨에서도 얼마나 읽었는지 항상 알 수 있습니다.

🎓 시험 모드 및 인증 안전 (안심하고 쓸 수 있게 만드는 규칙)
강의 퀴즈에서는 보기 선택지를 절대 번역하지 않습니다. 선택한 답이 원본 영어 정답과 항상 일치합니다. AI 튜터도 시험 안전 모드로 전환됩니다.

감독자 인증 시험(예: Claude Certified Architect)에서는 확장 프로그램이 스스로 완전히 비활성화됩니다 — 번역, UI, AI 튜터 모두 동작하지 않으므로 부정행위 도구로 오해될 일이 없습니다.

✨ 보호 용어 (Protected Terms)
프리미엄 언어당 570개 이상 큐레이션 항목. Anthropic, Claude, Cowork, Dispatch, Computer Use, Subagent 같은 브랜드명과 기술 용어가 정확하게 유지됩니다 — 모두 제3자 브랜드에 대한 서술적 참조입니다. 알려진 오역은 자동으로 수정됩니다. 플랫폼에 새 강의가 추가되면 48시간 안에 용어 사전을 업데이트합니다 — 오픈 소스 드리프트 워처가 이를 기계적으로 강제합니다.

💻 코드 주석 번역
코드 블록 안의 주석만 번역하고 코드 자체는 건드리지 않습니다. Python, JavaScript, HTML, Bash 등 지원.

🎬 자동 자막
강의 영상 재생 시 번역 자막이 자동으로 켜집니다. 수동 토글 불필요.

🔍 스마트 감지
첫 방문 시 브라우저 언어를 감지해 번역을 제안합니다. SPA 내비게이션도 처리합니다 — 레슨을 이동해도 새 페이지가 새로고침 없이 자동 번역됩니다.

📡 오프라인 지원
인터넷이 끊기면 캐시된 번역으로 전환하고 오프라인 배너를 표시합니다. AI 튜터는 조용히 실패하는 대신 안내 메시지를 띄웁니다.

⌨️ 단축키
Ctrl+Shift+S (튜터 토글), Ctrl+Shift+F (플래시카드), Ctrl+Shift+L (다크 모드), Ctrl+Shift+/ (도움말), Escape (닫기), / (채팅 포커스).

🌙 다크 모드 · 🔄 RTL 지원 · 📱 모바일 친화적
강의 사이트 전체에 적용되는 풀 다크 테마. 아랍어와 히브리어에 대한 완전한 RTL 레이아웃. 사이드바가 모바일 화면에 자동 적응.

━━━━━━━━━━━━━━━━━━━

지원 강의
anthropic.skilljar.com 에 현재 공개된 17개 강의 전체. 새 강의가 추가되면 48시간 안에 용어 사전을 추가합니다(오픈 소스 드리프트 워처가 새 slug를 발견하면 자동으로 이슈를 엽니다). 강의 이름은 호환성 설명을 위한 서술적 참조입니다:
Claude 101 · Claude Code 101 · Claude Code in Action · Introduction to Claude Cowork · Introduction to Agent Skills · Introduction to Subagents · Building with the Claude API · Introduction to MCP · MCP: Advanced Topics · Claude with Amazon Bedrock · Claude with Google Vertex AI · AI Fluency: Framework & Foundations · AI Fluency for Students · AI Fluency for Educators · Teaching AI Fluency · AI Fluency for Nonprofits · AI Capabilities and Limitations

━━━━━━━━━━━━━━━━━━━

프리미엄 언어 (큐레이션 사전 + Google Translate + AI 검증):
🇰🇷 한국어 · 🇯🇵 日本語 · 🇨🇳 中文简体 · 🇹🇼 中文繁體 · 🇪🇸 Español · 🇫🇷 Français · 🇮🇹 Italiano · 🇩🇪 Deutsch · 🇧🇷 Português (BR) · 🇷🇺 Русский · 🇻🇳 Tiếng Việt

표준 언어 (Google Translate + AI 검증):
Português (PT) · Nederlands · Polski · Українська · Čeština · Svenska · Dansk · Suomi · Norsk · Türkçe · العربية · हिन्दी · ภาษาไทย · Bahasa Indonesia · Bahasa Melayu · Filipino · বাংলা · עברית · Română · Magyar · Ελληνικά

━━━━━━━━━━━━━━━━━━━

동작 방식
1. 큐레이션 사전 조회 (570개 이상 항목) → 즉시, 완전 로컬
2. 로컬 캐시 (IndexedDB) → 즉시, 기기에 저장
3. 인라인 HTML 태그 → Gemini 2.0 Flash가 태그를 보존하며 번역 (Puter.js 경유)
4. 일반 텍스트 → Google Translate API (~200ms)
5. AI 품질 검증 → Gemini 2.0 Flash가 백그라운드에서 복잡한 문장을 재검증
6. 보호 용어 자동 복구 → 브랜드명과 기술 용어를 원복

SkillBridge 서버에는 어떤 데이터도 저장되지 않습니다. 번역에는 Google Translate와 Puter.js를 사용합니다 — 아래 개인정보 보호 정책을 참고하세요.

━━━━━━━━━━━━━━━━━━━

🔒 개인정보 및 데이터
API 키 불필요. 계정 불필요. 기본 설정에서 분석 및 추적 없음.

SkillBridge는 어떠한 서버도 운영하지 않습니다. 다만 번역과 AI 기능을 위해 다음 서드파티로 데이터가 전송됩니다:

• Google Translate — 페이지 텍스트가 Google 번역 엔드포인트로 전송됩니다. Google의 개인정보 정책이 적용됩니다.
• Puter.js → Gemini 2.0 Flash — 복잡한 문장의 품질 검증을 위해 Puter.js 경유로 번역 텍스트가 전송됩니다. Puter의 개인정보 정책이 적용됩니다.
• Puter.js → Claude Sonnet 4.6 — AI 튜터링을 위해 채팅 메시지와 레슨 컨텍스트(최대 2,000자)가 Puter.js 경유로 전송됩니다. Puter의 개인정보 정책이 적용됩니다.

모든 설정, 번역 캐시, 대화 기록은 브라우저에 로컬 저장됩니다(chrome.storage 및 IndexedDB). 이 데이터는 기기를 벗어나지 않습니다.

전체 개인정보 보호 정책: https://heznpc.github.io/skillBridge/privacy

📖 오픈 소스
https://github.com/heznpc/skillbridge
MIT 라이선스 — 기여 환영. 전략, 범위, "하지 않을 일" 목록은 POSITIONING.md에 공개되어 있습니다.

⚠️ 면책 조항
SkillBridge는 비공식 독립 커뮤니티 프로젝트입니다. Anthropic 또는 Skilljar와 제휴, 후원, 보증 관계가 없습니다. "Anthropic", "Claude", "Skilljar", 그리고 URL anthropic.skilljar.com 에 대한 모든 언급은 서술적(nominative)입니다 — 이 확장 프로그램이 번역하는 제3자 플랫폼과 콘텐츠를 가리킬 뿐입니다. 모든 상표는 각 권리자의 소유입니다.
