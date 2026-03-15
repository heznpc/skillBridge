/**
 * SkillBridge — Shared Constants
 * Loaded first by all content scripts via manifest.json.
 */

/* eslint-disable no-unused-vars */

// ==================== AI MODELS ====================

const SKILLBRIDGE_MODELS = {
  GEMINI: 'gemini-2.0-flash',
  CLAUDE: 'claude-sonnet-4',
};

// ==================== DEFAULTS ====================

const DEFAULT_PROTECTED_TERMS = 'API, SDK, Claude, Anthropic, Claude Code, Enterprise, Personal, Plugin, skill, SKILL.md, frontmatter';

// YouTube InnerTube client version — update periodically as needed
const YOUTUBE_CLIENT_VERSION = '2.20240101.00.00';

// ==================== THRESHOLDS ====================

const SKILLBRIDGE_THRESHOLDS = {
  GEMINI_MIN_TEXT: 80,
  GEMINI_ALPHA_RATIO: 0.5,
  MIN_COMPLEX_TEXT: 120,
  GT_BATCH_SIZE: 10,
  GEMINI_BATCH_SIZE: 3,
  VERIFY_QUEUE_MAX: 500,
  PENDING_NODES_MAX: 500,
  CACHE_TTL_MS: 30 * 24 * 60 * 60 * 1000, // 30 days
  CHAT_STREAM_TIMEOUT: 60000, // 60s timeout for AI tutor streaming
  GT_MAX_RETRIES: 3, // Max retries for Google Translate requests
  GT_BASE_DELAY: 500, // Base delay (ms) for exponential backoff
  GT_RATE_LIMIT_PER_MIN: 120, // Max Google Translate requests per minute
};

// ==================== DELAYS (ms) ====================

const SKILLBRIDGE_DELAYS = {
  GT_BATCH: 100,
  GEMINI_BATCH: 300,
  DOM_DEBOUNCE: 300,
  VERIFY_QUEUE: 1000,
  LATE_CONTENT: 1500,
  SIDEBAR_BIND: 100,
  TEXT_SELECTION: 10,
  BANNER_ANIMATION: 400,
  PROGRESS_HIDE: 300,
  PROGRESS_REMOVE: 400,
  WELCOME_BANNER: 1500,
  TEXT_UPDATE_FADE: 500,
};

// ==================== LIMITS ====================

const SKILLBRIDGE_LIMITS = {
  HISTORY: 50,
  HISTORY_PREVIEW: 50,
  QUOTE_MAX: 200,
};

// ==================== LANGUAGES ====================

const PREMIUM_LANGUAGES = [
  { code: 'ko', label: '\ud55c\uad6d\uc5b4' },
  { code: 'ja', label: '\u65e5\u672c\u8a9e' },
  { code: 'zh-CN', label: '\u4e2d\u6587(\u7b80\u4f53)' },
  { code: 'es', label: 'Espa\u00f1ol' },
  { code: 'fr', label: 'Fran\u00e7ais' },
  { code: 'de', label: 'Deutsch' },
];

const AVAILABLE_LANGUAGES = [
  { code: 'en', label: 'English' },
  ...PREMIUM_LANGUAGES,
  { code: 'zh-TW', label: '\u4e2d\u6587(\u7e41\u9ad4)' },
  { code: 'pt-BR', label: 'Portugu\u00eas (BR)' },
  { code: 'pt', label: 'Portugu\u00eas (PT)' },
  { code: 'it', label: 'Italiano' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'ru', label: '\u0420\u0443\u0441\u0441\u043a\u0438\u0439' },
  { code: 'pl', label: 'Polski' },
  { code: 'uk', label: '\u0423\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430' },
  { code: 'cs', label: '\u010ce\u0161tina' },
  { code: 'sv', label: 'Svenska' },
  { code: 'da', label: 'Dansk' },
  { code: 'fi', label: 'Suomi' },
  { code: 'no', label: 'Norsk' },
  { code: 'tr', label: 'T\u00fcrk\u00e7e' },
  { code: 'ar', label: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629' },
  { code: 'hi', label: '\u0939\u093f\u0928\u094d\u0926\u0940' },
  { code: 'th', label: '\u0e20\u0e32\u0e29\u0e32\u0e44\u0e17\u0e22' },
  { code: 'vi', label: 'Ti\u1ebfng Vi\u1ec7t' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'ms', label: 'Bahasa Melayu' },
  { code: 'tl', label: 'Filipino' },
  { code: 'bn', label: '\u09ac\u09be\u0982\u09b2\u09be' },
  { code: 'he', label: '\u05e2\u05d1\u05e8\u05d9\u05ea' },
  { code: 'ro', label: 'Rom\u00e2n\u0103' },
  { code: 'hu', label: 'Magyar' },
  { code: 'el', label: '\u0395\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac' },
];

const PREMIUM_LANGUAGE_CODES = PREMIUM_LANGUAGES.map(l => l.code);
const AVAILABLE_LANGUAGE_CODES = AVAILABLE_LANGUAGES.map(l => l.code);

/**
 * Build a { code: label } map from AVAILABLE_LANGUAGES.
 * Used by translator.js supportedLanguages and youtube-subtitles.js.
 */
const SUPPORTED_LANGUAGE_MAP = Object.fromEntries(
  AVAILABLE_LANGUAGES.filter(l => l.code !== 'en').map(l => [l.code, l.label])
);

// Google Translate language code overrides
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
  'ko': 'Korean', 'ja': 'Japanese', 'zh-CN': 'Chinese (Simplified)',
  'zh-TW': 'Chinese (Traditional)', 'es': 'Spanish', 'fr': 'French',
  'de': 'German', 'pt-BR': 'Portuguese', 'pt': 'Portuguese',
  'vi': 'Vietnamese', 'th': 'Thai', 'id': 'Indonesian', 'ar': 'Arabic',
  'hi': 'Hindi', 'ru': 'Russian', 'tr': 'Turkish', 'it': 'Italian',
  'nl': 'Dutch', 'pl': 'Polish', 'uk': 'Ukrainian', 'cs': 'Czech',
  'sv': 'Swedish', 'da': 'Danish', 'fi': 'Finnish', 'no': 'Norwegian',
  'ms': 'Malay', 'tl': 'Filipino', 'bn': 'Bengali', 'he': 'Hebrew',
  'ro': 'Romanian', 'hu': 'Hungarian', 'el': 'Greek',
};
const YT_LANG_NAME_MAP = Object.fromEntries(
  AVAILABLE_LANGUAGES.filter(l => l.code !== 'en').map(l => [l.code, _YT_LANG_NAMES[l.code] || l.code])
);

