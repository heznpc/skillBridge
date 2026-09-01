/**
 * Runtime tests for the content lifecycle factories. These load the shipped
 * IIFE and drive its public controllers with browser-shaped dependencies;
 * they do not inspect or reproduce the implementation.
 */

/* global describe, test, expect, jest */

const { readProductionSource } = require('./helpers/production-source');

const lifecycleSrc = readProductionSource('src', 'content', 'content-lifecycle.js');

function loadLifecycle() {
  const fakeWindow = {};
  new Function('window', lifecycleSrc)(fakeWindow);
  return fakeWindow._sbContentLifecycle;
}

function routeHarness(overrides = {}) {
  const { createRouteController } = loadLifecycle();
  const listeners = new Map();
  let href = 'https://academy.example/courses/start';
  const originalPushState = jest.fn((_state, _unused, nextHref) => {
    href = new URL(nextHref, href).href;
  });
  const originalReplaceState = jest.fn((_state, _unused, nextHref) => {
    href = new URL(nextHref, href).href;
  });
  const historyObject = { pushState: originalPushState, replaceState: originalReplaceState };
  const calls = {
    teardownCertificationSurface: jest.fn(),
    evaluateGate: jest.fn(),
    init: jest.fn(),
    teardownNonAIContentSurface: jest.fn(),
    rehydrateAfterGateResume: jest.fn(),
    cancelActiveStream: jest.fn(),
    reenableAfterCertificationSurface: jest.fn(),
    ensureObserver: jest.fn(),
    ensureSubtitleManager: jest.fn(),
    redetectExamPage: jest.fn(),
    redetectPageLocale: jest.fn(),
    reapplyTranslations: jest.fn(),
    onPageHide: jest.fn(),
    logInfo: jest.fn(),
  };
  const controller = createRouteController({
    getHref: () => href,
    historyObject,
    addWindowListener: (type, handler) => listeners.set(type, handler),
    removeWindowListener: (type, handler) => {
      if (listeners.get(type) === handler) listeners.delete(type);
    },
    isCertificationHref: (value) => value.includes('/certification'),
    isGatePaused: () => false,
    isInitStarted: () => true,
    ...calls,
    ...overrides,
  });
  return {
    controller,
    calls,
    listeners,
    historyObject,
    originalPushState,
    originalReplaceState,
    setHref: (value) => {
      href = new URL(value, href).href;
    },
  };
}

