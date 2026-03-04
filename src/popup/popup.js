/**
 * SkillBridge for Anthropic Academy - Popup Script
 */

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isSkilljar = tab?.url?.includes('skilljar.com');

  document.getElementById('main-content').style.display = isSkilljar ? 'block' : 'none';
  document.getElementById('not-skilljar').style.display = isSkilljar ? 'none' : 'block';

  if (!isSkilljar) return;

  // Load saved settings
  const stored = await chrome.storage.local.get(['targetLanguage', 'autoTranslate']);
  const langSelect = document.getElementById('lang-select');
  const autoTranslate = document.getElementById('auto-translate');
  const status = document.getElementById('status');

  if (stored.targetLanguage) langSelect.value = stored.targetLanguage;
  if (stored.autoTranslate) autoTranslate.checked = true;

  /**
   * Safe message sender - handles "Receiving end does not exist" gracefully
   */
  function safeSendMessage(tabId, message, callback) {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[Popup] Message failed:', chrome.runtime.lastError.message);
          showStatus('Please refresh the Skilljar page first', 'error');
          if (callback) callback(null);
          return;
        }
        if (callback) callback(response);
      });
    } catch (e) {
      console.warn('[Popup] sendMessage error:', e);
      showStatus('Please refresh the Skilljar page first', 'error');
    }
  }

  // Language change
  langSelect.addEventListener('change', () => {
    chrome.storage.local.set({ targetLanguage: langSelect.value });
    safeSendMessage(tab.id, { action: 'setLanguage', language: langSelect.value });
  });

  // Translate button
  document.getElementById('translate-btn').addEventListener('click', () => {
    const lang = langSelect.value;
    if (lang === 'en') {
      safeSendMessage(tab.id, { action: 'restoreOriginal' }, () => {
        showStatus('Restored to English', 'success');
      });
    } else {
      showStatus('Translating...', '');
      safeSendMessage(tab.id, { action: 'translatePage', language: lang }, (response) => {
        if (response?.success) {
          showStatus('Translation started!', 'success');
        } else if (response === null) {
          // Error already shown by safeSendMessage
        } else {
          showStatus('Translation error', 'error');
        }
      });
    }
  });

  // Restore button
  document.getElementById('restore-btn').addEventListener('click', () => {
    safeSendMessage(tab.id, { action: 'restoreOriginal' }, () => {
      showStatus('Restored to original', 'success');
    });
  });

  // Sidebar button
  document.getElementById('sidebar-btn').addEventListener('click', () => {
    safeSendMessage(tab.id, { action: 'toggleSidebar' });
    window.close();
  });

  // Auto-translate toggle
  autoTranslate.addEventListener('change', () => {
    chrome.storage.local.set({ autoTranslate: autoTranslate.checked });
  });

  function showStatus(text, type) {
    status.textContent = text;
    status.className = `status ${type}`;
    if (type) setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 4000);
  }
});
