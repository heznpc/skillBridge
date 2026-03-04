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
  constructor(translator, targetLang) {
    this.translator = translator;
    this.targetLang = targetLang;
    this._iframes = new Set();
    this._domObserver = null;
    this._messageListenerBound = false;
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
    this._iframes.clear();
  }

  // ==================== IFRAME DISCOVERY ====================

  _processExistingIframes() {
    const iframes = document.querySelectorAll(
      'iframe[src*="youtube.com/embed"], iframe[src*="youtube-nocookie.com/embed"]'
    );
    for (const iframe of iframes) {
      if (this._iframes.has(iframe)) continue;
      console.log('[SkillBridge] Found YouTube embed');
      this._enableAutoSubtitles(iframe);
      this._iframes.add(iframe);
    }
  }

  _startDomObserver() {
    if (this._domObserver) return;
    this._domObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.tagName === 'IFRAME' && this._isYouTubeEmbed(node)) {
            if (!this._iframes.has(node)) {
              console.log('[SkillBridge] New YouTube iframe detected');
              this._enableAutoSubtitles(node);
              this._iframes.add(node);
            }
          }
          const childIframes = node.querySelectorAll?.(
            'iframe[src*="youtube.com/embed"], iframe[src*="youtube-nocookie.com/embed"]'
          );
          if (childIframes) {
            for (const iframe of childIframes) {
              if (!this._iframes.has(iframe)) {
                this._enableAutoSubtitles(iframe);
                this._iframes.add(iframe);
              }
            }
          }
        }
      }
    });
    this._domObserver.observe(document.body, { childList: true, subtree: true });
  }

  _isYouTubeEmbed(iframe) {
    const src = iframe.src || '';
    return src.includes('youtube.com/embed') || src.includes('youtube-nocookie.com/embed');
  }

  // ==================== MESSAGE LISTENER ====================

  /**
   * Listen for postMessage events from YouTube player.
   * This is more reliable than setTimeout — we react when
   * the player actually signals it's ready.
   */
  _startMessageListener() {
    if (this._messageListenerBound) return;
    this._messageListenerBound = true;

    window.addEventListener('message', (event) => {
      // Only process messages from YouTube
      if (!event.origin.includes('youtube.com') &&
          !event.origin.includes('youtube-nocookie.com')) return;

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
        console.log(`[SkillBridge] YouTube event: ${data.event}${data.info !== undefined ? ' info=' + data.info : ''}`);
        // Find which iframe this came from and send caption commands
        this._onPlayerEvent(event.source);
      }
    });
  }

  /**
   * When we receive a player event, send caption commands
   * to the source iframe.
   */
  _onPlayerEvent(source) {
    if (!this.targetLang || this.targetLang === 'en') return;

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
        console.log(`[SkillBridge] Updating iframe src (lang=${this.targetLang || 'en'})`);
        iframe.src = newSrc;

        // Also send "listening" registration after load
        iframe.addEventListener('load', () => {
          this._registerAsListener(iframe);
          // Fallback: also try direct caption commands after delays
          if (this.targetLang && this.targetLang !== 'en') {
            setTimeout(() => this._sendCaptionCommands(iframe), 2000);
            setTimeout(() => this._sendCaptionCommands(iframe), 4000);
          }
        }, { once: true });
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
      console.log('[SkillBridge] Registered as YouTube API listener');
    } catch (e) {
      // Cross-origin might fail
    }
  }

  /**
   * Send commands to enable captions and set translation language.
   */
  _sendCaptionCommands(iframe) {
    const ytLang = this._ytLangCode(this.targetLang);

    try {
      // Step 1: Load captions module
      iframe.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func: 'loadModule',
        args: ['captions']
      }), '*');

      // Step 2: After module loads, set caption track with translation
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

          // Also try setting fontSize to ensure visibility
          iframe.contentWindow.postMessage(JSON.stringify({
            event: 'command',
            func: 'setOption',
            args: ['captions', 'fontSize', 1]
          }), '*');

          console.log(`[SkillBridge] Caption commands sent → ${ytLang}`);
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
    const map = {
      'zh-CN': 'zh-Hans', 'zh-TW': 'zh-Hant', 'pt-BR': 'pt',
    };
    return map[lang] || lang;
  }

  _ytLangName(lang) {
    const names = {
      'ko': 'Korean', 'ja': 'Japanese', 'zh-CN': 'Chinese (Simplified)',
      'zh-TW': 'Chinese (Traditional)', 'es': 'Spanish', 'fr': 'French',
      'de': 'German', 'pt-BR': 'Portuguese', 'pt': 'Portuguese',
      'vi': 'Vietnamese', 'th': 'Thai', 'id': 'Indonesian', 'ar': 'Arabic',
      'hi': 'Hindi', 'ru': 'Russian', 'tr': 'Turkish', 'it': 'Italian',
      'nl': 'Dutch', 'pl': 'Polish', 'uk': 'Ukrainian', 'cs': 'Czech',
      'sv': 'Swedish', 'da': 'Danish', 'fi': 'Finnish', 'no': 'Norwegian',
      'ms': 'Malay', 'tl': 'Filipino', 'bn': 'Bengali', 'he': 'Hebrew',
      'ro': 'Romanian', 'hu': 'Hungarian', 'el': 'Greek',
    };
    return names[lang] || lang;
  }
}

if (typeof window !== 'undefined') {
  window.YouTubeSubtitleManager = YouTubeSubtitleManager;
}
