/**
 * SkillBridge — AI Course Translator - Popup Script
 * Uses shared constants from constants.js (loaded via <script> in popup.html).
 */

// Hostname-exact / suffix match against `skilljar.com`. The previous
// substring check matched `evil.skilljar.com.attacker.example/` and
// `prefix-skilljar.com/`, both of which CodeQL flagged
// (`js/incomplete-url-substring-sanitization`, HIGH). URL checks still need
// exact host parsing whenever Chrome exposes tab.url; scoped content-script
// matches such as Claude tutorials use the extension-owned ping fallback below.
function isSkilljarHost(url) {
  try {
    const host = new URL(url).hostname;
    return host === 'skilljar.com' || host.endsWith('.skilljar.com');
  } catch {
    return false;
  }
}

function isClaudeTutorialUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'claude.com' && parsed.pathname.startsWith('/resources/tutorials/');
  } catch {
    return false;
  }
}

function isSupportedPage(url) {
  return isSkilljarHost(url) || isClaudeTutorialUrl(url);
}

function pingContentScript(tabId) {
  return new Promise((resolve) => {
    if (!Number.isInteger(tabId)) return resolve(false);
    try {
      chrome.tabs.sendMessage(tabId, { action: 'ping' }, (response) => {
        const failed = chrome.runtime.lastError;
        resolve(!failed && !!response && typeof response.ready === 'boolean');
      });
    } catch (_err) {
      resolve(false);
    }
  });
}

