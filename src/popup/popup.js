/**
 * SkillBridge for Anthropic Academy - Popup Script
 * Uses shared constants from constants.js (loaded via <script> in popup.html).
 */

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isSkilljar = tab?.url?.includes('skilljar.com');

  document.getElementById('main-content').style.display = isSkilljar ? 'block' : 'none';
  document.getElementById('not-skilljar').style.display = isSkilljar ? 'none' : 'block';

  // Footer from model constants
  document.getElementById('footer').innerHTML =
    `Google Translate + ${SKILLBRIDGE_MODEL_LABELS.GEMINI}<br>AI Tutor: ${SKILLBRIDGE_MODEL_LABELS.CLAUDE}`;

  if (!isSkilljar) return;

  const stored = await chrome.storage.local.get(['targetLanguage', 'autoTranslate']);
  const lang = stored.targetLanguage || 'en';

  function t(map) { return map[lang] || map['en']; }

  // Build language select dynamically from constants
  const langSelect = document.getElementById('lang-select');
  buildLanguageOptions(langSelect, t);
  langSelect.value = lang;

  // Apply i18n labels
  document.getElementById('lang-label').textContent = t(POPUP_LABELS.targetLang);
  const sidebarBtn = document.getElementById('sidebar-btn');
  sidebarBtn.textContent = t(POPUP_LABELS.openSidebar);
  document.getElementById('auto-translate-label').textContent = t(POPUP_LABELS.autoTranslate);

  const autoTranslate = document.getElementById('auto-translate');
  const status = document.getElementById('status');

  if (stored.autoTranslate) autoTranslate.checked = true;

  function safeSendMessage(tabId, message, callback) {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[Popup] Message failed:', chrome.runtime.lastError.message);
          showStatus(t(POPUP_LABELS.refreshPage), 'error');
          if (callback) callback(null);
          return;
        }
        if (callback) callback(response);
      });
    } catch (e) {
      console.warn('[Popup] sendMessage error:', e);
      showStatus(t(POPUP_LABELS.refreshPage), 'error');
    }
  }

  // Language change → immediate translate (same behavior as header selector)
  langSelect.addEventListener('change', () => {
    const newLang = langSelect.value;
    chrome.storage.local.set({ targetLanguage: newLang, autoTranslate: newLang !== 'en' });
    safeSendMessage(tab.id, { action: 'setLanguage', language: newLang });
    autoTranslate.checked = newLang !== 'en';
  });

  // Sidebar button
  sidebarBtn.addEventListener('click', () => {
    safeSendMessage(tab.id, { action: 'toggleSidebar' });
    window.close();
  });

  // Auto-translate toggle
  autoTranslate.addEventListener('change', () => {
    chrome.storage.local.set({ autoTranslate: autoTranslate.checked });
  });

  // Code comment translation toggle
  const commentTranslate = document.getElementById('comment-translate');
  const commentLabel = document.getElementById('comment-translate-label');
  if (commentLabel) commentLabel.textContent = t(COMMENT_TRANSLATE_LABELS);

  chrome.storage.local.get(['commentTranslate'], (result) => {
    if (result.commentTranslate) commentTranslate.checked = true;
  });

  commentTranslate.addEventListener('change', () => {
    chrome.storage.local.set({ commentTranslate: commentTranslate.checked });
    safeSendMessage(tab.id, { action: 'toggleCommentTranslation', enabled: commentTranslate.checked });
  });

  function showStatus(text, type) {
    status.textContent = text;
    status.className = `status ${type}`;
    if (type) setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 4000);
  }
});

function buildLanguageOptions(select, t) {
  // English (always first, outside groups)
  const enOpt = document.createElement('option');
  enOpt.value = 'en';
  enOpt.textContent = t(POPUP_LABELS.englishOriginal);
  select.appendChild(enOpt);

  // Premium tier
  const premiumGroup = document.createElement('optgroup');
  premiumGroup.label = t(POPUP_LABELS.premiumTier);
  for (const lang of PREMIUM_LANGUAGES) {
    const opt = document.createElement('option');
    opt.value = lang.code;
    opt.textContent = lang.label;
    premiumGroup.appendChild(opt);
  }
  select.appendChild(premiumGroup);

  // Standard tier (non-premium, non-English)
  const standardGroup = document.createElement('optgroup');
  standardGroup.label = t(POPUP_LABELS.standardTier);
  for (const lang of AVAILABLE_LANGUAGES) {
    if (lang.code === 'en' || PREMIUM_LANGUAGE_CODES.includes(lang.code)) continue;
    const opt = document.createElement('option');
    opt.value = lang.code;
    opt.textContent = lang.label;
    standardGroup.appendChild(opt);
  }
  select.appendChild(standardGroup);
}
