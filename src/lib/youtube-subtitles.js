/**
 * SkillBridge — YouTube Auto-Subtitle Enabler
 *
 * Strategy:
 * 1. Add cc_load_policy=1 & enablejsapi=1 to iframe src
 * 2. Listen for YouTube player postMessage events (onReady, onStateChange)
 * 3. When player is ready/playing, send loadModule('captions') + setOption
 * 4. MutationObserver catches lazily-loaded iframes
 */

class YouTubeSubtitleManager {
  static EMBED_SELECTOR = 'iframe[src*="youtube.com/embed"], iframe[src*="youtube-nocookie.com/embed"]';
  static EMBED_DOMAINS = ['youtube.com/embed', 'youtube-nocookie.com/embed'];

  constructor(targetLang) {
    this.targetLang = targetLang;
    this._iframes = new Set();
    this._domObserver = null;
    this._messageHandler = null;
  }

  async initialize() {
    // Start listening for YouTube player messages FIRST
    this._startMessageListener();

    // Process existing iframes
    this._processExistingIframes();

    // Watch for new iframes
    this._startDomObserver();

    // Retry for lazy-loaded content
    setTimeout(() => this._processExistingIframes(), 2000);
    setTimeout(() => this._processExistingIframes(), 5000);
  }

  setLanguage(newLang) {
    this.targetLang = newLang;
    for (const iframe of this._iframes) {
      this._enableAutoSubtitles(iframe);
    }
  }

  destroy() {
    if (this._domObserver) {
      this._domObserver.disconnect();
      this._domObserver = null;
    }
    if (this._messageHandler) {
      window.removeEventListener('message', this._messageHandler);
      this._messageHandler = null;
    }
    this._iframes.clear();
  }

  // ==================== IFRAME DISCOVERY ====================

  _trackIframe(iframe) {
    if (this._iframes.has(iframe)) return;
    this._enableAutoSubtitles(iframe);
    this._iframes.add(iframe);
  }

  _processExistingIframes() {
    const iframes = document.querySelectorAll(YouTubeSubtitleManager.EMBED_SELECTOR);
    for (const iframe of iframes) {
      this._trackIframe(iframe);
    }
  }

