/**
 * SkillBridge — Keyboard Shortcuts
 * Accesses shared state via window._sb namespace.
 */

(function () {
  'use strict';

  const sb = window._sb;
  let helpOverlayVisible = false;

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const MOD_LABEL = isMac ? '\u2318' : 'Ctrl';

  const SHORTCUTS = [
    { key: 's', ctrl: true, shift: true, action: 'toggleSidebar',
      label: SHORTCUT_DESCRIPTIONS.toggleSidebar },
    { key: 'l', ctrl: true, shift: true, action: 'toggleDarkMode',
      label: SHORTCUT_DESCRIPTIONS.toggleDarkMode },
    { key: '/', ctrl: true, shift: true, action: 'showHelp',
      label: SHORTCUT_DESCRIPTIONS.showHelp },
    { key: 'Escape', action: 'close',
      label: SHORTCUT_DESCRIPTIONS.close },
    { key: '/', action: 'focusChat',
      label: SHORTCUT_DESCRIPTIONS.focusChat },
  ];

  // ============================================================
  // KEY HANDLER
  // ============================================================

  function handleKeydown(e) {
    const isInput = e.target.matches('input, textarea, select, [contenteditable]');
    const ctrl = isMac ? e.metaKey : e.ctrlKey;

    // Ctrl/Cmd + Shift + S → Toggle sidebar
    if (ctrl && e.shiftKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      sb.toggleSidebar?.();
      return;
    }

    // Ctrl/Cmd + Shift + L → Toggle dark mode
    if (ctrl && e.shiftKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      document.getElementById('si18n-dark-toggle')?.click();
      return;
    }

    // Ctrl/Cmd + Shift + / → Shortcuts help
    // Use e.code because Shift+/ produces '?' on US keyboards (e.key unreliable)
    if (ctrl && e.shiftKey && e.code === 'Slash') {
      e.preventDefault();
      toggleHelpOverlay();
      return;
    }

    // Escape → Close help overlay or sidebar
    if (e.key === 'Escape') {
      if (helpOverlayVisible) { hideHelpOverlay(); return; }
      if (sb.sidebarVisible) { sb.toggleSidebar?.(); return; }
      return;
    }

    // / → Focus chat input (only when sidebar open, not in input)
    if (e.key === '/' && !isInput && !ctrl && !e.metaKey && !e.shiftKey && !e.altKey) {
      if (sb.sidebarVisible) {
        e.preventDefault();
        document.getElementById('si18n-chat-input')?.focus();
      }
    }
  }

  // ============================================================
  // HELP OVERLAY
  // ============================================================

  function toggleHelpOverlay() {
    helpOverlayVisible ? hideHelpOverlay() : showHelpOverlay();
  }

  function showHelpOverlay() {
    if (document.getElementById('si18n-shortcuts-overlay')) return;
    helpOverlayVisible = true;

    const overlay = document.createElement('div');
    overlay.id = 'si18n-shortcuts-overlay';
    overlay.innerHTML = `
      <div class="si18n-shortcuts-panel">
        <div class="si18n-shortcuts-header">
          <span>${sb.t(SHORTCUT_LABELS.title)}</span>
          <button class="si18n-shortcuts-close">&times;</button>
        </div>
        <div class="si18n-shortcuts-body">
          ${SHORTCUTS.map(s => `
            <div class="si18n-shortcut-row">
              <span class="si18n-shortcut-desc">${sb.t(s.label)}</span>
              <kbd class="si18n-shortcut-key">${formatKey(s)}</kbd>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) hideHelpOverlay();
    });
    overlay.querySelector('.si18n-shortcuts-close')?.addEventListener('click', hideHelpOverlay);

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));
  }

  function hideHelpOverlay() {
    const overlay = document.getElementById('si18n-shortcuts-overlay');
    if (!overlay) return;
    helpOverlayVisible = false;
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 200);
  }

  function formatKey(shortcut) {
    const parts = [];
    if (shortcut.ctrl) parts.push(MOD_LABEL);
    if (shortcut.shift) parts.push('Shift');
    const display = shortcut.key === 'Escape' ? 'Esc' :
                    shortcut.key === '/' ? '/' :
                    shortcut.key.toUpperCase();
    parts.push(display);
    return parts.join(' + ');
  }

  // Initialize
  document.addEventListener('keydown', handleKeydown);

  // Export
  sb.toggleShortcutsHelp = toggleHelpOverlay;
})();
