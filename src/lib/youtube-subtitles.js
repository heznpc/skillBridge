/**
 * SkillBridge - YouTube Auto-Subtitle Enabler + Transcript Panel
 *
 * Features:
 * 1. Auto-enable subtitles on YouTube embeds (cc_load_policy + postMessage)
 * 2. Auto-translate subtitles to target language
 * 3. Fetch English captions via timedtext API → translate → show transcript panel
 */

class YouTubeSubtitleManager {
  constructor(translator, targetLang) {
    this.translator = translator;
    this.targetLang = targetLang;
    this._iframes = [];
    this._transcriptPanels = new Map(); // iframe → panel element
  }

  /**
   * Initialize: find all YouTube embeds, enable subtitles, and create transcript panels.
   */
  async initialize() {
    const iframes = document.querySelectorAll('iframe[src*="youtube.com/embed"], iframe[src*="youtube-nocookie.com/embed"]');
    if (iframes.length === 0) {
      console.log('[SkillBridge] No YouTube embeds found');
      return;
    }

    console.log(`[SkillBridge] Found ${iframes.length} YouTube embed(s)`);

    for (const iframe of iframes) {
      this._enableAutoSubtitles(iframe);
      this._iframes.push(iframe);

      // Create transcript panel below each video
      if (this.targetLang && this.targetLang !== 'en') {
        this._createTranscriptPanel(iframe);
      }
    }
  }

  /**
   * Update target language and re-apply to all iframes.
   */
  setLanguage(newLang) {
    this.targetLang = newLang;
    for (const iframe of this._iframes) {
      this._enableAutoSubtitles(iframe);

      if (newLang && newLang !== 'en') {
        this._createTranscriptPanel(iframe);
      } else {
        this._removeTranscriptPanel(iframe);
      }
    }
  }

  destroy() {
    for (const iframe of this._iframes) {
      this._removeTranscriptPanel(iframe);
    }
    this._iframes = [];
    this._transcriptPanels.clear();
  }

  // ==================== SUBTITLE AUTO-ENABLE ====================

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

  _enableAutoSubtitles(iframe) {
    const url = new URL(iframe.src);
    url.searchParams.set('enablejsapi', '1');
    url.searchParams.set('cc_load_policy', '1');

    if (this.targetLang && this.targetLang !== 'en') {
      url.searchParams.set('cc_lang_pref', this._ytLangCode(this.targetLang));
      url.searchParams.set('hl', this._ytLangCode(this.targetLang));
    }

    const newSrc = url.toString();
    if (iframe.src !== newSrc) {
      console.log(`[SkillBridge] Enabling auto-subtitles (${this.targetLang}) for YouTube embed`);
      iframe.src = newSrc;

      if (this.targetLang && this.targetLang !== 'en') {
        iframe.addEventListener('load', () => {
          this._setAutoTranslate(iframe);
        }, { once: true });
      }
    }
  }

  _setAutoTranslate(iframe) {
    const ytLang = this._ytLangCode(this.targetLang);
    setTimeout(() => {
      try {
        iframe.contentWindow.postMessage(JSON.stringify({
          event: 'command', func: 'loadModule', args: ['captions']
        }), '*');

        setTimeout(() => {
          try {
            iframe.contentWindow.postMessage(JSON.stringify({
              event: 'command', func: 'setOption',
              args: ['captions', 'track', {
                languageCode: 'en',
                translationLanguage: {
                  languageCode: ytLang,
                  languageName: this._ytLangName(this.targetLang)
                }
              }]
            }), '*');
            console.log(`[SkillBridge] Sent auto-translate command (${ytLang})`);
          } catch (err) {
            console.warn('[SkillBridge] setOption failed:', err);
          }
        }, 1500);
      } catch (err) {
        console.warn('[SkillBridge] Auto-translate setup failed:', err);
      }
    }, 2000);
  }

  // ==================== TRANSCRIPT PANEL ====================

  _getVideoId(iframe) {
    try {
      const url = new URL(iframe.src);
      const parts = url.pathname.split('/');
      return parts[parts.length - 1];
    } catch { return null; }
  }