// ==================== UI LABELS (i18n) ====================

const TUTOR_GREETINGS = {
  'en': "Hi! I'm your AI learning assistant. Ask me anything about this course.",
  'ko': '안녕하세요! AI 학습 도우미입니다. 이 과정에 대해 무엇이든 물어보세요.',
  'ja': 'こんにちは！AI学習アシスタントです。このコースについて何でも聞いてください。',
  'zh-CN': '你好！我是你的AI学习助手。关于这门课程，有什么都可以问我。',
  'es': '¡Hola! Soy tu asistente de aprendizaje con IA. Pregúntame lo que quieras sobre este curso.',
  'fr': "Bonjour ! Je suis votre assistant d'apprentissage IA. Posez-moi n'importe quelle question sur ce cours.",
  'de': 'Hallo! Ich bin dein KI-Lernassistent. Frag mich alles über diesen Kurs.',
};

const SEND_LABELS = {
  'en': 'Send', 'ko': '전송', 'ja': '送信', 'zh-CN': '发送',
  'es': 'Enviar', 'fr': 'Envoyer', 'de': 'Senden',
};

const ASK_TUTOR_LABELS = {
  'en': 'Ask Tutor', 'ko': '튜터에게 질문', 'ja': 'チューターに質問',
  'zh-CN': '问导师', 'es': 'Preguntar', 'fr': 'Demander', 'de': 'Fragen',
};

const CHAT_PLACEHOLDERS = {
  'en': 'Ask about the course content...',
  'ko': '강의 내용에 대해 질문하세요...',
  'ja': 'コースの内容について質問してください...',
  'zh-CN': '关于课程内容，请提问...',
  'es': 'Pregunta sobre el contenido del curso...',
  'fr': 'Posez une question sur le cours...',
  'de': 'Frage zum Kursinhalt stellen...',
};

const QUOTE_PLACEHOLDERS = {
  'en': 'Ask about this text...',
  'ko': '선택한 텍스트에 대해 질문하세요...',
  'ja': '選択したテキストについて質問...',
  'zh-CN': '关于这段文字提问...',
  'es': 'Pregunta sobre este texto...',
  'fr': 'Posez une question sur ce texte...',
  'de': 'Frage zu diesem Text stellen...',
};

const BANNER_UI = {
  'en': { prompt: 'Translate this page to', confirm: 'Translate', dismiss: 'Close' },
  'ko': { prompt: '이 페이지를 다음 언어로 번역할까요?', confirm: '번역', dismiss: '닫기' },
  'ja': { prompt: 'このページを翻訳しますか？', confirm: '翻訳', dismiss: '閉じる' },
  'zh-CN': { prompt: '将此页面翻译为', confirm: '翻译', dismiss: '关闭' },
  'es': { prompt: '¿Traducir esta página a', confirm: 'Traducir', dismiss: 'Cerrar' },
  'fr': { prompt: 'Traduire cette page en', confirm: 'Traduire', dismiss: 'Fermer' },
  'de': { prompt: 'Diese Seite übersetzen auf', confirm: 'Übersetzen', dismiss: 'Schließen' },
};

const PROGRESS_LABELS = {
  'en': 'Translating…', 'ko': '번역 중…', 'ja': '翻訳中…',
  'zh-CN': '翻译中…', 'es': 'Traduciendo…', 'fr': 'Traduction…', 'de': 'Übersetzen…',
};

