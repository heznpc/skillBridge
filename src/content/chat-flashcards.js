/**
 * SkillBridge — Flashcard panel (vocabulary cards for exam prep).
 *
 * Extracted from sidebar-chat.js in v3.5.27. Owns:
 *   - Per-course flashcard deck building (URL slug → FLASHCARD_COURSE_MAP
 *     → static-dict section lookup → card list)
 *   - Leitner-box state (each card → box 0/1/2: new / learning / mastered)
 *   - Render + bind events for the flashcard sub-panel UI
 *   - Persistence: chrome.storage.local under `fc_<slug>_<lang>` keys,
 *     serialized through a single promise chain so rapid box-up/box-down
 *     clicks can't interleave (last-click-wins semantics)
 *
 * Loaded AFTER chat-render.js + sidebar-chat.js + chat-history.js — the
 * sub-panel state machinery (`_sb._chat.state.{savedChatHTML,
 * flashcardPanelOpen, historyPanelOpen}` and `_sb._chat.closeSubPanel`)
 * is provided by sidebar-chat.js. Toggling the flashcard panel is
 * invoked from sidebar-chat.js's "fc" button click + keyboard-
 * shortcuts.js via `_sb.toggleFlashcardPanel`.
 *
 * Public surface:
 *   - `_sb.toggleFlashcardPanel` (preserved for back-compat with
 *     keyboard-shortcuts.js's call-site)
 *   - `_sb._chat.toggleFlashcardPanel` (parallel to chat-history.js's
 *     `_sb._chat.toggleHistoryPanel`)
 */

