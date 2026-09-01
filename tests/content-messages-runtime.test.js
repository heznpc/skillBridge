/**
 * Runtime tests for the shipped content message-router factory. Assertions
 * are made only through its public handler and injected production actions.
 */

/* global describe, test, expect, jest */

const { readProductionSource } = require('./helpers/production-source');

const messagesSrc = readProductionSource('src', 'content', 'content-messages.js');

function loadMessages() {
  const fakeWindow = {};
  new Function('window', messagesSrc)(fakeWindow);
  return fakeWindow._sbContentMessages;
}

function routerHarness(overrides = {}) {
  const { createContentMessageRouter } = loadMessages();
  const actions = {
    isCertificationDisabled: jest.fn(() => false),
    isReady: jest.fn(() => true),
    translatePage: jest.fn(() => Promise.resolve()),
    restoreOriginal: jest.fn(),
    toggleSidebar: jest.fn(),
    getPageContext: jest.fn(() => ({ title: 'Runtime context' })),
    isSupportedLanguage: jest.fn((lang) => ['ko', 'ja'].includes(lang)),
    switchLanguage: jest.fn((_lang, { onDone }) => {
      onDone();
      return Promise.resolve();
    }),
    cleanupCache: jest.fn(),
    setCommentTranslation: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    ...overrides,
  };
  return { router: createContentMessageRouter(actions), actions };
}

async function settlePromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('translate messages', () => {
  test('a ready translation keeps the channel open and reports asynchronous success', async () => {
    const { router, actions } = routerHarness();
    const sendResponse = jest.fn();

    expect(router.handleMessage({ action: 'translatePage', language: 'ko' }, {}, sendResponse)).toBe(true);
    expect(actions.translatePage).toHaveBeenCalledWith('ko');
    expect(sendResponse).not.toHaveBeenCalled();
    await settlePromises();
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  test('a rejected translation is returned to the caller instead of becoming an unhandled rejection', async () => {
    const failure = new Error('translator unavailable');
    const { router, actions } = routerHarness({ translatePage: jest.fn(() => Promise.reject(failure)) });
    const sendResponse = jest.fn();

    expect(router.handleMessage({ action: 'translatePage', language: 'ja' }, {}, sendResponse)).toBe(true);
    await settlePromises();

    expect(actions.error).toHaveBeenCalledWith('[SkillBridge] translatePage error:', failure);
    expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'translator unavailable' });
  });

  test('translation requested before readiness is queued once and can be drained or cleared', () => {
    const { router, actions } = routerHarness({ isReady: jest.fn(() => false) });
    const first = { action: 'translatePage', language: 'ko' };
    const second = { action: 'translatePage', language: 'ja' };
    const sendResponse = jest.fn();

    expect(router.handleMessage(first, {}, sendResponse)).toBe(false);
    expect(router.handleMessage(second, {}, sendResponse)).toBe(false);
    expect(actions.translatePage).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenNthCalledWith(1, { success: true, queued: true });
    expect(sendResponse).toHaveBeenNthCalledWith(2, { success: true, queued: true });
    expect(router.drainPendingTranslateRequests()).toEqual([first, second]);
    expect(router.drainPendingTranslateRequests()).toEqual([]);

    router.handleMessage(first, {}, jest.fn());
    router.clearPendingActions();
    expect(router.drainPendingTranslateRequests()).toEqual([]);
  });
});

describe('synchronous message branches', () => {
  test('unknown and type-shaped messages fail explicitly, with a routing warning for type-only input', () => {
    const { router, actions } = routerHarness();
    const typeResponse = jest.fn();
    const unknownResponse = jest.fn();

    expect(router.handleMessage({ type: 'translate-request' }, {}, typeResponse)).toBe(false);
    expect(actions.warn).toHaveBeenCalledWith(
      '[SkillBridge] Content received `type`-shaped message - should this go to background?',
      'translate-request',
    );
    expect(typeResponse).toHaveBeenCalledWith({ success: false, error: 'Unknown action' });

    expect(router.handleMessage({ action: 'notARealAction' }, {}, unknownResponse)).toBe(false);
    expect(unknownResponse).toHaveBeenCalledWith({ success: false, error: 'Unknown action' });
  });

  test('comment translation coerces enabled to a boolean and acknowledges the caller', () => {
    const { router, actions } = routerHarness();
    const enabledResponse = jest.fn();
    const disabledResponse = jest.fn();

    expect(router.handleMessage({ action: 'toggleCommentTranslation', enabled: 'yes' }, {}, enabledResponse)).toBe(
      false,
    );
    expect(router.handleMessage({ action: 'toggleCommentTranslation', enabled: 0 }, {}, disabledResponse)).toBe(false);

    expect(actions.setCommentTranslation).toHaveBeenNthCalledWith(1, true);
    expect(actions.setCommentTranslation).toHaveBeenNthCalledWith(2, false);
    expect(enabledResponse).toHaveBeenCalledWith({ success: true });
    expect(disabledResponse).toHaveBeenCalledWith({ success: true });
  });

  test('certification mode blocks mutating UI actions but still allows ping, restore, and cache cleanup', () => {
    const { router, actions } = routerHarness({
      isCertificationDisabled: jest.fn(() => true),
      isReady: jest.fn(() => true),
    });
    const blockedResponse = jest.fn();

    expect(router.handleMessage({ action: 'toggleSidebar' }, {}, blockedResponse)).toBe(false);
    expect(blockedResponse).toHaveBeenCalledWith({
      success: false,
      error: 'SkillBridge disabled on certification pages',
    });
    expect(actions.toggleSidebar).not.toHaveBeenCalled();

    const pingResponse = jest.fn();
    router.handleMessage({ action: 'ping' }, {}, pingResponse);
    expect(pingResponse).toHaveBeenCalledWith({ ready: true });

    const restoreResponse = jest.fn();
    router.handleMessage({ action: 'restoreOriginal' }, {}, restoreResponse);
    expect(actions.restoreOriginal).toHaveBeenCalledTimes(1);
    expect(restoreResponse).toHaveBeenCalledWith({ success: true });

    const cleanupResponse = jest.fn();
    router.handleMessage({ action: 'cacheCleanup' }, {}, cleanupResponse);
    expect(actions.cleanupCache).toHaveBeenCalledTimes(1);
    expect(cleanupResponse).toHaveBeenCalledWith({ success: true });
  });

  test('language changes reject unsupported values and surface asynchronous switch failures', async () => {
    const failure = new Error('language setup failed');
    const { router, actions } = routerHarness({
      switchLanguage: jest.fn(() => Promise.reject(failure)),
    });
    const unsupportedResponse = jest.fn();
    const failedResponse = jest.fn();

    expect(router.handleMessage({ action: 'setLanguage', language: 'xx' }, {}, unsupportedResponse)).toBe(false);
    expect(unsupportedResponse).toHaveBeenCalledWith({ success: false, error: 'Unsupported language' });
    expect(actions.switchLanguage).not.toHaveBeenCalled();

    expect(router.handleMessage({ action: 'setLanguage', language: 'ko' }, {}, failedResponse)).toBe(true);
    await settlePromises();
    expect(actions.error).toHaveBeenCalledWith('[SkillBridge] setLanguage error:', failure);
    expect(failedResponse).toHaveBeenCalledWith({ success: false, error: 'language setup failed' });
  });
});
