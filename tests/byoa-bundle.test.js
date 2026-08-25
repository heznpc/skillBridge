/**
 * The "ask another assistant" hand-off.
 *
 * Most of what defines this feature is what it refuses to do, so most of these
 * tests assert an absence. That is deliberate: an integration that quietly
 * grew a deep link, or a panel that started reading a service's page, would
 * pass any test written only about the prompt it produces.
 *
 * Four boundaries:
 *   - nothing is sent by SkillBridge, so no request is made and no service UI
 *     is driven;
 *   - nothing goes in a URL, because a query parameter writes lesson text into
 *     history and into every log in front of that host;
 *   - a consumer chat login is not an API key, so no session is read, stored,
 *     or reused;
 *   - the bundle is bounded, and obeys the same exam rules as everything else.
 */

/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

function loadLib(file) {
  const fake = { module: { exports: {} } };
  new Function('globalThis', read('src', 'lib', file))(fake);
  return fake.module.exports;
}

const { BYOA_MAX_CHARS, BYOA_MAX_SELECTION_CHARS, BYOA_OMISSION, BYOA_ASSISTANTS, buildContextBundle } =
  loadLib('byoa-bundle.js');

const BASE = {
  title: 'Accessing Claude with the API',
  url: 'https://academy.claude.com/courses/building-with-the-claude-api/accessing-the-api',
  langName: 'Korean',
  pageContext: 'Course: Accessing Claude with the API. Sections: Key concepts',
};

describe('the bundle carries what an assistant needs', () => {
  test('the lesson, its source, and the language to answer in', () => {
    const { text } = buildContextBundle(BASE);
    expect(text).toContain(BASE.title);
    expect(text).toContain(BASE.url);
    expect(text).toContain('Korean');
  });

  test('the learner’s question, when they typed one', () => {
    const { text } = buildContextBundle({ ...BASE, question: 'Why is the key a header?' });
    expect(text).toContain('Why is the key a header?');
  });

  test('and the selection they pointed at, before the surrounding context', () => {
    const { text } = buildContextBundle({ ...BASE, selection: 'the x-api-key header' });
    expect(text).toContain('the x-api-key header');
    // Order matters under the ceiling: if anything is cut it should be the
    // material around the thing the learner chose, not the choice itself.
    expect(text.indexOf('the x-api-key header')).toBeLessThan(text.indexOf(BASE.pageContext));
  });

  test('section headings are localizable, so the assistant reads the learner’s language', () => {
    const { text } = buildContextBundle({
      ...BASE,
      question: 'q',
      labels: { lesson: '강의', question: '내 질문', answerIn: '다음 언어로 답해 주세요' },
    });
    expect(text).toContain('강의: Accessing Claude with the API');
    expect(text).toContain('내 질문: q');
  });
});

describe('the same exam rules as everything else', () => {
  test('an assessment page carries a do-not-answer instruction', () => {
    const { text, omissions } = buildContextBundle({ ...BASE, isExamPage: true, pageContext: '' });
    expect(text).toContain('Do not give me the answer');
    expect(omissions).toContain(BYOA_OMISSION.ASSESSMENT);
  });

  test('a withheld selection is reported, not silently dropped', () => {
    // The panel refuses a selection that touches an answer choice. Saying so is
    // the difference between a guard and a bug: a learner who cannot see the
    // omission will assume the assistant has context it does not have.
    const { text, omissions } = buildContextBundle({
      ...BASE,
      isExamPage: true,
      selection: '',
      selectionWithheld: true,
    });
    expect(omissions).toContain(BYOA_OMISSION.SELECTION_WITHHELD);
    expect(text).toContain('left out because it was an answer choice');
  });

  test('a withheld selection contributes no text at all', () => {
    const { text } = buildContextBundle({
      ...BASE,
      isExamPage: true,
      selection: '',
      selectionWithheld: true,
      pageContext: 'Certification Exam: Quiz. Page type: exam/assessment. DO NOT help with answers.',
    });
    expect(text).not.toContain('Zebra-cipher-alpha');
    // …and the exam page context the Tutor gets is what is embedded, so the
    // lesson body is already absent rather than being filtered again here.
    expect(text).not.toContain('Lesson content:');
  });

  test('a lesson page carries no exam instruction', () => {
    const { text, omissions } = buildContextBundle(BASE);
    expect(text).not.toContain('Do not give me the answer');
    expect(omissions).not.toContain(BYOA_OMISSION.ASSESSMENT);
  });
});

