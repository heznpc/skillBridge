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
  if (!sb) {
    console.warn('[SkillBridge] code-comments: _sb not ready');
    return;
  }

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
    if (originalComments.size >= 5000) return; // Consistent with MAP_SIZE_CAP
    const text = el.textContent;
    if (!text || text.length < 10) return;

    const pattern = _getCommentPattern(detectCodeLanguage(el));
    originalComments.set(el, el.innerHTML);

    let html = el.innerHTML;
    let hasTranslation = false;

    // Collect all comment matches (line + block), then translate + splice.
    const candidates = [];

    if (pattern.line) {
      for (const match of [...html.matchAll(pattern.line)]) {
        const ct = match[1]?.trim();
        if (ct && ct.length >= 4 && sb.isLikelyEnglish(ct)) candidates.push({ match, type: 'line' });
      }
    }
    if (pattern.block) {
      for (const match of [...html.matchAll(pattern.block)]) {
        const ct = match[1]?.trim();
        if (ct && ct.length >= 4 && sb.isLikelyEnglish(ct)) candidates.push({ match, type: 'block' });
      }
    }

    // Each splice rewrites `html` in place using its match's ORIGINAL offset, so
    // two matches whose source ranges overlap would clobber each other. The line
    // and block regexes are independent passes, so a `//` inside a `/* ... */`
    // block (e.g. a URL like `https://…`) yields overlapping line+block matches.
    // Keep only a non-overlapping subset (scan by ascending start, earliest wins)
    // — an untranslated comment is acceptable; corrupted code the learner copies
    // is not.
    candidates.sort((a, b) => a.match.index - b.match.index);
    const replacements = [];
    let lastEnd = -1;
    for (const c of candidates) {
      if (c.match.index >= lastEnd) {
        replacements.push(c);
        lastEnd = c.match.index + c.match[0].length;
      }
    }

    if (replacements.length === 0) {
      originalComments.delete(el);
      return;
    }

    const translations = await Promise.all(
      replacements.map((r) => translator.translate(r.match[1].trim(), targetLang)),
    );

    // Apply from the highest source offset to the lowest so each in-place
    // substring rewrite leaves the remaining (earlier, now guaranteed
    // non-overlapping) match indices valid.
    const ordered = replacements
      .map((r, i) => ({ match: r.match, type: r.type, result: translations[i] }))
      .sort((a, b) => b.match.index - a.match.index);
    for (const { match, type, result } of ordered) {
      if (result.text === match[1].trim() || result.source === 'original') continue;
      hasTranslation = true;

      // Restore protected brand/API terms before escaping and splicing into
      // innerHTML — code-comment translation bypasses the main GT queue.
      const restored = window._protectedTerms.restoreProtectedTerms(result.text);
      const safeText = sb.escapeHtml(restored);

      let replacement;
      if (type === 'line') {
        // Function replacement so `$`-sequences in the translated text ($&, $1,
        // $`, …) are inserted literally, not interpreted by String.replace.
        replacement = match[0].replace(match[1], () => safeText);
      } else {
        const opening = match[0].substring(0, match[0].indexOf(match[1]));
        const closing = match[0].substring(match[0].indexOf(match[1]) + match[1].length);
        replacement = `${opening}${safeText}${closing}`;
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
    window._protectedTerms.buildProtectedTermsMap(targetLang, sb.translator);
    // Honour the per-host content scope (e.g. claude.com tutorials) so code
    // comments in the surrounding marketing shell are never translated.
    const scope = sb.translationScope;
    const codeEls = Array.from(document.querySelectorAll('pre code, pre.code, .code-block code')).filter(
      (el) => !scope || el.closest(scope),
    );
    await Promise.all(codeEls.map((el) => _translateOneCodeBlock(el, targetLang)));
  }

  // Register into _sb namespace
  sb.translateCodeComments = translateCodeComments;
  sb.registerModule?.('code-comments');
})();
