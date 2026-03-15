/**
 * SkillBridge — Gemini Block Translation
 * Handles inline-tag-aware translation via Gemini for mixed-content elements.
 * Accesses shared state via window._sb namespace.
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
    [...INLINE_TAGS, ...NO_TRANSLATE_TAGS, 'BR'].map(t => t.toLowerCase())
  );

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

  function buildXmlForGemini(el) {
    const sb = window._sb;
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

  function getAttrsString(el) {
    const sb = window._sb;
    const attrs = [];
    for (const attr of el.attributes) {
      attrs.push(`${attr.name}="${sb.escapeHtml(attr.value)}"`);
    }
    return attrs.length ? ' ' + attrs.join(' ') : '';
  }

  function xmlToHtml(translatedXml, tagInfo) {
    let html = translatedXml;
    for (const [id, info] of Object.entries(tagInfo)) {
      if (id.startsWith('c')) {
        html = html.replace(new RegExp(`<${id}\\s*/>`, 'g'), info.original);
      } else {
        html = html.replace(new RegExp(`<${id}>([\\s\\S]*?)</${id}>`, 'g'), (_, content) => {
          return `<${info.tag}${info.attrs}>${content}</${info.tag}>`;
        });
      }
    }
    // Clean up unmatched placeholder tags
    html = html.replace(/<[xc]\d+\s*\/?>/g, '');
    html = html.replace(/<\/[xc]\d+>/g, '');
    // Strip any HTML tags not in SAFE_TAGS whitelist (prevent XSS from AI output)
    html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tag) => {
      if (!SAFE_TAGS.has(tag.toLowerCase())) return '';
      // Strip event handler attributes (on*) and javascript: URLs from safe tags
      return match.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, '')
                  .replace(/\s+href\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]*)/gi, '');
    });
    return html;
  }

  function queueGeminiBlockTranslation(el, targetLang) {
    const sb = window._sb;
    const { xml, tagInfo } = buildXmlForGemini(el);
    const pureText = el.textContent.trim();

    if (!pureText || pureText.length < 10) return;
    if (!sb.isLikelyEnglish(pureText)) return;

    if (!sb.originalTexts.has(el)) sb.originalTexts.set(el, el.innerHTML);

    const langName = sb.translator.supportedLanguages[targetLang] || targetLang;
    const protectedKeepEnglish = sb.getProtectedKeepEnglish();

    const prompt = `You are translating technical education content (Anthropic AI courses) to ${langName}.

SOURCE (XML-tagged English):
${xml}

RULES:
- Translate to natural, fluent ${langName}
- PRESERVE all XML tags exactly: <x1>...</x1>, <x2>...</x2>, <c1/>, <c2/> etc.
- You may REORDER tags to match ${langName} grammar (e.g., SOV word order for Korean/Japanese)
- Translate the TEXT INSIDE <xN>...</xN> tags
- NEVER modify <cN/> tags (they are code identifiers — keep exactly as-is)
- Keep these terms in English (DO NOT translate): ${protectedKeepEnglish}
- Output ONLY the translated text with tags. No explanations.`;

    sb.translator._sendRequest({
      type: 'VERIFY_REQUEST',
      systemPrompt: prompt,
      model: SKILLBRIDGE_MODELS.GEMINI,
    }).then(result => {
      if (!result) return;
      const trimmed = result.trim();
      if (trimmed.length > xml.length * 3 || trimmed.includes('SOURCE') || trimmed.includes('RULES:')) return;

      el.innerHTML = xmlToHtml(trimmed, tagInfo);
      el.classList.remove('si18n-verifying');
      sb.translator._cacheTranslation(pureText, el.textContent.trim(), targetLang);
    }).catch(err => {
      console.warn('[SkillBridge] Gemini block translation failed:', err.message);
      el.classList.remove('si18n-verifying');
    });

    el.classList.add('si18n-verifying');
  }

  // Expose on window._sb
  const sb = window._sb;
  sb.hasInlineTags = hasInlineTags;
  sb.buildXmlForGemini = buildXmlForGemini;
  sb.xmlToHtml = xmlToHtml;
  sb.queueGeminiBlockTranslation = queueGeminiBlockTranslation;
  sb.SAFE_TAGS = SAFE_TAGS;
})();
