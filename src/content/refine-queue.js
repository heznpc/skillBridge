/**
 * SkillBridge — optional LLM post-editing of the Google Translate baseline.
 *
 * Machine translation of technical course material fails in a particular way:
 * the sentence is fluent and a term is wrong. A language model is good at
 * fixing that. It is also good at rewriting an endpoint, dropping a version
 * number, or answering the prompt instead of editing the text — so this is
 * built as a post-editor with a veto rather than as a translator.
 *
 * Three properties hold, in this order.
 *
 * 1. THE BASELINE IS ALWAYS FIRST. Google Translate writes to the page exactly
 *    as it does with this feature off. Nothing waits for a model, nothing is
 *    held back pending a refinement, and a learner who never gets one sees the
 *    same page a moment sooner than one who does.
 *
 * 2. A REFINEMENT ONLY LANDS IF IT SURVIVES THE VALIDATOR. Protected terms,
 *    numbers, URLs, code spans and markup all have to come through unchanged,
 *    and where the target language uses a non-Latin script the answer has to
 *    be in it (src/lib/refinement-validator.js). A failure keeps the baseline.
 *
 *    What that proves is INVARIANT PRESERVATION, not semantic equivalence. A
 *    post-edit can invert a negation, swap cause for effect, or turn "may" into
 *    "must" while keeping every term, number, URL and length bound intact. So
 *    the validator bounds how a refinement can go wrong; it cannot promise the
 *    result is at least as good as the baseline, and this module must not be
 *    described as if it does. That promise needs measured quality evidence,
 *    which is what the GT experiment is for.
 *
 * 3. NOTHING RUNS WITHOUT BOTH THE SETTING AND THE CONSENT. Off by default;
 *    see src/lib/refinement-policy.js for why this is separate from the Tutor's
 *    consent, and for what "follow the Tutor" resolves to when the Tutor is off.
 *
 * The translation memory is untouched. Refinements are written to their own
 * store and never overwrite a cached Google translation, because the cache is
 * the thing that makes a revisit instant and a shared cache would mean a
 * rejected or disabled refinement silently degrading it. The dictionaries are
 * likewise read-only here.
 *
 * SCOPE, stated rather than discovered: only FLAT-TEXT blocks are post-edited.
 * Structured blocks — a paragraph carrying links, inline code or emphasis — go
 * through the HTML reconciliation path, where the translated markup is matched
 * back to the original nodes. Handing a model's plain-text answer to that path
 * would flatten the block, and handing it markup to preserve is a second
 * integrity problem on top of the one the validator already solves. Those
 * blocks keep their Google Translate baseline, which is the same thing they
 * have with the feature off.
 */

