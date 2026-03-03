/**
 * Skilljar i18n Assistant - Popup Script
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

  // Language change
  langSelect.addEventListener('change', () => {
    chrome.storage.local.set({ targetLanguage: langSelect.value });
    chrome.tabs.sendMessage(tab.id, { action: 'setLanguage', language: langSelect.value });
  });

  // Translate button
  document.getElementById('translate-btn').addEventListener('click', async () => {
    const lang = langSelect.value;
    if (lang === 'en') {
      chrome.tabs.sendMessage(tab.id, { action: 'restoreOriginal' });
      showStatus('Restored to English', 'success');
    } else {
      showStatus('Translating...', '');
      chrome.tabs.sendMessage(tab.id, { action: 'translatePage', language: lang }, (response) => {
        showStatus(response?.success ? 'Translation complete!' : 'Translation error', response?.success ? 'success' : 'error');
      });
    }
  });

  // Restore button
  document.getElementById('restore-btn').addEventListener('click', () => {
    chrome.tabs.sendMessage(tab.id, { action: 'restoreOriginal' });
    showStatus('Restored to original', 'success');
  });

  // Sidebar button
  document.getElementById('sidebar-btn').addEventListener('click', () => {
    chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' });
    window.close();
  });

  // Auto-translate toggle
  autoTranslate.addEventListener('change', () => {
    chrome.storage.local.set({ autoTranslate: autoTranslate.checked });
  });

  function showStatus(text, type) {
    status.textContent = text;
    status.className = `status ${type}`;
    if (type) setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 3000);
  }
});
