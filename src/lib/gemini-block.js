/**
 * SkillBridge — Gemini Block Translation
 * Handles elements with mixed inline tags (<strong>, <a>, <code>, etc.)
 * by converting to XML placeholders, sending to Gemini for translation,
 * then restoring the HTML structure with sanitization.
 *
 * Standalone module — loaded BEFORE content.js.
 * Exposes: window._geminiBlock = { hasInlineTags, queueGeminiBlockTranslation, ... }
 */

(function () {
  'use strict';

  // Inline tags that indicate mixed content needing Gemini block translation
  const INLINE_TAGS = new Set([
    'STRONG', 'B', 'EM', 'I', 'A', 'SPAN', 'CODE',
    'MARK', 'SUB', 'SUP', 'ABBR', 'SMALL', 'U', 'S',
  ]);
  const NO_TRANSLATE_TAGS = new Set(['CODE', 'PRE', 'KBD', 'SAMP', 'VAR']);

  // Tags allowed in Gemini block translation output — derived from existing sets + <br>
  const SAFE_TAGS = new Set(
    [...INLINE_TAGS, ...NO_TRANSLATE_TAGS, 'BR'].map(tag => tag.toLowerCase())
  );

  /**
   * Check whether an element contains a mix of text nodes and inline element children.
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
   * Convert an element's children to XML with placeholder tags for Gemini.
   * @param {Element} el
   * @returns {{ xml: string, tagInfo: object }}
   */
  function buildXmlForGemini(el) {
    const tagInfo = {};
    let xCounter = 0;
    let cCounter = 0;
    let xml = '';

    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        xml += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE && INLINE_TAGS.has(node.tagName)) {
        if (NO_TRANSLATE_TAGS.has(node.tagName)) {
          const id = `c${++cCounter}`;
          tagInfo[id] = { tag: node.tagName.toLowerCase(), original: node.outerHTML };
          xml += `<${id}/>`;
        } else {
          const id = `x${++xCounter}`;
          tagInfo[id] = { tag: node.tagName.toLowerCase(), attrs: getAttrsString(node) };
          xml += `<${id}>${node.textContent}</${id}>`;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        xml += node.outerHTML;
      }
    }
    return { xml: xml.trim(), tagInfo };
  }

  /**
   * Serialize an element's attributes to a string for later restoration.
   * @param {Element} el
   * @returns {string}
   */
  function getAttrsString(el) {
    const attrs = [];
    for (const attr of el.attributes) {
      attrs.push(`${attr.name}="${escapeHtml(attr.value)}"`);
    }
    return attrs.length ? ' ' + attrs.join(' ') : '';
  }

  /**
   * Escape HTML special characters.
   * @param {string} text
   * @returns {string}
   */
  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Convert Gemini's translated XML back to safe HTML.
   * @param {string} translatedXml
   * @param {object} tagInfo — from buildXmlForGemini
   * @returns {string}
   */
  function xmlToHtml(translatedXml, tagInfo) {
    // Step 1: Restore placeholder tags to real HTML using tagInfo
    let rawHtml = translatedXml;
    for (const [id, info] of Object.entries(tagInfo)) {
      if (id.startsWith('c')) {
        rawHtml = rawHtml.replace(new RegExp(`<${id}\\s*/>`, 'g'), info.original);
      } else {
        rawHtml = rawHtml.replace(new RegExp(`<${id}>([\\s\\S]*?)</${id}>`, 'g'), (_, content) => {
          return `<${info.tag}${info.attrs}>${content}</${info.tag}>`;
        });
      }
    }
    // Clean up unmatched placeholder tags
    rawHtml = rawHtml.replace(/<[xc]\d+\s*\/?>/g, '');
    rawHtml = rawHtml.replace(/<\/[xc]\d+>/g, '');

    // Step 2: DOM-based sanitization — parse and walk the tree,
    // keeping only SAFE_TAGS and stripping dangerous attributes
    const doc = new DOMParser().parseFromString(rawHtml, 'text/html');

    function sanitizeNode(node) {
      const fragment = document.createDocumentFragment();
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          fragment.appendChild(document.createTextNode(child.textContent));
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          if (SAFE_TAGS.has(child.tagName.toLowerCase())) {
            const clean = document.createElement(child.tagName.toLowerCase());
            // Copy only safe attributes — allowlist approach
            for (const attr of Array.from(child.attributes)) {
              const name = attr.name.toLowerCase();
              if (name.startsWith('on')) continue;  // event handlers
              if (name === 'style') continue;       // CSS injection
              if (name === 'href') {
                // Only allow http(s) and anchor links
                const raw = attr.value.replace(/[\x00-\x1f\s]/g, '');
                if (!/^https?:\/\//i.test(raw) && !raw.startsWith('#')) continue;
              }
              clean.setAttribute(attr.name, attr.value);
            }
            clean.appendChild(sanitizeNode(child));
            fragment.appendChild(clean);
          } else {
            // Unsafe tag — keep its text children but drop the element
            fragment.appendChild(sanitizeNode(child));
          }
        }
      }
      return fragment;
    }

    const sanitized = sanitizeNode(doc.body);
    const wrapper = document.createElement('div');
    wrapper.appendChild(sanitized);
    return wrapper.innerHTML;
  }

  /**
   * Queue a Gemini block translation for an element with mixed inline tags.
   * Builds XML placeholders, sends to Gemini, then restores safe HTML.
   * @param {Element} el — DOM element containing mixed text + inline children
   * @param {string} targetLang — ISO 639-1
   * @param {{translator: SkilljarTranslator, originalTexts: Map<Element, string>, isLikelyEnglish: (text: string) => boolean}} deps
   * @returns {void}
   */
  function queueGeminiBlockTranslation(el, targetLang, deps) {
    const { translator, originalTexts, isLikelyEnglish } = deps;
    const { xml, tagInfo } = buildXmlForGemini(el);
    const pureText = el.textContent.trim();

    if (!pureText || pureText.length < 10) return;
    if (!isLikelyEnglish(pureText)) return;

    if (!originalTexts.has(el)) originalTexts.set(el, el.innerHTML);

    const langName = translator.supportedLanguages[targetLang] || targetLang;
    const keepEnglish = window._protectedTerms.getKeepEnglishTerms();

    const prompt = `You are translating technical education content (Anthropic AI courses) to ${langName}.

SOURCE (XML-tagged English):
${xml}

RULES:
- Translate to natural, fluent ${langName}
- PRESERVE all XML tags exactly: <x1>...</x1>, <x2>...</x2>, <c1/>, <c2/> etc.
- You may REORDER tags to match ${langName} grammar (e.g., SOV word order for Korean/Japanese)
- Translate the TEXT INSIDE <xN>...</xN> tags
- NEVER modify <cN/> tags (they are code identifiers — keep exactly as-is)
- Keep these terms in English (DO NOT translate): ${keepEnglish}
- Output ONLY the translated text with tags. No explanations.`;

    translator._sendRequest({
      type: 'VERIFY_REQUEST',
      systemPrompt: prompt,
      model: SKILLBRIDGE_MODELS.GEMINI,
    }).then(result => {
      if (!result) return;
      const trimmed = result.trim();
      if (trimmed.length > xml.length * 3 || trimmed.includes('SOURCE') || trimmed.includes('RULES:')) return;

      if (el?.parentNode) {
        el.innerHTML = xmlToHtml(trimmed, tagInfo);
        el.classList.remove('si18n-verifying');
      }
      translator._cacheTranslation(pureText, el.textContent.trim(), targetLang);
    }).catch(err => {
      console.warn('[SkillBridge] Gemini block translation failed:', err.message);
      if (el?.parentNode) el.classList.remove('si18n-verifying');
    });

    el.classList.add('si18n-verifying');
  }

  // Expose as standalone global (loaded before content.js)
  window._geminiBlock = {
    hasInlineTags,
    queueGeminiBlockTranslation,
    escapeHtml,
  };
})();
