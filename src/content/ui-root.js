/**
 * SkillBridge - Shadow UI root and shadow-aware lookups.
 *
 * Owns the open shadow root that hosts overlay UI, plus the shared lookup
 * helpers used by sidebar/TOC modules.
 */

(function () {
  'use strict';

  const sb = window._sb;
  if (!sb) {
    console.warn('[SkillBridge] ui-root: _sb not ready');
    return;
  }

  function getUiRoot() {
    if (sb.certDisabled) return null;
    if (sb._uiHost && sb._uiHost.isConnected) return sb._uiHost.shadowRoot;
    const host = document.createElement('div');
    host.id = 'skillbridge-root';
    host.attachShadow({ mode: 'open' });
    window._sbShadowCss?.ensureShadowStylesheet(host.shadowRoot);
    syncHostThemeClasses(host);
    document.body.appendChild(host);
    sb._uiHost = host;
    return host.shadowRoot;
  }

  function syncHostThemeClasses(host) {
    const apply = () => {
      host.classList.toggle('si18n-dark', document.documentElement.classList.contains('si18n-dark'));
      for (const c of [...host.classList]) {
        if (c.startsWith('si18n-lang-') || c === 'si18n-rtl') host.classList.remove(c);
      }
      for (const c of document.body.classList) {
        if (c.startsWith('si18n-lang-') || c === 'si18n-rtl') host.classList.add(c);
      }
    };
    apply();
    const obs = new MutationObserver(() => {
      if (!host.isConnected) {
        obs.disconnect();
        return;
      }
      apply();
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  sb.$id = (id) =>
    (sb._uiHost && sb._uiHost.isConnected && sb._uiHost.shadowRoot.getElementById(id)) || document.getElementById(id);
  sb.$ = (sel) =>
    (sb._uiHost && sb._uiHost.isConnected && sb._uiHost.shadowRoot.querySelector(sel)) || document.querySelector(sel);

  let fabStylePromise = null;

  function ensureFabStyle(root) {
    if (!root) return Promise.resolve(false);
    if (root.querySelector('style[data-sb-fab]')) return Promise.resolve(true);
    if (!fabStylePromise) {
      fabStylePromise = fetch(chrome.runtime.getURL('src/content/styles/fab.css'))
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.text();
        })
        .catch((err) => {
          fabStylePromise = null;
          console.warn('[SkillBridge] FAB stylesheet load failed:', err && err.message);
          return null;
        });
    }
    return fabStylePromise.then((css) => {
      if (!css || root.querySelector('style[data-sb-fab]')) return Boolean(css);
      const style = document.createElement('style');
      style.setAttribute('data-sb-fab', '');
      style.textContent = css;
      root.appendChild(style);
      return true;
    });
  }

  sb.uiRoot = getUiRoot;
  sb._uiRoot = {
    ensureFabStyle,
  };
  sb.registerModule?.('ui-root');
})();