describe('route lifecycle', () => {
  test('replaceState, popstate, and hashchange run route work, while certification gets the stronger teardown', () => {
    const { controller, calls, listeners, historyObject, setHref } = routeHarness();
    controller.start();

    historyObject.replaceState({}, '', '/courses/replaced');
    expect(calls.evaluateGate).toHaveBeenCalledTimes(1);
    expect(calls.redetectPageLocale).toHaveBeenCalledTimes(1);
    expect(calls.reapplyTranslations).toHaveBeenCalledTimes(1);

    setHref('/courses/from-back-button');
    listeners.get('popstate')();
    expect(calls.evaluateGate).toHaveBeenCalledTimes(2);
    expect(calls.ensureObserver).toHaveBeenCalledTimes(2);

    setHref('/courses/from-back-button#chapter-2');
    listeners.get('hashchange')();
    expect(calls.evaluateGate).toHaveBeenCalledTimes(3);
    expect(calls.redetectExamPage).toHaveBeenCalledTimes(3);

    setHref('/certification/final');
    listeners.get('popstate')();
    expect(calls.teardownCertificationSurface).toHaveBeenCalledTimes(1);
    expect(calls.logInfo).toHaveBeenCalledWith('[SkillBridge] Navigated to certification page - extension disabled.');
    // Certification bypasses both the generic gate and rehydration pipeline.
    expect(calls.evaluateGate).toHaveBeenCalledTimes(3);
    expect(calls.reapplyTranslations).toHaveBeenCalledTimes(3);
  });

  test('pagehide stops listeners, restores History methods, and prevents later History calls from routing', () => {
    const { controller, calls, listeners, historyObject, originalPushState, originalReplaceState } = routeHarness();
    controller.start();
    const pagehide = listeners.get('pagehide');

    expect(historyObject.pushState).not.toBe(originalPushState);
    expect(historyObject.replaceState).not.toBe(originalReplaceState);
    pagehide();

    expect(calls.onPageHide).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
    expect(historyObject.pushState).toBe(originalPushState);
    expect(historyObject.replaceState).toBe(originalReplaceState);

    historyObject.replaceState({}, '', '/after-pagehide');
    expect(calls.evaluateGate).not.toHaveBeenCalled();
  });

  test('a non-AI route pauses an initialized surface and a later AI route fully rehydrates it', () => {
    const { createAIGateController } = loadLifecycle();
    let verdict = { isAI: true, reason: 'academy-host', hits: 1 };
    const warn = jest.fn();
    const gate = createAIGateController({ detectAITrainingContent: () => verdict, warn });
    gate.evaluate();

    const { controller, calls, setHref } = routeHarness({
      evaluateGate: (options) => gate.evaluate(options),
      isGatePaused: () => gate.paused,
      isInitStarted: () => true,
    });
    controller.start();

    verdict = { isAI: false, reason: 'unrelated-tenant', hits: 0 };
    setHref('/courses/not-ai-training');
    controller.onRouteChange();
    expect(gate.paused).toBe(true);
    expect(calls.teardownNonAIContentSurface).toHaveBeenCalledTimes(1);
    expect(calls.rehydrateAfterGateResume).not.toHaveBeenCalled();
    expect(calls.reapplyTranslations).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Non-AI Skilljar tenant detected'));

    verdict = { isAI: true, reason: 'course-signal', hits: 2 };
    setHref('/courses/ai-training-again');
    controller.onRouteChange();
    expect(gate.paused).toBe(false);
    expect(calls.rehydrateAfterGateResume).toHaveBeenCalledTimes(1);
    expect(calls.cancelActiveStream).toHaveBeenCalledTimes(1);
    expect(calls.ensureSubtitleManager).toHaveBeenCalledTimes(1);
    expect(calls.redetectPageLocale).toHaveBeenCalledTimes(1);
    expect(calls.reapplyTranslations).toHaveBeenCalledTimes(1);
  });

  test('resuming before initialization starts init once and leaves route work to init', () => {
    const { createAIGateController } = loadLifecycle();
    let verdict = { isAI: false, reason: 'unrelated-tenant', hits: 0 };
    const gate = createAIGateController({ detectAITrainingContent: () => verdict, warn: jest.fn() });
    gate.evaluate();
    const { controller, calls, setHref } = routeHarness({
      evaluateGate: (options) => gate.evaluate(options),
      isGatePaused: () => gate.paused,
      isInitStarted: () => false,
    });

    verdict = { isAI: true, reason: 'course-signal', hits: 1 };
    setHref('/courses/first-ai-route');
    controller.onRouteChange();

    expect(calls.init).toHaveBeenCalledTimes(1);
    expect(calls.rehydrateAfterGateResume).not.toHaveBeenCalled();
    expect(calls.cancelActiveStream).not.toHaveBeenCalled();
    expect(calls.reapplyTranslations).not.toHaveBeenCalled();
  });
});

describe('deferred activation', () => {
  test('queues work while inactive, then runs every callback even if one fails', () => {
    const { createActivationQueue } = loadLifecycle();
    let active = false;
    const order = [];
    const onError = jest.fn();
    const queue = createActivationQueue({ isActive: () => active, onError });
    queue.whenActive(() => order.push('first'));
    queue.whenActive(() => {
      throw new Error('broken deferred work');
    });
    queue.whenActive(() => order.push('last'));

    expect(order).toEqual([]);
    active = true;
    queue.run();

    expect(order).toEqual(['first', 'last']);
    expect(onError).toHaveBeenCalledWith('[SkillBridge] Deferred activation callback failed:', 'broken deferred work');
    queue.whenActive(() => order.push('immediate'));
    expect(order).toEqual(['first', 'last', 'immediate']);
    queue.run();
    expect(order).toEqual(['first', 'last', 'immediate']);
  });
});
