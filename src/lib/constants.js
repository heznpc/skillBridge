/**
 * SkillBridge — Shared Constants
 * Loaded first by all content scripts via manifest.json.
 */

/* eslint-disable no-unused-vars */

// ==================== AI MODELS ====================

const SKILLBRIDGE_MODELS = {
  GEMINI: 'gemini-2.0-flash',
  CLAUDE: 'claude-sonnet-4-6',
};

// ==================== DEFAULTS ====================

const DEFAULT_PROTECTED_TERMS =
  'API, SDK, Claude, Anthropic, Claude Code, Cowork, Dispatch, Computer Use, Subagent, Enterprise, Personal, Plugin, skill, SKILL.md, frontmatter';

// YouTube InnerTube client version — update periodically as needed
// Source of truth: src/shared/constants.json (keep in sync; validated by scripts/check-bg-sync.js)
const YOUTUBE_CLIENT_VERSION = '2.20260415.01.00';

// ==================== CERTIFICATION EXAM (full disable) ====================
// Proctored certification exams — extension must NOT run at all.
// The extension could be flagged as a cheating tool during proctored exams.

const CERT_DISABLE_PATTERNS = [
  /\/claude-certified/i,
  /\/certified-architect/i,
  /\/certification-exam/i,
  /\/certified.*access-request/i,
  /[?&]type=certification/i,
  /\/proctored\b/i,
];

// ==================== COURSE QUIZ / ASSESSMENT (exam mode) ====================
// Lightweight course-completion quizzes — translate question text, skip answers.
//
// Each pattern requires a strict path-segment boundary (`/`, `?`, `#`, or end
// of string) after the keyword. The earlier `\b` form matched benign URLs like
// `/quiz-answers-blog` because `-` is a word boundary too; segment boundaries
// avoid those false positives without losing any real quiz/exam URL.

