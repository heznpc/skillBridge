/**
 * SkillBridge — DOM-safe rendering helpers.
 *
 * Central allowlisted HTML sanitizers and escape helpers shared by chat,
 * history, and panel rendering code. Loaded after gemini-block.js so the
 * canonical escapeHtml implementation stays the single escaping primitive.
 */
(function () {
  'use strict';

  const fallbackEscapeHtml = (text) =>
    String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const escapeHtml = window._geminiBlock?.escapeHtml || fallbackEscapeHtml;

  function stripControlChars(value) {
    return Array.from(String(value ?? ''))
      .filter((ch) => ch.charCodeAt(0) > 31)
      .join('');
  }

  const CHAT_ALLOWED_TAGS = new Set([
    'div',
    'span',
    'p',
    'h3',
    'ul',
    'ol',
    'li',
    'strong',
    'em',
    'code',
    'br',
    'button',
    'svg',
    'polyline',
    'path',
    'circle',
  ]);

  const CHAT_ALLOWED_ATTRS = new Set([
    'class',
    'id',
    'data-id',
    'data-question',
    'title',
    'aria-label',
    'role',
    'width',
    'height',
    'viewBox',
    'fill',
    'stroke',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
    'cx',
    'cy',
    'r',
    'd',
    'points',
  ]);

  const INLINE_ALLOWED_TAGS = new Set([
    'a',
    'abbr',
    'b',
    'br',
    'code',
    'em',
    'i',
    'kbd',
    'mark',
    's',
    'samp',
    'small',
    'span',
    'strong',
    'sub',
    'sup',
    'u',
    'var',
  ]);

  const INLINE_ATTR_ALLOWLIST = {
    a: new Set(['href', 'title', 'lang', 'target']),
    abbr: new Set(['title', 'lang']),
    code: new Set(['class', 'lang']),
    kbd: new Set(['lang']),
    mark: new Set(['lang']),
    samp: new Set(['lang']),
    span: new Set(['class', 'lang', 'title']),
    var: new Set(['lang']),
  };
  const DEFAULT_INLINE_ATTRS = new Set(['lang', 'title']);

  function stripUnsafeAttrs(el, allowedAttrs) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || !allowedAttrs.has(name)) {
        el.removeAttribute(attr.name);
      }
    }
  }

  function sanitizeChatHtml(html) {
    const doc = new DOMParser().parseFromString(String(html ?? ''), 'text/html');

    function walk(node) {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        const tag = child.tagName.toLowerCase();
        if (!CHAT_ALLOWED_TAGS.has(tag)) {
          child.remove();
          continue;
        }
        stripUnsafeAttrs(child, CHAT_ALLOWED_ATTRS);
        walk(child);
      }
    }

    walk(doc.body);
    return doc.body.innerHTML;
  }

  function isSafeHttpHref(value) {
    const raw = stripControlChars(value).trim();
    if (raw.startsWith('#')) return true;
    try {
      const parsed = new URL(raw, document.baseURI);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function sanitizeInlineHtml(html) {
    const doc = new DOMParser().parseFromString(String(html ?? ''), 'text/html');

    function cleanNode(node) {
      const fragment = document.createDocumentFragment();
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          fragment.appendChild(document.createTextNode(child.textContent));
          continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        const tag = child.tagName.toLowerCase();
        if (!INLINE_ALLOWED_TAGS.has(tag)) {
          fragment.appendChild(cleanNode(child));
          continue;
        }
        const clean = document.createElement(tag);
        const allowed = INLINE_ATTR_ALLOWLIST[tag] || DEFAULT_INLINE_ATTRS;
        for (const attr of Array.from(child.attributes)) {
          const name = attr.name.toLowerCase();
          if (name.startsWith('on') || !allowed.has(name)) continue;
          if (name === 'href' && !isSafeHttpHref(attr.value)) continue;
          clean.setAttribute(attr.name, attr.value);
        }
        if (tag === 'a' && clean.getAttribute('target') === '_blank') {
          clean.setAttribute('rel', 'noopener noreferrer');
        }
        clean.appendChild(cleanNode(child));
        fragment.appendChild(clean);
      }
      return fragment;
    }

    const wrapper = document.createElement('div');
    wrapper.appendChild(cleanNode(doc.body));
    return wrapper.innerHTML;
  }

  window._sbDomSafe = {
    escapeHtml,
    sanitizeChatHtml,
    sanitizeInlineHtml,
  };
})();
