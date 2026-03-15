/**
 * SkillBridge — Page Type Detection & DOM Helpers
 * Detects translatable elements, text nodes, and page context.
 * Accesses shared state via window._sb namespace.
 */

(function () {
  'use strict';

  // Target ALL visible text elements — including Skilljar-specific
  const TRANSLATABLE_SELECTOR = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'li', 'td', 'th', 'label', 'figcaption',
    'span', '.btn-text', '.nav-text', 'blockquote', 'dt', 'dd',
    '.coursebox-text', '.coursebox-text-description',
    '.sj-ribbon-text', '.course-time',
    '.faq-title', '.faq-post p',
    'div.title', '.lesson-row div.title',
    '.focus-link-v2', '.section-title',
    '.left-nav-return-text', '.sj-text-course-overview',
    '.lesson-top h2', '.details-pane-description',
  ].join(', ');

  const EXCLUDE_SELECTOR = [
    'code', 'pre', 'script', 'style', 'noscript',
    '.code-block', '.syntax-highlight',
    '.skillbridge-sidebar', '#skillbridge-bridge', '#skillbridge-fab',
    'header nav', '.site-header nav', 'nav.navbar', 'footer',
  ].join(', ');

  function isLikelyEnglish(text) {
    let latin = 0, total = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13) continue; // whitespace
      total++;
      if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) latin++;
    }
    return total > 0 && (latin / total) > 0.5;
  }

  function getTranslatableElements() {
    return Array.from(document.querySelectorAll(TRANSLATABLE_SELECTOR)).filter(el => {
      if (el.closest(EXCLUDE_SELECTOR)) return false;
      const parent = el.parentElement;
      if (parent && parent.matches && parent.matches(TRANSLATABLE_SELECTOR) &&
          !parent.closest(EXCLUDE_SELECTOR)) {
        if (['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH', 'BLOCKQUOTE'].includes(parent.tagName)) {
          return false;
        }
      }
      if (el.tagName === 'SPAN') {
        const text = el.textContent.trim();
        if (text.length < 4) return false;
        if (el.children.length > 3) return false;
      }
      return el.textContent.trim().length > 1;
    });
  }

  function getTextNodes(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (node.textContent.trim().length < 2) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest('code, pre, script, style')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function safeReplaceText(el, newText) {
    if (el.children.length === 0) { el.textContent = newText; return; }

    const textNodes = [];
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) {
        textNodes.push(node);
      }
    }

    if (textNodes.length === 1) {
      textNodes[0].textContent = newText;
    } else if (textNodes.length > 1) {
      textNodes[0].textContent = newText;
      for (let i = 1; i < textNodes.length; i++) textNodes[i].textContent = '';
    } else {
      const deepTextNodes = getTextNodes(el);
      if (deepTextNodes.length > 0) {
        deepTextNodes[0].textContent = newText;
        for (let i = 1; i < deepTextNodes.length; i++) deepTextNodes[i].textContent = '';
      } else {
        el.textContent = newText;
      }
    }
  }

  function isCodeContent(node) {
    return !!node.parentElement?.closest('code, pre, script, style');
  }

  function getPageContext() {
    const title = document.querySelector('h1, h2, .course-title')?.textContent || document.title || '';
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4'))
      .map(h => h.textContent.trim())
      .slice(0, 5)
      .join(', ');
    return `Course: ${title}. Sections: ${headings}`;
  }

  // Expose on window._sb
  const sb = window._sb;
  sb.TRANSLATABLE_SELECTOR = TRANSLATABLE_SELECTOR;
  sb.EXCLUDE_SELECTOR = EXCLUDE_SELECTOR;
  sb.isLikelyEnglish = isLikelyEnglish;
  sb.getTranslatableElements = getTranslatableElements;
  sb.getTextNodes = getTextNodes;
  sb.safeReplaceText = safeReplaceText;
  sb.isCodeContent = isCodeContent;
  sb.getPageContext = getPageContext;
})();
