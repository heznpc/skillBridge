/**
 * SkillBridge — Tutor Conversation History (IndexedDB + panel UI)
 *
 * Owns the `chat-history` IDB store, the history sub-panel, and the detail
 * view. Talks back into sidebar-chat.js through `_sb._chat` for sub-panel
 * state machinery (savedChatHTML, closeSubPanel, bindChatInputEvents) and
 * to chat-render.js for sanitizeHtml / formatResponse.
 *
 * Loaded after content.js + chat-render.js + sidebar-chat.js (which sets up
 * `_sb._chat`). Toggling the panel is invoked from sidebar-chat.js's
 * "history" button click handler via `_sb._chat.toggleHistoryPanel`.
 */

(function () {
  'use strict';

  const sb = window._sb;
  if (!sb) {
    console.warn('[SkillBridge] chat-history: _sb not ready');
    return;
  }
  // chat-render.js + sidebar-chat.js must have loaded first.
  if (!sb._chat || !sb._chat.sanitizeHtml || !sb._chat.formatResponse || !sb._chat.openSubPanel) {
    console.warn('[SkillBridge] chat-history: _sb._chat not ready (chat-render/sidebar-chat missing?)');
    return;
  }

  let historyDb = null;

  function openHistoryDb() {
    return new Promise((resolve, reject) => {
      if (historyDb) return resolve(historyDb);
      const req = indexedDB.open(HISTORY_DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(HISTORY_STORE)) {
          const store = db.createObjectStore(HISTORY_STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp');
          store.createIndex('chapter', 'chapter');
        }
      };
      req.onsuccess = (e) => {
        historyDb = e.target.result;
        // If another tab (or a future extension update) bumps the schema,
        // close this connection so it doesn't block the upgrade. Without
        // this, every subsequent transaction() throws InvalidStateError.
        historyDb.onversionchange = () => {
          historyDb.close();
          historyDb = null;
        };
        resolve(historyDb);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function saveConversation(question, answer, lang) {
    try {
      const db = await openHistoryDb();
      const chapter = sb.$('h1')?.textContent?.trim() || 'Unknown';
      const entry = {
        question,
        answer,
        lang,
        chapter,
        timestamp: Date.now(),
        url: location.href,
      };
      const ok = await _addHistoryEntry(db, entry);
      if (!ok) {
        // First add hit the IDB quota — prune oldest 20 then retry once.
        // If the prune freed less than expected (some deletes silently
        // failed under the cursor) the retry can still fail; we then
        // double the prune count once before giving up. Two-shot retry
        // is bounded so a sticky quota can't infinite-loop.
        const pruned = await pruneOldHistory(db, 20);
        let okAfterPrune = await _addHistoryEntry(db, entry);
        if (!okAfterPrune && pruned > 0) {
          await pruneOldHistory(db, 40);
          okAfterPrune = await _addHistoryEntry(db, entry);
        }
        if (!okAfterPrune) {
          console.warn('[SkillBridge] Chat history save failed after prune+retry — quota may be stuck');
        }
      }
    } catch (e) {
      console.warn('[SkillBridge] Failed to save conversation:', e);
    }
  }

  function _addHistoryEntry(db, entry) {
    return new Promise((resolve) => {
      const tx = db.transaction(HISTORY_STORE, 'readwrite');
      const req = tx.objectStore(HISTORY_STORE).add(entry);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => {
        const isQuota = e.target.error?.name === 'QuotaExceededError';
        if (isQuota) {
          console.warn('[SkillBridge] Chat history quota exceeded — will prune and retry');
        } else {
          console.warn('[SkillBridge] Chat history add failed:', e.target.error?.name);
        }
        resolve(false);
      };
    });
  }

  function pruneOldHistory(db, target = 20) {
    return new Promise((resolve) => {
      const tx = db.transaction(HISTORY_STORE, 'readwrite');
      const store = tx.objectStore(HISTORY_STORE);
      const idx = store.index('timestamp');
      const req = idx.openCursor();
      let deleted = 0;
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && deleted < target) {
          // Track per-delete failures — without this the count claims
          // success even when the runtime silently aborted some deletes.
          const delReq = cursor.delete();
          delReq.onsuccess = () => {
            deleted++;
          };
          delReq.onerror = () => {
            console.warn('[SkillBridge] history prune: delete failed at cursor', cursor.primaryKey);
          };
          cursor.continue();
        }
      };
      // Resolve with the actually-deleted count when the whole transaction
      // commits (or fails), so the caller knows whether to escalate.
      tx.oncomplete = () => resolve(deleted);
      tx.onerror = () => resolve(deleted);
      tx.onabort = () => resolve(deleted);
    });
  }

  async function getConversations(limit = SKILLBRIDGE_LIMITS.HISTORY) {
    try {
      const db = await openHistoryDb();
      return new Promise((resolve) => {
        const tx = db.transaction(HISTORY_STORE, 'readonly');
        const idx = tx.objectStore(HISTORY_STORE).index('timestamp');
        const results = [];
        const req = idx.openCursor(null, 'prev');
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor && results.length < limit) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  async function clearAllHistory() {
    try {
      const db = await openHistoryDb();
      const tx = db.transaction(HISTORY_STORE, 'readwrite');
      tx.objectStore(HISTORY_STORE).clear();
      tx.oncomplete = () => {
        const listEl = sb.$id('si18n-history-list');
        if (listEl) {
          listEl.innerHTML = `<div class="si18n-history-empty">${sb.t(HISTORY_LABELS.historyCleared)}</div>`;
        }
      };
    } catch (e) {
      console.warn('[SkillBridge] Failed to clear history:', e);
    }
  }

  function toggleHistoryPanel() {
    const opened = sb._chat.openSubPanel(
      'history',
      `
      <div class="si18n-history-header">
        <button class="si18n-history-back" id="si18n-history-back" aria-label="${sb.t(A11Y_LABELS.backToChat)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
        <span class="si18n-history-title">${sb.t(HISTORY_LABELS.title)}</span>
        <button class="si18n-history-clear" id="si18n-history-clear" title="${sb.t(HISTORY_LABELS.clearHistory)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          <span>${sb.t(HISTORY_LABELS.clearHistory)}</span>
        </button>
      </div>
      <div class="si18n-history-list" id="si18n-history-list">
        <div class="si18n-history-loading">${sb.t(HISTORY_LABELS.loading)}</div>
      </div>
    `,
      () => {
        sb.$id('si18n-history-back')?.addEventListener('click', sb._chat.closeSubPanel);
        sb.$id('si18n-history-clear')?.addEventListener('click', () => {
          if (confirm(sb.t(HISTORY_LABELS.clearHistory) + '?')) clearAllHistory();
        });
      },
    );
    if (!opened) return;
    loadHistoryList();
  }

  async function loadHistoryList() {
    const listEl = sb.$id('si18n-history-list');
    if (!listEl) return;

    const conversations = await getConversations();
    if (conversations.length === 0) {
      listEl.innerHTML = `<div class="si18n-history-empty">${sb.t(HISTORY_LABELS.empty)}</div>`;
      return;
    }

    const grouped = {};
    for (const conv of conversations) {
      const ch = conv.chapter || 'Other';
      if (!grouped[ch]) grouped[ch] = [];
      grouped[ch].push(conv);
    }

    let html = '';
    for (const [chapter, convs] of Object.entries(grouped)) {
      html += `<div class="si18n-history-chapter">${sb.escapeHtml(chapter)}</div>`;
      for (const conv of convs) {
        const preview =
          conv.question.length > SKILLBRIDGE_LIMITS.HISTORY_PREVIEW
            ? conv.question.slice(0, SKILLBRIDGE_LIMITS.HISTORY_PREVIEW) + '…'
            : conv.question;
        const time = new Date(conv.timestamp).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        html += `
          <div class="si18n-history-item" data-id="${conv.id}">
            <div class="si18n-history-item-q">${sb.escapeHtml(preview)}</div>
            <div class="si18n-history-item-time">${time}</div>
          </div>
        `;
      }
    }
    listEl.innerHTML = sb._chat.sanitizeHtml(html);

    // Event delegation instead of per-item listeners
    listEl.addEventListener('click', (e) => {
      const item = e.target.closest('.si18n-history-item');
      if (item) showConversationDetail(item.dataset.id);
    });
  }

  async function showConversationDetail(id) {
    try {
      const db = await openHistoryDb();
      const tx = db.transaction(HISTORY_STORE, 'readonly');
      const req = tx.objectStore(HISTORY_STORE).get(Number(id));
      req.onsuccess = () => {
        const conv = req.result;
        if (!conv) return;
        const listEl = sb.$id('si18n-history-list');
        if (!listEl) return;
        const time = conv.timestamp ? new Date(conv.timestamp).toLocaleString() : '';
        const chapter = conv.chapter ? sb.escapeHtml(conv.chapter) : '';
        let metaHtml = '';
        if (chapter || time) {
          metaHtml = `<div class="si18n-history-detail-meta">`;
          if (chapter) metaHtml += `<span class="si18n-detail-lesson">${chapter}</span>`;
          if (time) metaHtml += `<span class="si18n-detail-time">${time}</span>`;
          metaHtml += `</div>`;
        }
        listEl.innerHTML = sb._chat.sanitizeHtml(`
          <div class="si18n-history-detail">
            ${metaHtml}
            <div class="si18n-chat-msg si18n-chat-user">
              <div class="si18n-chat-bubble">${sb.escapeHtml(conv.question)}</div>
            </div>
            <div class="si18n-chat-msg si18n-chat-bot">
              <div class="si18n-chat-bubble">${sb._chat.formatResponse(conv.answer)}</div>
            </div>
          </div>
        `);
      };
    } catch (e) {
      console.warn('[SkillBridge] Failed to load conversation:', e);
    }
  }

  // Expose for sidebar-chat.js (history button binding) and chat-render.js
  // tests. saveConversation runs after every successful Gemini response.
  sb._chat.saveConversation = saveConversation;
  sb._chat.toggleHistoryPanel = toggleHistoryPanel;
  sb.registerModule?.('chat-history');
})();
