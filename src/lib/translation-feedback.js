/**
 * SkillBridge — translation feedback record core.
 *
 * The content UI owns presentation and storage. This module owns the small,
 * stable boundary beneath it: resolving a DOM selection back to one known
 * translation, constructing versioned records, and reading the legacy
 * `wrongText` queue without losing fields.
 *
 * Kept as a classic script because it is loaded directly by the extension;
 * CommonJS is exported as well so the same implementation is exercised in
 * tests and can be used by build-time tooling.
 */

/* global module */

(function (root) {
  'use strict';

  /** Bump only when a stored report needs a reader-visible shape change. */
  const REPORT_SCHEMA_VERSION = 1;
  const MAX_REPORTS = 200;

  const CAPTURES = new Set(['selection', 'manual']);
  const SIGNALS = new Set(['positive', 'negative']);

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function requiredText(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  }

  function comparableText(value) {
    return String(value == null ? '' : value)
      .replace(/\s+/g, ' ')
      .trim();
  }

  function containsNode(el, node) {
    return !!el && !!node && (el === node || (typeof el.contains === 'function' && el.contains(node)));
  }

  /**
   * Flatten the runtime's `Map<originalText, Array<{el}>>` bookkeeping into
   * element membership. A single `{el}` is tolerated as well, which keeps a
   * partially migrated in-memory queue from turning every selection inert.
   */
  function translatedElementSet(translatedTexts) {
    if (!translatedTexts || typeof translatedTexts.entries !== 'function') return null;
    const elements = new Set();
    try {
      for (const [key, rawEntries] of translatedTexts.entries()) {
        // The production map uses source strings as keys. Accepting an element
        // key costs nothing and makes the reader tolerant of an older draft of
        // the tracking shape.
        if (key && key.nodeType === 1) elements.add(key);
        const entries = Array.isArray(rawEntries) ? rawEntries : [rawEntries];
        for (const entry of entries) {
          const el = entry && entry.el ? entry.el : entry;
          if (el && el.nodeType === 1) elements.add(el);
        }
      }
    } catch (_error) {
      return null;
    }
    return elements;
  }

  /** Find the nearest translated ancestor of a Range boundary. */
  function nearestTrackedElement(node, tracked) {
    let cursor = node && node.nodeType === 1 ? node : node?.parentNode;
    while (cursor) {
      if (tracked.has(cursor)) return cursor;
      cursor = cursor.parentNode;
    }
    return null;
  }

  /** Convert the saved `innerHTML` snapshot to the text the learner saw. */
  function snapshotText(snapshot, el) {
    if (typeof snapshot !== 'string') return null;
    const doc = el?.ownerDocument;
    if (!doc || typeof doc.createElement !== 'function') return null;
    try {
      const template = doc.createElement('template');
      template.innerHTML = snapshot;
      if (template.content) return template.content.textContent || '';
      return template.textContent || '';
    } catch (_error) {
      return null;
    }
  }

  /**
   * Resolve a non-empty Range to exactly one element known to have been
   * translated.
   *
   * The map key is deliberately not used as translated text: refinement and
   * page-driven edits can change an element after it was first tracked. The
   * live `textContent` is the evidence the learner actually reacted to.
   *
   * @param {Range} range
   * @param {Map<Element, string>} originalTexts saved `innerHTML` snapshots
   * @param {Map<string, Array<{el: Element}>>} translatedTexts
   * @returns {{element: Element, originalText: string, translatedText: string, selectedText: string}|null}
   */
  function resolveSelection(range, originalTexts, translatedTexts) {
    if (
      !range ||
      range.collapsed ||
      !range.startContainer ||
      !range.endContainer ||
      !originalTexts ||
      typeof originalTexts.has !== 'function' ||
      typeof originalTexts.get !== 'function'
    ) {
      return null;
    }

    const tracked = translatedElementSet(translatedTexts);
    if (!tracked || tracked.size === 0) return null;

    const startElement = nearestTrackedElement(range.startContainer, tracked);
    const endElement = nearestTrackedElement(range.endContainer, tracked);
    if (!startElement || startElement !== endElement) return null;
    if (!containsNode(startElement, range.startContainer) || !containsNode(startElement, range.endContainer)) {
      return null;
    }
    if (!originalTexts.has(startElement)) return null;

    let selectedText;
    try {
      selectedText = requiredText(range.toString());
    } catch (_error) {
      return null;
    }
    if (!selectedText) return null;

    const originalText = snapshotText(originalTexts.get(startElement), startElement);
    const translatedText = startElement.textContent;
    if (originalText == null || translatedText == null) return null;
    if (!comparableText(originalText) || !comparableText(translatedText)) return null;

    // Tracking references can outlive a restore for a few microtasks. Equality
    // with the saved English snapshot is the deterministic indication that the
    // Range is no longer inside a translation; script heuristics would wrongly
    // reject protected English terms inside otherwise translated prose.
    if (comparableText(originalText) === comparableText(translatedText)) return null;

    return {
      element: startElement,
      originalText,
      translatedText,
      selectedText,
    };
  }

  function optionalString(input, key) {
    const value = input[key];
    if (value == null) return { ok: true, value: null };
    if (typeof value !== 'string') return { ok: false, value: null };
    const trimmed = value.trim();
    return { ok: true, value: trimmed || null };
  }

  /**
   * Validate and construct one current-schema report.
   *
   * This stays pure: the content module supplies page metadata and its clock.
   * Optional malformed metadata rejects the input instead of silently writing
   * a record different from the caller's intent.
   *
   * @param {object} input
   * @returns {object|null}
   */
  function makeFeedbackReport(input) {
    if (!isRecord(input)) return null;
    if (input.reportSchemaVersion != null && input.reportSchemaVersion !== REPORT_SCHEMA_VERSION) return null;

    const capture = requiredText(input.capture);
    const signal = requiredText(input.signal);
    if (!CAPTURES.has(capture) || !SIGNALS.has(signal)) return null;

    const translatedText = requiredText(input.translatedText);
    if (!translatedText) return null;

    let originalText = null;
    if (capture === 'selection') {
      originalText = requiredText(input.originalText);
      if (!originalText) return null;
    }

    let selectedText;
    if (input.selectedText == null || input.selectedText === '') {
      selectedText = translatedText;
    } else {
      selectedText = requiredText(input.selectedText);
      if (!selectedText) return null;
    }

    let correction = '';
    if (input.correction != null) {
      if (typeof input.correction !== 'string') return null;
      correction = input.correction.trim();
    }

    const report = {
      reportSchemaVersion: REPORT_SCHEMA_VERSION,
      capture,
      signal,
      originalText,
      translatedText,
      selectedText,
      correction,
    };

    const wrongText = optionalString(input, 'wrongText');
    const url = optionalString(input, 'url');
    const title = optionalString(input, 'title');
    const lang = optionalString(input, 'lang');
    if (!wrongText.ok || !url.ok || !title.ok || !lang.ok) return null;
    // v4.1's Reports list renders only `wrongText`. Keep that downgrade path
    // readable for every new v4.2 record while retaining `selectedText` as the
    // canonical evidence field. An explicit legacy value wins when a caller
    // intentionally supplies one; normal selection captures project their
    // canonical selection into the legacy field.
    report.wrongText = wrongText.value || selectedText;
    if (url.value) report.url = url.value;
    if (title.value) report.title = title.value;
    if (lang.value) report.lang = lang.value;

    if (input.ts != null) {
      if (typeof input.ts !== 'number' || !Number.isFinite(input.ts) || input.ts < 0) return null;
      report.ts = input.ts;
    }

    return report;
  }

  function hasValidOptionalLegacyFields(row) {
    for (const key of ['correction', 'url', 'title', 'lang']) {
      if (row[key] != null && typeof row[key] !== 'string') return false;
    }
    return row.ts == null || (typeof row.ts === 'number' && Number.isFinite(row.ts) && row.ts >= 0);
  }

  function isCanonicalReport(row) {
    if (!isRecord(row) || row.reportSchemaVersion !== REPORT_SCHEMA_VERSION) return false;
    if (!CAPTURES.has(row.capture) || !SIGNALS.has(row.signal)) return false;
    if (!requiredText(row.translatedText) || !requiredText(row.selectedText)) return false;
    if (row.capture === 'selection' && !requiredText(row.originalText)) return false;
    if (row.capture === 'manual' && row.originalText != null && !requiredText(row.originalText)) return false;
    if (!hasValidOptionalLegacyFields(row)) return false;
    if (row.wrongText != null && typeof row.wrongText !== 'string') return false;
    return true;
  }

  /**
   * Read a stored array or `{reports: [...]}` export and migrate legacy rows.
   *
   * Migration is additive: a v4.1 row keeps `wrongText` and every other field
   * byte-for-byte, gaining only the fields needed by the versioned reader.
   * A current bare array is returned by identity so its owner can observe that
   * no rewrite or in-memory queue replacement is needed.
   *
   * @param {unknown} raw
   * @returns {{records: object[], changed: boolean}}
   */
  function normalizeReports(raw) {
    // `undefined` is chrome.storage's normal fresh-install answer, not corrupt
    // data. Treat it like an already-canonical empty queue so opening the
    // extension does not manufacture a storage write.
    if (raw === undefined) return { records: [], changed: false };
    const isStoredArray = Array.isArray(raw);
    const rows = isStoredArray ? raw : isRecord(raw) && Array.isArray(raw.reports) ? raw.reports : null;
    if (!rows) return { records: [], changed: true };

    const reports = [];
    // Envelopes are accepted for import/export compatibility, but storage uses
    // the bare array. Marking the unwrap as a change lets the caller persist
    // the canonical shape once and then remain stable on every later load.
    let changed = !isStoredArray || rows.length > MAX_REPORTS;
    for (const row of rows) {
      if (reports.length === MAX_REPORTS) {
        changed = true;
        break;
      }
      if (!isRecord(row)) {
        changed = true;
        continue;
      }

      if (row.reportSchemaVersion === REPORT_SCHEMA_VERSION) {
        if (isCanonicalReport(row)) {
          // Early v4.2 development snapshots did not project `selectedText`
          // into the legacy alias. Backfill it once so every understood v1
          // row stays visible if the user temporarily returns to v4.1, whose
          // Reports list renders only `wrongText`.
          if (!requiredText(row.wrongText)) {
            reports.push({ ...row, wrongText: row.selectedText });
            changed = true;
          } else {
            reports.push({ ...row });
          }
        } else changed = true;
        continue;
      }

      // A present but unknown version is not legacy. The current reader must
      // not rewrite it, but dropping it and persisting the shortened queue
      // would be an irreversible downgrade. Preserve the opaque row exactly;
      // rendering and export treat every field as escaped/untrusted text.
      if (row.reportSchemaVersion != null) {
        reports.push({ ...row });
        continue;
      }
      if (!requiredText(row.wrongText) || !hasValidOptionalLegacyFields(row)) {
        changed = true;
        continue;
      }

      changed = true;
      reports.push({
        ...row,
        reportSchemaVersion: REPORT_SCHEMA_VERSION,
        capture: 'manual',
        signal: 'negative',
        originalText: null,
        translatedText: row.wrongText,
        selectedText: row.wrongText,
      });
    }
    // The no-change path deliberately returns the caller's array. Besides
    // avoiding churn, this makes idempotence observable to the storage owner:
    // it need not replace its in-memory queue when no migration occurred.
    return { records: changed ? reports : rows, changed };
  }

  const api = {
    REPORT_SCHEMA_VERSION,
    resolveSelection,
    normalizeReports,
    makeFeedbackReport,
  };

  if (root && typeof root === 'object') root._sbTranslationFeedback = api;
  if (typeof module !== 'undefined' && module && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null);
