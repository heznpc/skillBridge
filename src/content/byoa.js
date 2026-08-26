/**
 * SkillBridge — Ask another assistant (Tools ▸ Ask another assistant).
 *
 * Some learners already pay for Claude, ChatGPT or Gemini; some workplaces
 * forbid a third AI service in the loop. The built-in Tutor answers neither
 * case, and the honest response is not another integration — it is to assemble
 * what an assistant would need, hand it over, and stop.
 *
 * So this panel does exactly three things: it shows the prompt, it copies the
 * prompt, and it opens a blank chat. What it deliberately does NOT do is the
 * more important half:
 *
 *   - No automation or scraping of those services. Nothing is typed into them,
 *     no page of theirs is read, no request is made on the learner's behalf.
 *   - Nothing goes in a URL. A deep link carrying the lesson text would put it
 *     in browser history and in every log in front of that host, which is
 *     precisely what the clipboard step exists to avoid.
 *   - A consumer chat login is not a credential. Signing in to claude.ai gives
 *     a person a session, not this extension an API key, and nothing here
 *     reads, stores or reuses one.
 *
 * The prompt is always visible before it is copied. "I could not see what I
 * was about to send" is the complaint this feature answers, so a hidden
 * payload would defeat it.
 *
 * Loaded after chat-subpanels.js (for `_sb._chat.openSubPanel`) and after
 * text-selection.js, whose exam guard it shares.
 */