  /**
   * Fetch English captions from YouTube's timedtext API via background proxy.
   */
  async _fetchCaptions(videoId) {
    try {
      const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const pageResp = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'FETCH_URL', url: pageUrl }, resolve);
      });

      if (!pageResp?.ok) return null;

      // Extract caption track info from page data (try multiple patterns)
      const patterns = [
        /"captionTracks":\s*(\[.*?\])\s*[,}]/,
        /captionTracks\\?":\s*(\[.*?\])/,
        /"captions":\s*\{.*?"captionTracks":\s*(\[.*?\])/s,
      ];
      let captionMatch = null;
      for (const pat of patterns) {
        captionMatch = pageResp.data.match(pat);
        if (captionMatch) break;
      }
      if (!captionMatch) {
        console.log('[SkillBridge] No caption tracks found for video', videoId);
        return null;
      }

      // Clean up escaped JSON if needed
      let rawJson = captionMatch[1];
      if (rawJson.includes('\\u0026')) {
        rawJson = rawJson.replace(/\\u0026/g, '&');
      }
      if (rawJson.includes('\\"')) {
        rawJson = rawJson.replace(/\\"/g, '"');
      }

      let tracks;
      try { tracks = JSON.parse(rawJson); } catch {
        console.warn('[SkillBridge] Failed to parse caption tracks JSON');
        return null;
      }

      // Prefer manual English captions, fall back to auto-generated or first track
      const enTrack = tracks.find(t => t.languageCode === 'en' && !t.kind) ||
                      tracks.find(t => t.languageCode === 'en') ||
                      tracks[0];

      if (!enTrack?.baseUrl) return null;

      // Fetch caption data in JSON3 format
      const captionUrl = enTrack.baseUrl + '&fmt=json3';
      const captionResp = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'FETCH_URL', url: captionUrl }, resolve);
      });

      if (!captionResp?.ok) return null;

      const data = JSON.parse(captionResp.data);
      if (!data.events) return null;

      return data.events
        .filter(e => e.segs && e.segs.length > 0)
        .map(e => ({
          start: Math.floor((e.tStartMs || 0) / 1000),
          text: e.segs.map(s => s.utf8 || '').join('').trim()
        }))
        .filter(e => e.text.length > 0);
    } catch (err) {
      console.warn('[SkillBridge] Caption fetch failed:', err);
      return null;
    }
  }

  /**
   * Translate captions using Google Translate batch via background proxy.
   */
  async _translateCaptions(captions, targetLang) {
    const batchSize = 20;
    const translated = [];

    for (let i = 0; i < captions.length; i += batchSize) {
      const batch = captions.slice(i, i + batchSize);
      const texts = batch.map(c => c.text);

      try {
        const results = await this.translator.googleTranslateBatch(texts, targetLang);
        for (let j = 0; j < batch.length; j++) {
          translated.push({
            start: batch[j].start,
            original: batch[j].text,
            translated: results[j] || batch[j].text,
          });
        }
      } catch {
        for (const c of batch) {
          translated.push({ start: c.start, original: c.text, translated: c.text });
        }
      }
    }
    return translated;
  }

  _formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  /**
   * Create or update the transcript panel below a YouTube iframe.
   */
  async _createTranscriptPanel(iframe) {
    const videoId = this._getVideoId(iframe);
    if (!videoId) return;

    this._removeTranscriptPanel(iframe);

    const langLabel = this._ytLangName(this.targetLang) || this.targetLang.toUpperCase();

    const panel = document.createElement('div');
    panel.className = 'sb-transcript-panel'; // starts collapsed
    panel.setAttribute('translate', 'no'); // prevent browser/extension translation
    panel.innerHTML = `
      <div class="sb-transcript-header">
        <span class="sb-transcript-arrow">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M6 3l5 5-5 5V3z"/></svg>
        </span>
        <span class="sb-transcript-header-title">Video Script</span>
        <div class="sb-transcript-header-meta">
          <button class="sb-transcript-toggle-lang" title="Toggle EN / ${langLabel}" style="display:none">EN ↔ ${langLabel}</button>
        </div>
      </div>
      <div class="sb-transcript-body">
        <div class="sb-transcript-loading">
          <span class="si18n-thinking-dots">
            <span class="si18n-dot"></span><span class="si18n-dot"></span><span class="si18n-dot"></span>
          </span>
          <span style="margin-left:8px">Loading...</span>
        </div>
      </div>
    `;

    // Insert after iframe or its parent wrapper
    const wrapper = iframe.closest('.embed-responsive, .video-wrapper, .sj-lesson-video') || iframe.parentElement;
    if (wrapper && wrapper.parentElement) {
      wrapper.parentElement.insertBefore(panel, wrapper.nextSibling);
    } else {
      iframe.parentElement.insertBefore(panel, iframe.nextSibling);
    }
    this._transcriptPanels.set(iframe, panel);

    // Toggle expand/collapse — click header to toggle
    const header = panel.querySelector('.sb-transcript-header');
    const body = panel.querySelector('.sb-transcript-body');
    header.addEventListener('click', (e) => {
      // Don't toggle when clicking the lang button
      if (e.target.closest('.sb-transcript-toggle-lang')) return;
      panel.classList.toggle('expanded');
    });

    // Fetch and translate captions
    const captions = await this._fetchCaptions(videoId);
    if (!captions || captions.length === 0) {
      body.innerHTML = '<div class="sb-transcript-empty">Captions not available for this video.</div>';
      // Auto-expand to show empty state, then allow toggle
      panel.classList.add('expanded');
      return;
    }

    const translated = await this._translateCaptions(captions, this.targetLang);

    // Show the toggle button now that we have data
    const toggleBtnEl = panel.querySelector('.sb-transcript-toggle-lang');
    if (toggleBtnEl) toggleBtnEl.style.display = '';

    // Render lines
    let showOriginal = false;
    const linesHtml = translated.map(line => `
      <div class="sb-transcript-line" data-time="${line.start}">
        <span class="sb-transcript-time">${this._formatTime(line.start)}</span>
        <span class="sb-transcript-text" data-original="${this._esc(line.original)}" data-translated="${this._esc(line.translated)}">${line.translated}</span>
      </div>
    `).join('');

    body.innerHTML = `<div class="sb-transcript-lines">${linesHtml}</div>`;

    // Toggle EN ↔ target language
    const toggleBtn = panel.querySelector('.sb-transcript-toggle-lang');
    toggleBtn.addEventListener('click', () => {
      showOriginal = !showOriginal;
      toggleBtn.textContent = showOriginal ? `EN ↔ ${langLabel}` : `${langLabel} ↔ EN`;
      panel.querySelectorAll('.sb-transcript-text').forEach(el => {
        el.textContent = showOriginal ? el.dataset.original : el.dataset.translated;
      });
    });

    // Click timestamp → seek video
    body.addEventListener('click', (e) => {
      const line = e.target.closest('.sb-transcript-line');
      if (!line) return;
      const time = parseInt(line.dataset.time, 10);
      if (isNaN(time)) return;

      try {
        iframe.contentWindow.postMessage(JSON.stringify({
          event: 'command', func: 'seekTo', args: [time, true]
        }), '*');
      } catch (err) { console.warn('[SkillBridge] Seek failed:', err); }

      panel.querySelectorAll('.sb-transcript-line.active').forEach(el => el.classList.remove('active'));
      line.classList.add('active');
    });

    console.log(`[SkillBridge] Transcript panel ready (${translated.length} lines)`);
  }

  _removeTranscriptPanel(iframe) {
    const panel = this._transcriptPanels.get(iframe);
    if (panel) { panel.remove(); this._transcriptPanels.delete(iframe); }
  }

  _esc(text) {
    return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

if (typeof window !== 'undefined') {
  window.YouTubeSubtitleManager = YouTubeSubtitleManager;
}