  _startDomObserver() {
    if (this._domObserver) return;
    this._domObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.tagName === 'IFRAME' && this._isYouTubeEmbed(node)) {
            this._trackIframe(node);
          }
          const childIframes = node.querySelectorAll?.(YouTubeSubtitleManager.EMBED_SELECTOR);
          if (childIframes) {
            for (const iframe of childIframes) {
              this._trackIframe(iframe);
            }
          }
        }
      }
    });
    this._domObserver.observe(document.body, { childList: true, subtree: true });
  }

  _isYouTubeEmbed(iframe) {
    const src = iframe.src || '';
    return YouTubeSubtitleManager.EMBED_DOMAINS.some(d => src.includes(d));
  }

  // ==================== MESSAGE LISTENER ====================

  /**
   * Listen for postMessage events from YouTube player.
   * This is more reliable than setTimeout — we react when
   * the player actually signals it's ready.
   */
  _startMessageListener() {
    if (this._messageHandler) return;

    this._messageHandler = (event) => {
      // Only process messages from YouTube (strict hostname validation)
      let originHost;
      try { originHost = new URL(event.origin).hostname; } catch { return; }
      if (!originHost.endsWith('.youtube.com') && originHost !== 'youtube.com' &&
          !originHost.endsWith('.youtube-nocookie.com') && originHost !== 'youtube-nocookie.com') return;

      let data;
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch (e) {
        return; // Not JSON, skip
      }

      if (!data || !data.event) return;

      // React to player ready or state change (1 = playing)
      if (data.event === 'onReady' ||
          data.event === 'initialDelivery' ||
          (data.event === 'onStateChange' && data.info === 1)) {
        // Find which iframe this came from and send caption commands
        this._onPlayerEvent(event.source);
      }
    };
    window.addEventListener('message', this._messageHandler);
  }

  /**
   * When we receive a player event, send caption commands
   * to the source iframe.
   */
  _onPlayerEvent(source) {
    if (!this.targetLang || this.targetLang === 'en') return;

    // Re-register listener on each event to keep connection alive
    for (const iframe of this._iframes) {
      this._registerAsListener(iframe);
    }

    for (const iframe of this._iframes) {
      try {
        if (iframe.contentWindow === source) {
          this._sendCaptionCommands(iframe);
          return;
        }
      } catch (e) {
        // Cross-origin — can't compare contentWindow, send to all
      }
    }

    // If we couldn't match the source, send to all iframes
    for (const iframe of this._iframes) {
      this._sendCaptionCommands(iframe);
    }
  }

  // ==================== SUBTITLE CONTROL ====================

  _enableAutoSubtitles(iframe) {
    try {
      const url = new URL(iframe.src);

      // Force captions on + enable JS API
      url.searchParams.set('cc_load_policy', '1');
      url.searchParams.set('enablejsapi', '1');
      url.searchParams.set('origin', window.location.origin);

      if (this.targetLang && this.targetLang !== 'en') {
        url.searchParams.set('cc_lang_pref', this._ytLangCode(this.targetLang));
        url.searchParams.set('hl', this._ytLangCode(this.targetLang));
      }

      const newSrc = url.toString();
      if (iframe.src !== newSrc) {
        iframe.src = newSrc;

        // Register + send commands with aggressive retries after load
        iframe.addEventListener('load', () => {
          this._registerAsListener(iframe);
          // Multiple retries to ensure captions activate
          const delays = [500, 1500, 3000, 5000, 8000];
          for (const delay of delays) {
            setTimeout(() => {
              this._registerAsListener(iframe);
              this._sendCaptionCommands(iframe);
            }, delay);
          }
        }, { once: true });
      } else {
        // Src unchanged but language might have changed — re-send commands
        this._sendCaptionCommands(iframe);
      }
    } catch (err) {
      console.warn('[SkillBridge] Failed to set iframe src:', err);
    }
  }

  /**
   * Register as an API listener with the YouTube player.
   * This tells the player to send us state change events.
   */
  _registerAsListener(iframe) {
    try {
      iframe.contentWindow.postMessage(JSON.stringify({
        event: 'listening',
        id: 1
      }), '*');
    } catch (e) {
      // Cross-origin might fail
    }
  }

  /**
   * Send commands to enable captions and set translation language.
   */
  _sendCaptionCommands(iframe) {
    if (!this.targetLang || this.targetLang === 'en') return;
    const ytLang = this._ytLangCode(this.targetLang);

    try {
      // Step 1: Load captions module
      iframe.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func: 'loadModule',
        args: ['captions']
      }), '*');

      // Step 2: After module loads, set caption track + force show
      setTimeout(() => {
        try {
          // Set the caption track to English with auto-translation
          iframe.contentWindow.postMessage(JSON.stringify({
            event: 'command',
            func: 'setOption',
            args: ['captions', 'track', {
              languageCode: 'en',
              translationLanguage: {
                languageCode: ytLang,
                languageName: this._ytLangName(this.targetLang)
              }
            }]
          }), '*');

          // Force captions visible (fontSize > 0 = visible)
          iframe.contentWindow.postMessage(JSON.stringify({
            event: 'command',
            func: 'setOption',
            args: ['captions', 'fontSize', 1]
          }), '*');

          // Also try showCaptions command (undocumented but works on some embeds)
          iframe.contentWindow.postMessage(JSON.stringify({
            event: 'command',
            func: 'showCaptions'
          }), '*');

        } catch (e) {
          // Silent
        }
      }, 800);
    } catch (e) {
      // Silent
    }
  }

  // ==================== LANGUAGE HELPERS ====================

  _ytLangCode(lang) {
    return YT_LANG_CODE_MAP[lang] || lang;
  }

  _ytLangName(lang) {
    return YT_LANG_NAME_MAP[lang] || lang;
  }
}

if (typeof window !== 'undefined') {
  window.YouTubeSubtitleManager = YouTubeSubtitleManager;
}
