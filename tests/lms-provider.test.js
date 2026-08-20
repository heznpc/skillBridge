/* global describe, test, expect */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const providerSrc = fs.readFileSync(path.join(root, 'src', 'lib', 'lms-provider.js'), 'utf8');
const selectorsSrc = fs.readFileSync(path.join(root, 'src', 'lib', 'selectors.js'), 'utf8');
const constantsSrc = fs.readFileSync(path.join(root, 'src', 'lib', 'constants.js'), 'utf8');
const sharedSrc = fs.readFileSync(path.join(root, 'src', 'shared', 'runtime-constants.js'), 'utf8');
const contentSrc = fs.readFileSync(path.join(root, 'src', 'content', 'content.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

function loadProviderApi() {
  const fake = { module: { exports: {} } };
  new Function('globalThis', providerSrc)(fake);
  return fake.module.exports;
}

const { SKILLJAR_SELECTORS, CERT_DISABLE_PATTERNS, EXAM_URL_PATTERNS, EXAM_SKIP_SELECTORS } = new Function(
  `${selectorsSrc}\n${sharedSrc}\n${constantsSrc}\nreturn { SKILLJAR_SELECTORS, CERT_DISABLE_PATTERNS, EXAM_URL_PATTERNS, EXAM_SKIP_SELECTORS };`,
)();

function makeDocument({ selectors = [], title = 'Fixture course', heading = 'Fixture lesson' } = {}) {
  return {
    title,
    querySelector(query) {
      if (query.startsWith('h1, h2,')) return { textContent: heading };
      return selectors.some((selector) => query.includes(selector)) ? { textContent: heading } : null;
    },
  };
}

function makeSkilljarProvider(api) {
  return api.createSkilljarProvider({
    selectors: SKILLJAR_SELECTORS,
    certPatterns: CERT_DISABLE_PATTERNS,
    examPatterns: EXAM_URL_PATTERNS,
    examSkipSelectors: EXAM_SKIP_SELECTORS,
    platform: {
      detectPlatform: (hostname) => (hostname.endsWith('skilljar.com') ? 'skilljar' : 'unknown'),
      getHostCapabilities: () => ({ platform: 'unknown' }),
    },
  });
}

describe('LMS provider contract and registry', () => {
  test('rejects incomplete providers', () => {
    const { createRegistry } = loadProviderApi();
    expect(() => createRegistry([{ id: 'broken', matches: () => true }])).toThrow(/probeRestricted/);
  });

  test('a fixture LMS can be added without changing core translation code', () => {
    const { createRegistry } = loadProviderApi();
    const fixture = {
      id: 'fixture-lms',
      matches: ({ hostname }) => hostname === 'learn.example.test',
      probeRestricted: () => ({ restricted: false, reason: null }),
      getPageContext: ({ pathname }) => ({
        providerId: 'fixture-lms',
        pageKind: pathname === '/unit/1' ? 'lesson' : 'unknown',
      }),
    };
    const registry = createRegistry([fixture]);
    const provider = registry.resolve({ href: 'https://learn.example.test/unit/1' });

    expect(provider).toBe(fixture);
    expect(provider.getPageContext({ pathname: '/unit/1' })).toEqual({
      providerId: 'fixture-lms',
      pageKind: 'lesson',
    });
    expect(contentSrc).not.toContain('fixture-lms');
  });

  test('restricted probe completes without running page discovery', () => {
    const api = loadProviderApi();
    const getPageContext = jest.fn();
    const fixture = {
      id: 'restricted-fixture',
      matches: () => true,
      probeRestricted: () => ({ restricted: true, reason: 'fixture-restricted' }),
      getPageContext,
    };
    const registry = api.createRegistry([fixture]);
    const context = api.normaliseContext({ href: 'https://restricted.example.test/exam' });
    const provider = registry.resolve(context);
    const probed = Object.freeze({ provider, context, restricted: provider.probeRestricted(context) });

    expect(api.describe(probed)).toBe(probed);
    expect(getPageContext).not.toHaveBeenCalled();
  });
});

describe('Skilljar provider', () => {
  test('matches Skilljar hosts and exposes lesson metadata, roots, targets, and stable identity', () => {
    const api = loadProviderApi();
    const provider = makeSkilljarProvider(api);
    const first = api.normaliseContext({
      href: 'https://anthropic.skilljar.com/claude-101/383389?utm_source=test#section',
      document: makeDocument({ selectors: [SKILLJAR_SELECTORS.lessonMain] }),
    });
    const second = api.normaliseContext({
      href: 'https://anthropic.skilljar.com/claude-101/383389?different=1',
      document: first.document,
    });
    const page = provider.getPageContext(first);

    expect(provider.matches(first)).toBe(true);
    expect(page.pageKind).toBe('lesson');
    expect(page.metadata.title).toBe('Fixture lesson');
    expect(page.contentRootSelector).toContain(SKILLJAR_SELECTORS.lessonMain);
    expect(page.translationInclude).toContain(SKILLJAR_SELECTORS.courseBox);
    expect(page.translationExclude).toContain(SKILLJAR_SELECTORS.aiTutor);
    expect(page.lessonIdentity).toEqual(
      expect.objectContaining({ providerId: 'skilljar', courseId: 'claude-101', lessonId: '383389' }),
    );
    expect(provider.getPageContext(second).lessonIdentity.key).toBe(page.lessonIdentity.key);
  });

  test('detects quizzes by URL or DOM and preserves answer-skip selectors', () => {
    const api = loadProviderApi();
    const provider = makeSkilljarProvider(api);
    const urlQuiz = provider.getPageContext(
      api.normaliseContext({ href: 'https://anthropic.skilljar.com/course/quiz', document: makeDocument() }),
    );
    const domQuiz = provider.getPageContext(
      api.normaliseContext({
        href: 'https://anthropic.skilljar.com/course/checkpoint',
        document: makeDocument({ selectors: [SKILLJAR_SELECTORS.quizForm] }),
      }),
    );

    expect(urlQuiz.pageKind).toBe('quiz');
    expect(domQuiz.quizDetected).toBe(true);
    expect(domQuiz.examSkipSelectors).toEqual(EXAM_SKIP_SELECTORS);
  });

  test.each([
    'https://anthropic.skilljar.com/claude-certified',
    'https://anthropic.skilljar.com/certification-exam',
    'https://anthropic.skilljar.com/proctored',
  ])('restricted certification preflight blocks %s', (href) => {
    const api = loadProviderApi();
    const verdict = makeSkilljarProvider(api).probeRestricted(api.normaliseContext({ href }));
    expect(verdict).toEqual({ restricted: true, reason: 'certification-url' });
  });

  test('normal lessons never become restricted pages', () => {
    const api = loadProviderApi();
    const verdict = makeSkilljarProvider(api).probeRestricted(
      api.normaliseContext({ href: 'https://anthropic.skilljar.com/claude-101/383389' }),
    );
    expect(verdict).toEqual({ restricted: false, reason: null });
  });
});

describe('production wiring and safety ordering', () => {
  test('loads provider dependencies before content initialization', () => {
    const scripts = manifest.content_scripts[0].js;
    const providerIndex = scripts.indexOf('src/lib/lms-provider.js');
    expect(providerIndex).toBeGreaterThan(scripts.indexOf('src/lib/constants.js'));
    expect(providerIndex).toBeLessThan(scripts.indexOf('src/content/content.js'));
  });

  test('restricted preflight and core safety floor run before translation/tool initialization', () => {
    const restrictedCheck = contentSrc.indexOf('providerResolution.restricted.restricted');
    const pageDiscovery = contentSrc.indexOf('providerApi.describe(providerResolution)');
    const aiGate = contentSrc.indexOf('createAIGateController');
    const namespace = contentSrc.indexOf('window._sb = {');
    expect(restrictedCheck).toBeGreaterThanOrEqual(0);
    expect(contentSrc.slice(0, aiGate)).toContain('CERT_DISABLE_PATTERNS.some');
    expect(restrictedCheck).toBeLessThan(aiGate);
    expect(restrictedCheck).toBeLessThan(namespace);
    expect(restrictedCheck).toBeLessThan(pageDiscovery);
  });

  test('core translation and migrated learning tools contain no Skilljar selector references', () => {
    for (const relative of [
      'src/content/content.js',
      'src/content/header-controls.js',
      'src/content/pdf-export.js',
      'src/content/reading-aid.js',
    ]) {
      const source = fs.readFileSync(path.join(root, relative), 'utf8');
      expect(source).not.toContain('SKILLJAR_SELECTORS');
    }
  });
});
