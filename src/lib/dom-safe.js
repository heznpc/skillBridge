/**
 * SkillBridge — DOM-safe rendering helpers.
 *
 * Central allowlisted HTML sanitizers and escape helpers shared by chat,
 * history, and panel rendering code. Loaded after the legacy-named
 * gemini-block.js helper so escapeHtml stays a single escaping primitive.
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
    // `button` and `img` are structural for HTML-GT: the integrity gate tracks
    // them, so stripping them here made every block containing one fail the
    // gate and stay untranslated (img additionally used to vanish silently).
    'button',
    'img',
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
    a: new Set(['href', 'title', 'lang', 'target', 'class', 'id']),
    button: new Set(['type', 'title', 'lang', 'class', 'id', 'disabled']),
    img: new Set(['src', 'alt', 'title', 'lang', 'class', 'id', 'width', 'height']),
    abbr: new Set(['title', 'lang']),
    code: new Set(['class', 'lang']),
    kbd: new Set(['lang']),
    mark: new Set(['lang']),
    samp: new Set(['lang']),
    span: new Set(['class', 'lang', 'title', 'id']),
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

  // An image source is kept when it cannot be a page-text-derived beacon:
  // http(s) like links, plus inline `data:image/` and same-origin `blob:`
  // payloads, which trigger no network request. Dropping data:/blob: sources
  // silently broke translation of any block with an inline base64 image — the
  // original kept its src while the sanitized copy lost it, so the integrity
  // multisets never matched and the block stayed in English forever.
  function isSafeMediaSrc(value) {
    const raw = stripControlChars(value).trim();
    if (/^data:image\//i.test(raw)) return true;
    try {
      const parsed = new URL(raw, document.baseURI);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'blob:';
    } catch {
      return false;
    }
  }

  function sanitizeInlineHtml(html) {
    const doc = new DOMParser().parseFromString(String(html ?? ''), 'text/html');
    // Build the cleaned tree in an INERT document. Elements created via the
    // live document fetch their src at parse/attribute time even while
    // detached, so a rewritten image URL in a hostile GT response would fire
    // a request before the integrity gate could reject the block.
    const inert = document.implementation.createHTMLDocument('');

    function cleanNode(node) {
      const fragment = inert.createDocumentFragment();
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          fragment.appendChild(inert.createTextNode(child.textContent));
          continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        const tag = child.tagName.toLowerCase();
        if (!INLINE_ALLOWED_TAGS.has(tag)) {
          fragment.appendChild(cleanNode(child));
          continue;
        }
        const clean = inert.createElement(tag);
        const allowed = INLINE_ATTR_ALLOWLIST[tag] || DEFAULT_INLINE_ATTRS;
        for (const attr of Array.from(child.attributes)) {
          const name = attr.name.toLowerCase();
          if (name.startsWith('on') || !allowed.has(name)) continue;
          if (name === 'href' && !isSafeHttpHref(attr.value)) continue;
          if (name === 'src' && !isSafeMediaSrc(attr.value)) continue;
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

    const wrapper = inert.createElement('div');
    wrapper.appendChild(cleanNode(doc.body));
    return wrapper.innerHTML;
  }

  window._sbDomSafe = {
    escapeHtml,
    sanitizeChatHtml,
    sanitizeInlineHtml,
  };
})();
