/**
 * SkillBridge — HTML-mode Google Translate reconciliation (v4, B6).
 *
 * Replaces the flat-text + placeholder-token approach for inline-mixed blocks
 * (prose containing <a>, <strong>, <code>, …). Instead of extracting text and
 * losing/mangling structure, the block's innerHTML is sent to the GT endpoint,
 * which preserves tags/hrefs, translates inner text, and reorders for target
 * grammar (verified 2026-07-24 across en→ko/ja/zh/ar). This module takes the
 * translated HTML and folds it back into the ORIGINAL element WITHOUT
 * `el.innerHTML =` — original inline element nodes are moved into place so
 * their identity, listeners, and attributes survive; only text is replaced.
 *
 * Safety: an integrity gate compares the interactive/structural tag set of the
 * translation against the original. Any mismatch → caller keeps the original
 * (never render a corrupted/blanked structure). See TRANSLATION-HTML-GT-SPEC.md.
 *
 * Exposes: window._sbHtmlGt = { checkTagIntegrity, reconcileHtml, elementKey }
 */
(function () {
  'use strict';

  // Tags whose presence/identity we protect. Interactive ones are load-bearing
  // (a blanked/duplicated <a> is the killer this whole path exists to prevent);
  // formatting ones are matched too so reconciliation stays deterministic.
  // IMG is tracked (not just formatting): GT does preserve inline <img src>
  // (verified 2026-07-25 en→ko), but an UNtracked element is invisible to the
  // integrity gate, so a drop would pass the gate and reconciliation would
  // silently lose the image. Tracking it makes a dropped/rewritten image fail
  // the gate → caller keeps the original block, and preserves the original
  // node instead of a shallow clone.
  const TRACKED_TAGS = new Set([
    'A',
    'BUTTON',
    'IMG',
    'STRONG',
    'B',
    'EM',
    'I',
    'CODE',
    'U',
    'SPAN',
    'SUP',
    'SUB',
    'MARK',
  ]);
  const INTERACTIVE_TAGS = new Set(['A', 'BUTTON']);

  // A stable key for matching a translated element back to its original.
  // GT preserves tagName + href/src, so those identify the element. Repeats
  // that share a key (e.g. two <a href="/x">, or every plain <strong>) are NOT
  // disambiguated by the key itself — buildOriginalPool consumes same-key
  // originals FIFO in document order, so a GT reorder can pair original #1
  // with translated position #2. That is harmless for same-key elements with
  // identical attributes (the visible text comes from the translation either
  // way); it only matters when same-key elements carry distinct attributes,
  // which is why the pool prefers an attribute-exact candidate below.
  function elementKey(el) {
    const tag = el.tagName;
    const href = el.getAttribute && (el.getAttribute('href') || el.getAttribute('src') || '');
    return `${tag}|${href}`;
  }

  // Collect tracked descendant elements into a key→count multiset.
  function tagMultiset(root) {
    const counts = new Map();
    const walk = (node) => {
      for (const child of node.children || []) {
        if (TRACKED_TAGS.has(child.tagName)) {
          const k = elementKey(child);
          counts.set(k, (counts.get(k) || 0) + 1);
        }
        walk(child);
      }
    };
    walk(root);
    return counts;
  }

  function multisetsEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) if (b.get(k) !== v) return false;
    return true;
  }

  /**
   * Integrity gate. `translatedRoot` is a parsed container whose children are
   * the translated block content. Returns true only if every tracked/
   * interactive element in the original is present exactly once in the
   * translation with the same key. Interactive elements are required to match
   * exactly; a single missing/extra <a>/<button> fails the gate.
   * @param {Element} originalEl
   * @param {Element} translatedRoot
   * @returns {boolean}
   */
  function checkTagIntegrity(originalEl, translatedRoot) {
    const orig = tagMultiset(originalEl);
    const trans = tagMultiset(translatedRoot);
    // Interactive elements must match exactly (the load-bearing invariant).
    for (const [k, v] of orig) {
      const tag = k.split('|', 1)[0];
      if (INTERACTIVE_TAGS.has(tag) && trans.get(k) !== v) return false;
    }
    for (const [k, v] of trans) {
      const tag = k.split('|', 1)[0];
      if (INTERACTIVE_TAGS.has(tag) && orig.get(k) !== v) return false;
    }
    // Full multiset equality for everything tracked keeps reconciliation total;
    // a formatting-only drift (e.g. GT drops a <strong>) also fails so we never
    // render a partially-restructured block.
    return multisetsEqual(orig, trans);
  }

  // Pool of original tracked elements by key, in document order, so repeated
  // keys are consumed FIFO to match the translation's order.
  function buildOriginalPool(originalEl) {
    const pool = new Map(); // key -> Element[]
    const walk = (node) => {
      for (const child of node.children || []) {
        if (TRACKED_TAGS.has(child.tagName)) {
          const k = elementKey(child);
          if (!pool.has(k)) pool.set(k, []);
          pool.get(k).push(child);
        }
        walk(child);
      }
    };
    walk(originalEl);
    return pool;
  }

  /**
   * Fold the translated content into `originalEl` in place, preserving original
   * element node identity. Assumes checkTagIntegrity already passed.
   *
   * For each node in the translated tree:
   *  - text node  → cloned as a fresh text node (the translated text)
   *  - tracked element → the matching ORIGINAL element node is MOVED here, its
   *    children recursively reconciled (so it keeps identity but gains
   *    translated text + child order)
   *  - untracked element → cloned shallow and its children reconciled
   *
   * @param {Element} originalEl   element to mutate (its children are replaced)
   * @param {Element} translatedRoot parsed container of translated children
   * @returns {boolean} true on success
   */
  // Signature of the attributes GT carries through, used to disambiguate
  // same-key originals (elementKey is only tag|href/src).
  function attrSignature(el) {
    if (!el.getAttribute) return '';
    return ['class', 'id', 'title', 'alt'].map((a) => el.getAttribute(a) || '').join('|');
  }

  // Take the original that best corresponds to `srcNode` from a same-key
  // bucket: prefer an attribute-exact match (so a GT reorder cannot land the
  // attributes of one element on another's text), else fall back to FIFO
  // document order.
  function takeBestMatch(bucket, srcNode) {
    if (!bucket.length) return null;
    const wanted = attrSignature(srcNode);
    const exact = bucket.findIndex((el) => attrSignature(el) === wanted);
    return bucket.splice(exact >= 0 ? exact : 0, 1)[0];
  }

  function reconcileHtml(originalEl, translatedRoot) {
    const pool = buildOriginalPool(originalEl);
    const doc = originalEl.ownerDocument || document;

    function reconcileInto(destParent, srcParent) {
      for (const srcNode of Array.from(srcParent.childNodes)) {
        if (srcNode.nodeType === 3 /* TEXT_NODE */) {
          destParent.appendChild(doc.createTextNode(srcNode.textContent));
        } else if (srcNode.nodeType === 1 /* ELEMENT_NODE */) {
          const tag = srcNode.tagName;
          if (TRACKED_TAGS.has(tag)) {
            const k = elementKey(srcNode);
            const bucket = pool.get(k);
            const origEl = bucket && takeBestMatch(bucket, srcNode);
            if (!origEl) return false; // integrity said this can't happen; bail safe
            // Move original node here, clear its children, refill from translation.
            while (origEl.firstChild) origEl.removeChild(origEl.firstChild);
            destParent.appendChild(origEl);
            if (!reconcileInto(origEl, srcNode)) return false;
          } else {
            // Untracked (e.g. <br>): clone shallow, recurse.
            const clone = srcNode.cloneNode(false);
            destParent.appendChild(clone);
            if (!reconcileInto(clone, srcNode)) return false;
          }
        }
        // Comments / others: dropped.
      }
      return true;
    }

    const frag = doc.createDocumentFragment();
    if (!reconcileInto(frag, translatedRoot)) return false;
    while (originalEl.firstChild) originalEl.removeChild(originalEl.firstChild);
    originalEl.appendChild(frag);
    return true;
  }

  const api = { checkTagIntegrity, reconcileHtml, elementKey, TRACKED_TAGS, INTERACTIVE_TAGS };
  if (typeof window !== 'undefined') window._sbHtmlGt = api;
  if (typeof globalThis !== 'undefined' && typeof globalThis.module !== 'undefined') {
    globalThis.module.exports = api;
  }
})();
