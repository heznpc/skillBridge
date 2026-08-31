/**
 * @jest-environment jsdom
 */

/* global describe, test, expect, beforeEach, afterEach, jest, MouseEvent */

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'text-selection.js'), 'utf8');

const labels = {
  feedbackToolbar: { en: 'Translation feedback' },
  helpful: { en: 'Helpful translation' },
  needsWork: { en: 'Translation needs improvement' },
  saved: { en: 'Feedback saved' },
};

function mount({ bridge = false, lang = 'ko', pair = null, exam = false } = {}) {
  document.body.innerHTML = '<main><p id="translated">번역된 문장입니다.</p></main>';
  const paragraph = document.getElementById('translated');
  const range = {
    getBoundingClientRect: () => ({ left: 40, right: 180, top: 40, bottom: 58, width: 140, height: 18 }),
  };
  const selection = {
    isCollapsed: false,
    rangeCount: 1,
    toString: () => '번역된 문장',
    getRangeAt: () => range,
    removeAllRanges: jest.fn(),
  };
  window.getSelection = jest.fn(() => selection);

  const recordTranslationFeedback = jest.fn(async () => ({ signal: 'positive' }));
  const composeTranslationFeedback = jest.fn(async () => true);
  const sb = {
    currentLang: lang,
    hostCaps: { bridge },
    isExamPage: exam,
    originalTexts: new Map(),
    translatedTexts: new Map(),
    sidebarVisible: false,
    t: (map) => map.en,
    escapeHtml: (text) => String(text),
    registerModule: jest.fn(),
    toggleSidebar: jest.fn(() => {
      sb.sidebarVisible = true;
    }),
    $: (selector) => document.querySelector(selector),
    $id: (id) => document.getElementById(id),
    _chat: { recordTranslationFeedback, composeTranslationFeedback },
  };
  window._sb = sb;
  window._sbTranslationFeedback = { resolveSelection: jest.fn(() => pair) };
  window._sbExamSelection = { selectionHitsExamChoice: jest.fn(() => exam) };

  new Function(
    'window',
    'document',
    'EXAM_SKIP_SELECTORS',
    'SKILLBRIDGE_LIMITS',
    'SKILLBRIDGE_DELAYS',
    'REPORT_LABELS',
    'ASK_TUTOR_LABELS',
    'A11Y_LABELS',
    'QUOTE_PLACEHOLDERS',
    source,
  )(
    window,
    document,
    ['.answer-choice'],
    { QUOTE_MAX: 500 },
    { TEXT_SELECTION: 10 },
    labels,
    { en: 'Ask Tutor' },
    { removeQuote: { en: 'Remove quote' } },
    { en: 'Ask about this text' },
  );
  sb.initAskTutorButton();

  expect(document.querySelector('.si18n-selection-toolbar').hidden).toBe(true);

  paragraph.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  jest.advanceTimersByTime(10);

  return { sb, paragraph, recordTranslationFeedback, composeTranslationFeedback, selection };
}

