/* global module */

/**
 * SkillBridge — pure Tutor conversation model.
 *
 * IndexedDB remains at schema version 1: every stored object is still one
 * question/answer row.  New rows only gain conversation metadata, while old
 * rows are grouped into a one-turn `legacy:<id>` conversation at read time.
 * This keeps an older, still-open extension tab from blocking a database
 * upgrade and avoids rewriting a learner's existing history in bulk.
 */
(function () {
  'use strict';

  const SCHEMA_VERSION = 2;
  const TITLE_MAX_LENGTH = 72;

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function safeString(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  /** Return a finite millisecond timestamp. Invalid values use `fallback`. */
  function normalizeTimestamp(value, fallback = 0) {
    let number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number) && typeof value === 'string' && value.trim()) {
      number = Date.parse(value);
    }
    if (Number.isFinite(number) && number >= 0) return number;

    const fallbackNumber = typeof fallback === 'number' ? fallback : Number(fallback);
    return Number.isFinite(fallbackNumber) && fallbackNumber >= 0 ? fallbackNumber : 0;
  }

  /** A local, deterministic title derived only from the first question. */
  function deriveTitle(question, maxLength = TITLE_MAX_LENGTH) {
    const compact = safeString(question).replace(/\s+/g, ' ').trim();
    const limit = Math.max(1, Math.trunc(Number(maxLength)) || TITLE_MAX_LENGTH);
    const codePoints = Array.from(compact);
    if (codePoints.length <= limit) return compact;
    if (limit === 1) return '…';
    return `${codePoints
      .slice(0, limit - 1)
      .join('')
      .trimEnd()}…`;
  }

  /**
   * Build a lesson grouping key without ever borrowing IndexedDB's `id` field.
   * Canonical identity wins. URL fallback deliberately ignores query/hash so
   * tracking parameters and in-page anchors do not split one lesson.
   */
  function lessonKeyFor(rawUrl, canonicalIdentity) {
    const canonical =
      canonicalIdentity && typeof canonicalIdentity === 'object' ? canonicalIdentity.id : canonicalIdentity;
    const canonicalText = safeString(canonical).trim();
    if (canonicalText) return canonicalText.startsWith('id:') ? canonicalText : `id:${canonicalText}`;

    const raw = safeString(rawUrl).trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw);
      parsed.search = '';
      parsed.hash = '';
      return `url:${parsed.href}`;
    } catch (_error) {
      const withoutQueryOrHash = raw.split(/[?#]/, 1)[0];
      return withoutQueryOrHash ? `url:${withoutQueryOrHash}` : '';
    }
  }

  /** Stable fallback for the rare unsaved/test row that has no IDB key yet. */
  function rowFingerprint(row) {
    const text = JSON.stringify([
      safeString(row?.url),
      normalizeTimestamp(row?.timestamp),
      safeString(row?.question),
      safeString(row?.answer),
    ]);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  /** Existing rows become isolated one-turn conversations, with no writes. */
  function conversationIdForRow(row) {
    const explicit = safeString(row?.conversationId).trim();
    if (explicit) return explicit;
    if (row && row.id !== undefined && row.id !== null && safeString(row.id) !== '') {
      return `legacy:${safeString(row.id)}`;
    }
    return `legacy:unsaved:${rowFingerprint(row)}`;
  }

  /** Create a local conversation identifier. Injectable entropy keeps tests deterministic. */
  function createConversationId(timestamp = Date.now(), entropy) {
    const time = normalizeTimestamp(timestamp, Date.now());
    let token = safeString(entropy).trim();
    if (!token) {
      if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
        const values = new Uint32Array(2);
        globalThis.crypto.getRandomValues(values);
        token = `${values[0].toString(36)}${values[1].toString(36)}`;
      } else {
        token = Math.random().toString(36).slice(2, 14);
      }
    }
    return `conversation:${time.toString(36)}-${token.replace(/\s+/g, '-')}`;
  }

  function normalizeTurnRow(row, timestampFallback = 0) {
    const source = row && typeof row === 'object' ? row : {};
    const timestamp = normalizeTimestamp(source.timestamp, timestampFallback);
    const normalized = {
      ...source,
      question: safeString(source.question),
      answer: safeString(source.answer),
      lang: safeString(source.lang),
      chapter: safeString(source.chapter),
      timestamp,
      url: safeString(source.url),
    };

    if (own(source, 'conversationId')) normalized.conversationId = safeString(source.conversationId).trim();
    if (own(source, 'lessonKey')) normalized.lessonKey = safeString(source.lessonKey).trim();
    if (own(source, 'title')) normalized.title = safeString(source.title);
    if (own(source, 'startedAt')) normalized.startedAt = normalizeTimestamp(source.startedAt, timestamp);
    return normalized;
  }

  /**
   * Add conversation metadata to one Q/A row. The input row is spread first,
   * so all v1 fields (including an existing numeric `id`) survive unchanged.
   * Canonical identity is consumed only for `lessonKey`.
   */
  function createTurnRow(row, conversation = {}) {
    const source = row && typeof row === 'object' ? row : {};
    const timestamp = normalizeTimestamp(source.timestamp, Date.now());
    const conversationId =
      safeString(conversation.conversationId || source.conversationId).trim() || createConversationId(timestamp);
    const canonicalKey = lessonKeyFor(source.url, conversation.canonicalIdentity);
    const existingKey = safeString(conversation.lessonKey || source.lessonKey).trim();
    const lessonKey = canonicalKey.startsWith('id:') ? canonicalKey : existingKey || canonicalKey;
    const startedAt = normalizeTimestamp(conversation.startedAt ?? source.startedAt, timestamp);
    const title = deriveTitle(conversation.title || source.title || source.question);

    return normalizeTurnRow(
      {
        ...source,
        conversationId,
        lessonKey,
        title,
        startedAt,
      },
      timestamp,
    );
  }

  function compareRows(left, right) {
    const byTime = left.row.timestamp - right.row.timestamp;
    if (byTime !== 0) return byTime;
    const leftId = Number(left.row.id);
    const rightId = Number(right.row.id);
    if (Number.isFinite(leftId) && Number.isFinite(rightId) && leftId !== rightId) return leftId - rightId;
    return left.index - right.index;
  }

  function normalizeConversation(conversation) {
    const source = conversation && typeof conversation === 'object' ? conversation : {};
    const indexedTurns = (Array.isArray(source.turns) ? source.turns : [])
      .map((row, index) => ({ row: normalizeTurnRow(row), index }))
      .sort(compareRows);
    const turns = indexedTurns.map(({ row }) => row);
    const first = turns[0] || {};
    const last = turns[turns.length - 1] || first;
    const startedAt = normalizeTimestamp(source.startedAt, first.startedAt ?? first.timestamp ?? 0);
    const updatedAt = normalizeTimestamp(source.updatedAt, last.timestamp ?? startedAt);
    const canonicalKey = lessonKeyFor(first.url || source.url, source.canonicalIdentity);
    const existingKey = safeString(source.lessonKey || first.lessonKey).trim();
    const conversationId = safeString(source.conversationId || source.id || conversationIdForRow(first)).trim();
    const lessonTitle = safeString(source.lessonTitle || source.chapter || first.chapter);

    return {
      ...source,
      schemaVersion: SCHEMA_VERSION,
      // `id` is the in-memory conversation identifier. Stored turn rows keep
      // their numeric keyPath `id`; this grouped object is never written back.
      id: conversationId,
      conversationId,
      lessonKey: canonicalKey.startsWith('id:') ? canonicalKey : existingKey || canonicalKey,
      title: deriveTitle(source.title || first.title || first.question),
      lang: safeString(source.lang || first.lang),
      chapter: lessonTitle,
      lessonTitle,
      url: safeString(source.url || first.url),
      startedAt,
      updatedAt: Math.max(startedAt, updatedAt),
      turns,
    };
  }

  /**
   * Group IDB Q/A rows into schema-v2 conversations without rewriting them.
   * `canonicalIdentityForRow`, when supplied, is a local resolver callback.
   */
  function groupConversationRows(rows, canonicalIdentityForRow) {
    const groups = new Map();
    for (const [index, rawRow] of (Array.isArray(rows) ? rows : []).entries()) {
      const row = normalizeTurnRow(rawRow);
      const conversationId = conversationIdForRow(row);
      const canonicalIdentity =
        typeof canonicalIdentityForRow === 'function' ? canonicalIdentityForRow(rawRow) : canonicalIdentityForRow;
      const canonicalKey = lessonKeyFor(row.url, canonicalIdentity);
      const existingKey = safeString(row.lessonKey).trim();
      const lessonKey = canonicalKey.startsWith('id:') ? canonicalKey : existingKey || canonicalKey;

      if (!groups.has(conversationId)) groups.set(conversationId, []);
      groups.get(conversationId).push({ row, index, lessonKey });
    }

    const conversations = [];
    for (const [conversationId, indexedRows] of groups) {
      indexedRows.sort(compareRows);
      const turns = indexedRows.map(({ row }) => row);
      const first = turns[0];
      const last = turns[turns.length - 1];
      const startedAt = Math.min(...turns.map((row) => normalizeTimestamp(row.startedAt, row.timestamp)));
      conversations.push(
        normalizeConversation({
          conversationId,
          lessonKey: indexedRows[0].lessonKey,
          title: first.title || deriveTitle(first.question),
          lang: first.lang,
          chapter: first.chapter,
          url: first.url,
          startedAt,
          updatedAt: last.timestamp,
          turns,
        }),
      );
    }

    return conversations.sort((left, right) => {
      if (right.updatedAt !== left.updatedAt) return right.updatedAt - left.updatedAt;
      if (right.startedAt !== left.startedAt) return right.startedAt - left.startedAt;
      return left.conversationId.localeCompare(right.conversationId);
    });
  }

  /** Select complete oldest conversations for quota pruning, preserving active/in-flight conversations. */
  function oldestConversationRowIds(conversations, excludedConversationIds, target) {
    const limit = Math.max(0, Math.trunc(Number(target)) || 0);
    if (limit === 0) return [];
    const excluded = new Set(
      (Array.isArray(excludedConversationIds) ? excludedConversationIds : [excludedConversationIds])
        .map((id) => safeString(id).trim())
        .filter(Boolean),
    );
    return (Array.isArray(conversations) ? conversations : [])
      .filter((conversation) => !excluded.has(safeString(conversation?.conversationId || conversation?.id).trim()))
      .slice()
      .sort((left, right) => {
        const byUpdate = normalizeTimestamp(left?.updatedAt) - normalizeTimestamp(right?.updatedAt);
        if (byUpdate !== 0) return byUpdate;
        const byStart = normalizeTimestamp(left?.startedAt) - normalizeTimestamp(right?.startedAt);
        if (byStart !== 0) return byStart;
        return safeString(left?.conversationId || left?.id).localeCompare(
          safeString(right?.conversationId || right?.id),
        );
      })
      .slice(0, limit)
      .flatMap((conversation) =>
        (Array.isArray(conversation?.turns) ? conversation.turns : [])
          .map((turn) => turn?.id)
          .filter((id) => id !== undefined && id !== null),
      );
  }

  function migrateLegacyConversation(row, canonicalIdentity) {
    return groupConversationRows([row], canonicalIdentity)[0] || normalizeConversation({ turns: [] });
  }

  /** JSON-safe, recursively key-sorted copy for reproducible local exports. */
  function stableJsonValue(value, seen = new WeakSet()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'bigint') return value.toString();
    if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return undefined;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
    if (typeof value !== 'object') return safeString(value);
    if (seen.has(value)) return null;
    seen.add(value);

    if (Array.isArray(value)) {
      const output = value.map((item) => {
        const safe = stableJsonValue(item, seen);
        return safe === undefined ? null : safe;
      });
      seen.delete(value);
      return output;
    }

    const output = {};
    for (const key of Object.keys(value).sort()) {
      const safe = stableJsonValue(value[key], seen);
      if (safe !== undefined) output[key] = safe;
    }
    seen.delete(value);
    return output;
  }

  /** Serialize only caller-supplied, locally stored/grouped history. */
  function serializeExport(conversations, exportedAt = Date.now()) {
    const normalized = (Array.isArray(conversations) ? conversations : []).map(normalizeConversation);
    const envelope = {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: normalizeTimestamp(exportedAt),
      conversations: stableJsonValue(normalized),
    };
    return JSON.stringify(envelope, null, 2);
  }

  const api = Object.freeze({
    SCHEMA_VERSION,
    TITLE_MAX_LENGTH,
    normalizeTimestamp,
    deriveTitle,
    lessonKeyFor,
    conversationIdForRow,
    createConversationId,
    normalizeTurnRow,
    createTurnRow,
    normalizeConversation,
    groupConversationRows,
    oldestConversationRowIds,
    migrateLegacyConversation,
    serializeExport,
  });

  if (typeof window !== 'undefined') window._sbTutorConversations = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
