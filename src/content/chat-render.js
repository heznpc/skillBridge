/**
 * SkillBridge — Chat response rendering helpers.
 *
 * Pure (DOM-free for the markdown half) functions used by the sidebar chat,
 * conversation-history detail view, and any other surface that needs to
 * convert Gemini's markdown into safe HTML.
 *
 * Loaded after content.js (which constructs `_sb`) and before
 * sidebar-chat.js / chat-history.js — both consume these via `sb._chat`.
 *
 * Exports (on `window._sb._chat`):
 *   - formatResponse(text) → safe HTML string
 *   - applyInline(escapedText) → HTML with bold/italic/code spans applied
 *   - sanitizeHtml(html) → string stripped to the chat-allowlist of tags/attrs
 */

(function () {
  'use strict';

  const sb = window._sb;
  if (!sb) {
    console.warn('[SkillBridge] chat-render: _sb not ready');
    return;
  }

  /**
   * Convert Gemini-style markdown into HTML.
   * Input is fully HTML-escaped first so any markdown captured groups can
   * be inserted without re-escaping (see {@link applyInline}).
   * @param {string} text
   * @returns {string}
   */
  function formatResponse(text) {
    const escaped = sb.escapeHtml(text);

    // Ensure markdown block elements start on new lines
    // (avoid lookbehind for wider browser compatibility)
    const normalized = escaped
      .replace(/([^\n#])(#{2,3}\s)/g, '$1\n$2')
      .replace(/([^\n])(-\s)/g, '$1\n$2')
      .replace(/([^\n])(\d+[.)]\s)/g, '$1\n$2');

    const lines = normalized.split('\n');
    const out = [];
    let listBuf = [];
    let listOrdered = false;
    let paraBuf = [];

    const flushList = () => {
      if (!listBuf.length) return;
      const tag = listOrdered ? 'ol' : 'ul';
      out.push(`<${tag}>${listBuf.map((t) => `<li>${applyInline(t)}</li>`).join('')}</${tag}>`);
      listBuf = [];
    };
    const flushPara = () => {
      if (!paraBuf.length) return;
      out.push(`<p>${applyInline(paraBuf.join('<br>'))}</p>`);
      paraBuf = [];
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        flushList();
        flushPara();
        continue;
      }
      const hMatch = trimmed.match(/^(#{2,3})\s+(.+)/);
      if (hMatch) {
        flushList();
        flushPara();
        out.push(`<h3>${applyInline(hMatch[2])}</h3>`);
        continue;
      }
      const ulMatch = trimmed.match(/^[-*]\s+(.*)/);
      if (ulMatch) {
        if (listBuf.length && listOrdered) flushList();
        listOrdered = false;
        flushPara();
        listBuf.push(ulMatch[1]);
        continue;
      }
      const olMatch = trimmed.match(/^\d+[.)]\s+(.*)/);
      if (olMatch) {
        if (listBuf.length && !listOrdered) flushList();
        listOrdered = true;
        flushPara();
        listBuf.push(olMatch[1]);
        continue;
      }
      flushList();
      paraBuf.push(trimmed);
    }
    flushList();
    flushPara();
    return out.join('');
  }

  function applyInline(text) {
    // Input is already HTML-escaped by formatResponse — do NOT re-escape captured groups
    return text
      .replace(/\*\*(.*?)\*\*/g, (_, g) => '<strong>' + g + '</strong>')
      .replace(/\*(.*?)\*/g, (_, g) => '<em>' + g + '</em>')
      .replace(/`(.*?)`/g, (_, g) => '<code>' + g + '</code>');
  }

  /**
   * Strip dangerous tags and attributes from trusted-structure HTML.
   * Keeps only the tags used by our own formatResponse / history rendering.
   *
   * Allowlist note: `style` was previously allowed but enables CSS exfil
   * (`background:url(attacker)`) and clickjack overlays via attacker-influenced
   * content. Use class-based styling instead.
   *
   * @param {string} html
   * @returns {string}
   */
  const sanitizeHtml = window._sbDomSafe.sanitizeChatHtml;

  // Reserve the sub-namespace; sidebar-chat.js will fill in its half.
  // `applyInline` is intentionally not exposed — it's an implementation
  // detail of formatResponse. The v3.5.13 back-compat `sb.formatResponse`
  // shim was removed in v3.5.14 after grep confirmed zero external callers.
  sb._chat = sb._chat || {};
  sb._chat.formatResponse = formatResponse;
  sb._chat.sanitizeHtml = sanitizeHtml;
  sb.registerModule?.('chat-render');
})();
