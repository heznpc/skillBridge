/**
 * SkillBridge — Code Comment Translation
 * Detects programming language in code blocks and translates
 * only the comment text, preserving code structure.
 *
 * Loaded AFTER content.js — accesses shared state via window._sb.
 */

(function () {
  'use strict';

  const sb = window._sb;

  /**
   * Detect programming language from code element class names.
   * @param {Element} el
   * @returns {string}
   */
  function detectCodeLanguage(el) {
    const cls = (el.className || '') + ' ' + (el.parentElement?.className || '');
    if (/\b(language-|lang-|hljs-)?(python|py)\b/i.test(cls)) return 'python';
    if (/\b(language-|lang-|hljs-)?(javascript|js|typescript|ts)\b/i.test(cls)) return 'js';
    if (/\b(language-|lang-|hljs-)?(html|xml|svg)\b/i.test(cls)) return 'html';
    if (/\b(language-|lang-|hljs-)?(bash|sh|shell|zsh)\b/i.test(cls)) return 'bash';
    if (/\b(language-|lang-|hljs-)?(ruby|rb)\b/i.test(cls)) return 'ruby';
    if (/\b(language-|lang-|hljs-)?(yaml|yml)\b/i.test(cls)) return 'yaml';
    if (/\b(language-|lang-|hljs-)?(java|kotlin|swift|go|rust|c|cpp|csharp|cs)\b/i.test(cls)) return 'js';
    // Heuristic fallback
    const text = el.textContent || '';
    if (/^\s*(def |import |class |from )/m.test(text)) return 'python';
    if (/^\s*(function |const |let |var |import |export )/m.test(text)) return 'js';
    return 'js'; // default to // style
  }

  /**
   * Get the appropriate comment regex pattern for a language.
   * @param {string} lang
   * @returns {{ line: RegExp|null, block: RegExp|null }}
   */
  function _getCommentPattern(lang) {
    if (lang === 'python' || lang === 'bash' || lang === 'ruby' || lang === 'yaml') return CODE_COMMENT_PATTERNS[1];
    if (lang === 'html') return CODE_COMMENT_PATTERNS[2];
    return CODE_COMMENT_PATTERNS[0];
  }

  /**
   * Translate comments within a single code block element.
   * @param {Element} el
   * @param {string} targetLang
   */
  async function _translateOneCodeBlock(el, targetLang) {
    const originalComments = sb.originalComments;
    const translator = sb.translator;

    if (originalComments.has(el)) return;
    const text = el.textContent;
    if (!text || text.length < 10) return;

    const pattern = _getCommentPattern(detectCodeLanguage(el));
    originalComments.set(el, el.innerHTML);

    let html = el.innerHTML;
    let hasTranslation = false;

    // Collect all comments, translate in batch, then apply
    const replacements = [];

    if (pattern.line) {
      for (const match of [...html.matchAll(pattern.line)]) {
        const ct = match[1]?.trim();
        if (ct && ct.length >= 4 && sb.isLikelyEnglish(ct)) replacements.push({ match, type: 'line' });
      }
    }
    if (pattern.block) {
      for (const match of [...html.matchAll(pattern.block)]) {
        const ct = match[1]?.trim();
        if (ct && ct.length >= 4 && sb.isLikelyEnglish(ct)) replacements.push({ match, type: 'block' });
      }
    }

    if (replacements.length === 0) {
      originalComments.delete(el);
      return;
    }

    const translations = await Promise.all(
      replacements.map((r) => translator.translate(r.match[1].trim(), targetLang)),
    );

    // Apply in reverse order to preserve indices
    for (let i = replacements.length - 1; i >= 0; i--) {
      const { match, type } = replacements[i];
      const result = translations[i];
      if (result.text === match[1].trim() || result.source === 'original') continue;
      hasTranslation = true;

      let replacement;
      if (type === 'line') {
        replacement = match[0].replace(match[1], result.text);
      } else {
        const opening = match[0].substring(0, match[0].indexOf(match[1]));
        const closing = match[0].substring(match[0].indexOf(match[1]) + match[1].length);
        replacement = `${opening}${result.text}${closing}`;
      }
      html = html.substring(0, match.index) + replacement + html.substring(match.index + match[0].length);
    }

    if (hasTranslation) {
      el.innerHTML = html;
    } else {
      originalComments.delete(el);
    }
  }

  /**
   * Translate comments in all code blocks on the page.
   * @param {string} targetLang
   */
  async function translateCodeComments(targetLang) {
    if (!sb.translator || targetLang === 'en') return;
    const codeEls = document.querySelectorAll('pre code, pre.code, .code-block code');
    await Promise.all(Array.from(codeEls).map((el) => _translateOneCodeBlock(el, targetLang)));
  }

  // Register into _sb namespace
  sb.translateCodeComments = translateCodeComments;
})();