const CHAT_ERROR_LABELS = {
  'en': 'Sorry, an error occurred.',
  'ko': '죄송합니다. 응답 중 오류가 발생했습니다.',
  'ja': '申し訳ありません。エラーが発生しました。',
  'zh-CN': '抱歉，发生了错误。',
  'es': 'Lo sentimos, se produjo un error.',
  'fr': "Désolé, une erreur s'est produite.",
  'de': 'Entschuldigung, ein Fehler ist aufgetreten.',
};

const HISTORY_LABELS = {
  title: { 'en': 'Chat History', 'ko': '대화 기록', 'ja': '会話履歴', 'zh-CN': '聊天记录', 'es': 'Historial', 'fr': 'Historique', 'de': 'Verlauf' },
  loading: { 'en': 'Loading...', 'ko': '불러오는 중...', 'ja': '読み込み中...', 'zh-CN': '加载中...', 'es': 'Cargando...', 'fr': 'Chargement...', 'de': 'Laden...' },
  empty: { 'en': 'No conversations yet', 'ko': '대화 기록이 없습니다', 'ja': 'まだ会話がありません', 'zh-CN': '暂无对话', 'es': 'Sin conversaciones', 'fr': 'Aucune conversation', 'de': 'Noch keine Gespräche' },
};

const HISTORY_DB_NAME = 'skillbridge-tutor';
const HISTORY_STORE = 'conversations';

// ==================== POPUP LABELS (i18n) ====================

const POPUP_LABELS = {
  targetLang: {
    'en': 'Target Language', 'ko': '번역 언어', 'ja': '翻訳言語',
    'zh-CN': '目标语言', 'es': 'Idioma destino', 'fr': 'Langue cible', 'de': 'Zielsprache',
  },
  premiumTier: {
    'en': '\u2605 Premium (Static Dict + AI Verify)',
    'ko': '\u2605 프리미엄 (정적 사전 + AI 검증)',
    'ja': '\u2605 プレミアム（静的辞書＋AI検証）',
    'zh-CN': '\u2605 高级（静态词典＋AI验证）',
    'es': '\u2605 Premium (Diccionario + IA)',
    'fr': '\u2605 Premium (Dictionnaire + IA)',
    'de': '\u2605 Premium (Wörterbuch + KI)',
  },
  standardTier: {
    'en': 'Google Translate + AI Verify',
    'ko': 'Google 번역 + AI 검증',
    'ja': 'Google翻訳＋AI検証',
    'zh-CN': 'Google翻译＋AI验证',
    'es': 'Google Translate + verificaci\u00f3n IA',
    'fr': 'Google Traduction + v\u00e9rification IA',
    'de': 'Google \u00dcbersetzer + KI-Pr\u00fcfung',
  },
  openSidebar: {
    'en': 'Open AI Tutor Sidebar', 'ko': 'AI 튜터 사이드바 열기', 'ja': 'AI\u30c1\u30e5\u30fc\u30bf\u30fc\u3092\u958b\u304f',
    'zh-CN': '\u6253\u5f00AI\u5bfc\u5e08\u4fa7\u680f', 'es': 'Abrir tutor IA', 'fr': 'Ouvrir le tuteur IA', 'de': 'KI-Tutor \u00f6ffnen',
  },
  autoTranslate: {
    'en': 'Auto-translate on page load', 'ko': '\ud398\uc774\uc9c0 \ub85c\ub4dc \uc2dc \uc790\ub3d9 \ubc88\uc5ed', 'ja': '\u30da\u30fc\u30b8\u8aad\u307f\u8fbc\u307f\u6642\u306b\u81ea\u52d5\u7ffb\u8a33',
    'zh-CN': '\u9875\u9762\u52a0\u8f7d\u65f6\u81ea\u52a8\u7ffb\u8bd1', 'es': 'Traducci\u00f3n autom\u00e1tica al cargar', 'fr': 'Traduction auto au chargement', 'de': 'Automatisch beim Laden \u00fcbersetzen',
  },
  englishOriginal: {
    'en': 'English (Original)', 'ko': 'English (Original)', 'ja': 'English (Original)',
    'zh-CN': 'English (Original)', 'es': 'English (Original)', 'fr': 'English (Original)', 'de': 'English (Original)',
  },
  refreshPage: {
    'en': 'Please refresh the Skilljar page', 'ko': 'Skilljar \ud398\uc774\uc9c0\ub97c \uc0c8\ub85c\uace0\uce68\ud574\uc8fc\uc138\uc694', 'ja': 'Skilljar\u30da\u30fc\u30b8\u3092\u66f4\u65b0\u3057\u3066\u304f\u3060\u3055\u3044',
    'zh-CN': '\u8bf7\u5237\u65b0Skilljar\u9875\u9762', 'es': 'Actualice la p\u00e1gina de Skilljar', 'fr': 'Veuillez actualiser la page Skilljar', 'de': 'Bitte Skilljar-Seite aktualisieren',
  },
};

const SKILLBRIDGE_MODEL_LABELS = {
  GEMINI: 'Gemini 2.0 Flash',
  CLAUDE: 'Claude Sonnet 4',
};
