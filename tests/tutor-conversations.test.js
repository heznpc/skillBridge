const {
  SCHEMA_VERSION,
  TITLE_MAX_LENGTH,
  normalizeTimestamp,
  deriveTitle,
  lessonKeyFor,
  conversationIdForRow,
  createConversationId,
  createTurnRow,
  normalizeConversation,
  groupConversationRows,
  oldestConversationRowIds,
  migrateLegacyConversation,
  serializeExport,
} = require('../src/lib/tutor-conversations');

describe('Tutor conversation row model', () => {
  test('lesson keys prefer canonical identity and URL fallback drops query/hash', () => {
    const url = 'https://academy.claude.com/courses/building/lesson?utm_source=test#exercise';

    expect(lessonKeyFor(url, { id: 'building.lesson' })).toBe('id:building.lesson');
    expect(lessonKeyFor(url, 'id:already-namespaced')).toBe('id:already-namespaced');
    expect(lessonKeyFor(url)).toBe('url:https://academy.claude.com/courses/building/lesson');
  });

  test('a v1 row migrates in memory without losing or mutating any stored field', () => {
    const legacy = {
      id: 41,
      question: 'Why does context matter?',
      answer: 'It bounds what the model can see.',
      lang: 'ko',
      chapter: 'Context windows',
      timestamp: 1_725_000_000_000,
      url: 'https://academy.claude.com/courses/building/context?source=email#top',
    };
    const before = { ...legacy };

    const conversation = migrateLegacyConversation(legacy, { id: 'course.context' });

    expect(conversation).toMatchObject({
      schemaVersion: SCHEMA_VERSION,
      conversationId: 'legacy:41',
      lessonKey: 'id:course.context',
      title: 'Why does context matter?',
      startedAt: legacy.timestamp,
      updatedAt: legacy.timestamp,
    });
    expect(conversation.turns).toHaveLength(1);
    expect(conversation.turns[0]).toMatchObject(legacy);
    expect(conversation.turns[0].question).toBe(legacy.question);
    expect(conversation.turns[0].answer).toBe(legacy.answer);
    expect(conversation.turns[0]).not.toHaveProperty('lessonKey');
    expect(legacy).toEqual(before);
  });

  test('explicit conversation IDs group Q/A rows into chronological multi-turn conversations', () => {
    const rows = [
      {
        id: 3,
        conversationId: 'conversation:one',
        question: 'Third?',
        answer: 'Third answer',
        lang: 'en',
        chapter: 'A lesson',
        timestamp: 300,
        url: 'https://academy.claude.com/courses/a/lesson?late=1',
        lessonKey: 'id:lesson-a',
        title: 'First?',
        startedAt: 100,
      },
      {
        id: 9,
        question: 'Legacy question',
        answer: 'Legacy answer',
        lang: 'en',
        chapter: 'Other',
        timestamp: 400,
        url: 'https://academy.claude.com/courses/other/lesson',
      },
      {
        id: 1,
        conversationId: 'conversation:one',
        question: 'First?',
        answer: 'First answer',
        lang: 'en',
        chapter: 'A lesson',
        timestamp: 100,
        url: 'https://academy.claude.com/courses/a/lesson?early=1#part',
        lessonKey: 'id:lesson-a',
        title: 'First?',
        startedAt: 100,
      },
    ];

    const conversations = groupConversationRows(rows);

    expect(conversations).toHaveLength(2);
    expect(conversations[0].conversationId).toBe('legacy:9');
    const grouped = conversations.find((item) => item.conversationId === 'conversation:one');
    expect(grouped.turns.map((turn) => turn.id)).toEqual([1, 3]);
    expect(grouped.turns.map((turn) => turn.question)).toEqual(['First?', 'Third?']);
    expect(grouped).toMatchObject({
      schemaVersion: SCHEMA_VERSION,
      lessonKey: 'id:lesson-a',
      title: 'First?',
      startedAt: 100,
      updatedAt: 300,
    });
  });

  test('a canonical lesson identity never replaces the IndexedDB keyPath id', () => {
    const row = createTurnRow(
      {
        id: 73,
        question: 'What is an agent loop?',
        answer: 'A repeated model/tool cycle.',
        lang: 'en',
        chapter: 'Agents',
        timestamp: 500,
        url: 'https://anthropic.skilljar.com/agents/123?ref=mail',
      },
      {
        conversationId: 'conversation:agents',
        canonicalIdentity: { id: 'agents.loop' },
        startedAt: 450,
      },
    );

    expect(row.id).toBe(73);
    expect(row.lessonKey).toBe('id:agents.loop');
    expect(row.conversationId).toBe('conversation:agents');
    expect(row.title).toBe('What is an agent loop?');
    expect(row.startedAt).toBe(450);
    expect(row.schemaVersion).toBeUndefined();
  });

  test('legacy IDs are stable and new conversation IDs accept deterministic entropy', () => {
    const unsaved = { question: 'same', answer: 'same', timestamp: 10, url: 'https://example.test/lesson' };

    expect(conversationIdForRow({ id: 0 })).toBe('legacy:0');
    expect(conversationIdForRow({ id: 5, conversationId: 'conversation:kept' })).toBe('conversation:kept');
    expect(conversationIdForRow(unsaved)).toBe(conversationIdForRow({ ...unsaved }));
    expect(createConversationId(1234, 'fixed-token')).toBe('conversation:ya-fixed-token');
  });

  test('quota pruning keeps the in-flight conversation even after the active UI conversation changes', () => {
    const conversations = groupConversationRows([
      {
        id: 1,
        conversationId: 'conversation:oldest',
        question: 'Old',
        answer: 'Old answer',
        timestamp: 100,
      },
      {
        id: 2,
        conversationId: 'conversation:saving',
        question: 'First saved turn',
        answer: 'Keep this whole conversation',
        timestamp: 200,
      },
      {
        id: 3,
        conversationId: 'conversation:saving',
        question: 'Turn being saved',
        answer: 'Keep this too',
        timestamp: 300,
      },
      {
        id: 4,
        conversationId: 'conversation:new-ui-active',
        question: 'New UI conversation',
        answer: 'Newest',
        timestamp: 400,
      },
    ]);

    expect(oldestConversationRowIds(conversations, ['conversation:saving', 'conversation:new-ui-active'], 20)).toEqual([
      1,
    ]);
  });
});

