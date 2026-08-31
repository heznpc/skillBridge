/**
 * Semantic regression guards for the curated Dutch dictionary.
 *
 * Structural parity is enforced by the shared dictionary checks. These tests
 * pin the terminology decisions that are easiest to erase with a bulk edit.
 */

/* global describe, test, expect */

const dutch = require('../src/data/nl.json');
const manifest = require('../manifest.json');
const pluginDutch = require('../claude-plugin/skills/academy-terms/data/terms.nl.json');
const pluginCourses = require('../claude-plugin/skills/academy-terms/data/courses.json');

const contentEntries = Object.entries(dutch)
  .filter(([section]) => section !== '_meta' && section !== '_protected')
  .flatMap(([section, entries]) =>
    Object.entries(entries).map(([source, translated]) => ({ section, source, translated })),
  );

describe('curated Dutch dictionary', () => {
  test('records the curation and native-review status', () => {
    expect(dutch._meta).toMatchObject({
      lang: 'nl',
      langName: 'Nederlands',
      lastUpdated: '2026-09-01',
      lastAudited: '2026-09-01',
      nativeReview: 'recruiting',
    });
    expect(dutch._meta.version).toBe(manifest.version);
    expect(dutch._meta.translation_provenance).toContain('Term voor term');
    expect(dutch._meta.translation_provenance).toContain('geen uitvoer van automatische machinevertaling');
  });

  test('pins high-risk framework and platform terminology', () => {
    expect(dutch.aiFluency.Diligence).toBe('Zorgvuldigheid');
    expect(dutch.aiFluency.Discernment).toBe('Oordeelsvermogen');
    expect(dutch.aiFluency.Description).toBe('Beschrijving');
    expect(dutch.aiCapabilities['Factual accuracy and hallucinations']).toBe('Feitelijke juistheid en hallucinaties');
    expect(dutch.aiCapabilities['Guardrails and constraints']).toBe('Veiligheidskaders en beperkingen');
    expect(dutch.aiCapabilities['Bias in AI outputs']).toBe('Vertekening in AI-uitvoer');
    expect(dutch.aiCapabilities['Safe AI Deployment']).toBe('Veilige inzet van AI');
    expect(dutch.claudeAPI['Chain of thought prompting']).toBe('Chain-of-thought-prompting');
    expect(dutch.cloudDeployment['Setting up cloud credentials']).toBe('Aanmeldingsgegevens voor de cloud instellen');
    expect(dutch.mcpIntro['Tools primitive']).toBe('Tools-primitive');
    expect(dutch.mcpIntro['Resources primitive']).toBe('Resources-primitive');
    expect(dutch.mcpIntro['Prompts primitive']).toBe('Prompts-primitive');
  });

  test('retains the named 4D framework marker wherever the source uses it', () => {
    const lostMarkers = contentEntries
      .filter(({ source }) => source.includes('4D'))
      .filter(({ translated }) => !translated.includes('4D'));

    expect(lostMarkers).toEqual([]);
  });

  test('retains protected product, API, and identifier names in prose', () => {
    const protectedNames = Object.keys(dutch._protected).sort((a, b) => b.length - a.length);
    const lostNames = contentEntries.flatMap(({ section, source, translated }) =>
      protectedNames
        .filter((term) => source.includes(term) && !translated.includes(term))
        .map((term) => ({ section, source, term })),
    );

    expect(lostNames).toEqual([]);
  });

  test('retains protected feature names when source prose changes case or number', () => {
    const featureForms = [
      { source: /agent skills/i, translated: /Agent Skills/ },
      { source: /managed agents?/i, translated: /Managed Agents?/ },
      { source: /function calling/i, translated: /Function Calling/ },
    ];

    for (const { source, translated } of featureForms) {
      const matching = contentEntries.filter((entry) => source.test(entry.source));
      expect(matching.length).toBeGreaterThan(0);
      expect(matching.filter((entry) => !translated.test(entry.translated))).toEqual([]);
    }
  });

  test('pins the responsibility meaning of Deployment Diligence', () => {
    const source =
      'Video: A closer look at diligence explores Deployment Diligence - The ability to take informed responsibility for the outputs you use or share. Key concepts include: Verify facts, Check for biases, Ensure accuracy';
    const translated = dutch.aiFluency[source];

    expect(translated).toContain('weloverwogen verantwoordelijkheid');
    expect(translated).toContain('feiten verifiëren');
    expect(translated).toContain('vertekeningen');
    expect(translated).toContain('juistheid');
  });

  test('uses formal u/uw rather than mixing informal pronouns', () => {
    const informal = contentEntries
      .filter(({ translated }) => /\b(?:je|jij|jou|jouw|jullie|jezelf|jouzelf|julliezelf)\b/i.test(translated))
      .map(({ section, source }) => ({ section, source }));

    expect(informal).toEqual([]);
  });

  test('keeps protected-term restoration entries self-referential', () => {
    for (const [term, wrongForms] of Object.entries(dutch._protected)) {
      expect(wrongForms).toEqual([term]);
    }
  });

  test('ships every Claude Platform term through the companion plugin', () => {
    for (const [source, translated] of Object.entries(dutch.claudePlatform)) {
      expect(pluginDutch.terms[source]).toBe(translated);
    }
    expect(pluginCourses.courses).toContainEqual({
      block: 'claudePlatform',
      title: 'Claude Platform 101',
      slugs: ['certification-faq', 'claude-certified-architect-foundations-certification', 'claude-platform-101'],
    });
  });

  test('does not export canonical keep-English markers as forbidden plugin output', () => {
    for (const [canonical, wrongForms] of Object.entries(pluginDutch.protected)) {
      expect(wrongForms).not.toContain(canonical);
    }
  });
});