(function () {
  'use strict';

  const sb = window._sb;
  if (!sb) {
    console.warn('[SkillBridge] chat-flashcards: _sb not ready');
    return;
  }
  if (!sb._chat || !sb._chat.state || !sb._chat.closeSubPanel) {
    console.warn('[SkillBridge] chat-flashcards: _sb._chat not ready (sidebar-chat.js missing?)');
    return;
  }
  const _state = sb._chat.state;

  // Local state.
  let flashcardCards = [];
  let flashcardIndex = 0;
  let flashcardBoxes = {};
  let _matchedCourseSlug = null;
  // Raw per-section JSON cache for section-specific flashcards (only the
  // premium-language dictionaries have section keys; the flattened
  // staticDict drops the section level).
  let _rawSectionsCache = null;
  let _rawSectionsLang = null;

  // ============================================================
  // PANEL TOGGLE
  // ============================================================

  function toggleFlashcardPanel() {
    const chatPanel = document.getElementById('si18n-panel-chat');
    if (!chatPanel) return;

    if (_state.flashcardPanelOpen) {
      closeFlashcardPanel();
      return;
    }
    // Close history if open — they share `savedChatHTML`, so closing first
    // restores the chat panel before we save it again.
    if (_state.historyPanelOpen) sb._chat.closeSubPanel();

    _state.flashcardPanelOpen = true;
    _state.savedChatHTML = chatPanel.innerHTML;

    flashcardCards = loadFlashcardsForCourse();
    flashcardIndex = 0;
    loadFlashcardProgress();

    chatPanel.innerHTML = `
      <div class="si18n-flashcard-header">
        <button class="si18n-history-back" id="si18n-fc-back" aria-label="${sb.t(A11Y_LABELS.backToChat)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="si18n-history-title">${sb.t(FLASHCARD_LABELS.title)}</span>
        <button class="si18n-history-clear" id="si18n-fc-reset" title="${sb.t(FLASHCARD_LABELS.reset)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        </button>
      </div>
      <div class="si18n-flashcard-container" id="si18n-fc-container">
        ${
          flashcardCards.length === 0
            ? `<div class="si18n-history-empty">${sb.t(FLASHCARD_LABELS.empty)}</div>`
            : renderFlashcard()
        }
      </div>
    `;

    document.getElementById('si18n-fc-back')?.addEventListener('click', closeFlashcardPanel);
    document.getElementById('si18n-fc-reset')?.addEventListener('click', () => {
      flashcardBoxes = {};
      flashcardIndex = 0;
      saveFlashcardProgress();
      refreshFlashcard();
    });
    bindFlashcardEvents();
  }

  function closeFlashcardPanel() {
    sb._chat.closeSubPanel();
  }

  // ============================================================
  // DECK BUILDING
  // ============================================================

  function loadFlashcardsForCourse() {
    const dict = sb.translator?.staticDict;
    if (!dict || Object.keys(dict).length === 0) return [];

    // Try to match current URL to a course for section-specific flashcards.
    // Sort slugs longest-first to prevent short slugs stealing matches
    // (e.g., 'ai-fluency' must not match 'ai-fluency-for-educators').
    const url = location.pathname.toLowerCase();
    let sections = null;
    _matchedCourseSlug = null;
    for (const [slug, sects] of FLASHCARD_COURSE_SLUGS_SORTED) {
      if (url.includes(slug)) {
        sections = sects;
        _matchedCourseSlug = slug;
        break;
      }
    }

    // If we matched a course, try loading section-specific vocabulary
    // from the raw JSON (premium-language dictionaries only — others get
    // the flattened staticDict fallback below).
    if (sections) {
      const lang = sb.currentLang;
      if (lang && lang !== 'en' && sb.translator?.premiumLanguages?.includes(lang)) {
        try {
          const jsonUrl = chrome.runtime.getURL(`src/data/${lang}.json`);
          // Invalidate cache if language changed.
          if (_rawSectionsCache && _rawSectionsLang !== lang) {
            _rawSectionsCache = null;
            _rawSectionsLang = null;
          }
          if (!_rawSectionsCache) {
            // Trigger async load and fall back to all entries for now.
            fetch(jsonUrl)
              .then((r) => r.json())
              .then((data) => {
                _rawSectionsCache = data;
                _rawSectionsLang = lang;
                // Re-run with warm cache and update panel.
                if (_state.flashcardPanelOpen) {
                  flashcardCards = loadFlashcardsForCourse();
                  flashcardIndex = 0;
                  refreshFlashcard();
                }
              })
              .catch(() => {});
          } else {
            const data = _rawSectionsCache;
            const sectionEntries = [];
            for (const sect of sections) {
              if (data[sect] && typeof data[sect] === 'object') {
                for (const [en, tr] of Object.entries(data[sect])) {
                  if (en !== tr && en.length >= 6 && tr.length >= 2) {
                    sectionEntries.push({ en, tr });
                  }
                }
              }
            }
            if (sectionEntries.length > 0) return sectionEntries;
          }
        } catch (_ignored) {
          /* fall through to all entries */
        }
      }
    }

    // Fallback: return all entries from staticDict.
    return Object.entries(dict)
      .filter(([k, v]) => k !== v && k.length >= 6 && v.length >= 2)
      .map(([en, tr]) => ({ en, tr }));
  }

  // ============================================================
  // RENDER + EVENTS
  // ============================================================

  function renderFlashcard() {
    if (flashcardCards.length === 0) return '';
    const card = flashcardCards[flashcardIndex];
    const box = flashcardBoxes[flashcardIndex] || 0;
    const boxLabelKeys = [FLASHCARD_LABELS.boxNew, FLASHCARD_LABELS.boxLearning, FLASHCARD_LABELS.mastered];
    const boxClasses = ['si18n-fc-new', 'si18n-fc-learning', 'si18n-fc-done'];
    const countByBox = [0, 0, 0];
    for (let i = 0; i < flashcardCards.length; i++) countByBox[flashcardBoxes[i] || 0]++;
    return `
      <div class="si18n-flashcard-card" id="si18n-fc-card" role="button" tabindex="0" aria-label="${sb.t(FLASHCARD_LABELS.flip)}">
        <div class="si18n-flashcard-inner">
          <div class="si18n-flashcard-front">${sb.escapeHtml(card.en)}</div>
          <div class="si18n-flashcard-back">${sb.escapeHtml(card.tr)}</div>
        </div>
      </div>
      <div class="si18n-flashcard-nav">
        <button class="si18n-fc-btn" id="si18n-fc-prev" ${flashcardIndex === 0 ? 'disabled' : ''}>${sb.t(FLASHCARD_LABELS.prev)}</button>
        <span class="si18n-flashcard-progress">${flashcardIndex + 1} / ${flashcardCards.length}</span>
        <button class="si18n-fc-btn" id="si18n-fc-next" ${flashcardIndex >= flashcardCards.length - 1 ? 'disabled' : ''}>${sb.t(FLASHCARD_LABELS.next)}</button>
      </div>
      <div class="si18n-fc-box-controls">
        <button class="si18n-fc-box-btn si18n-fc-new" id="si18n-fc-box-down">✗</button>
        <span class="si18n-fc-box-label ${boxClasses[box]}">${sb.t(boxLabelKeys[box])}</span>
        <button class="si18n-fc-box-btn si18n-fc-done" id="si18n-fc-box-up">✓</button>
      </div>
      <div class="si18n-fc-stats">
        <span class="si18n-fc-new">${sb.t(FLASHCARD_LABELS.boxNew)}: ${countByBox[0]}</span>
        <span class="si18n-fc-learning">${sb.t(FLASHCARD_LABELS.boxLearning)}: ${countByBox[1]}</span>
        <span class="si18n-fc-done">${sb.t(FLASHCARD_LABELS.mastered)}: ${countByBox[2]}</span>
      </div>
    `;
  }

  function refreshFlashcard() {
    const container = document.getElementById('si18n-fc-container');
    if (!container) return;
    container.innerHTML =
      flashcardCards.length === 0
        ? `<div class="si18n-history-empty">${sb.t(FLASHCARD_LABELS.empty)}</div>`
        : renderFlashcard();
    bindFlashcardEvents();
  }

  function bindFlashcardEvents() {
    const card = document.getElementById('si18n-fc-card');
    card?.addEventListener('click', () => card.classList.toggle('si18n-card-flipped'));
    card?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.classList.toggle('si18n-card-flipped');
      }
    });
    document.getElementById('si18n-fc-prev')?.addEventListener('click', () => {
      if (flashcardIndex > 0) {
        flashcardIndex--;
        saveFlashcardProgress();
        refreshFlashcard();
      }
    });
    document.getElementById('si18n-fc-next')?.addEventListener('click', () => {
      if (flashcardIndex < flashcardCards.length - 1) {
        flashcardIndex++;
        saveFlashcardProgress();
        refreshFlashcard();
      }
    });
    document.getElementById('si18n-fc-box-up')?.addEventListener('click', () => {
      const cur = flashcardBoxes[flashcardIndex] || 0;
      flashcardBoxes[flashcardIndex] = Math.min(cur + 1, 2);
      saveFlashcardProgress();
      // Auto-advance to next card after marking.
      if (flashcardIndex < flashcardCards.length - 1) flashcardIndex++;
      refreshFlashcard();
    });
    document.getElementById('si18n-fc-box-down')?.addEventListener('click', () => {
      flashcardBoxes[flashcardIndex] = 0;
      saveFlashcardProgress();
      if (flashcardIndex < flashcardCards.length - 1) flashcardIndex++;
      refreshFlashcard();
    });
  }

  // ============================================================
  // PERSISTENCE (chrome.storage.local)
  // ============================================================

  function _flashcardStorageKey() {
    const slug = _matchedCourseSlug || 'all';
    return `fc_${slug}_${sb.currentLang}`;
  }

  // Serialize flashcard writes through a single promise chain. chrome.storage
  // .set is async with no ordering guarantee across in-flight calls, so
  // rapid box-up/box-down clicks could interleave and resurrect cleared
  // boxes. The chain forces last-clicked-wins semantics.
  let _flashcardSaveQueue = Promise.resolve();

  function saveFlashcardProgress() {
    const key = _flashcardStorageKey();
    const stableBoxes = {};
    for (const [idx, box] of Object.entries(flashcardBoxes)) {
      const card = flashcardCards[idx];
      if (card) stableBoxes[card.en] = box;
    }
    const data = {};
    data[key] = { boxes: stableBoxes, index: flashcardIndex };
    _flashcardSaveQueue = _flashcardSaveQueue
      .catch(() => {}) // a prior failure shouldn't block the next write
      .then(() => new Promise((resolve) => chrome.storage.local.set(data, resolve)));
  }

  function loadFlashcardProgress() {
    const key = _flashcardStorageKey();
    chrome.storage.local.get([key], (result) => {
      const saved = result[key];
      flashcardBoxes = {};
      if (saved?.boxes) {
        // Restore by matching english text back to current card indices.
        for (let i = 0; i < flashcardCards.length; i++) {
          const box = saved.boxes[flashcardCards[i].en];
          if (box !== undefined) flashcardBoxes[i] = box;
        }
      }
      if (saved?.index != null && saved.index < flashcardCards.length) {
        flashcardIndex = saved.index;
      }
      refreshFlashcard();
    });
  }

  // ============================================================
  // EXPORT
  // ============================================================

  // `sb.toggleFlashcardPanel` is the back-compat handle keyboard-
  // shortcuts.js was already using. `sb._chat.toggleFlashcardPanel`
  // mirrors `sb._chat.toggleHistoryPanel` from chat-history.js for
  // consistency.
  sb.toggleFlashcardPanel = toggleFlashcardPanel;
  sb._chat.toggleFlashcardPanel = toggleFlashcardPanel;
})();
