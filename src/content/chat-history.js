/**
 * SkillBridge — local Tutor conversation lifecycle.
 *
 * IndexedDB intentionally stays at version 1. Published builds store one Q/A
 * turn per row; new builds add conversation metadata to those same rows and
 * group them at read time. An open old tab can therefore neither block an
 * upgrade nor lose a learner's existing flat history.
 *
 * Saved turns never feed back into Tutor prompts. Conversation grouping,
 * delete, clear, and export stay device-local, preserving the existing
 * cloud/local transport privacy boundary.
 */
(function () {
  'use strict';

  const sb = window._sb;
  const model = window._sbTutorConversations;
  if (!sb) {
    console.warn('[SkillBridge] chat-history: _sb not ready');
    return;
  }
  if (!sb._chat || !sb._chat.sanitizeHtml || !sb._chat.formatResponse || !sb._chat.openSubPanel) {
    console.warn('[SkillBridge] chat-history: _sb._chat not ready (chat-render/chat-subpanels missing?)');
    return;
  }
  if (!model || !model.groupConversationRows || !model.createTurnRow || !model.oldestConversationRowIds) {
    console.warn('[SkillBridge] chat-history: Tutor conversation model not ready');
    return;
  }

  let historyDb = null;
  let writeQueue = Promise.resolve();
  let renderGeneration = 0;
  let activeConversationId = null;
  let activeLessonKey = null;
  let activeLessonUrl = null;
  let activeStartedAt = null;
  let activeTitle = '';

  // Keep the published v1 schema. New metadata is additive because IDB rows
  // are schemaless; old builds safely ignore the new properties.
  function openHistoryDb() {
    return new Promise((resolve, reject) => {
      if (historyDb) return resolve(historyDb);
      const req = indexedDB.open(HISTORY_DB_NAME, 1);
      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(HISTORY_STORE)) {
          const store = db.createObjectStore(HISTORY_STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp');
          store.createIndex('chapter', 'chapter');
        }
      };
      req.onsuccess = (event) => {
        historyDb = event.target.result;
        historyDb.onversionchange = () => {
          historyDb.close();
          historyDb = null;
        };
        resolve(historyDb);
      };
      req.onerror = () => reject(req.error);
    });
  }

  function enqueueWrite(operation) {
    const queued = writeQueue.catch(() => {}).then(operation);
    writeQueue = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }

  function addHistoryRow(db, row) {
    return new Promise((resolve) => {
      const tx = db.transaction(HISTORY_STORE, 'readwrite');
      const req = tx.objectStore(HISTORY_STORE).add(row);
      let key = null;
      let error = null;
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      req.onsuccess = () => {
        key = req.result;
      };
      req.onerror = () => {
        error = req.error;
      };
      tx.oncomplete = () => finish({ ok: true, id: key });
      tx.onabort = () => finish({ ok: false, error: error || tx.error });
      tx.onerror = () => {
        error = error || tx.error;
      };
    });
  }

  function readHistoryRows(db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE, 'readonly');
      const req = tx.objectStore(HISTORY_STORE).openCursor();
      const rows = [];
      req.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        rows.push(cursor.value);
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve(rows);
      tx.onabort = () => reject(tx.error || new Error('Tutor history read aborted'));
    });
  }

  function deleteHistoryRows(db, ids) {
    const keys = Array.from(new Set(ids.filter((id) => id !== undefined && id !== null)));
    if (keys.length === 0) return Promise.resolve(0);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE, 'readwrite');
      const store = tx.objectStore(HISTORY_STORE);
      for (const key of keys) store.delete(key);
      tx.oncomplete = () => resolve(keys.length);
      tx.onerror = () => reject(tx.error || new Error('Tutor history delete failed'));
      tx.onabort = () => reject(tx.error || new Error('Tutor history delete aborted'));
    });
  }

  function clearHistoryRows(db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE, 'readwrite');
      tx.objectStore(HISTORY_STORE).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Tutor history clear failed'));
      tx.onabort = () => reject(tx.error || new Error('Tutor history clear aborted'));
    });
  }

  async function identityReady() {
    if (!sb.identity?.ready) return;
    try {
      await sb.identity.ready();
    } catch (_error) {
      // lessonKeyFor safely retains normalized URL identity.
    }
  }

  function canonicalIdForUrl(url) {
    try {
      return sb.identity?.resolve?.(url)?.id || null;
    } catch (_error) {
      return null;
    }
  }

  function groupRows(rows) {
    return model.groupConversationRows(rows, (row) => canonicalIdForUrl(row?.url));
  }

  async function committedConversations(limit = SKILLBRIDGE_LIMITS.HISTORY) {
    await writeQueue;
    const db = await openHistoryDb();
    const rows = await readHistoryRows(db);
    await identityReady();
    return groupRows(rows).slice(0, limit);
  }

  async function pruneOldConversations(db, target, excludedConversationIds) {
    const rows = await readHistoryRows(db);
    const ids = model.oldestConversationRowIds(groupRows(rows), excludedConversationIds, target);
    return deleteHistoryRows(db, ids);
  }

  function lessonKeyNow(url = location.href) {
    return model.lessonKeyFor(url, canonicalIdForUrl(url));
  }

  function clearActiveConversation() {
    activeConversationId = null;
    activeLessonKey = null;
    activeLessonUrl = null;
    activeStartedAt = null;
    activeTitle = '';
  }

  function beginConversationTurn(question) {
    const now = Date.now();
    const url = location.href;
    const lessonKey = lessonKeyNow(url);
    if (activeConversationId && activeLessonKey && activeLessonKey !== lessonKey) {
      clearActiveConversation();
      sb._chat.resetConversationUI?.();
    }
    if (!activeConversationId) {
      activeConversationId = model.createConversationId(now);
      activeLessonKey = lessonKey;
      activeLessonUrl = url;
      activeStartedAt = now;
      activeTitle = '';
    }
    return {
      conversationId: activeConversationId,
      lessonKey: activeLessonKey,
      lessonUrl: url,
      lessonTitle: sb.$('h1')?.textContent?.trim() || document.title?.trim() || url,
      startedAt: activeStartedAt,
      title: activeTitle || model.deriveTitle(question),
    };
  }

  async function saveConversation(question, answer, lang, captured) {
    const snapshot = captured || beginConversationTurn(question);
    return enqueueWrite(async () => {
      try {
        await identityReady();
        const db = await openHistoryDb();
        const row = model.createTurnRow(
          {
            question,
            answer,
            lang,
            chapter: snapshot.lessonTitle,
            lessonTitle: snapshot.lessonTitle,
            timestamp: Date.now(),
            url: snapshot.lessonUrl,
            schemaVersion: model.SCHEMA_VERSION,
          },
          {
            conversationId: snapshot.conversationId,
            canonicalIdentity: canonicalIdForUrl(snapshot.lessonUrl),
            lessonKey: snapshot.lessonKey,
            title: snapshot.title,
            startedAt: snapshot.startedAt,
          },
        );

        let added = await addHistoryRow(db, row);
        if (!added.ok && added.error?.name === 'QuotaExceededError') {
          const preserved = [snapshot.conversationId, activeConversationId];
          const pruned = await pruneOldConversations(db, 20, preserved);
          added = await addHistoryRow(db, row);
          if (!added.ok && pruned > 0) {
            await pruneOldConversations(db, 40, preserved);
            added = await addHistoryRow(db, row);
          }
        }
        if (!added.ok) throw added.error || new Error('Tutor history add failed');
        if (snapshot.conversationId === activeConversationId) {
          activeTitle = row.title;
          activeLessonKey = row.lessonKey;
          activeLessonUrl = snapshot.lessonUrl;
        }
        return added.id;
      } catch (error) {
        console.warn('[SkillBridge] Failed to save conversation:', error);
        return null;
      }
    });
  }

  function startNewConversation(options = {}) {
    const focus = options.focus !== false;
    sb.cancelActiveStream?.();
    clearActiveConversation();
    // Any learning-tool subpanel has replaced the chat panel's DOM. Restore it
    // before resetting, otherwise closing that tool later resurrects the old
    // transcript even though the active conversation id was already cleared.
    sb._chat.closeSubPanel?.();
    sb._chat.resetConversationUI?.({ focus });
  }

  async function handleRouteChange() {
    if (!activeConversationId || !activeLessonUrl) return;
    const nextUrl = location.href;
    const nextRoute = model.lessonKeyFor(nextUrl, null);
    await identityReady();
    if (model.lessonKeyFor(location.href, null) !== nextRoute) return;
    const previousKey = model.lessonKeyFor(activeLessonUrl, canonicalIdForUrl(activeLessonUrl));
    const nextKey = model.lessonKeyFor(nextUrl, canonicalIdForUrl(nextUrl));
    if (previousKey !== nextKey) startNewConversation({ focus: false });
    else activeLessonKey = nextKey;
  }

  async function deleteConversation(conversationId) {
    return enqueueWrite(async () => {
      const db = await openHistoryDb();
      const rows = await readHistoryRows(db);
      const ids = rows.filter((row) => model.conversationIdForRow(row) === conversationId).map((row) => row.id);
      return deleteHistoryRows(db, ids);
    });
  }

  async function clearAllHistory() {
    return enqueueWrite(async () => clearHistoryRows(await openHistoryDb()));
  }

  async function exportHistory() {
    const conversations = await committedConversations(Number.MAX_SAFE_INTEGER);
    const blob = new Blob([model.serializeExport(conversations, Date.now())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `skillbridge-tutor-history-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function formatTime(timestamp, withTime = false) {
    const date = new Date(Number(timestamp));
    if (Number.isNaN(date.getTime())) return '';
    return withTime
      ? date.toLocaleString()
      : date.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
  }

  function formatTurnCount(count) {
    return `${count} ${sb.t(count === 1 ? HISTORY_LABELS.turn : HISTORY_LABELS.turns)}`;
  }

  function makeIconButton(className, label, iconHtml) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = iconHtml;
    return button;
  }

  function conversationDeleteLabel(conversation) {
    const action = sb.t(HISTORY_LABELS.deleteConversation);
    const title = conversation?.title?.trim();
    return title ? `${action}: ${title}` : action;
  }

  function conversationRow(conversation) {
    const row = document.createElement('div');
    row.className = 'si18n-history-item';
    row.dataset.id = conversation.conversationId;
    if (conversation.conversationId === activeConversationId) row.classList.add('si18n-history-item-current');

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'si18n-history-open';
    open.dataset.id = conversation.conversationId;
    const title = document.createElement('span');
    title.className = 'si18n-history-item-title si18n-history-item-q';
    title.textContent = conversation.title || conversation.turns[0]?.question || sb.t(HISTORY_LABELS.empty);
    const meta = document.createElement('span');
    meta.className = 'si18n-history-item-meta';
    const time = document.createElement('span');
    time.className = 'si18n-history-item-time';
    time.textContent = formatTime(conversation.updatedAt);
    const turns = document.createElement('span');
    turns.className = 'si18n-history-item-turns';
    turns.textContent = formatTurnCount(conversation.turns.length);
    meta.append(time, turns);
    if (conversation.conversationId === activeConversationId) {
      const current = document.createElement('span');
      current.className = 'si18n-history-current-badge';
      current.textContent = sb.t(HISTORY_LABELS.current);
      meta.appendChild(current);
    }
    open.append(title, meta);
    open.addEventListener('click', () => showConversationDetail(conversation.conversationId));

    const remove = makeIconButton(
      'si18n-history-delete',
      conversationDeleteLabel(conversation),
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>',
    );
    remove.dataset.id = conversation.conversationId;
    remove.addEventListener('click', () => confirmAndDelete(conversation.conversationId));
    row.append(open, remove);
    return row;
  }

  function renderConversationGroups(list, conversations) {
    const groups = new Map();
    for (const conversation of conversations) {
      const key = conversation.lessonKey || `url:${conversation.url || ''}`;
      if (!groups.has(key)) {
        groups.set(key, {
          title: conversation.lessonTitle || conversation.chapter || sb.t(HISTORY_LABELS.otherLesson),
          conversations: [],
        });
      }
      groups.get(key).conversations.push(conversation);
    }
    const fragment = document.createDocumentFragment();
    for (const group of groups.values()) {
      const heading = document.createElement('h3');
      heading.className = 'si18n-history-chapter';
      heading.textContent = group.title;
      fragment.appendChild(heading);
      for (const conversation of group.conversations) fragment.appendChild(conversationRow(conversation));
    }
    list.replaceChildren(fragment);
  }

  async function loadHistoryList() {
    const generation = ++renderGeneration;
    const list = sb.$id('si18n-history-list');
    if (!list) return;
    try {
      const conversations = await committedConversations();
      if (generation !== renderGeneration || !list.isConnected) return;
      if (conversations.length === 0) {
        list.innerHTML = `<div class="si18n-history-empty">${sb.t(HISTORY_LABELS.empty)}</div>`;
        return;
      }
      renderConversationGroups(list, conversations);
    } catch (error) {
      console.warn('[SkillBridge] Failed to load Tutor history:', error);
      if (generation === renderGeneration && list.isConnected) {
        list.innerHTML = `<div class="si18n-history-empty">${sb.t(HISTORY_LABELS.empty)}</div>`;
      }
    }
  }

  async function confirmAndDelete(conversationId) {
    if (!confirm(sb.t(HISTORY_LABELS.deleteConfirm))) return;
    try {
      await deleteConversation(conversationId);
      if (conversationId === activeConversationId) {
        sb._chat.closeSubPanel?.();
        clearActiveConversation();
        sb._chat.resetConversationUI?.();
        toggleHistoryPanel();
      } else {
        await loadHistoryList();
      }
    } catch (error) {
      console.warn('[SkillBridge] Failed to delete Tutor conversation:', error);
    }
  }

  function detailTurn(turn) {
    const wrapper = document.createElement('div');
    wrapper.className = 'si18n-history-detail-turn';
    wrapper.innerHTML = sb._chat.sanitizeHtml(`
      <div class="si18n-chat-msg si18n-chat-user">
        <div class="si18n-chat-bubble">${sb.escapeHtml(turn.question)}</div>
      </div>
      <div class="si18n-chat-msg si18n-chat-bot">
        <div class="si18n-chat-bubble">${sb._chat.formatResponse(turn.answer)}</div>
      </div>
    `);
    return wrapper;
  }

  function renderConversationDetail(conversation) {
    const list = sb.$id('si18n-history-list');
    if (!list) return;
    const detail = document.createElement('div');
    detail.className = 'si18n-history-detail';
    const nav = document.createElement('div');
    nav.className = 'si18n-history-detail-nav';
    const title = document.createElement('span');
    title.className = 'si18n-history-title';
    title.textContent = conversation.title;
    const remove = makeIconButton(
      'si18n-history-delete',
      conversationDeleteLabel(conversation),
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
    );
    remove.addEventListener('click', () => confirmAndDelete(conversation.conversationId));
    nav.append(title, remove);

    const meta = document.createElement('div');
    meta.className = 'si18n-history-detail-meta';
    const lesson = document.createElement('span');
    lesson.className = 'si18n-detail-lesson';
    lesson.textContent = conversation.lessonTitle || conversation.chapter || sb.t(HISTORY_LABELS.otherLesson);
    const time = document.createElement('span');
    time.className = 'si18n-detail-time';
    time.textContent = `${formatTime(conversation.updatedAt, true)} · ${formatTurnCount(conversation.turns.length)}`;
    meta.append(lesson, time);
    const turns = document.createElement('div');
    turns.className = 'si18n-history-detail-turns';
    for (const turn of conversation.turns) turns.appendChild(detailTurn(turn));
    detail.append(nav, meta, turns);
    list.replaceChildren(detail);
    const back = sb.$id('si18n-history-back');
    if (back) {
      back.setAttribute('aria-label', sb.t(HISTORY_LABELS.backToHistory));
      back.focus();
    }
  }

  async function showConversationDetail(conversationId) {
    const generation = ++renderGeneration;
    try {
      const conversations = await committedConversations(Number.MAX_SAFE_INTEGER);
      if (generation !== renderGeneration) return;
      const conversation = conversations.find((item) => item.conversationId === conversationId);
      if (conversation) renderConversationDetail(conversation);
    } catch (error) {
      console.warn('[SkillBridge] Failed to load Tutor conversation:', error);
    }
  }

  function toggleHistoryPanel() {
    const opened = sb._chat.openSubPanel(
      'history',
      `
      <div class="si18n-history-header">
        <button class="si18n-history-back" id="si18n-history-back" aria-label="${sb.t(A11Y_LABELS.backToSidebar)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg></button>
        <span class="si18n-history-title">${sb.t(HISTORY_LABELS.title)}</span>
        <button class="si18n-history-clear" id="si18n-history-export" title="${sb.t(HISTORY_LABELS.exportHistory)}" aria-label="${sb.t(HISTORY_LABELS.exportHistory)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
        <button class="si18n-history-clear" id="si18n-history-clear" title="${sb.t(HISTORY_LABELS.clearHistory)}" aria-label="${sb.t(HISTORY_LABELS.clearHistory)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>
      </div>
      <div class="si18n-history-list" id="si18n-history-list">
        <div class="si18n-history-loading">${sb.t(HISTORY_LABELS.loading)}</div>
      </div>
    `,
      () => {
        sb.$id('si18n-history-back')?.addEventListener('click', () => {
          const back = sb.$id('si18n-history-back');
          if (sb.$('.si18n-history-detail')) {
            if (back) back.setAttribute('aria-label', sb.t(A11Y_LABELS.backToSidebar));
            loadHistoryList();
          } else sb._chat.closeSubPanel();
        });
        sb.$id('si18n-history-export')?.addEventListener('click', () =>
          exportHistory().catch((error) => console.warn('[SkillBridge] Failed to export Tutor history:', error)),
        );
        sb.$id('si18n-history-clear')?.addEventListener('click', async () => {
          if (!confirm(sb.t(HISTORY_LABELS.clearConfirm))) return;
          try {
            await clearAllHistory();
            sb._chat.closeSubPanel?.();
            clearActiveConversation();
            sb._chat.resetConversationUI?.();
            toggleHistoryPanel();
          } catch (error) {
            console.warn('[SkillBridge] Failed to clear Tutor history:', error);
          }
        });
      },
    );
    if (!opened) {
      renderGeneration++;
      return;
    }
    loadHistoryList();
  }

  sb._chat.beginConversationTurn = beginConversationTurn;
  sb._chat.saveConversation = saveConversation;
  sb._chat.startNewConversation = startNewConversation;
  sb._chat.handleRouteChange = () =>
    handleRouteChange().catch((error) => {
      console.warn('[SkillBridge] Tutor route boundary check failed:', error);
    });
  sb._chat.toggleHistoryPanel = toggleHistoryPanel;
  sb._chat.getConversations = committedConversations;
  sb.registerModule?.('chat-history');
})();
