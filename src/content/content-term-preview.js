/**
 * SkillBridge per-lesson term preview.
 *
 * Extracted from content.js; content.js still owns translator/current language
 * state and passes those handles into this factory.
 */

(function () {
  'use strict';

  function createTermPreview({
    getCurrentLang,
    getIsExamPage,
    getTranslator,
    courseSlugs,
    labels,
    translateLabel,
    escapeHtml,
    storage,
    getDataUrl,
    openFlashcards,
  } = {}) {
    let shown = false;

    function show() {
      const currentLang = getCurrentLang?.();
      const translator = getTranslator?.();
      if (shown) return;
      if (currentLang === 'en' || getIsExamPage?.()) return;
      if (!translator?.staticDict || Object.keys(translator.staticDict).length === 0) return;
      if (document.getElementById('si18n-term-preview')) return;

      const url = location.pathname.toLowerCase();
      let matchedSlug = null;
      let sections = null;
      for (const [slug, sects] of courseSlugs) {
        if (url.includes(slug)) {
          matchedSlug = slug;
          sections = sects;
          break;
        }
      }
      if (!matchedSlug) return;
      shown = true;

      const dismissKey = `termPreview_${matchedSlug}`;
      storage.get([dismissKey], (result) => {
        if (result[dismissKey]) return;

        let terms = [];
        if (sections && translator.premiumLanguages.includes(currentLang)) {
          try {
            fetch(getDataUrl(currentLang))
              .then((r) => r.json())
              .then((data) => {
                for (const sect of sections) {
                  if (data[sect] && typeof data[sect] === 'object') {
                    for (const [en, tr] of Object.entries(data[sect])) {
                      if (en !== tr && en.length >= 3 && en.length <= 40 && tr.length >= 1) {
                        terms.push({ en, tr });
                      }
                    }
                  }
                }
                if (terms.length > 0) render(terms.slice(0, 6), matchedSlug, dismissKey);
              })
              .catch(() => {});
          } catch (_ignored) {
            /* non-fatal */
          }
        } else {
          terms = Object.entries(translator.staticDict)
            .filter(([k, v]) => k !== v && k.length >= 3 && k.length <= 40)
            .map(([en, tr]) => ({ en, tr }))
            .slice(0, 6);
          if (terms.length > 0) render(terms, matchedSlug, dismissKey);
        }
      });
    }

    function render(terms, slug, dismissKey) {
      shown = true;
      const card = document.createElement('div');
      card.id = 'si18n-term-preview';
      card.setAttribute('role', 'status');
      card.setAttribute('aria-live', 'polite');

      const courseName = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

      card.innerHTML = `
        <div class="si18n-tp-header">
          <span class="si18n-tp-title">${escapeHtml(translateLabel(labels.title))} · ${escapeHtml(courseName)}</span>
          <button class="si18n-tp-close" aria-label="Close">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="si18n-tp-terms">
          ${terms.map((term) => `<div class="si18n-tp-chip"><span class="si18n-tp-en">${escapeHtml(term.en)}</span><span class="si18n-tp-tr">${escapeHtml(term.tr)}</span></div>`).join('')}
        </div>
        <button class="si18n-tp-viewall">${escapeHtml(translateLabel(labels.viewAll))} →</button>
      `;
      document.body.appendChild(card);

      requestAnimationFrame(() => card.classList.add('visible'));

      const dismiss = () => {
        card.classList.remove('visible');
        storage.set({ [dismissKey]: true });
        setTimeout(() => card.remove(), 400);
      };

      card.querySelector('.si18n-tp-close').addEventListener('click', dismiss);
      card.querySelector('.si18n-tp-viewall').addEventListener('click', () => {
        dismiss();
        openFlashcards?.();
      });

      setTimeout(() => {
        if (document.getElementById('si18n-term-preview')) dismiss();
      }, 15000);
    }

    return { show };
  }

  window._sbContentTermPreview = { createTermPreview };
})();
