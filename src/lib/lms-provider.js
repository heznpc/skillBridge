/**
 * SkillBridge — LMS provider seam.
 *
 * Providers describe the page context that core translation and learning
 * tools need.  SPA event ownership deliberately stays in content-lifecycle;
 * the active provider is simply re-resolved after a route change.
 *
 * The contract is intentionally small and based only on surfaces SkillBridge
 * supports today:
 *   - matches(context)
 *   - probeRestricted(context)
 *   - getPageContext(context)
 */

(function () {
  'use strict';

  const root = typeof window !== 'undefined' ? window : globalThis;

  function normaliseContext(input = {}) {
    const doc = input.document || (typeof document !== 'undefined' ? document : null);
    const liveLocation = input.location || (typeof location !== 'undefined' ? location : null);
    const href = input.href || liveLocation?.href || '';
    let parsed = null;
    try {
      parsed = new URL(href, liveLocation?.origin || 'https://invalid.local');
    } catch (_err) {
      // An invalid URL cannot match a shipped provider or a restricted route.
    }
    return Object.freeze({
      document: doc,
      location: liveLocation,
      href,
      hostname: parsed?.hostname || liveLocation?.hostname || '',
      origin: parsed?.origin || liveLocation?.origin || '',
      pathname: parsed?.pathname || liveLocation?.pathname || '',
    });
  }

  function assertProvider(provider) {
    if (!provider || typeof provider.id !== 'string' || !provider.id.trim()) {
      throw new TypeError('LMS provider requires a non-empty id');
    }
    for (const method of ['matches', 'probeRestricted', 'getPageContext']) {
      if (typeof provider[method] !== 'function') {
        throw new TypeError(`LMS provider "${provider.id}" requires ${method}()`);
      }
    }
  }

  function createRegistry(initialProviders = []) {
    const providers = new Map();

    function register(provider) {
      assertProvider(provider);
      if (providers.has(provider.id)) throw new Error(`LMS provider already registered: ${provider.id}`);
      providers.set(provider.id, provider);
      return provider;
    }

    function resolve(input) {
      const context = normaliseContext(input);
      for (const provider of providers.values()) {
        if (provider.matches(context)) return provider;
      }
      return null;
    }

    initialProviders.forEach(register);
    return Object.freeze({ register, resolve, ids: () => Object.freeze(Array.from(providers.keys())) });
  }

  function textOf(doc, selector) {
    return doc?.querySelector(selector)?.textContent?.trim() || '';
  }

  function makeLessonIdentity(providerId, context, pageKind) {
    if (pageKind !== 'lesson' && pageKind !== 'quiz') return null;
    const segments = context.pathname.split('/').filter(Boolean);
    const lessonId = segments.at(-1) || 'lesson';
    const courseId = segments.length > 1 ? segments.at(-2) : null;
    const stablePath = context.pathname.replace(/\/$/, '') || '/';
    return Object.freeze({
      providerId,
      courseId,
      lessonId,
      key: `${providerId}:${context.origin}${stablePath}`,
    });
  }

  function createSkilljarProvider({ selectors, certPatterns, examPatterns, examSkipSelectors, platform }) {
    const translationInclude = Object.freeze([
      selectors.courseBox,
      selectors.courseBoxDesc,
      selectors.ribbonText,
      selectors.courseTime,
      selectors.faqTitle,
      `${selectors.faqPost} p`,
      `${selectors.lessonRow} div.title, ${selectors.lessonRow} .lesson-wrapper div`,
      selectors.focusLink,
      selectors.sectionTitle,
      selectors.leftNavReturn,
      selectors.courseOverview,
      `${selectors.lessonTop} h2`,
      selectors.detailsPane,
      selectors.courseFamilyTitle,
      selectors.courseRatingText,
    ]);

    function matches(context) {
      if (platform?.getHostCapabilities?.(context.hostname)?.platform === 'skilljar') return true;
      return platform?.detectPlatform?.(context.hostname) === 'skilljar';
    }

    function probeRestricted(context) {
      const restricted = certPatterns.some((pattern) => pattern.test(context.href));
      return Object.freeze({ restricted, reason: restricted ? 'certification-url' : null });
    }

    function getPageContext(context) {
      const doc = context.document;
      const quizDetected =
        examPatterns.some((pattern) => pattern.test(context.href)) ||
        !!doc?.querySelector(`${selectors.quizForm}, ${selectors.answerOption}`);
      let pageKind = 'unknown';
      if (quizDetected) pageKind = 'quiz';
      else if (doc?.querySelector(`${selectors.lessonMain}, ${selectors.lessonContent}`)) pageKind = 'lesson';
      else if (doc?.querySelector(`${selectors.courseTitle}, ${selectors.lessonRow}, ${selectors.courseOverview}`)) {
        pageKind = 'course';
      } else if (doc?.querySelector(selectors.courseBox)) pageKind = 'catalog';

      const title = textOf(doc, `h1, h2, ${selectors.courseTitle}`) || doc?.title || '';
      return Object.freeze({
        providerId: 'skilljar',
        pageKind,
        contentRootSelector: `${selectors.lessonMain}, ${selectors.lessonContent}, ${selectors.courseContent}, main`,
        translationScope: null,
        translationInclude,
        translationExclude: Object.freeze([selectors.aiTutor]),
        examSkipSelectors: Object.freeze([...examSkipSelectors]),
        quizDetected,
        metadata: Object.freeze({ title }),
        lessonIdentity: makeLessonIdentity('skilljar', context, pageKind),
        uiAnchors: Object.freeze({
          headerRight: selectors.headerRight,
          headerLinks: selectors.headerLinks,
        }),
      });
    }

    return Object.freeze({ id: 'skilljar', matches, probeRestricted, getPageContext });
  }

  function createClaudeTutorialProvider({ contentScope }) {
    function matches(context) {
      return context.hostname === 'claude.com' && context.pathname.startsWith('/resources/tutorials/');
    }

    function probeRestricted() {
      return Object.freeze({ restricted: false, reason: null });
    }

    function getPageContext(context) {
      const title = textOf(context.document, 'h1, h2') || context.document?.title || '';
      const hasRoot = !!context.document?.querySelector(contentScope);
      const pageKind = hasRoot ? 'lesson' : 'unknown';
      return Object.freeze({
        providerId: 'claude-tutorials',
        pageKind,
        contentRootSelector: contentScope,
        translationScope: contentScope,
        translationInclude: Object.freeze([]),
        translationExclude: Object.freeze([]),
        examSkipSelectors: Object.freeze([]),
        quizDetected: false,
        metadata: Object.freeze({ title }),
        lessonIdentity: makeLessonIdentity('claude-tutorials', context, pageKind),
        uiAnchors: Object.freeze({ headerRight: null, headerLinks: null }),
      });
    }

    return Object.freeze({ id: 'claude-tutorials', matches, probeRestricted, getPageContext });
  }

  const selectors = typeof SKILLJAR_SELECTORS !== 'undefined' ? SKILLJAR_SELECTORS : null;
  const certPatterns = typeof CERT_DISABLE_PATTERNS !== 'undefined' ? CERT_DISABLE_PATTERNS : [];
  const examPatterns = typeof EXAM_URL_PATTERNS !== 'undefined' ? EXAM_URL_PATTERNS : [];
  const examSkipSelectors = typeof EXAM_SKIP_SELECTORS !== 'undefined' ? EXAM_SKIP_SELECTORS : [];
  const platform = root._sbPlatform || null;
  const providers = [];
  if (selectors) {
    providers.push(createSkilljarProvider({ selectors, certPatterns, examPatterns, examSkipSelectors, platform }));
  }
  const tutorialScope = platform?.CLAUDE_TUTORIAL_CONTENT_SCOPE || '.hero_tutorial_post_content, #tutorial_content';
  providers.push(createClaudeTutorialProvider({ contentScope: tutorialScope }));

  const registry = createRegistry(providers);

  function probe(input) {
    const context = normaliseContext(input);
    const provider = registry.resolve(context);
    if (!provider) return null;
    return Object.freeze({
      provider,
      context,
      restricted: provider.probeRestricted(context),
    });
  }

  function describe(probed) {
    if (!probed || probed.restricted?.restricted) return probed || null;
    return Object.freeze({ ...probed, page: probed.provider.getPageContext(probed.context) });
  }

  function resolve(input) {
    return describe(probe(input));
  }

  const api = Object.freeze({
    createRegistry,
    normaliseContext,
    createSkilljarProvider,
    probe,
    describe,
    resolve,
    registry,
  });
  root._sbLmsProviders = api;

  if (typeof globalThis !== 'undefined' && typeof globalThis.module !== 'undefined') {
    globalThis.module.exports = api;
  }
})();