(function () {
  'use strict';

  const sb = window._sb;
  if (!sb) {
    console.warn('[SkillBridge] refine-queue: _sb not ready');
    return;
  }
  const log = window._skillbridgeLog?.createLogger('refine') || { debug() {}, info() {}, warn() {}, error() {} };
  const policy = window._sbRefinementPolicy;
  const validator = window._sbRefinementValidator;
  if (!policy || !validator) {
    console.warn('[SkillBridge] refine-queue: policy or validator missing — refinement disabled');
    return;
  }

  const STORAGE_MODE = 'sb_refine_mode';
  const STORAGE_CONSENT = 'sb_refine_consent';
  /** Refinement results, kept apart from the GT cache on purpose (see the header). */
  const STORAGE_CACHE = 'sb_refine_cache';

  /**
   * Bounds, because this spends a model call per paragraph.
   *
   * The queue length alone was not a budget: a long lesson enqueued every
   * block the translator produced, so a learner who read the first screen
   * still paid for calls on paragraphs they never scrolled to. Refinement is
   * an optional improvement to what someone is READING, so the work is
   * restricted to blocks at or near the viewport, and the whole page has a
   * ceiling regardless.
   */
  const MAX_QUEUE = 200;
  const MAX_CALLS_PER_PAGE = 40;
  /** How far outside the viewport still counts as "about to be read". */
  const NEAR_VIEWPORT_PX = 1200;
  const CACHE_MAX_ENTRIES = 500;

  const queue = [];
  let running = false;
  /** Aborts whatever call is in flight when consent or the mode is withdrawn. */
  let inFlight = null;
  /** Reset per page/language generation, alongside the GT generation. */
  let callsThisPage = 0;
  /** Bumped whenever the language or the page changes, exactly like the GT generation. */
  let cache = null;
  let cachePromise = null;

  const stats = { queued: 0, refined: 0, rejected: 0, failed: 0, cached: 0, calls: 0 };

  // ============================================================
  // SETTINGS
  // ============================================================

  /**
   * Resolve the setting into an engine, or into a reason there is none.
   *
   * Read fresh on every drain rather than cached at load: a learner who turns
   * refinement off mid-page means it off from that moment, not from the next
   * navigation.
   */
  async function currentEngine() {
    let stored;
    try {
      stored = await chrome.storage.local.get([STORAGE_MODE, STORAGE_CONSENT, 'sb_ai_engine']);
    } catch (_e) {
      // Unreadable settings fail CLOSED. An optional feature that sends course
      // text to a model must never run because a storage read went wrong.
      return { enabled: false, engine: null, reason: 'settings-unreadable' };
    }
    return policy.resolveRefinementEngine({
      mode: stored[STORAGE_MODE] || policy.REFINE_MODE.OFF,
      consented: stored[STORAGE_CONSENT] === true,
      tutorEngine: stored.sb_ai_engine || 'cloud',
      hasTransport: sb.hostCaps?.bridge !== false,
    });
  }

  // ============================================================
  // REFINEMENT CACHE (separate from the translation memory)
  // ============================================================

  async function loadCache() {
    if (cache) return cache;
    if (!cachePromise) {
      cachePromise = chrome.storage.local
        .get([STORAGE_CACHE])
        .then((res) => {
          cache = res[STORAGE_CACHE] && typeof res[STORAGE_CACHE] === 'object' ? res[STORAGE_CACHE] : {};
          return cache;
        })
        .catch(() => {
          cache = {};
          return cache;
        });
    }
    return cachePromise;
  }

  /**
   * Cache identity has to cover every input the refinement was derived from.
   *
   * The key was `lang + baseline`, but the prompt is built from the ENGLISH
   * SOURCE as well as the baseline — so two different source sentences that
   * happen to share a Google translation would collide, and the first one's
   * post-edit would be served for the second.
   *
   * The version prefix covers the input nobody thinks of: the prompt and the
   * validator themselves. When either changes, previously accepted refinements
   * were accepted under different rules, and re-serving them would quietly
   * ship results the current contract would reject. Bump it when you change
   * buildRefinementPrompt or validateRefinement.
   */
  const REFINE_CACHE_VERSION = 1;
  const cacheKey = (baseline, lang, source) => [REFINE_CACHE_VERSION, lang, source || '', baseline].join('\u0001');

  let _writeQueue = Promise.resolve();
  function persistCache() {
    _writeQueue = _writeQueue
      .catch(() => {})
      .then(() => chrome.storage.local.set({ [STORAGE_CACHE]: cache }))
      .catch(() => {});
  }

  function rememberRefinement(baseline, lang, refined, source) {
    if (!cache) return;
    const keys = Object.keys(cache);
    if (keys.length >= CACHE_MAX_ENTRIES) delete cache[keys[0]];
    cache[cacheKey(baseline, lang, source)] = refined;
    persistCache();
  }

  // ============================================================
  // QUEUE
  // ============================================================

  /**
   * Record a block whose baseline has just been written to the page.
   *
   * Called from the GT apply paths, AFTER the baseline is in the DOM. Cheap and
   * synchronous: it takes the text and returns. Whether anything is ever done
   * with it is decided later, in the drain, against settings read at that time.
   */
  /** True when the element is on screen or close enough to be read next. */
  function isNearViewport(el) {
    try {
      const r = el.getBoundingClientRect();
      const h = window.innerHeight || 0;
      return r.bottom > -NEAR_VIEWPORT_PX && r.top < h + NEAR_VIEWPORT_PX;
    } catch (_e) {
      // No layout to measure — treat it as eligible rather than silently
      // dropping work on a page that renders unusually.
      return true;
    }
  }

  function enqueue(entry) {
    if (!entry?.el || !entry.baseline || queue.length >= MAX_QUEUE) return;
    if (!isNearViewport(entry.el)) return;
    queue.push({ ...entry, generation: sb._gt?.gtGeneration });
    stats.queued += 1;
    if (!running) void drain();
  }

  async function drain() {
    if (running) return;
    running = true;
    try {
      await loadCache();
      while (queue.length > 0) {
        // Re-resolved before EVERY call, not once when the drain started.
        //
        // A drain could previously run through the whole queue on the engine
        // it read at the top, so a learner who switched refinement off — or
        // withdrew consent — kept paying for model calls on text they had
        // already decided not to send. Off means off from that moment.
        const resolved = await currentEngine();
        if (!resolved.enabled) {
          // Dropped rather than held: turning this on later should refine what
          // is being read THEN, not a backlog already scrolled past.
          queue.length = 0;
          return;
        }
        if (callsThisPage >= MAX_CALLS_PER_PAGE) {
          queue.length = 0;
          log.debug('refinement page budget spent', { calls: callsThisPage });
          return;
        }
        const item = queue.shift();
        await refineOne(item, resolved.engine);
      }
    } finally {
      running = false;
    }
  }

  /**
   * Stop everything in flight and drop what is waiting.
   *
   * Called when the setting or the consent changes. Aborting the live call is
   * the part that matters: without it, withdrawing consent still let the
   * request that was already open complete.
   */
  function cancelAll(reason) {
    queue.length = 0;
    if (inFlight) {
      inFlight.abort();
      inFlight = null;
      log.debug('refinement aborted', reason);
    }
  }

  /** True when the page has moved on and this refinement would land somewhere wrong. */
  function isStale(item) {
    if (!item.el?.parentNode) return true;
    if (sb._gt && item.generation !== sb._gt.gtGeneration) return true;
    if (item.targetLang !== sb.currentLang) return true;
    // The baseline we were given must still be what is on screen. Anything else
    // means another pass rewrote this block, and overwriting it would undo work
    // that happened after ours started.
    return item.el.textContent.replace(/\s+/g, ' ').trim() !== item.baseline.replace(/\s+/g, ' ').trim();
  }

  async function refineOne(item, engine) {
    if (isStale(item)) return;

    const cached = cache?.[cacheKey(item.baseline, item.targetLang, item.source)];
    if (typeof cached === 'string') {
      stats.cached += 1;
      apply(item, cached);
      return;
    }

    const protectedTerms = window._protectedTerms?.getProtectedTermList?.() || [];
    const prompt = policy.buildRefinementPrompt({
      source: item.source,
      baseline: item.baseline,
      langName: sb.translator?.supportedLanguages?.[item.targetLang] || item.targetLang,
      protectedTerms,
    });

    let candidate;
    const controller = new AbortController();
    inFlight = controller;
    try {
      stats.calls += 1;
      callsThisPage += 1;
      candidate = await sb.translator.refineText(prompt, {
        engine,
        targetLang: item.targetLang,
        signal: controller.signal,
      });
    } catch (_e) {
      // A transport failure is a non-event: the baseline is already correct
      // enough to read, and this is an optional improvement on top of it.
      stats.failed += 1;
      return;
    } finally {
      if (inFlight === controller) inFlight = null;
    }
    // Withdrawn while this call was open: the answer is discarded rather than
    // applied, so the last thing a learner sees after switching off is not a
    // refinement that arrived afterwards.
    if (controller.signal.aborted) return;

    const verdict = validator.validateRefinement({
      baseline: item.baseline,
      candidate: String(candidate || '').trim(),
      source: item.source,
      targetLang: item.targetLang,
      protectedTerms,
    });
    if (!verdict.ok) {
      stats.rejected += 1;
      // Logged, not silent: a validator that starts rejecting everything is a
      // broken feature, and a broken feature that spends a model call per
      // paragraph should be visible to whoever looks.
      log.debug('refinement rejected', verdict.violations, verdict.detail);
      return;
    }

    if (isStale(item)) return;
    const accepted = String(candidate).trim();
    // Only a refinement that PASSED is remembered. Caching a rejected one would
    // re-serve the same rejection on every revisit while occupying a slot.
    rememberRefinement(item.baseline, item.targetLang, accepted, item.source);
    apply(item, accepted);
  }

  function apply(item, refined) {
    if (isStale(item)) return;
    if (sb.safeReplaceText(item.el, refined) === false) return;
    stats.refined += 1;
    // Re-mark so the translation walk does not treat the refined text as fresh
    // English and send it back to Google — the exact loop the `_lastWritten`
    // guard exists to prevent.
    sb._gt?.markTranslated?.(item.el);
  }

  // ============================================================
  // EXPORT
  // ============================================================

  sb._refine = {
    enqueue,
    /** For settings UI and tests; never consulted by the drain. */
    currentEngine,
    stats: () => ({ ...stats, pending: queue.length }),
    /** Withdrawn consent, or the setting switched off. Exposed for tests. */
    cancelAll,
    reset() {
      cancelAll('reset');
      // A new page or language is a new budget — the ceiling is per page, not
      // per session.
      callsThisPage = 0;
      for (const key of Object.keys(stats)) stats[key] = 0;
    },
  };
  // Consent and the mode live in storage, and they can change from the popup
  // while a drain is running in this tab. Watching the keys is what makes
  // "off" immediate rather than "off from the next page".
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (!(STORAGE_MODE in changes) && !(STORAGE_CONSENT in changes)) return;
      const mode = changes[STORAGE_MODE]?.newValue;
      const consent = changes[STORAGE_CONSENT]?.newValue;
      const offNow = (STORAGE_MODE in changes && mode === policy.REFINE_MODE.OFF) || consent === false;
      if (offNow) cancelAll('setting-withdrawn');
    });
  } catch (_e) {
    // No storage events available (tests, or a restricted context). The
    // per-call re-check in the drain still catches the change one call later.
  }

  sb.registerModule?.('refine-queue');
})();
