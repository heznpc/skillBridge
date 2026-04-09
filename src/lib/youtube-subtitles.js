/**
 * SkillBridge — YouTube Auto-Subtitle Enabler
 *
 * Strategy:
 * 1. Add cc_load_policy=1 & enablejsapi=1 to iframe src
 * 2. Listen for YouTube player postMessage events (onReady, onStateChange)
 * 3. When player is ready/playing, send loadModule('captions') + setOption
 * 4. MutationObserver catches lazily-loaded iframes
 */

/**
 * Manages auto-enabling of translated subtitles on embedded YouTube players.
 * Patches iframe src params and uses postMessage API to load captions.
 */
class YouTubeSubtitleManager {
  static EMBED_SELECTOR = 'iframe[src*="youtube.com/embed"], iframe[src*="youtube-nocookie.com/embed"]';
  static EMBED_DOMAINS = ['youtube.com/embed', 'youtube-nocookie.com/embed'];

  /** @param {string} targetLang — ISO 639-1 language code */
  constructor(targetLang) {
    /** @type {string} */
    this.targetLang = targetLang;
    /** @type {Set<HTMLIFrameElement>} */
    this._iframes = new Set();
    /** @type {MutationObserver|null} */
    this._domObserver = null;
    /** @type {((event: MessageEvent) => void)|null} */
    this._messageHandler = null;
  }

  /** Discover existing iframes, start DOM observer, and begin listening for player events. @returns {Promise<void>} */
  async initialize() {
    // Start listening for YouTube player messages FIRST
    this._startMessageListener();

    // Process existing iframes
    this._processExistingIframes();

    // Watch for new iframes
    this._startDomObserver();

    // Retry for lazy-loaded content only if YouTube iframes exist on page
    if (document.querySelector(YouTubeSubtitleManager.EMBED_SELECTOR)) {
      this._retryTimers = [
        setTimeout(() => this._processExistingIframes(), 2000),
        setTimeout(() => this._processExistingIframes(), 5000),
      ];
    }
  }

  /** @param {string} newLang — ISO 639-1 code to switch subtitles to */
  setLanguage(newLang) {
    this.targetLang = newLang;
    for (const iframe of this._iframes) {
      this._enableAutoSubtitles(iframe);
    }
  }

  /** Disconnect observers, remove event listeners, and release tracked iframes. */
  destroy() {
    if (this._domObserver) {
      this._domObserver.disconnect();
      this._domObserver = null;
    }
    if (this._messageHandler) {
      window.removeEventListener('message', this._messageHandler);
      this._messageHandler = null;
    }
    if (this._retryTimers) {
      for (const timer of this._retryTimers) clearTimeout(timer);
      this._retryTimers = null;
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
    return YouTubeSubtitleManager.EMBED_DOMAINS.some((d) => src.includes(d));
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
      try {
        originHost = new URL(event.origin).hostname;
      } catch {
        return;
      }
      if (
        !originHost.endsWith('.youtube.com') &&
        originHost !== 'youtube.com' &&
        !originHost.endsWith('.youtube-nocookie.com') &&
        originHost !== 'youtube-nocookie.com'
      )
        return;

      let data;
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch (_e) {
        return; // Not JSON, skip
      }

      if (!data || !data.event) return;

      // React to player ready or state change (1 = playing)
      if (
        data.event === 'onReady' ||
        data.event === 'initialDelivery' ||
        (data.event === 'onStateChange' && data.info === 1)
      ) {
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
        console.debug('[SkillBridge] Cross-origin iframe compare:', e.message);
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

        // Register + send commands with retries after load (reduced from 5 to 3)
        iframe.addEventListener(
          'load',
          () => {
            this._registerAsListener(iframe);
            const delays = [500, 1500, 3000];
            for (const delay of delays) {
              setTimeout(() => {
                if (!this._iframes.has(iframe)) return; // Skip if destroyed
                this._registerAsListener(iframe);
                this._sendCaptionCommands(iframe);
              }, delay);
            }
          },
          { once: true },
        );
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
      iframe.contentWindow.postMessage(
        JSON.stringify({
          event: 'listening',
          id: 1,
        }),
        '*',
      );
    } catch (e) {
      console.debug('[SkillBridge] Cross-origin postMessage:', e.message);
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
      iframe.contentWindow.postMessage(
        JSON.stringify({
          event: 'command',
          func: 'loadModule',
          args: ['captions'],
        }),
        '*',
      );

      // Step 2: After module loads, set caption track + force show
      setTimeout(() => {
        try {
          // Set the caption track to English with auto-translation
          iframe.contentWindow.postMessage(
            JSON.stringify({
              event: 'command',
              func: 'setOption',
              args: [
                'captions',
                'track',
                {
                  languageCode: 'en',
                  translationLanguage: {
                    languageCode: ytLang,
                    languageName: this._ytLangName(this.targetLang),
                  },
                },
              ],
            }),
            '*',
          );

          // Force captions visible (fontSize > 0 = visible)
          iframe.contentWindow.postMessage(
            JSON.stringify({
              event: 'command',
              func: 'setOption',
              args: ['captions', 'fontSize', 1],
            }),
            '*',
          );

          // Also try showCaptions command (undocumented but works on some embeds)
          iframe.contentWindow.postMessage(
            JSON.stringify({
              event: 'command',
              func: 'showCaptions',
            }),
            '*',
          );
        } catch (e) {
          console.debug('[SkillBridge] Caption command failed:', e.message);
        }
      }, 800);
    } catch (e) {
      console.debug('[SkillBridge] Caption module load failed:', e.message);
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