describe('Tutor conversation normalization and export', () => {
  test('normalization makes turns and all conversation times safe', () => {
    const normalized = normalizeConversation({
      conversationId: 'conversation:safe',
      startedAt: 'not a date',
      updatedAt: Number.POSITIVE_INFINITY,
      turns: [
        { id: 2, question: null, answer: 7, lang: null, chapter: 8, timestamp: '200', url: null },
        { id: 1, question: 123, answer: undefined, lang: 9, chapter: null, timestamp: 'bad', url: 10 },
      ],
    });

    expect(normalized.schemaVersion).toBe(SCHEMA_VERSION);
    expect(normalized.startedAt).toBe(0);
    expect(normalized.updatedAt).toBe(200);
    expect(normalized.turns.map((turn) => turn.id)).toEqual([1, 2]);
    expect(normalized.turns[0]).toMatchObject({
      question: '123',
      answer: '',
      lang: '9',
      chapter: '',
      timestamp: 0,
      url: '10',
    });
    expect(normalized.turns[1].answer).toBe('7');
    expect(normalizeTimestamp('2026-08-30T00:00:00.000Z')).toBe(Date.parse('2026-08-30T00:00:00.000Z'));
  });

  test('titles are whitespace-normalized, Unicode-safe, and bounded', () => {
    expect(deriveTitle('  What\n  is\tClaude?  ')).toBe('What is Claude?');
    const long = '🧠'.repeat(TITLE_MAX_LENGTH + 5);
    const title = deriveTitle(long);
    expect(Array.from(title)).toHaveLength(TITLE_MAX_LENGTH);
    expect(title.endsWith('…')).toBe(true);
  });

  test('export is a deterministic schema-v2 envelope of grouped local data', () => {
    const conversations = groupConversationRows([
      {
        id: 8,
        question: 'Local question',
        answer: 'Local answer',
        lang: 'en',
        chapter: 'Privacy',
        timestamp: 800,
        url: 'https://academy.claude.com/courses/privacy/local',
        localOnlyMarker: 'preserved',
      },
    ]);

    const first = serializeExport(conversations, 999);
    const second = serializeExport(conversations, 999);
    const payload = JSON.parse(first);

    expect(first).toBe(second);
    expect(payload).toMatchObject({ schemaVersion: SCHEMA_VERSION, exportedAt: 999 });
    expect(payload.conversations).toHaveLength(1);
    expect(payload.conversations[0].turns[0]).toMatchObject({
      id: 8,
      question: 'Local question',
      answer: 'Local answer',
      localOnlyMarker: 'preserved',
    });
    expect(payload.conversations[0]).not.toHaveProperty('messages');
    expect(payload.conversations[0]).not.toHaveProperty('prompt');
  });
});