const EXAM_URL_PATTERNS = [
  /\/quiz(?:\/|\?|#|$)/i,
  /\/exam(?:\/|\?|#|$)/i,
  /\/assessment(?:\/|\?|#|$)/i,
  /[?&]type=quiz/i,
  /[?&]type=exam/i,
];

// Elements whose text should NOT be translated on exam pages
// (answer choices, form inputs — translating these could alter meaning)
const EXAM_SKIP_SELECTORS = [
  'input[type="radio"] + label',
  'input[type="checkbox"] + label',
  `${SKILLJAR_SELECTORS.answerOption}`,
  `${SKILLJAR_SELECTORS.answerLabel}`,
  `${SKILLJAR_SELECTORS.quizForm} label`,
  `${SKILLJAR_SELECTORS.quizForm} .option`,
  `${SKILLJAR_SELECTORS.quizForm} li`,
];

const EXAM_BANNER_LABELS = {
  en: 'Exam mode — answer choices are not translated to preserve accuracy.',
  ko: '시험 모드 — 정확성을 위해 답안 선택지는 번역되지 않습니다.',
  ja: '試験モード — 正確性のため、回答選択肢は翻訳されません。',
  'zh-CN': '考试模式 — 为确保准确性，答案选项不会被翻译。',
  'zh-TW': '考試模式 — 為確保準確性，答案選項不會被翻譯。',
  es: 'Modo examen — las opciones de respuesta no se traducen para mayor precisión.',
  fr: 'Mode examen — les choix de réponse ne sont pas traduits pour préserver la précision.',
  de: 'Prüfungsmodus — Antwortmöglichkeiten werden nicht übersetzt, um die Genauigkeit zu wahren.',
  'pt-BR': 'Modo prova — as opções de resposta não são traduzidas para preservar a precisão.',
  ru: 'Режим экзамена — варианты ответов не переводятся для сохранения точности.',
  vi: 'Chế độ thi — các lựa chọn đáp án không được dịch để đảm bảo độ chính xác.',
};

const TUTOR_EXAM_LABELS = {
  en: "I can't help with exam answers directly, but I can explain concepts after you submit.",
  ko: '시험 답안은 직접 도와드릴 수 없지만, 제출 후 개념 설명은 가능합니다.',
  ja: '試験の回答は直接お手伝いできませんが、提出後にコンセプトを説明できます。',
  'zh-CN': '我不能直接帮助回答考试题目，但提交后可以解释相关概念。',
  'zh-TW': '我無法直接協助回答考試題目，但提交後可以解釋相關概念。',
  es: 'No puedo ayudar directamente con las respuestas del examen, pero puedo explicar conceptos después de enviar.',
  fr: "Je ne peux pas aider directement avec les réponses d'examen, mais je peux expliquer les concepts après soumission.",
  de: 'Ich kann nicht direkt bei Prüfungsantworten helfen, aber nach der Abgabe kann ich Konzepte erklären.',
  'pt-BR': 'Não posso ajudar diretamente com as respostas da prova, mas posso explicar conceitos após o envio.',
  ru: 'Я не могу помочь с ответами на экзамене напрямую, но могу объяснить концепции после отправки.',
  vi: 'Tôi không thể giúp trực tiếp với câu trả lời bài thi, nhưng có thể giải thích khái niệm sau khi bạn nộp bài.',
};

// ==================== THRESHOLDS ====================

const SKILLBRIDGE_THRESHOLDS = {
  GEMINI_MIN_TEXT: 80,
  GEMINI_ALPHA_RATIO: 0.5,
  MIN_COMPLEX_TEXT: 120,
  GT_BATCH_SIZE: 10,
  GEMINI_BATCH_SIZE: 3,
  VERIFY_QUEUE_MAX: 500,
  PENDING_NODES_MAX: 500,
  VIEWPORT_CHUNK_SIZE: 50, // Elements per idle-callback chunk
  CACHE_TTL_MS: 30 * 24 * 60 * 60 * 1000, // 30 days
  CHAT_STREAM_TIMEOUT: 60000, // 60s timeout for AI tutor streaming
  GT_MAX_RETRIES: 3, // Max retries for Google Translate requests
  GT_BASE_DELAY: 500, // Base delay (ms) for exponential backoff
  GT_RATE_LIMIT_PER_MIN: 120, // Max Google Translate requests per minute
  GT_QUEUE_MAX: 200, // Max items in the Google Translate queue
  BRIDGE_READY_TIMEOUT: 20000, // 20s timeout waiting for Puter.js bridge
  REQUEST_TIMEOUT: 30000, // 30s timeout for individual AI requests
  PENDING_CALLBACKS_MAX: 100, // Max concurrent pending bridge callbacks
  CALLBACK_STALE_MS: 120000, // Auto-cleanup callbacks older than 2 min
  STORAGE_QUOTA_WARN: 0.9, // Warn when storage usage exceeds 90%
  STORAGE_EVICT_TARGET: 0.7, // Evict old entries until usage drops below 70%
};

// ==================== DELAYS (ms) ====================

const SKILLBRIDGE_DELAYS = {
  GT_BATCH: 100,
  GEMINI_BATCH: 300,
  DOM_DEBOUNCE: 300,
  VERIFY_QUEUE: 1000,
  VERIFY_QUEUE_RETRY: 2000,
  BRIDGE_READY_VERIFY: 500,
  LATE_CONTENT: 1500,
  SIDEBAR_BIND: 100,
  TEXT_SELECTION: 10,
  BANNER_ANIMATION: 400,
  PROGRESS_HIDE: 300,
  PROGRESS_REMOVE: 400,
  WELCOME_BANNER: 1500,
  TEXT_UPDATE_FADE: 500,
  IDLE_TIMEOUT: 1000, // requestIdleCallback timeout (ms) for offscreen work
  OVERLAY_REMOVE: 200, // delay before removing overlay element after fade-out
};

// ==================== LIMITS ====================

const SKILLBRIDGE_LIMITS = {
  HISTORY: 50,
  HISTORY_PREVIEW: 50,
  QUOTE_MAX: 200,
};

// ==================== LANGUAGES ====================

const PREMIUM_LANGUAGES = [
  { code: 'ko', label: '한국어' },
  { code: 'ja', label: '日本語' },
  { code: 'zh-CN', label: '中文(简体)' },
  { code: 'zh-TW', label: '中文(繁體)' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt-BR', label: 'Português (BR)' },
  { code: 'ru', label: 'Русский' },
  { code: 'vi', label: 'Tiếng Việt' },
];

const AVAILABLE_LANGUAGES = [
  { code: 'en', label: 'English' },
  ...PREMIUM_LANGUAGES,
  { code: 'pt', label: 'Português (PT)' },
  { code: 'it', label: 'Italiano' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'pl', label: 'Polski' },
  { code: 'uk', label: 'Українська' },
  { code: 'cs', label: 'Čeština' },
  { code: 'sv', label: 'Svenska' },
  { code: 'da', label: 'Dansk' },
  { code: 'fi', label: 'Suomi' },
  { code: 'no', label: 'Norsk' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'th', label: 'ภาษาไทย' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'ms', label: 'Bahasa Melayu' },
  { code: 'tl', label: 'Filipino' },
  { code: 'bn', label: 'বাংলা' },
  { code: 'he', label: 'עברית' },
  { code: 'ro', label: 'Română' },
  { code: 'hu', label: 'Magyar' },
  { code: 'el', label: 'Ελληνικά' },
];

const PREMIUM_LANGUAGE_CODES = PREMIUM_LANGUAGES.map((l) => l.code);
const AVAILABLE_LANGUAGE_CODES = AVAILABLE_LANGUAGES.map((l) => l.code);

/**
 * Build a { code: label } map from AVAILABLE_LANGUAGES.
 * Used by translator.js supportedLanguages and youtube-subtitles.js.
 */
const SUPPORTED_LANGUAGE_MAP = Object.fromEntries(
  AVAILABLE_LANGUAGES.filter((l) => l.code !== 'en').map((l) => [l.code, l.label]),
);

// Google Translate language code overrides
// Source of truth: src/shared/constants.json (keep in sync; validated by scripts/check-bg-sync.js)
const GT_LANG_MAP = {
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW',
  'pt-BR': 'pt',
};

// YouTube subtitle language code overrides
const YT_LANG_CODE_MAP = {
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
  'pt-BR': 'pt',
};

// YouTube subtitle language names (English) — hoisted to avoid per-iteration allocation
const _YT_LANG_NAMES = {
  ko: 'Korean',
  ja: 'Japanese',
  'zh-CN': 'Chinese (Simplified)',
  'zh-TW': 'Chinese (Traditional)',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  'pt-BR': 'Portuguese',
  pt: 'Portuguese',
  vi: 'Vietnamese',
  th: 'Thai',
  id: 'Indonesian',
  ar: 'Arabic',
  hi: 'Hindi',
  ru: 'Russian',
  tr: 'Turkish',
  it: 'Italian',
  nl: 'Dutch',
  pl: 'Polish',
  uk: 'Ukrainian',
  cs: 'Czech',
  sv: 'Swedish',
  da: 'Danish',
  fi: 'Finnish',
  no: 'Norwegian',
  ms: 'Malay',
  tl: 'Filipino',
  bn: 'Bengali',
  he: 'Hebrew',
  ro: 'Romanian',
  hu: 'Hungarian',
  el: 'Greek',
};
const YT_LANG_NAME_MAP = Object.fromEntries(
  AVAILABLE_LANGUAGES.filter((l) => l.code !== 'en').map((l) => [l.code, _YT_LANG_NAMES[l.code] || l.code]),
);

// ==================== UI LABELS (i18n) ====================

const TUTOR_GREETINGS = {
  en: "Hi! I'm your AI learning assistant. Ask me anything about this course.",
  ko: '안녕하세요! AI 학습 도우미입니다. 이 과정에 대해 무엇이든 물어보세요.',
  ja: 'こんにちは！AI学習アシスタントです。このコースについて何でも聞いてください。',
  'zh-CN': '你好！我是你的AI学习助手。关于这门课程，有什么都可以问我。',
  'zh-TW': '你好！我是你的AI學習助手。關於這門課程，有什麼都可以問我。',
  es: '¡Hola! Soy tu asistente de aprendizaje con IA. Pregúntame lo que quieras sobre este curso.',
  fr: "Bonjour ! Je suis votre assistant d'apprentissage IA. Posez-moi n'importe quelle question sur ce cours.",
  de: 'Hallo! Ich bin dein KI-Lernassistent. Frag mich alles über diesen Kurs.',
  'pt-BR': 'Olá! Sou seu assistente de aprendizagem com IA. Pergunte o que quiser sobre este curso.',
  ru: 'Привет! Я ваш ИИ-помощник по обучению. Задавайте любые вопросы об этом курсе.',
  vi: 'Xin chào! Tôi là trợ lý học tập AI của bạn. Hãy hỏi bất cứ điều gì về khóa học này.',
};

const SEND_LABELS = {
  en: 'Send',
  ko: '전송',
  ja: '送信',
  'zh-CN': '发送',
  'zh-TW': '傳送',
  es: 'Enviar',
  fr: 'Envoyer',
  de: 'Senden',
  'pt-BR': 'Enviar',
  ru: 'Отправить',
  vi: 'Gửi',
};

const ASK_TUTOR_LABELS = {
  en: 'Ask Tutor',
  ko: '튜터에게 질문',
  ja: 'チューターに質問',
  'zh-CN': '问导师',
  'zh-TW': '問導師',
  es: 'Preguntar',
  fr: 'Demander',
  de: 'Fragen',
  'pt-BR': 'Perguntar',
  ru: 'Спросить',
  vi: 'Hỏi gia sư',
};

const CHAT_PLACEHOLDERS = {
  en: 'Ask about the course content...',
  ko: '강의 내용에 대해 질문하세요...',
  ja: 'コースの内容について質問してください...',
  'zh-CN': '关于课程内容，请提问...',
  'zh-TW': '關於課程內容，請提問...',
  es: 'Pregunta sobre el contenido del curso...',
  fr: 'Posez une question sur le cours...',
  de: 'Frage zum Kursinhalt stellen...',
  'pt-BR': 'Pergunte sobre o conteúdo do curso...',
  ru: 'Задайте вопрос о содержании курса...',
  vi: 'Hỏi về nội dung khóa học...',
};

const QUOTE_PLACEHOLDERS = {
  en: 'Ask about this text...',
  ko: '선택한 텍스트에 대해 질문하세요...',
  ja: '選択したテキストについて質問...',
  'zh-CN': '关于这段文字提问...',
  'zh-TW': '關於這段文字提問...',
  es: 'Pregunta sobre este texto...',
  fr: 'Posez une question sur ce texte...',
  de: 'Frage zu diesem Text stellen...',
  'pt-BR': 'Pergunte sobre este texto...',
  ru: 'Задайте вопрос об этом тексте...',
  vi: 'Hỏi về đoạn văn bản này...',
};

const BANNER_UI = {
  en: { prompt: 'Translate this page to', confirm: 'Translate', dismiss: 'Close' },
  ko: { prompt: '이 페이지를 다음 언어로 번역할까요?', confirm: '번역', dismiss: '닫기' },
  ja: { prompt: 'このページを翻訳しますか？', confirm: '翻訳', dismiss: '閉じる' },
  'zh-CN': { prompt: '将此页面翻译为', confirm: '翻译', dismiss: '关闭' },
  'zh-TW': { prompt: '將此頁面翻譯為', confirm: '翻譯', dismiss: '關閉' },
  es: { prompt: '¿Traducir esta página a', confirm: 'Traducir', dismiss: 'Cerrar' },
  fr: { prompt: 'Traduire cette page en', confirm: 'Traduire', dismiss: 'Fermer' },
  de: { prompt: 'Diese Seite übersetzen auf', confirm: 'Übersetzen', dismiss: 'Schließen' },
  'pt-BR': { prompt: 'Traduzir esta página para', confirm: 'Traduzir', dismiss: 'Fechar' },
  ru: { prompt: 'Перевести эту страницу на', confirm: 'Перевести', dismiss: 'Закрыть' },
  vi: { prompt: 'Dịch trang này sang', confirm: 'Dịch', dismiss: 'Đóng' },
};

// Onboarding banner for ALL first-time visitors (including English speakers)
const ONBOARDING_LABELS = {
  en: {
    title: 'SkillBridge is ready',
    body: 'Translate this page into 30+ languages and get AI-powered help as you learn.',
    cta: 'Choose Language',
    dismiss: 'Got it',
  },
  ko: {
    title: 'SkillBridge 준비 완료',
    body: '이 페이지를 30개 이상의 언어로 번역하고, AI 튜터의 도움을 받으세요.',
    cta: '언어 선택',
    dismiss: '확인',
  },
  ja: {
    title: 'SkillBridge準備完了',
    body: 'このページを30以上の言語に翻訳し、AIチューターのサポートを受けましょう。',
    cta: '言語を選択',
    dismiss: 'OK',
  },
  'zh-CN': {
    title: 'SkillBridge 已就绪',
    body: '将此页面翻译成30多种语言，并获得AI辅导帮助。',
    cta: '选择语言',
    dismiss: '知道了',
  },
  es: {
    title: 'SkillBridge está listo',
    body: 'Traduce esta página a más de 30 idiomas y obtén ayuda con IA mientras aprendes.',
    cta: 'Elegir idioma',
    dismiss: 'Entendido',
  },
  fr: {
    title: 'SkillBridge est prêt',
    body: "Traduisez cette page dans plus de 30 langues et obtenez de l'aide IA pendant votre apprentissage.",
    cta: 'Choisir la langue',
    dismiss: 'Compris',
  },
  de: {
    title: 'SkillBridge ist bereit',
    body: 'Übersetzen Sie diese Seite in über 30 Sprachen und erhalten Sie KI-gestützte Hilfe beim Lernen.',
    cta: 'Sprache wählen',
    dismiss: 'Verstanden',
  },
  'zh-TW': {
    title: 'SkillBridge 已就緒',
    body: '將此頁面翻譯成30多種語言，並獲得AI輔導幫助。',
    cta: '選擇語言',
    dismiss: '知道了',
  },
  'pt-BR': {
    title: 'SkillBridge está pronto',
    body: 'Traduza esta página para mais de 30 idiomas e obtenha ajuda com IA enquanto aprende.',
    cta: 'Escolher idioma',
    dismiss: 'Entendi',
  },
  ru: {
    title: 'SkillBridge готов',
    body: 'Переведите эту страницу на 30+ языков и получите помощь ИИ во время обучения.',
    cta: 'Выбрать язык',
    dismiss: 'Понятно',
  },
  vi: {
    title: 'SkillBridge đã sẵn sàng',
    body: 'Dịch trang này sang hơn 30 ngôn ngữ và nhận trợ giúp từ AI khi học.',
    cta: 'Chọn ngôn ngữ',
    dismiss: 'Đã hiểu',
  },
};

const EXAMPLE_QUESTIONS = {
  en: ['Explain this concept simply', 'What are the key takeaways?', 'Give me a practical example'],
  ko: ['이 개념을 쉽게 설명해줘', '핵심 포인트가 뭐야?', '실제 예시를 들어줘'],
  ja: ['この概念を簡単に説明して', '重要なポイントは？', '実例を教えて'],
  'zh-CN': ['简单解释一下这个概念', '关键要点是什么？', '给我一个实际例子'],
  'zh-TW': ['簡單解釋一下這個概念', '關鍵要點是什麼？', '給我一個實際例子'],
  es: ['Explica este concepto de forma simple', '¿Cuáles son los puntos clave?', 'Dame un ejemplo práctico'],
  fr: ['Explique ce concept simplement', 'Quels sont les points clés ?', 'Donne-moi un exemple pratique'],
  de: ['Erkläre dieses Konzept einfach', 'Was sind die wichtigsten Punkte?', 'Gib mir ein praktisches Beispiel'],
  'pt-BR': ['Explique este conceito de forma simples', 'Quais são os pontos-chave?', 'Me dê um exemplo prático'],
  ru: ['Объясни эту концепцию простыми словами', 'Какие ключевые выводы?', 'Приведи практический пример'],
  vi: ['Giải thích khái niệm này một cách đơn giản', 'Những điểm chính là gì?', 'Cho tôi một ví dụ thực tế'],
};

const A11Y_LABELS = {
  toggleDark: {
    en: 'Toggle dark mode',
    ko: '다크 모드 전환',
    ja: 'ダークモード切替',
    'zh-CN': '切换暗色模式',
    'zh-TW': '切換暗色模式',
    es: 'Modo oscuro',
    fr: 'Mode sombre',
    de: 'Dunkelmodus',
    'pt-BR': 'Modo escuro',
    ru: 'Тёмный режим',
    vi: 'Chế độ tối',
  },
  chatHistory: {
    en: 'Chat history',
    ko: '대화 기록',
    ja: '会話履歴',
    'zh-CN': '聊天记录',
    'zh-TW': '聊天記錄',
    es: 'Historial',
    fr: 'Historique',
    de: 'Verlauf',
    'pt-BR': 'Histórico',
    ru: 'История чата',
    vi: 'Lịch sử trò chuyện',
  },
  closeSidebar: {
    en: 'Close sidebar',
    ko: '사이드바 닫기',
    ja: 'サイドバーを閉じる',
    'zh-CN': '关闭侧栏',
    'zh-TW': '關閉側欄',
    es: 'Cerrar panel',
    fr: 'Fermer le panneau',
    de: 'Panel schließen',
    'pt-BR': 'Fechar painel',
    ru: 'Закрыть панель',
    vi: 'Đóng thanh bên',
  },
  openTutor: {
    en: 'Open AI Tutor',
    ko: 'AI 튜터 열기',
    ja: 'AIチューターを開く',
    'zh-CN': '打开AI导师',
    'zh-TW': '開啟AI導師',
    es: 'Abrir tutor IA',
    fr: 'Ouvrir le tuteur IA',
    de: 'KI-Tutor öffnen',
    'pt-BR': 'Abrir tutor IA',
    ru: 'Открыть ИИ-репетитора',
    vi: 'Mở gia sư AI',
  },
  retry: {
    en: 'Retry',
    ko: '재시도',
    ja: '再試行',
    'zh-CN': '重试',
    'zh-TW': '重試',
    es: 'Reintentar',
    fr: 'Réessayer',
    de: 'Erneut versuchen',
    'pt-BR': 'Tentar novamente',
    ru: 'Повторить',
    vi: 'Thử lại',
  },
  loading: {
    en: 'Loading',
    ko: '로딩 중',
    ja: '読み込み中',
    'zh-CN': '加载中',
    'zh-TW': '載入中',
    es: 'Cargando',
    fr: 'Chargement',
    de: 'Laden',
    'pt-BR': 'Carregando',
    ru: 'Загрузка',
    vi: 'Đang tải',
  },
  backToChat: {
    en: 'Back to chat',
    ko: '채팅으로 돌아가기',
    ja: 'チャットに戻る',
    'zh-CN': '返回聊天',
    'zh-TW': '返回聊天',
    es: 'Volver al chat',
    fr: 'Retour au chat',
    de: 'Zurück zum Chat',
    'pt-BR': 'Voltar ao chat',
    ru: 'Вернуться в чат',
    vi: 'Quay lại trò chuyện',
  },
  removeQuote: {
    en: 'Remove quote',
    ko: '인용 제거',
    ja: '引用を削除',
    'zh-CN': '移除引用',
    'zh-TW': '移除引用',
    es: 'Eliminar cita',
    fr: 'Supprimer la citation',
    de: 'Zitat entfernen',
    'pt-BR': 'Remover citação',
    ru: 'Удалить цитату',
    vi: 'Xóa trích dẫn',
  },
};

const PROGRESS_LABELS = {
  en: 'Translating…',
  ko: '번역 중…',
  ja: '翻訳中…',
  'zh-CN': '翻译中…',
  'zh-TW': '翻譯中…',
  es: 'Traduciendo…',
  fr: 'Traduction…',
  de: 'Übersetzen…',
  'pt-BR': 'Traduzindo…',
  ru: 'Перевод…',
  vi: 'Đang dịch…',
};

const CHAT_ERROR_LABELS = {
  en: 'Sorry, an error occurred.',
  ko: '죄송합니다. 응답 중 오류가 발생했습니다.',
  ja: '申し訳ありません。エラーが発生しました。',
  'zh-CN': '抱歉，发生了错误。',
  'zh-TW': '抱歉，發生了錯誤。',
  es: 'Lo sentimos, se produjo un error.',
  fr: "Désolé, une erreur s'est produite.",
  de: 'Entschuldigung, ein Fehler ist aufgetreten.',
  'pt-BR': 'Desculpe, ocorreu um erro.',
  ru: 'Извините, произошла ошибка.',
  vi: 'Xin lỗi, đã xảy ra lỗi.',
};

const OFFLINE_LABELS = {
  en: 'Offline — using cached translations only',
  ko: '오프라인 — 캐시된 번역만 사용 중',
  ja: 'オフライン — キャッシュされた翻訳のみ使用中',
  'zh-CN': '离线 — 仅使用缓存翻译',
  'zh-TW': '離線 — 僅使用快取翻譯',
  es: 'Sin conexión — solo traducciones en caché',
  fr: 'Hors ligne — traductions en cache uniquement',
  de: 'Offline — nur zwischengespeicherte Übersetzungen',
  'pt-BR': 'Offline — usando apenas traduções em cache',
  ru: 'Офлайн — используются только кэшированные переводы',
  vi: 'Ngoại tuyến — chỉ sử dụng bản dịch đã lưu',
};

const STORAGE_WARNING_LABELS = {
  en: 'Storage almost full — old translations will be cleared automatically',
  ko: '저장 공간 부족 — 오래된 번역이 자동으로 삭제됩니다',
  ja: 'ストレージがほぼ満杯です — 古い翻訳が自動的に削除されます',
  'zh-CN': '存储空间即将满 — 旧翻译将自动清除',
  'zh-TW': '儲存空間即將滿 — 舊翻譯將自動清除',
  es: 'Almacenamiento casi lleno — las traducciones antiguas se eliminarán automáticamente',
  fr: 'Stockage presque plein — les anciennes traductions seront supprimées automatiquement',
  de: 'Speicher fast voll — alte Übersetzungen werden automatisch gelöscht',
  'pt-BR': 'Armazenamento quase cheio — traduções antigas serão removidas automaticamente',
  ru: 'Хранилище почти заполнено — старые переводы будут удалены автоматически',
  vi: 'Bộ nhớ gần đầy — bản dịch cũ sẽ được xóa tự động',
};

const TUTOR_OFFLINE_LABELS = {
  en: 'AI Tutor is unavailable offline. Please check your connection.',
  ko: 'AI 튜터는 오프라인에서 사용할 수 없습니다. 인터넷 연결을 확인해주세요.',
  ja: 'AIチューターはオフラインでは利用できません。接続を確認してください。',
  'zh-CN': 'AI导师在离线状态下不可用。请检查您的网络连接。',
  'zh-TW': 'AI導師在離線狀態下不可用。請檢查您的網路連線。',
  es: 'El tutor IA no está disponible sin conexión. Verifique su conexión.',
  fr: "Le tuteur IA n'est pas disponible hors ligne. Vérifiez votre connexion.",
  de: 'KI-Tutor ist offline nicht verfügbar. Bitte überprüfen Sie Ihre Verbindung.',
  'pt-BR': 'O tutor IA não está disponível offline. Verifique sua conexão.',
  ru: 'ИИ-репетитор недоступен офлайн. Проверьте подключение к интернету.',
  vi: 'Gia sư AI không khả dụng khi ngoại tuyến. Vui lòng kiểm tra kết nối.',
};

const HISTORY_LABELS = {
  title: {
    en: 'Chat History',
    ko: '대화 기록',
    ja: '会話履歴',
    'zh-CN': '聊天记录',
    'zh-TW': '聊天記錄',
    es: 'Historial',
    fr: 'Historique',
    de: 'Verlauf',
    'pt-BR': 'Histórico',
    ru: 'История чата',
    vi: 'Lịch sử trò chuyện',
  },
  loading: {
    en: 'Loading...',
    ko: '불러오는 중...',
    ja: '読み込み中...',
    'zh-CN': '加载中...',
    'zh-TW': '載入中...',
    es: 'Cargando...',
    fr: 'Chargement...',
    de: 'Laden...',
    'pt-BR': 'Carregando...',
    ru: 'Загрузка...',
    vi: 'Đang tải...',
  },
  empty: {
    en: 'No conversations yet',
    ko: '대화 기록이 없습니다',
    ja: 'まだ会話がありません',
    'zh-CN': '暂无对话',
    'zh-TW': '暫無對話',
    es: 'Sin conversaciones',
    fr: 'Aucune conversation',
    de: 'Noch keine Gespräche',
    'pt-BR': 'Nenhuma conversa ainda',
    ru: 'Пока нет бесед',
    vi: 'Chưa có cuộc trò chuyện nào',
  },
  clearHistory: {
    en: 'Clear History',
    ko: '기록 삭제',
    ja: '履歴を削除',
    'zh-CN': '清除记录',
    'zh-TW': '清除記錄',
    es: 'Borrar historial',
    fr: "Effacer l'historique",
    de: 'Verlauf löschen',
    'pt-BR': 'Limpar histórico',
    ru: 'Очистить историю',
    vi: 'Xóa lịch sử',
  },
  historyCleared: {
    en: 'History cleared',
    ko: '기록이 삭제되었습니다',
    ja: '履歴を削除しました',
    'zh-CN': '记录已清除',
    'zh-TW': '記錄已清除',
    es: 'Historial borrado',
    fr: 'Historique effacé',
    de: 'Verlauf gelöscht',
    'pt-BR': 'Histórico limpo',
    ru: 'История очищена',
    vi: 'Đã xóa lịch sử',
  },
};

const HISTORY_DB_NAME = 'skillbridge-tutor';
const HISTORY_STORE = 'conversations';

// ==================== POPUP LABELS (i18n) ====================

const POPUP_LABELS = {
  targetLang: {
    en: 'Target Language',
    ko: '번역 언어',
    ja: '翻訳言語',
    'zh-CN': '目标语言',
    'zh-TW': '目標語言',
    es: 'Idioma destino',
    fr: 'Langue cible',
    de: 'Zielsprache',
    'pt-BR': 'Idioma de destino',
    ru: 'Целевой язык',
    vi: 'Ngôn ngữ đích',
  },
  premiumTier: {
    en: '\u2605 Premium (Static Dict + AI Verify)',
    ko: '\u2605 프리미엄 (정적 사전 + AI 검증)',
    ja: '\u2605 プレミアム（静的辞書＋AI検証）',
    'zh-CN': '\u2605 高级（静态词典＋AI验证）',
    'zh-TW': '\u2605 進階（靜態詞典＋AI驗證）',
    es: '\u2605 Premium (Diccionario + IA)',
    fr: '\u2605 Premium (Dictionnaire + IA)',
    de: '\u2605 Premium (Wörterbuch + KI)',
    'pt-BR': '\u2605 Premium (Dicionário + IA)',
    ru: '\u2605 Премиум (Словарь + ИИ-проверка)',
    vi: '\u2605 Cao cấp (Từ điển + AI xác minh)',
  },
  standardTier: {
    en: 'Google Translate + AI Verify',
    ko: 'Google 번역 + AI 검증',
    ja: 'Google翻訳＋AI検証',
    'zh-CN': 'Google翻译＋AI验证',
    'zh-TW': 'Google翻譯＋AI驗證',
    es: 'Google Translate + verificaci\u00f3n IA',
    fr: 'Google Traduction + v\u00e9rification IA',
    de: 'Google \u00dcbersetzer + KI-Pr\u00fcfung',
    'pt-BR': 'Google Tradutor + verificação IA',
    ru: 'Google Переводчик + ИИ-проверка',
    vi: 'Google Dịch + AI xác minh',
  },
  openSidebar: {
    en: 'Open AI Tutor Sidebar',
    ko: 'AI 튜터 사이드바 열기',
    ja: 'AI\u30c1\u30e5\u30fc\u30bf\u30fc\u3092\u958b\u304f',
    'zh-CN': '\u6253\u5f00AI\u5bfc\u5e08\u4fa7\u680f',
    'zh-TW': '開啟AI導師側欄',
    es: 'Abrir tutor IA',
    fr: 'Ouvrir le tuteur IA',
    de: 'KI-Tutor \u00f6ffnen',
    'pt-BR': 'Abrir painel do tutor IA',
    ru: 'Открыть панель ИИ-репетитора',
    vi: 'Mở thanh bên gia sư AI',
  },
  autoTranslate: {
    en: 'Auto-translate on page load',
    ko: '\ud398\uc774\uc9c0 \ub85c\ub4dc \uc2dc \uc790\ub3d9 \ubc88\uc5ed',
    ja: '\u30da\u30fc\u30b8\u8aad\u307f\u8fbc\u307f\u6642\u306b\u81ea\u52d5\u7ffb\u8a33',
    'zh-CN': '\u9875\u9762\u52a0\u8f7d\u65f6\u81ea\u52a8\u7ffb\u8bd1',
    'zh-TW': '頁面載入時自動翻譯',
    es: 'Traducci\u00f3n autom\u00e1tica al cargar',
    fr: 'Traduction auto au chargement',
    de: 'Automatisch beim Laden \u00fcbersetzen',
    'pt-BR': 'Traduzir automaticamente ao carregar',
    ru: 'Автоперевод при загрузке страницы',
    vi: 'Tự động dịch khi tải trang',
  },
  englishOriginal: {
    en: 'English (Original)',
    ko: 'English (Original)',
    ja: 'English (Original)',
    'zh-CN': 'English (Original)',
    'zh-TW': 'English (Original)',
    es: 'English (Original)',
    fr: 'English (Original)',
    de: 'English (Original)',
    'pt-BR': 'English (Original)',
    ru: 'English (Original)',
    vi: 'English (Original)',
  },
  refreshPage: {
    en: 'Please refresh the Skilljar page',
    ko: 'Skilljar \ud398\uc774\uc9c0\ub97c \uc0c8\ub85c\uace0\uce68\ud574\uc8fc\uc138\uc694',
    ja: 'Skilljar\u30da\u30fc\u30b8\u3092\u66f4\u65b0\u3057\u3066\u304f\u3060\u3055\u3044',
    'zh-CN': '\u8bf7\u5237\u65b0Skilljar\u9875\u9762',
    'zh-TW': '請重新整理Skilljar頁面',
    es: 'Actualice la p\u00e1gina de Skilljar',
    fr: 'Veuillez actualiser la page Skilljar',
    de: 'Bitte Skilljar-Seite aktualisieren',
    'pt-BR': 'Atualize a página do Skilljar',
    ru: 'Обновите страницу Skilljar',
    vi: 'Vui lòng tải lại trang Skilljar',
  },
};

const SKILLBRIDGE_MODEL_LABELS = {
  GEMINI: 'Gemini 2.0 Flash',
  CLAUDE: 'Claude Sonnet 4.6',
};

// ==================== KEYBOARD SHORTCUTS (i18n) ====================

const SHORTCUT_LABELS = {
  title: {
    en: 'Keyboard Shortcuts',
    ko: '키보드 단축키',
    ja: 'キーボードショートカット',
    'zh-CN': '键盘快捷键',
    'zh-TW': '鍵盤快捷鍵',
    es: 'Atajos de teclado',
    fr: 'Raccourcis clavier',
    de: 'Tastaturkürzel',
    'pt-BR': 'Atalhos de teclado',
    ru: 'Сочетания клавиш',
    vi: 'Phím tắt',
  },
};

const SHORTCUT_DESCRIPTIONS = {
  toggleSidebar: {
    en: 'Toggle AI Tutor',
    ko: 'AI 튜터 열기/닫기',
    ja: 'AIチューター切替',
    'zh-CN': '切换AI导师',
    'zh-TW': '切換AI導師',
    es: 'Abrir/cerrar tutor IA',
    fr: 'Ouvrir/fermer tuteur IA',
    de: 'KI-Tutor umschalten',
    'pt-BR': 'Abrir/fechar tutor IA',
    ru: 'Вкл/выкл ИИ-репетитора',
    vi: 'Bật/tắt gia sư AI',
  },
  toggleFlashcards: {
    en: 'Vocabulary cards',
    ko: '어휘 카드',
    ja: '語彙カード',
    'zh-CN': '词汇卡片',
    'zh-TW': '詞彙卡片',
    es: 'Tarjetas de vocabulario',
    fr: 'Cartes de vocabulaire',
    de: 'Vokabelkarten',
    'pt-BR': 'Cartões de vocabulário',
    ru: 'Карточки словаря',
    vi: 'Thẻ từ vựng',
  },
  toggleDarkMode: {
    en: 'Toggle dark mode',
    ko: '다크 모드 전환',
    ja: 'ダークモード切替',
    'zh-CN': '切换暗色模式',
    'zh-TW': '切換暗色模式',
    es: 'Modo oscuro',
    fr: 'Mode sombre',
    de: 'Dunkelmodus',
    'pt-BR': 'Modo escuro',
    ru: 'Тёмный режим',
    vi: 'Chế độ tối',
  },
  showHelp: {
    en: 'Show shortcuts',
    ko: '단축키 도움말',
    ja: 'ショートカット表示',
    'zh-CN': '显示快捷键',
    'zh-TW': '顯示快捷鍵',
    es: 'Ver atajos',
    fr: 'Afficher raccourcis',
    de: 'Tastaturkürzel anzeigen',
    'pt-BR': 'Ver atalhos',
    ru: 'Показать сочетания',
    vi: 'Hiển thị phím tắt',
  },
  close: {
    en: 'Close panel',
    ko: '패널 닫기',
    ja: 'パネルを閉じる',
    'zh-CN': '关闭面板',
    'zh-TW': '關閉面板',
    es: 'Cerrar panel',
    fr: 'Fermer le panneau',
    de: 'Panel schließen',
    'pt-BR': 'Fechar painel',
    ru: 'Закрыть панель',
    vi: 'Đóng bảng',
  },
  focusChat: {
    en: 'Focus chat input',
    ko: '채팅 입력 포커스',
    ja: 'チャット入力にフォーカス',
    'zh-CN': '聚焦聊天输入',
    'zh-TW': '聚焦聊天輸入',
    es: 'Enfocar chat',
    fr: 'Focus sur le chat',
    de: 'Chat-Eingabe fokussieren',
    'pt-BR': 'Focar no chat',
    ru: 'Фокус на чат',
    vi: 'Chuyển đến ô nhập chat',
  },
};

// ==================== FLASHCARD MODE (i18n) ====================

const FLASHCARD_LABELS = {
  title: {
    en: 'Vocabulary Cards',
    ko: '어휘 카드',
    ja: '語彙カード',
    'zh-CN': '词汇卡片',
    'zh-TW': '詞彙卡片',
    es: 'Tarjetas de vocabulario',
    fr: 'Cartes de vocabulaire',
    de: 'Vokabelkarten',
    'pt-BR': 'Cartões de vocabulário',
    ru: 'Карточки словаря',
    vi: 'Thẻ từ vựng',
  },
  flip: {
    en: 'Flip',
    ko: '뒤집기',
    ja: 'めくる',
    'zh-CN': '翻转',
    'zh-TW': '翻轉',
    es: 'Voltear',
    fr: 'Retourner',
    de: 'Umdrehen',
    'pt-BR': 'Virar',
    ru: 'Перевернуть',
    vi: 'Lật',
  },
  next: {
    en: 'Next',
    ko: '다음',
    ja: '次へ',
    'zh-CN': '下一个',
    'zh-TW': '下一個',
    es: 'Siguiente',
    fr: 'Suivant',
    de: 'Weiter',
    'pt-BR': 'Próximo',
    ru: 'Далее',
    vi: 'Tiếp',
  },
  prev: {
    en: 'Previous',
    ko: '이전',
    ja: '前へ',
    'zh-CN': '上一个',
    'zh-TW': '上一個',
    es: 'Anterior',
    fr: 'Précédent',
    de: 'Zurück',
    'pt-BR': 'Anterior',
    ru: 'Назад',
    vi: 'Trước',
  },
  boxNew: {
    en: 'New',
    ko: '새로운',
    ja: '新規',
    'zh-CN': '新',
    'zh-TW': '新',
    es: 'Nuevo',
    fr: 'Nouveau',
    de: 'Neu',
    'pt-BR': 'Novo',
    ru: 'Новые',
    vi: 'Mới',
  },
  boxLearning: {
    en: 'Learning',
    ko: '학습 중',
    ja: '学習中',
    'zh-CN': '学习中',
    'zh-TW': '學習中',
    es: 'Aprendiendo',
    fr: 'En cours',
    de: 'Lernend',
    'pt-BR': 'Aprendendo',
    ru: 'Изучаемые',
    vi: 'Đang học',
  },
  mastered: {
    en: 'Mastered',
    ko: '숙지 완료',
    ja: '習得済み',
    'zh-CN': '已掌握',
    'zh-TW': '已掌握',
    es: 'Dominado',
    fr: 'Maîtrisé',
    de: 'Gelernt',
    'pt-BR': 'Dominado',
    ru: 'Изучено',
    vi: 'Đã thuộc',
  },
  reset: {
    en: 'Reset Progress',
    ko: '진행 초기화',
    ja: '進捗リセット',
    'zh-CN': '重置进度',
    'zh-TW': '重置進度',
    es: 'Reiniciar progreso',
    fr: 'Réinitialiser',
    de: 'Fortschritt zurücksetzen',
    'pt-BR': 'Reiniciar progresso',
    ru: 'Сбросить прогресс',
    vi: 'Đặt lại tiến trình',
  },
  empty: {
    en: 'No vocabulary for this page',
    ko: '이 페이지의 어휘가 없습니다',
    ja: 'このページの語彙はありません',
    'zh-CN': '此页面没有词汇',
    'zh-TW': '此頁面沒有詞彙',
    es: 'Sin vocabulario para esta página',
    fr: 'Aucun vocabulaire pour cette page',
    de: 'Kein Vokabular für diese Seite',
    'pt-BR': 'Sem vocabulário para esta página',
    ru: 'Нет словаря для этой страницы',
    vi: 'Không có từ vựng cho trang này',
  },
  openFlashcards: {
    en: 'Vocabulary flashcards',
    ko: '어휘 플래시카드',
    ja: '語彙フラッシュカード',
    'zh-CN': '词汇闪卡',
    'zh-TW': '詞彙閃卡',
    es: 'Tarjetas de vocabulario',
    fr: 'Cartes mémoire',
    de: 'Vokabel-Lernkarten',
    'pt-BR': 'Flashcards de vocabulário',
    ru: 'Карточки для запоминания',
    vi: 'Thẻ ghi nhớ từ vựng',
  },
};

const PDF_EXPORT_LABELS = {
  title: {
    en: 'Export lesson as PDF',
    ko: '레슨을 PDF로 내보내기',
    ja: 'レッスンをPDFでエクスポート',
    'zh-CN': '将课程导出为PDF',
    'zh-TW': '將課程匯出為PDF',
    es: 'Exportar lección como PDF',
    fr: 'Exporter la leçon en PDF',
    de: 'Lektion als PDF exportieren',
    'pt-BR': 'Exportar aula como PDF',
    ru: 'Экспортировать урок в PDF',
    vi: 'Xuất bài học dưới dạng PDF',
  },
};

const TERM_PREVIEW_LABELS = {
  title: {
    en: 'Key terms',
    ko: '핵심 용어',
    ja: 'キーワード',
    'zh-CN': '关键术语',
    'zh-TW': '關鍵術語',
    es: 'Términos clave',
    fr: 'Termes clés',
    de: 'Schlüsselbegriffe',
    'pt-BR': 'Termos-chave',
    ru: 'Ключевые термины',
    vi: 'Thuật ngữ chính',
  },
  viewAll: {
    en: 'View all',
    ko: '전체 보기',
    ja: 'すべて表示',
    'zh-CN': '查看全部',
    'zh-TW': '查看全部',
    es: 'Ver todo',
    fr: 'Tout voir',
    de: 'Alle anzeigen',
    'pt-BR': 'Ver tudo',
    ru: 'Все термины',
    vi: 'Xem tất cả',
  },
};

/**
 * Map URL slug substrings to dictionary section names for flashcard loading.
 *
 * Each course appears under both its canonical Academy slug (the long one,
 * e.g. `claude-with-the-anthropic-api`) AND a shorter fallback (e.g.
 * `claude-api`). Matching in content.js/sidebar-chat.js is sorted by key
 * length descending so the canonical slug wins; the short fallback only
 * triggers if Skilljar ever rotates the URL.
 *
 * "Extended Thinking" is not a standalone Academy course — it's a topic
 * inside `claude-with-the-anthropic-api`, so its deck is attached to that
 * course's slug rather than exposed under a separate entry.
 */
const FLASHCARD_COURSE_MAP = {
  // Claude / Developer courses
  'claude-101': ['claude101'],
  'claude-code': ['claudeCode'],
  'claude-code-101': ['claudeCode'],
  'claude-code-in-action': ['claudeCode'],
  'claude-cowork': ['claudeCowork'],
  'introduction-to-claude-cowork': ['claudeCowork'],
  'agent-skills': ['agentSkills'],
  'introduction-to-agent-skills': ['agentSkills'],
  subagents: ['subagents'],
  'introduction-to-subagents': ['subagents'],
  'claude-api': ['claudeAPI', 'extendedThinking'],
  'claude-with-the-anthropic-api': ['claudeAPI', 'extendedThinking'],
  'model-context-protocol': ['mcpIntro', 'mcpAdvanced'],
  'introduction-to-model-context-protocol': ['mcpIntro'],
  'mcp-advanced': ['mcpAdvanced'],
  'model-context-protocol-advanced': ['mcpAdvanced'],
  'model-context-protocol-advanced-topics': ['mcpAdvanced'],
  // Cloud deployment
  'amazon-bedrock': ['cloudDeployment'],
  'claude-in-amazon-bedrock': ['cloudDeployment'],
  'google-vertex': ['cloudDeployment'],
  'claude-with-google-vertex': ['cloudDeployment'],
  // AI Fluency courses
  'ai-fluency': ['aiFluency'],
  'ai-fluency-framework': ['aiFluency'],
  'ai-fluency-framework-foundations': ['aiFluency'],
  'ai-fluency-for-educators': ['aiFluencyEdu'],
  'ai-fluency-for-students': ['aiFluencyStudent'],
  'ai-fluency-for-nonprofits': ['aiFluencyNonprofit'],
  'teaching-ai-fluency': ['teachingAI'],
  // Other
  'ai-capabilities': ['aiCapabilities'],
  'ai-capabilities-and-limitations': ['aiCapabilities'],
};

// ==================== CODE COMMENT TRANSLATION ====================

const CODE_COMMENT_PATTERNS = [
  // JavaScript, TypeScript, Java, C, C++, Go, Rust, Swift, Kotlin
  { line: /\/\/\s*(.+)$/gm, block: /\/\*\s*([\s\S]*?)\s*\*\//g },
  // Python, Ruby, Bash, YAML — hash comments
  { line: /#\s*(.+)$/gm, block: null },
  // HTML, XML — angle-bracket comments
  { line: null, block: /<!--\s*([\s\S]*?)\s*-->/g },
];

const COMMENT_TRANSLATE_LABELS = {
  en: 'Translate code comments',
  ko: '코드 주석 번역',
  ja: 'コードコメントを翻訳',
  'zh-CN': '翻译代码注释',
  'zh-TW': '翻譯程式碼註解',
  es: 'Traducir comentarios de código',
  fr: 'Traduire les commentaires',
  de: 'Code-Kommentare übersetzen',
  'pt-BR': 'Traduzir comentários de código',
  ru: 'Перевести комментарии в коде',
  vi: 'Dịch chú thích mã nguồn',
};
