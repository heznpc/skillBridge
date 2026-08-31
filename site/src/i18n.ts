export const locales = ['en', 'ko'] as const;
export type Locale = (typeof locales)[number];

export type Copy = {
  title: string;
  description: string;
  nav: { experience: string; tools: string; how: string; install: string };
  hero: { eyebrow: string; title: string; lead: string; primary: string; secondary: string; assurances: string[] };
  language: { title: string; lead: string; more: string };
  proof: { eyebrow: string; title: string; lead: string; cards: { id: string; title: string; body: string; note: string }[] };
  tools: { eyebrow: string; title: string; lead: string; items: string[]; noteTitle: string; noteBody: string };
  steps: { eyebrow: string; title: string; lead: string; items: { id: string; title: string; body: string; note: string }[] };
  cta: { title: string; lead: string; primary: string; source: string };
  footer: { disclaimer: string; privacy: string; source: string; license: string };
};

export const copy: Record<Locale, Copy> = {
  en: {
    title: 'SkillBridge - AI courses in your language',
    description: 'Read supported AI Academy lessons in your language with curated terminology, local study tools, and exam safeguards.',
    nav: { experience: 'Experience', tools: 'Learning tools', how: 'How it works', install: 'Get extension' },
    hero: { eyebrow: 'A language layer for learning', title: 'Read the idea.\nNot the translation.', lead: 'Read supported AI Academy lessons in your language without leaving the course page. The lesson flow and technical terms stay intact.', primary: 'Get the extension', secondary: 'See the experience', assurances: ['No account for translation', 'Cached in your browser', 'Exam-aware behavior'] },
    language: { title: 'Your course is not a language test.', lead: 'Read in the language that lets you focus on the concept.', more: 'more languages' },
    proof: { eyebrow: 'What stays intact', title: 'The course still feels like the course.', lead: 'Translation belongs inside the lesson, not in another tab, document, or assistant.', cards: [
      { id: '01', title: 'Read in context', body: 'Course navigation, lesson structure, and translated copy stay together on the same page.', note: 'LESSON FLOW PRESERVED' },
      { id: '02', title: 'Keep precise terms', body: 'Curated dictionaries protect technical vocabulary from literal, confusing translations.', note: 'TERMINOLOGY AWARE' },
      { id: '03', title: 'Respect the assessment', body: 'Exam mode skips answer choices and disables the extension on recognized proctored routes.', note: 'EXAM-SAFE BY DESIGN' },
    ] },
    tools: { eyebrow: 'Built for the second read', title: 'Stay with the lesson.', lead: 'When a passage needs another pass, the context should stay visible. SkillBridge brings study tools into the course workspace.', items: ['Ask about the visible lesson context', 'Save flashcards and bookmarks locally', 'Resume with recent lessons and progress', 'Export study notes when you are done'], noteTitle: 'Ask in context.', noteBody: 'The Tutor opens beside the lesson so the passage you are studying remains visible.' },
    steps: { eyebrow: 'A lighter learning loop', title: 'Open a lesson. Make it yours.', lead: 'No landing-page account flow is required before you can begin reading.', items: [
      { id: '01', title: 'Install SkillBridge', body: 'Add the extension in Chrome or another supported Chromium browser.', note: 'ONE CLICK TO START' },
      { id: '02', title: 'Choose your language', body: 'Open a supported course and choose a course language from the globe menu.', note: 'LANGUAGE ON DEMAND' },
      { id: '03', title: 'Build a study rhythm', body: 'Read, review, save, and return to the lesson where you stopped.', note: 'ALL IN ONE PLACE' },
    ] },
    cta: { title: 'Make the course meet you halfway.', lead: 'Read supported AI Academy lessons in the language that lets you focus on the idea.', primary: 'Get SkillBridge', source: 'View source on GitHub' },
    footer: { disclaimer: 'Independent project. Not affiliated with, endorsed by, or sponsored by Anthropic or Skilljar.', privacy: 'Privacy', source: 'GitHub', license: 'MIT License' },
  },
  ko: {
    title: 'SkillBridge - AI 강의를 내 언어로',
    description: '핵심 용어, 로컬 학습 도구, 시험 안전 장치를 유지하며 지원되는 AI Academy 강의를 내 언어로 읽으세요.',
    nav: { experience: '경험', tools: '학습 도구', how: '사용 방법', install: '확장 프로그램 받기' },
    hero: { eyebrow: '학습을 위한 언어 레이어', title: '번역이 아니라,\n생각에 집중하세요.', lead: '지원되는 AI Academy 강의를 내 언어로 읽으세요. 강의 흐름과 전문 용어는 그대로 남습니다.', primary: '확장 프로그램 받기', secondary: '사용 경험 보기', assurances: ['번역에 계정 불필요', '브라우저에 로컬 캐시', '시험 상황 인식'] },
    language: { title: '강의는 언어 시험이 아니니까요.', lead: '개념에 집중할 수 있는 언어로 강의를 읽으세요.', more: '개 언어 더 보기' },
    proof: { eyebrow: '바뀌지 않는 것', title: '강의는 여전히, 그 강의 그대로입니다.', lead: '번역은 다른 탭이나 문서로 옮겨 가지 않습니다. 원래 학습 흐름 안에서 필요한 언어만 더해집니다.', cards: [
      { id: '01', title: '문맥 속에서 읽기', body: '강의 탐색, 목차, 본문과 번역이 같은 화면에서 이어집니다.', note: '학습 흐름 유지' },
      { id: '02', title: '정확해야 할 단어는 지키기', body: '큐레이션된 사전이 중요한 기술 용어를 어색한 직역으로 바꾸지 않도록 보호합니다.', note: '전문 용어 인식' },
      { id: '03', title: '평가의 경계 존중하기', body: '시험 모드는 선택지를 번역하지 않고 감독형 시험 경로에서는 확장 프로그램을 비활성화합니다.', note: '시험 안전 설계' },
    ] },
    tools: { eyebrow: '두 번째 읽기를 위해', title: '강의에서 벗어나지 마세요.', lead: '문단을 한 번 더 이해해야 할 때도 문맥은 화면에 남아 있어야 합니다. SkillBridge는 강의 공간에 학습 도구를 더합니다.', items: ['보이는 강의 문맥을 바탕으로 질문하기', '플래시카드와 북마크를 로컬에 저장하기', '최근 강의와 진도로 다시 시작합니다', '공부를 마친 뒤 노트 내보내기'], noteTitle: '문맥 안에서 질문하세요.', noteBody: 'Tutor는 강의 옆에서 열리므로 이해하려는 문단을 계속 보면서 질문할 수 있습니다.' },
    steps: { eyebrow: '가벼운 학습 루프', title: '강의를 열고, 내 것으로 만드세요.', lead: '읽기 시작 전 별도의 랜딩 계정 절차는 필요하지 않습니다.', items: [
      { id: '01', title: 'SkillBridge 설치', body: 'Chrome 또는 지원되는 Chromium 브라우저에 확장 프로그램을 추가합니다.', note: '한 번의 설치' },
      { id: '02', title: '언어 선택', body: '지원되는 강의를 열고 지구본 메뉴에서 강의 언어를 고릅니다.', note: '필요한 순간에 언어 선택' },
      { id: '03', title: '나만의 학습 흐름 만들기', body: '읽고, 복습하고, 저장하고, 멈춘 지점에서 다시 시작합니다.', note: '한 화면 안에서 완결' },
    ] },
    cta: { title: '강의가 당신에게 한 걸음 다가오게 하세요.', lead: '개념에 집중할 수 있는 언어로 지원되는 AI Academy 강의를 읽으세요.', primary: 'SkillBridge 받기', source: 'GitHub에서 소스 보기' },
    footer: { disclaimer: '독립 커뮤니티 프로젝트입니다. Anthropic 또는 Skilljar와 제휴·후원·승인 관계가 아닙니다.', privacy: '개인정보 처리방침', source: 'GitHub', license: 'MIT 라이선스' },
  },
};

export function localePath(locale: Locale, base: string) {
  return locale === 'en' ? base : `${base}${locale}/`;
}