async function hasSkillBridgeContentScript(tabId) {
  // claude.com is intentionally scoped through content_scripts.matches rather
  // than a broad host permission. Chrome may therefore omit tab.url from the
  // popup's query result. Probe our own content script instead, with a short
  // document_idle retry window for a just-opened tutorial.
  for (let attempt = 0; attempt < 6; attempt++) {
    if (await pingContentScript(tabId)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

// `=== true`, not `!== false`: popup.html loads ../shared/build-config.js
// before this file, so the flag is always an explicit boolean here. Treating an
// absent flag as enabled would surface the Tutor engine selector in a build
// that has no Tutor transport.
const _POPUP_AI_GATEWAY_ENABLED = globalThis.__SKILLBRIDGE_AI_GATEWAY_ENABLED__ === true;

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isSupported = isSupportedPage(tab?.url) || (await hasSkillBridgeContentScript(tab?.id));

  document.getElementById('main-content').style.display = isSupported ? 'block' : 'none';
  document.getElementById('not-skilljar').style.display = isSupported ? 'none' : 'block';

  // Footer from model constants
  document.getElementById('footer').innerHTML = _POPUP_AI_GATEWAY_ENABLED
    ? `Google Translate + curated terminology<br>AI Tutor: ${SKILLBRIDGE_MODEL_LABELS.CLAUDE}`
    : 'Google Translate<br>Local learning tools';

  if (!isSupported) return;

  const stored = await chrome.storage.local.get(['targetLanguage', 'autoTranslate']);
  let lang = stored.targetLanguage || 'en';

  function t(map) {
    return map[lang] || map['en'];
  }

  // Build language select dynamically from constants
  const langSelect = document.getElementById('lang-select');
  const sidebarBtn = document.getElementById('sidebar-btn');
  const autoTranslate = document.getElementById('auto-translate');
  const status = document.getElementById('status');
  const commentTranslate = document.getElementById('comment-translate');
  const commentLabel = document.getElementById('comment-translate-label');

  // Which ENGINE_LABELS map the local-engine status line is currently showing,
  // so a language change re-renders it too. Declared up here because
  // renderPopupLabels() runs before the engine block below is initialized.
  let localStatusMap = null;

  function renderPopupLabels() {
    const selectedLang = langSelect.value || lang;
    langSelect.textContent = '';
    buildLanguageOptions(langSelect, t);
    langSelect.value = selectedLang;
    document.getElementById('lang-label').textContent = t(POPUP_LABELS.targetLang);
    sidebarBtn.textContent = _POPUP_AI_GATEWAY_ENABLED ? t(POPUP_LABELS.openSidebar) : t(MENU_LABELS.tools);
    document.getElementById('auto-translate-label').textContent = t(POPUP_LABELS.autoTranslate);
    if (commentLabel) commentLabel.textContent = t(COMMENT_TRANSLATE_LABELS);
    if (_POPUP_AI_GATEWAY_ENABLED) renderEngineLabels();
  }

  renderPopupLabels();
  langSelect.value = lang;

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
    lang = newLang;
    chrome.storage.local.set({ targetLanguage: newLang, autoTranslate: newLang !== 'en' });
    safeSendMessage(tab.id, { action: 'setLanguage', language: newLang });
    renderPopupLabels();
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
  chrome.storage.local.get(['commentTranslate'], (result) => {
    if (result.commentTranslate) commentTranslate.checked = true;
  });

  commentTranslate.addEventListener('change', () => {
    chrome.storage.local.set({ commentTranslate: commentTranslate.checked });
    safeSendMessage(tab.id, { action: 'toggleCommentTranslation', enabled: commentTranslate.checked });
  });

  // AI tutor engine selector (cloud / local / off) — only when the AI gateway
  // is bundled. `local` reveals the on-device (Ollama / OpenAI-compatible) config.
  const engineField = document.getElementById('engine-field');
  const engineSelect = document.getElementById('engine-select');
  const localConfig = document.getElementById('local-config');
  const localBaseInput = document.getElementById('local-base-input');
  const localModelInput = document.getElementById('local-model-input');

  const refineField = document.getElementById('refine-field');
  const refineSelect = document.getElementById('refine-select');
  const refineConsentRow = document.getElementById('refine-consent-row');
  const refineConsent = document.getElementById('refine-consent');

  function renderRefineLabels() {
    document.getElementById('refine-label').textContent = t(REFINE_LABELS.refineLabel);
    document.getElementById('refine-opt-off').textContent = t(REFINE_LABELS.refineOff);
    document.getElementById('refine-opt-cloud').textContent = t(REFINE_LABELS.refineCloud);
    document.getElementById('refine-opt-local').textContent = t(REFINE_LABELS.refineLocal);
    document.getElementById('refine-opt-follow').textContent = t(REFINE_LABELS.refineFollow);
    document.getElementById('refine-consent-label').textContent = t(REFINE_LABELS.refineConsent);
    document.getElementById('refine-consent-hint').textContent = t(REFINE_LABELS.refineConsentHint);
    document.getElementById('refine-hint').textContent = t(REFINE_LABELS.refineHint);
  }

  /**
   * The consent checkbox is only shown once a non-off mode is selected.
   *
   * Asking for consent to a thing the user has just declined would be a nag,
   * and a checkbox visible while the mode is off invites the belief that
   * ticking it turns something on. It does not — both are required, and the
   * runtime checks the mode first.
   */
  function syncRefineConsentVisibility() {
    refineConsentRow.style.display = refineSelect.value === 'off' ? 'none' : 'flex';
  }

  function renderEngineLabels() {
    document.getElementById('engine-label').textContent = t(ENGINE_LABELS.engineLabel);
    document.getElementById('engine-opt-cloud').textContent = t(ENGINE_LABELS.cloudOption);
    document.getElementById('engine-opt-local').textContent = t(ENGINE_LABELS.localOption);
    document.getElementById('engine-opt-off').textContent = t(ENGINE_LABELS.offOption);
    document.getElementById('local-base-label').textContent = t(ENGINE_LABELS.localBaseUrl);
    document.getElementById('local-model-label').textContent = t(ENGINE_LABELS.localModel);
    document.getElementById('on-device-hint').textContent = t(ENGINE_LABELS.onDeviceHint);
    document.getElementById('hardware-hint').textContent = t(ENGINE_LABELS.hardwareHint);
    // Re-render the live status line in the new language too. Looked up by id
    // (not the const below) so this is safe on the pre-engine-block call.
    const statusEl = document.getElementById('local-status');
    if (localStatusMap && statusEl) statusEl.textContent = t(localStatusMap);
  }

  const localStatus = document.getElementById('local-status');
  const LOCALHOST_ORIGINS = ['http://localhost/*', 'http://127.0.0.1/*'];

  function syncLocalConfigVisibility() {
    localConfig.style.display = engineSelect.value === 'local' ? 'block' : 'none';
  }

  function setLocalStatus(map) {
    localStatusMap = map || null;
    localStatus.textContent = localStatusMap ? t(localStatusMap) : '';
  }

  // The SW is the only context that can fetch localhost cross-origin, so it
  // classifies reachability: ok / cors / unreachable. Requires the optional
  // localhost host permission first (granted from the select's user gesture).
  async function probeLocalEngine() {
    const baseUrl = localBaseInput.value.trim() || undefined;
    setLocalStatus(ENGINE_LABELS.statusChecking);
    let result;
    try {
      result = await chrome.runtime.sendMessage({ type: 'CHECK_LOCAL_ENGINE', baseUrl });
    } catch {
      result = { status: 'unreachable' };
    }
    if (!result || result.status === 'unreachable' || result.status === 'error') {
      setLocalStatus(ENGINE_LABELS.statusUnreachable);
    } else if (result.status === 'cors') {
      setLocalStatus(ENGINE_LABELS.statusCors);
    } else if (result.status === 'ok') {
      setLocalStatus(ENGINE_LABELS.statusOk);
    }
  }

  // `previousEngine` is what we fall back to when the user declines the
  // localhost prompt: persisting 'local' without the permission would route
  // every later tutor message into a fetch that can never succeed, and the
  // reopened popup would show Local selected with no explanation.
  async function ensureLocalPermissionAndProbe(previousEngine) {
    let granted;
    try {
      granted = await chrome.permissions.request({ origins: LOCALHOST_ORIGINS });
    } catch {
      granted = false;
    }
    if (!granted) {
      const revertTo = previousEngine && previousEngine !== 'local' ? previousEngine : 'cloud';
      engineSelect.value = revertTo;
      await chrome.storage.local.set({ sb_ai_engine: revertTo });
      setLocalStatus(null);
      syncLocalConfigVisibility();
      // The local config (and its status line) is hidden again by the revert,
      // so the explanation goes to the always-visible status row.
      showStatus(t(ENGINE_LABELS.permDenied), 'error');
      return;
    }
    await probeLocalEngine();
  }

  if (_POPUP_AI_GATEWAY_ENABLED) {
    engineField.style.display = 'block';
    renderEngineLabels();
    const eng = await chrome.storage.local.get(['sb_ai_engine', 'sb_local_base', 'sb_local_model']);
    engineSelect.value = eng.sb_ai_engine || 'cloud';
    localBaseInput.value = eng.sb_local_base || '';
    localModelInput.value = eng.sb_local_model || '';
    syncLocalConfigVisibility();

    let currentEngine = engineSelect.value;
    engineSelect.addEventListener('change', () => {
      const previousEngine = currentEngine;
      currentEngine = engineSelect.value;
      chrome.storage.local.set({ sb_ai_engine: engineSelect.value });
      syncLocalConfigVisibility();
      setLocalStatus(null);
      if (engineSelect.value === 'local') {
        ensureLocalPermissionAndProbe(previousEngine).then(() => {
          currentEngine = engineSelect.value;
        });
      }
    });
    // Persist trimmed values; empty falls back to the SW defaults. A changed
    // base URL re-probes (permission already held once local was selected).
    localBaseInput.addEventListener('change', () => {
      chrome.storage.local.set({ sb_local_base: localBaseInput.value.trim() });
      if (engineSelect.value === 'local') probeLocalEngine();
    });
    localModelInput.addEventListener('change', () => {
      chrome.storage.local.set({ sb_local_model: localModelInput.value.trim() });
    });

    refineField.style.display = 'block';
    renderRefineLabels();
    const refinePrefs = await chrome.storage.local.get(['sb_refine_mode', 'sb_refine_consent']);
    // Default off, and `=== true` for the consent: an absent value is not
    // consent, and treating it as one is how an opt-in becomes an opt-out.
    refineSelect.value = refinePrefs.sb_refine_mode || 'off';
    refineConsent.checked = refinePrefs.sb_refine_consent === true;
    syncRefineConsentVisibility();

    refineSelect.addEventListener('change', () => {
      chrome.storage.local.set({ sb_refine_mode: refineSelect.value });
      syncRefineConsentVisibility();
    });
    refineConsent.addEventListener('change', () => {
      chrome.storage.local.set({ sb_refine_consent: refineConsent.checked === true });
    });
  }

  function showStatus(text, type) {
    status.textContent = text;
    status.className = `status ${type}`;
    if (type)
      setTimeout(() => {
        status.textContent = '';
        status.className = 'status';
      }, 4000);
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