(function () {
  'use strict';

  const sb = window._sb;
  if (!sb) {
    console.warn('[SkillBridge] byoa: _sb not ready');
    return;
  }
  if (!sb._chat || !sb._chat.state || !sb._chat.openSubPanel) {
    console.warn('[SkillBridge] byoa: _sb._chat not ready (chat-subpanels.js missing?)');
    return;
  }

  const bundleLib = window._sbByoaBundle;

  /** The learner's current selection, if it is one we are allowed to carry. */
  function readSelection() {
    const sel = window.getSelection();
    const text = sel && !sel.isCollapsed ? sel.toString().trim() : '';
    if (!text) return { text: '', withheld: false };
    // The same verdict the Ask Tutor quote uses — one implementation, in
    // src/lib/exam-selection.js, over the same EXAM_SKIP_SELECTORS list the
    // translation chokepoint reads. A learner can always select and copy by
    // hand; what must not exist is a button of ours that does it for them.
    const withheld = !!window._sbExamSelection?.selectionIsWithheld(sel, {
      isExamPage: sb.isExamPage,
      selectors: EXAM_SKIP_SELECTORS,
    });
    return { text: withheld ? '' : text, withheld };
  }

  /** Assemble the prompt for the page as it is right now. */
  function currentBundle(question) {
    const selection = readSelection();
    const lang = sb.currentLang || 'en';
    const promptLabels = Object.fromEntries(
      Object.entries(BYOA_PROMPT_LABELS).map(([key, map]) => [key, map[lang] || map.en]),
    );
    return bundleLib.buildContextBundle({
      title: (document.querySelector('h1') || {}).textContent?.trim() || document.title || '',
      url: location.href,
      langName: sb.translator?.supportedLanguages?.[lang] || 'English',
      // The SAME context object the Tutor is given, not a second extraction of
      // the page. On an assessment page it has already dropped the lesson body,
      // which is where the answer choices live.
      pageContext: sb.getPageContext ? sb.getPageContext() : '',
      selection: selection.text,
      selectionWithheld: selection.withheld,
      isExamPage: !!sb.isExamPage,
      question,
      labels: promptLabels,
    });
  }

  // ============================================================
  // PANEL
  // ============================================================

  function assistantButtonsHTML() {
    return bundleLib.BYOA_ASSISTANTS.map(
      (a) => `
        <button class="si18n-byoa-open" data-assistant="${sb.escapeHtml(a.id)}" type="button">
          ${sb.escapeHtml(sb.t(BYOA_LABELS.openIn))} ${sb.escapeHtml(a.name)}
        </button>`,
    ).join('');
  }

  function toggleByoaPanel() {
    const opened = sb._chat.openSubPanel(
      'byoa',
      `
      <div class="si18n-history-header">
        <button class="si18n-history-back" id="si18n-byoa-back" aria-label="${sb.t(A11Y_LABELS.backToSidebar)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg></button>
        <span class="si18n-history-title">${sb.t(BYOA_LABELS.title)}</span>
      </div>
      <div class="si18n-byoa">
        <p class="si18n-byoa-explain">${sb.escapeHtml(sb.t(BYOA_LABELS.explain))}</p>
        <div id="si18n-byoa-notes" class="si18n-byoa-notes" role="status" aria-live="polite"></div>
        <input id="si18n-byoa-question" class="si18n-chat-input si18n-byoa-question" type="text"
               placeholder="${sb.escapeHtml(sb.t(BYOA_LABELS.questionPlaceholder))}" />
        <textarea id="si18n-byoa-preview" class="si18n-chat-input si18n-byoa-preview" rows="8" readonly
                  aria-label="${sb.escapeHtml(sb.t(BYOA_LABELS.title))}"></textarea>
        <div class="si18n-byoa-actions">
          <button class="si18n-chat-send-btn" id="si18n-byoa-copy" type="button">${sb.escapeHtml(sb.t(BYOA_LABELS.copy))}</button>
        </div>
        <div class="si18n-byoa-assistants">${assistantButtonsHTML()}</div>
      </div>
    `,
      bindPanelEvents,
    );
    if (!opened) return;
    refreshPreview();
  }

  function bindPanelEvents() {
    sb.$id('si18n-byoa-back')?.addEventListener('click', () => sb._chat.closeSubPanel());
    sb.$id('si18n-byoa-question')?.addEventListener('input', refreshPreview);
    sb.$id('si18n-byoa-copy')?.addEventListener('click', copyPrompt);
    for (const btn of sb.$id('si18n-byoa-preview')?.parentElement?.querySelectorAll('.si18n-byoa-open') || []) {
      btn.addEventListener('click', () => openAssistant(btn.dataset.assistant));
    }
  }

  function refreshPreview() {
    if (!bundleLib) return;
    const question = sb.$id('si18n-byoa-question')?.value || '';
    const built = currentBundle(question);
    const preview = sb.$id('si18n-byoa-preview');
    if (preview) preview.value = built.text;

    // What was left out, said plainly. An omission the learner cannot see is
    // the same as a silent one.
    const notes = sb.$id('si18n-byoa-notes');
    if (!notes) return;
    const messages = [];
    if (built.omissions.includes(bundleLib.BYOA_OMISSION.ASSESSMENT)) messages.push(sb.t(BYOA_LABELS.examNote));
    if (built.omissions.includes(bundleLib.BYOA_OMISSION.SELECTION_WITHHELD)) {
      messages.push(sb.t(BYOA_LABELS.selectionWithheld));
    }
    if (built.omissions.includes(bundleLib.BYOA_OMISSION.TRUNCATED)) messages.push(sb.t(BYOA_LABELS.truncated));
    notes.replaceChildren();
    for (const message of messages) {
      const line = document.createElement('div');
      line.className = 'si18n-byoa-note';
      line.textContent = message;
      notes.appendChild(line);
    }
  }

  async function copyPrompt() {
    const preview = sb.$id('si18n-byoa-preview');
    const button = sb.$id('si18n-byoa-copy');
    const text = preview?.value || '';
    if (!text) return;
    const say = (label) => {
      if (!button) return;
      button.textContent = label;
      setTimeout(() => {
        button.textContent = sb.t(BYOA_LABELS.copy);
      }, 2000);
    };
    try {
      await navigator.clipboard.writeText(text);
      say(sb.t(BYOA_LABELS.copied));
    } catch (_e) {
      // Clipboard access can be refused by policy or by a missing secure
      // context. The prompt is on screen and selectable either way, so say so
      // rather than failing silently and leaving the learner with nothing.
      say(sb.t(BYOA_LABELS.copyFailed));
      preview?.focus();
      preview?.select();
    }
  }

  function openAssistant(id) {
    const assistant = bundleLib.BYOA_ASSISTANTS.find((a) => a.id === id);
    if (!assistant) return;
    // A blank chat, and nothing else: no query parameter, no prefill, no
    // content in the URL. `noopener` so the opened tab gets no handle back to
    // the course page.
    window.open(assistant.url, '_blank', 'noopener,noreferrer');
  }

  // ============================================================
  // EXPORT
  // ============================================================

  sb.toggleByoaPanel = toggleByoaPanel;
  sb._chat.toggleByoaPanel = toggleByoaPanel;
  // Exposed for tests and for the panel's own refresh; not a transmission path.
  sb._byoa = { currentBundle, readSelection };
  sb.registerModule?.('byoa');
})();