describe('selection feedback toolbar', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    delete window._sb;
    delete window._sbTranslationFeedback;
    delete window._sbExamSelection;
  });

  test('bridge-free translated text exposes feedback without Ask Tutor', () => {
    mount({
      pair: {
        element: document.createElement('p'),
        originalText: 'Original sentence.',
        translatedText: '번역된 문장입니다.',
        selectedText: '번역된 문장',
      },
    });

    expect(document.querySelector('.si18n-selection-toolbar').classList.contains('visible')).toBe(true);
    expect(document.querySelector('.si18n-ask-tutor-btn')).toHaveProperty('hidden', true);
    expect(document.querySelector('.si18n-feedback-positive')).toHaveProperty('hidden', false);
    expect(document.querySelector('.si18n-feedback-negative')).toHaveProperty('hidden', false);
  });

  test('English text on a bridge host offers Ask Tutor but no translation rating', () => {
    mount({ bridge: true, lang: 'en', pair: null });

    expect(document.querySelector('.si18n-ask-tutor-btn')).toHaveProperty('hidden', false);
    expect(document.querySelector('.si18n-feedback-positive')).toHaveProperty('hidden', true);
    expect(document.querySelector('.si18n-feedback-negative')).toHaveProperty('hidden', true);
  });

  test('helpful feedback saves immediately and clears the selection', async () => {
    const pair = {
      element: document.createElement('p'),
      originalText: 'Original sentence.',
      translatedText: '번역된 문장입니다.',
      selectedText: '번역된 문장',
    };
    const { recordTranslationFeedback, selection } = mount({ pair });

    document.querySelector('.si18n-feedback-positive').click();
    await Promise.resolve();

    expect(recordTranslationFeedback).toHaveBeenCalledWith(pair, 'positive');
    expect(selection.removeAllRanges).toHaveBeenCalled();
    expect(document.querySelector('.si18n-selection-status').textContent).toBe('Feedback saved');
  });

  test('needs-work feedback opens the sidebar and prefills Reports', async () => {
    const pair = {
      element: document.createElement('p'),
      originalText: 'Original sentence.',
      translatedText: '번역된 문장입니다.',
      selectedText: '번역된 문장',
    };
    const { sb, composeTranslationFeedback } = mount({ pair });

    document.querySelector('.si18n-feedback-negative').click();
    await Promise.resolve();

    expect(sb.toggleSidebar).toHaveBeenCalled();
    expect(composeTranslationFeedback).toHaveBeenCalledWith(pair);
  });

  test('assessment answer selections expose no action', () => {
    mount({
      bridge: true,
      exam: true,
      pair: {
        originalText: 'Choice A',
        translatedText: '선택지 A',
        selectedText: '선택지 A',
      },
    });

    expect(document.querySelector('.si18n-selection-toolbar').classList.contains('visible')).toBe(false);
    expect(document.querySelector('.si18n-selection-toolbar').hidden).toBe(true);
  });

  test('dismissed toolbar leaves no invisible actions in the tab order', () => {
    const pair = {
      originalText: 'Original sentence.',
      translatedText: '번역된 문장입니다.',
      selectedText: '번역된 문장',
    };
    mount({ bridge: true, pair });
    const toolbar = document.querySelector('.si18n-selection-toolbar');
    expect(toolbar.hidden).toBe(false);

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(toolbar.hidden).toBe(true);
    expect(toolbar.querySelectorAll('button')).toHaveLength(3);
    expect(Array.from(toolbar.querySelectorAll('button')).every((button) => button.closest('[hidden]'))).toBe(true);
  });

  test('button click activation uses the same action path as a pointer press', async () => {
    const pair = {
      originalText: 'Original sentence.',
      translatedText: '번역된 문장입니다.',
      selectedText: '번역된 문장',
    };
    const { recordTranslationFeedback } = mount({ pair });

    document.querySelector('.si18n-feedback-positive').click();
    await Promise.resolve();

    expect(recordTranslationFeedback).toHaveBeenCalledWith(pair, 'positive');
  });

  test('language changes invalidate a pending feedback pair before it can be mislabeled', async () => {
    const pair = {
      originalText: 'Original sentence.',
      translatedText: '번역된 문장입니다.',
      selectedText: '번역된 문장',
    };
    const { sb, recordTranslationFeedback } = mount({ pair });
    sb.currentLang = 'ja';

    document.querySelector('.si18n-feedback-positive').click();
    await Promise.resolve();

    expect(recordTranslationFeedback).not.toHaveBeenCalled();
    expect(document.querySelector('.si18n-selection-toolbar').hidden).toBe(true);
  });

  test('route changes invalidate a pending feedback pair before it can be saved to the wrong lesson', async () => {
    const pair = {
      originalText: 'Original sentence.',
      translatedText: '번역된 문장입니다.',
      selectedText: '번역된 문장',
    };
    const originalUrl = location.href;
    const { recordTranslationFeedback } = mount({ pair });
    history.pushState({}, '', '/another-lesson');

    document.querySelector('.si18n-feedback-positive').click();
    await Promise.resolve();

    expect(recordTranslationFeedback).not.toHaveBeenCalled();
    expect(document.querySelector('.si18n-selection-toolbar').hidden).toBe(true);
    history.replaceState({}, '', originalUrl);
  });

  test('a failed save logs the failure without showing a false success state', async () => {
    const pair = {
      originalText: 'Original sentence.',
      translatedText: '번역된 문장입니다.',
      selectedText: '번역된 문장',
    };
    const { sb } = mount({ pair });
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    sb._chat.recordTranslationFeedback = jest.fn(async () => {
      throw new Error('storage failed');
    });

    document.querySelector('.si18n-feedback-positive').click();
    await Promise.resolve();
    await Promise.resolve();

    const toolbar = document.querySelector('.si18n-selection-toolbar');
    expect(toolbar.hidden).toBe(true);
    expect(toolbar.querySelector('.si18n-selection-status').textContent).toBe('');
    expect(warning).toHaveBeenCalledWith('[SkillBridge] Translation feedback could not be saved:', 'storage failed');
    warning.mockRestore();
  });

  test('a slow save cannot replace a newer selection toolbar with its old success toast', async () => {
    const pair = {
      originalText: 'Original sentence.',
      translatedText: '번역된 문장입니다.',
      selectedText: '번역된 문장',
    };
    const { sb, paragraph } = mount({ pair });
    let finishSave;
    sb._chat.recordTranslationFeedback = jest.fn(
      () =>
        new Promise((resolve) => {
          finishSave = resolve;
        }),
    );

    document.querySelector('.si18n-feedback-positive').click();
    paragraph.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    jest.advanceTimersByTime(10);
    finishSave({ signal: 'positive' });
    await Promise.resolve();

    const toolbar = document.querySelector('.si18n-selection-toolbar');
    expect(toolbar.hidden).toBe(false);
    expect(toolbar.querySelector('.si18n-feedback-positive').hidden).toBe(false);
    expect(toolbar.querySelector('.si18n-selection-status').hidden).toBe(true);
  });
});
