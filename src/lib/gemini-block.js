/**
 * SkillBridge — Inline HTML helpers
 * Detects mixed inline content and exposes the canonical HTML escaping helper
 * used by the content UI.
 *
 * The legacy filename and global name are retained to avoid a migration-only
 * manifest change. No AI request or model-specific translation runs here.
 *
 * Standalone module — loaded BEFORE content.js.
 * Exposes: window._geminiBlock = { hasInlineTags, escapeHtml }
 */

(function () {
  'use strict';

  const INLINE_TAGS = new Set([
    'STRONG',
    'B',
    'EM',
    'I',
    'A',
    'SPAN',
    'CODE',
    'MARK',
    'SUB',
    'SUP',
    'ABBR',
    'SMALL',
    'U',
    'S',
  ]);

  /**
   * Check whether an element contains a mix of text nodes and inline children.
   * @param {Element} el
   * @returns {boolean}
   */
  function hasInlineTags(el) {
    if (el.children.length === 0) return false;
    let hasText = false;
    let hasInline = false;
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) hasText = true;
      if (node.nodeType === Node.ELEMENT_NODE && INLINE_TAGS.has(node.tagName)) hasInline = true;
    }
    return hasText && hasInline;
  }

  /**
   * Escape HTML special characters.
   * @param {string} text
   * @returns {string}
   */
  function escapeHtml(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  window._geminiBlock = { hasInlineTags, escapeHtml };
})();
