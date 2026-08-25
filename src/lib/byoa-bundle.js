/**
 * SkillBridge — the "bring your own assistant" context bundle.
 *
 * Not everyone wants the built-in Tutor. Some learners already pay for Claude,
 * ChatGPT or Gemini and would rather ask there; some organisations forbid a
 * third AI service in the loop. The honest answer to that is not another
 * integration — it is to assemble what the assistant would need, hand it to the
 * learner, and get out of the way.
 *
 * Three rules shape this, and each of them rules something out.
 *
 * 1. SkillBridge does not talk to those services. No automation of their UI, no
 *    scraping of their pages, no request on the learner's behalf. The bundle
 *    goes to the clipboard; opening a chat opens a blank one; the learner
 *    pastes. That is also why nothing is ever put in a URL — a query parameter
 *    would put lesson text, and whatever the learner selected, into a browser
 *    history entry and a server log.
 *
 * 2. A consumer chat login is not an API key. Signing in to claude.ai grants a
 *    person a chat session, not an extension a credential, and treating it as
 *    one would mean riding someone's session against a service's terms. There
 *    is nothing here that reads, stores, or reuses a session from any of them.
 *
 * 3. The bundle is BOUNDED and obeys the same exam rules as everything else.
 *    The page context it embeds is the same `getPageContext()` output the Tutor
 *    gets — so on an assessment page the lesson body is already gone — and a
 *    selection that touches an answer choice is refused by the same guard the
 *    Ask Tutor quote uses. A learner can always select and copy by hand; what
 *    must not exist is a button of ours that does it for them.
 *
 * Pure: parts go in, one string comes out. Nothing here touches the DOM, the
 * clipboard, or the network.
 */

/**
 * Total character ceiling for the assembled bundle.
 *
 * Bounded for the reader, not for a wire: this never leaves the machine by
 * itself. A prompt that runs to tens of thousands of characters is one the
 * learner cannot check before pasting, and "I could not see what I was
 * sending" is the complaint this feature exists to answer.
 */
const BYOA_MAX_CHARS = 6000;

/** Ceiling for the learner's own selection, inside the total above. */
const BYOA_MAX_SELECTION_CHARS = 2000;

/** What the bundle is missing, and why. Surfaced to the learner, not swallowed. */
const BYOA_OMISSION = Object.freeze({
  /** The page is an assessment; the lesson body is withheld. */
  ASSESSMENT: 'assessment',
  /** The selection touched an answer choice and was refused. */
  SELECTION_WITHHELD: 'selection-withheld',
  /** The bundle hit the character ceiling and the tail was cut. */
  TRUNCATED: 'truncated',
});

/**
 * Cut to `max`, on a whitespace boundary where one is near enough to matter.
 *
 * The ellipsis counts toward the ceiling. Appending it after slicing to `max`
 * returns `max + 1`, and a limit that is off by one is a limit nobody can
 * assert on — which is how a documented cap quietly stops being one.
 */
function _clip(text, max) {
  const value = String(text || '').trim();
  if (value.length <= max) return { text: value, truncated: false };
  const room = Math.max(0, max - 1);
  const hard = value.slice(0, room);
  const lastBreak = hard.lastIndexOf(' ');
  const body = lastBreak > room * 0.8 ? hard.slice(0, lastBreak) : hard;
  return { text: `${body}…`, truncated: true };
}

/**
 * Assemble the bundle.
 *
 * @param {object} args
 * @param {string} args.title       Lesson or course title.
 * @param {string} args.url         The page the learner is on.
 * @param {string} args.langName    The language the learner wants an answer in.
 * @param {string} [args.pageContext] `getPageContext()` output — already bounded and exam-safe.
 * @param {string} [args.selection] The learner's highlighted text, if any.
 * @param {boolean} [args.selectionWithheld] True when the selection was refused by the exam guard.
 * @param {boolean} [args.isExamPage]
 * @param {string} [args.question]  What the learner wants to ask.
 * @param {object} [args.labels]    Localized section headings; English is the fallback.
 * @returns {{ text: string, omissions: string[], length: number }}
 */
function buildContextBundle({
  title = '',
  url = '',
  langName = 'English',
  pageContext = '',
  selection = '',
  selectionWithheld = false,
  isExamPage = false,
  question = '',
  labels = {},
} = {}) {
  const L = {
    intro: labels.intro || 'I am studying an online lesson. Here is the context.',
    lesson: labels.lesson || 'Lesson',
    source: labels.source || 'Source',
    answerIn: labels.answerIn || 'Please answer in',
    selected: labels.selected || 'The part I selected',
    context: labels.context || 'Lesson context',
    question: labels.question || 'My question',
    examNote:
      labels.examNote ||
      'This page is a quiz or assessment. Do not give me the answer. Explain the underlying concept only.',
    withheldNote:
      labels.withheldNote || 'My selection was left out because it was an answer choice on an assessment page.',
  };

  const omissions = [];
  if (isExamPage) omissions.push(BYOA_OMISSION.ASSESSMENT);
  if (selectionWithheld) omissions.push(BYOA_OMISSION.SELECTION_WITHHELD);

  const lines = [L.intro, ''];
  if (title) lines.push(`${L.lesson}: ${title}`);
  if (url) lines.push(`${L.source}: ${url}`);
  lines.push(`${L.answerIn}: ${langName}`);

  if (isExamPage) lines.push('', L.examNote);
  if (selectionWithheld) lines.push('', L.withheldNote);

  // The learner's own selection comes BEFORE the page context: it is the part
  // they pointed at, and if anything gets cut by the ceiling it should be the
  // surrounding material rather than the thing they chose.
  const clippedSelection = selection ? _clip(selection, BYOA_MAX_SELECTION_CHARS) : null;
  if (clippedSelection?.text) {
    if (clippedSelection.truncated) omissions.push(BYOA_OMISSION.TRUNCATED);
    lines.push('', `${L.selected}:`, clippedSelection.text);
  }

  if (pageContext) lines.push('', `${L.context}:`, String(pageContext).trim());
  if (question) lines.push('', `${L.question}: ${question.trim()}`);

  const assembled = lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const clipped = _clip(assembled, BYOA_MAX_CHARS);
  if (clipped.truncated && !omissions.includes(BYOA_OMISSION.TRUNCATED)) omissions.push(BYOA_OMISSION.TRUNCATED);

  return { text: clipped.text, omissions, length: clipped.text.length };
}

/**
 * Where "Open …" goes.
 *
 * A blank chat, and nothing else. No query parameter, no prefill, no deep link
 * carrying content: a URL is written to history and to whatever logs sit in
 * front of it, and the whole point of the clipboard step is that the learner
 * decides what gets pasted.
 *
 * `https` and a fixed hostname each, so nothing here can be turned into an
 * open redirect by a value from the page.
 */
const BYOA_ASSISTANTS = Object.freeze([
  Object.freeze({ id: 'claude', name: 'Claude', url: 'https://claude.ai/new' }),
  Object.freeze({ id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/' }),
  Object.freeze({ id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app' }),
]);

if (typeof window !== 'undefined') {
  window._sbByoaBundle = {
    BYOA_MAX_CHARS,
    BYOA_MAX_SELECTION_CHARS,
    BYOA_OMISSION,
    BYOA_ASSISTANTS,
    buildContextBundle,
  };
}

if (typeof globalThis !== 'undefined' && typeof globalThis.module !== 'undefined') {
  globalThis.module.exports = {
    BYOA_MAX_CHARS,
    BYOA_MAX_SELECTION_CHARS,
    BYOA_OMISSION,
    BYOA_ASSISTANTS,
    buildContextBundle,
  };
}
