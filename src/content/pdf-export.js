/**
 * SkillBridge - Lesson PDF/print export.
 *
 * Keeps the print-window generation and pre-write DOM sanitization away from
 * the sidebar renderer.
 */

(function () {
  'use strict';

  const sb = window._sb;
  if (!sb) {
    console.warn('[SkillBridge] pdf-export: _sb not ready');
    return;
  }

  function exportLessonPDF() {
    const lessonContent = sb.$(SKILLJAR_SELECTORS.lessonContent) || sb.$('main');
    if (!lessonContent) return;

    const title = sb.$('h1')?.textContent?.trim() || 'SkillBridge Lesson';
    const langName = sb.translator?.supportedLanguages?.[sb.currentLang] || sb.currentLang;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert(sb.t(PDF_EXPORT_LABELS.blocked));
      return;
    }

    const lessonClone = lessonContent.cloneNode(true);
    const DANGEROUS_TAGS = 'script, iframe, object, embed, link[rel="import"], style, base, meta';
    lessonClone.querySelectorAll(DANGEROUS_TAGS).forEach((el) => el.remove());
    lessonClone
      .querySelectorAll('[class*="si18n"], [id*="si18n"], [class*="skillbridge"]')
      .forEach((el) => el.remove());

    const NAV_URL_ATTRS = new Set(['href', 'xlink:href', 'formaction', 'action', 'ping']);
    const dangerousScheme = (value, blockData) => {
      const v = String(value)
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0020]+/g, '')
        .toLowerCase();
      return /^(?:javascript|vbscript):/.test(v) || (blockData && v.startsWith('data:'));
    };
    lessonClone.querySelectorAll('*').forEach((el) => {
      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on')) {
          el.removeAttribute(attr.name);
        } else if (
          NAV_URL_ATTRS.has(name)
            ? dangerousScheme(attr.value, true)
            : name === 'src' && dangerousScheme(attr.value, false)
        ) {
          el.removeAttribute(attr.name);
        }
      }
    });

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${sb.escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 24px; color: #1c1917; line-height: 1.7; font-size: 14px; }
  h1 { font-size: 22px; font-weight: 600; margin-bottom: 4px; }
  h2 { font-size: 18px; margin-top: 28px; }
  h3 { font-size: 16px; margin-top: 20px; }
  p { margin: 10px 0; }
  code { background: #f5f5f4; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  pre { background: #f5f5f4; padding: 14px; border-radius: 8px; overflow-x: auto; font-size: 13px; }
  img { max-width: 100%; height: auto; }
  .si18n-pdf-meta { color: #78716c; font-size: 12px; margin-bottom: 24px; border-bottom: 1px solid #e7e5e4; padding-bottom: 12px; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
  <h1>${sb.escapeHtml(title)}</h1>
  <div class="si18n-pdf-meta">SkillBridge &middot; ${sb.escapeHtml(langName)} &middot; ${new Date().toLocaleDateString()}</div>
  ${lessonClone.innerHTML}
</body>
</html>`);
    printWindow.document.close();

    setTimeout(() => {
      try {
        if (!printWindow.closed) printWindow.print();
      } catch (_e) {
        /* window already closed - nothing to do */
      }
    }, 500);
  }

  sb.exportLessonPDF = exportLessonPDF;
  sb.registerModule?.('pdf-export');
})();
