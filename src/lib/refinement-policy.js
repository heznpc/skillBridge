/**
 * SkillBridge — whether a translation refinement may run at all.
 *
 * Refinement sends already-translated course text to a language model to be
 * post-edited. That is a different bargain from the Tutor: the Tutor sends
 * something the learner just typed, deliberately, one message at a time, while
 * this would send paragraphs the learner never chose, continuously, as they
 * read. Consenting to one is not consenting to the other, so this has its own
 * consent and its own setting, and BOTH have to be affirmative before a single
 * call is made.
 *
 * Default off. Not "off until we see how it performs" — off because a feature
 * that spends a model call per paragraph of someone's reading should be a thing
 * they went and turned on.
 *
 * Four settings, and the interesting one is FOLLOW. A learner who has already
 * decided how they feel about AI in this extension should not have to decide
 * twice; FOLLOW says "whatever I picked for the Tutor". It resolves to nothing
 * when the Tutor is off, which is the whole point — "AI off" has to mean off
 * everywhere, or it means nothing.
 *
 * Pure: settings in, a decision out. Nothing here reads storage or the network.
 */

/** The refinement setting. */
const REFINE_MODE = Object.freeze({
  /** Default. No model call is ever made. */
  OFF: 'off',
  /** Post-edit through the same cloud transport the Tutor uses. */
  CLOUD: 'cloud',
  /** Post-edit through the learner's own local server. */
  LOCAL: 'local',
  /** Use whatever the Tutor is set to — including off. */
  FOLLOW: 'follow',
});

/** Why refinement is not running. Surfaced, so "nothing happened" is explicable. */
const REFINE_BLOCKED = Object.freeze({
  /** The setting is off. */
  MODE_OFF: 'mode-off',
  /** The setting is on but the separate consent was never given. */
  NO_CONSENT: 'no-consent',
  /** Mode is FOLLOW and the Tutor itself is off. */
  TUTOR_OFF: 'tutor-off',
  /** The host has no AI transport at all. */
  NO_TRANSPORT: 'no-transport',
});

/**
 * Resolve the setting into an engine, or into a reason there is none.
 *
 * @param {object} args
 * @param {string} [args.mode]         The refinement setting.
 * @param {boolean} [args.consented]   The separate refinement consent.
 * @param {string} [args.tutorEngine]  'cloud' | 'local' | 'off'.
 * @param {boolean} [args.hasTransport] Whether this host can reach a model at all.
 * @returns {{ enabled: boolean, engine: string|null, reason: string|null }}
 */
function resolveRefinementEngine({ mode, consented, tutorEngine, hasTransport = true } = {}) {
  const setting = String(mode || REFINE_MODE.OFF);

  // Order matters here. The setting is checked FIRST so that an explicit `off`
  // never reports "you have not consented" — that would read as a prompt to
  // turn something on, when the learner has already said no.
  if (setting === REFINE_MODE.OFF) {
    return { enabled: false, engine: null, reason: REFINE_BLOCKED.MODE_OFF };
  }
  if (!consented) {
    return { enabled: false, engine: null, reason: REFINE_BLOCKED.NO_CONSENT };
  }

  const engine = setting === REFINE_MODE.FOLLOW ? String(tutorEngine || 'off') : setting;
  if (engine === 'off') {
    // Only reachable through FOLLOW. An explicit cloud/local setting cannot
    // land here, and if a future setting could, "off" is still the answer.
    return { enabled: false, engine: null, reason: REFINE_BLOCKED.TUTOR_OFF };
  }
  if (engine !== 'cloud' && engine !== 'local') {
    // An unrecognised value fails closed rather than defaulting into a
    // transport. This is the same shape as the Tutor's own preference gate.
    return { enabled: false, engine: null, reason: REFINE_BLOCKED.TUTOR_OFF };
  }
  if (engine === 'cloud' && !hasTransport) {
    return { enabled: false, engine: null, reason: REFINE_BLOCKED.NO_TRANSPORT };
  }
  return { enabled: true, engine, reason: null };
}

/**
 * The post-editor prompt.
 *
 * Written as an edit task, not a translation task, and it says so three times
 * in three ways — because the failure it guards against is the model deciding
 * to be helpful and rewriting rather than correcting. The validator catches
 * that too, but a prompt that invites the failure just means most refinements
 * get thrown away, which is a slow feature and a wasted call rather than a
 * wrong page.
 *
 * The English source goes in alongside the machine translation on purpose: the
 * whole reason to post-edit technical course material is that the terminology
 * is what machine translation gets wrong, and the terms are in the English.
 */
function buildRefinementPrompt({ source = '', baseline = '', langName = '', protectedTerms = [] } = {}) {
  const terms = protectedTerms.slice(0, 40);
  const termLine = terms.length ? `\nKeep these exactly as written, in English: ${terms.join(', ')}` : '';
  return `You are post-editing a machine translation of a technical course paragraph into ${langName}.

Rules:
- Return ONLY the corrected ${langName} text. No preamble, no explanation, no quotes.
- Edit, do not retranslate. Keep the meaning, the sentence order, and the length.
- Do not change numbers, version numbers, URLs, code, or HTML tags in any way.
- If the machine translation is already correct, return it unchanged.${termLine}

English source:
${source}

Machine translation to correct:
${baseline}`;
}

if (typeof window !== 'undefined') {
  window._sbRefinementPolicy = {
    REFINE_MODE,
    REFINE_BLOCKED,
    resolveRefinementEngine,
    buildRefinementPrompt,
  };
}

if (typeof globalThis !== 'undefined' && typeof globalThis.module !== 'undefined') {
  globalThis.module.exports = {
    REFINE_MODE,
    REFINE_BLOCKED,
    resolveRefinementEngine,
    buildRefinementPrompt,
  };
}
