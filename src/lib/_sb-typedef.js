/**
 * SkillBridge — `_sb` Namespace Contract
 *
 * Pure JSDoc type definitions for the shared namespace that content scripts
 * mount on `window._sb`. Only loaded by IDEs / `tsc --noEmit` for static
 * analysis (see tsconfig.json) — there is no runtime export here. The file
 * is intentionally NOT in manifest.content_scripts.js.
 *
 * Convention:
 *   - `content.js` constructs the base `_sb` object and exposes shared state
 *     accessors (currentLang, sidebarVisible, translator, etc.).
 *   - Each extracted content module attaches its own methods to `_sb`
 *     (banners.js, header-controls.js, sidebar-chat.js, ...).
 *   - All cross-module calls go through `_sb.foo?.()` so a module that
 *     hasn't loaded yet (or got intentionally dropped from the manifest)
 *     never throws.
 *
 * @see src/content/content.js — owner of the `_sb` object
 * @see src/content/{banners,header-controls,sidebar-chat,text-selection,code-comments,keyboard-shortcuts}.js
 */

/**
 * @typedef {Object} SbState
 * @property {string} currentLang — active target language ISO code
 * @property {boolean} sidebarVisible
 * @property {SkilljarTranslator|null} translator
 * @property {boolean} isExamPage — true when `detectExamPage()` matched at init
 * @property {Map<HTMLElement, string>} originalTexts
 * @property {Map<HTMLElement, string>} translatedTexts
 * @property {Map<HTMLElement, string>} originalComments
 * @property {number} gtGeneration — bumped each switchLanguage; use to drop stale GT results
 * @property {boolean} isOffline
 *
 * @property {(map: Record<string, string>, lang?: string) => string} t
 * @property {(text: string) => string} escapeHtml
 * @property {(text: string) => boolean} isLikelyEnglish
 * @property {(newLang: string, opts?: { onDone?: () => void }) => Promise<void>} switchLanguage
 * @property {() => { url: string; title: string; lang: string; lessonText?: string }} getPageContext
 *
 * --- banners.js ---
 * @property {?() => void} showOfflineBanner
 * @property {?() => void} hideOfflineBanner
 * @property {?() => void} showExamBanner
 * @property {?() => void} showTranslationProgress
 * @property {?(percent: number, label?: string) => void} updateTranslationProgress
 * @property {?() => void} hideTranslationProgress
 *
 * --- header-controls.js ---
 * @property {?() => void} injectDarkModeToggle
 * @property {?() => void} toggleDarkMode
 * @property {?() => void} injectHeaderLanguageSelect
 * @property {?() => string|null} detectBrowserLanguage
 * @property {?(detected?: string|null) => void} showWelcomeBanner
 *
 * --- text-selection.js ---
 * @property {?() => void} initAskTutorButton
 *
 * --- keyboard-shortcuts.js ---
 * @property {?() => void} toggleShortcutsHelp
 *
 * --- code-comments.js ---
 * @property {?(targetLang: string) => Promise<void>} translateCodeComments
 *
 * --- sidebar-chat.js (and any extracted chat-* modules) ---
 * @property {?() => void} injectSidebar
 * @property {?() => void} injectFloatingButton
 * @property {?() => void} toggleSidebar
 * @property {?() => void} updateLocalizedLabels
 * @property {?(text: string) => string} formatResponse
 * @property {?() => void} toggleFlashcardPanel
 * @property {?() => void} cancelActiveStream
 */

/**
 * @typedef {Object} ProtectedTermsApi
 * @property {(targetLang: string, translator: SkilljarTranslator) => void} buildProtectedTermsMap
 * @property {(text: string) => string} restoreProtectedTerms
 * @property {() => void} resetProtectedTerms
 * @property {() => string} getKeepEnglishTerms
 */

/**
 * @typedef {Object} GeminiBlockApi
 * @property {(text: string) => string} escapeHtml
 * @property {(text: string) => string} sanitizeFromGemini
 */

// This file is JSDoc-only — no runtime code. The empty `void 0` keeps it a
// valid module body for IDEs that need an expression.
void 0;