describe('the bundle is bounded', () => {
  test('a very long selection is clipped, and the clip is reported', () => {
    const { text, omissions, length } = buildContextBundle({
      ...BASE,
      selection: 'word '.repeat(2000),
    });
    expect(omissions).toContain(BYOA_OMISSION.TRUNCATED);
    expect(length).toBeLessThanOrEqual(BYOA_MAX_CHARS);
    expect(text).toContain('…');
  });

  test('a very long page context cannot push the total past the ceiling', () => {
    const { length, omissions } = buildContextBundle({
      ...BASE,
      pageContext: 'x'.repeat(BYOA_MAX_CHARS * 3),
    });
    expect(length).toBeLessThanOrEqual(BYOA_MAX_CHARS);
    expect(omissions).toContain(BYOA_OMISSION.TRUNCATED);
  });

  test('the selection ceiling is smaller than the total, so context always has room', () => {
    expect(BYOA_MAX_SELECTION_CHARS).toBeLessThan(BYOA_MAX_CHARS);
  });

  test('an empty page produces something coherent rather than a stray heading', () => {
    const { text } = buildContextBundle({});
    expect(text).toContain('I am studying an online lesson');
    expect(text).not.toContain('Lesson:');
    expect(text).not.toContain('My question:');
  });
});

describe('what this feature must never do', () => {
  test('every destination is a fixed https host, and a blank chat', () => {
    expect(BYOA_ASSISTANTS.map((a) => a.id).sort()).toEqual(['chatgpt', 'claude', 'gemini']);
    for (const assistant of BYOA_ASSISTANTS) {
      const url = new URL(assistant.url);
      expect(url.protocol).toBe('https:');
      // No query and no fragment. A deep link carrying lesson text would put
      // it in browser history and in every log in front of that host, which is
      // exactly what the clipboard step exists to avoid.
      expect(url.search).toBe('');
      expect(url.hash).toBe('');
    }
  });

  test('the bundle never becomes a URL', () => {
    // Nothing in the builder encodes content for transport. If this ever
    // starts producing a link, the privacy property above is gone.
    const { text } = buildContextBundle({ ...BASE, selection: 'secret', question: 'secret' });
    expect(text).not.toMatch(/https?:\/\/(claude\.ai|chatgpt\.com|gemini\.google\.com)/);
    expect(text).not.toContain('encodeURIComponent');
  });

  test('the panel makes no request and drives no other service', () => {
    const src = read('src', 'content', 'byoa.js');
    // fetch/XHR would mean sending on the learner's behalf; a message to a
    // service's page, or a query of one, would mean driving its UI.
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/XMLHttpRequest/);
    expect(src).not.toMatch(/postMessage/);
    // The only navigation is a blank chat in a new tab, with no opener handle.
    expect(src).toContain("window.open(assistant.url, '_blank', 'noopener,noreferrer')");
    expect(src).not.toMatch(/location\.href\s*=/);
  });

  test('no assistant session, cookie or token is read, stored, or reused', () => {
    // A consumer chat login grants a person a session, not this extension a
    // credential. Reading one would mean riding it against the service's terms.
    const src = read('src', 'content', 'byoa.js') + read('src', 'lib', 'byoa-bundle.js');
    for (const pattern of [/document\.cookie/, /\bcookies\b/, /apiKey/i, /authToken/i, /Authorization/i]) {
      expect(src).not.toMatch(pattern);
    }
  });

  test('the prompt is on screen before it can be copied', () => {
    // "I could not see what I was about to send" is the complaint this feature
    // answers, so a hidden payload would defeat it. The copy button reads the
    // visible preview rather than rebuilding the text out of sight.
    const src = read('src', 'content', 'byoa.js');
    expect(src).toContain("const preview = sb.$id('si18n-byoa-preview')");
    expect(src).toContain('const text = preview?.value');
  });
});
