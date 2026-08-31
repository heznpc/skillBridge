/**
 * E2E — Term reports queue ("Report wrong term", Tools ▸ Reports)
 *
 * Boots the bundle on the lesson fixture, opens the sidebar, and drives the
 * Reports sub-panel end to end, including v4.2 selection feedback: boot-time
 * legacy migration, manual compose, actual GT translation → real DOM Range →
 * helpful immediate-save / needs-work prefill → correction → list → export →
 * delete. Export uses a client-side Blob + `<a download>` (no downloads
 * permission), so the browser also proves that local-only hand-off works.
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

test.describe('SkillBridge — term reports queue', () => {
  /** @type {Awaited<ReturnType<typeof launchExtension>>} */
  let extCtx;
  /** @type {import('@playwright/test').Page} */
  let page;
  /** @type {{server: import('http').Server, baseUrl: string}} */
  let fixture;

  test.beforeAll(async () => {
    fixture = await startFixtureServer();
    extCtx = await launchExtension();
    await registerStubs(extCtx.context);

    const worker =
      extCtx.context.serviceWorkers()[0] || (await extCtx.context.waitForEvent('serviceworker', { timeout: 20_000 }));
    await worker.evaluate(async () => {
      await chrome.storage.local.set({
        sb_term_reports: [
          {
            wrongText: 'legacy translation',
            correction: 'legacy correction',
            url: 'https://anthropic.skilljar.com/legacy-lesson',
            title: 'Legacy lesson',
            lang: 'ko',
            ts: 1,
            retainedField: 'keep me',
          },
          null,
          { wrongText: '   ', ts: 'malformed' },
        ],
      });
    });

    page = await extCtx.context.newPage();
    await page.goto(`${fixture.baseUrl}/lesson`);

    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const snap = await evalInContentWorld(extCtx.context, 'snapshot');
      if (snap?.init && snap?.sb) break;
      await page.waitForTimeout(250);
    }
    await evalInContentWorld(extCtx.context, 'injectSidebar');
    await evalInContentWorld(extCtx.context, 'toggleSidebar');
  });

  test.afterAll(async () => {
    if (extCtx) await closeExtension(extCtx);
    if (fixture) await stopFixtureServer(fixture.server);
  });

  test('boot migration keeps the legacy row additively and drops malformed rows', async () => {
    await evalInContentWorld(extCtx.context, 'toggleReportsPanel');
    await page.waitForTimeout(200);
    expect(await evalInContentWorld(extCtx.context, 'readReportsList')).toEqual([
      { wrongText: 'legacy translation', correction: 'legacy correction' },
    ]);

    const stored = await evalInContentWorld(extCtx.context, 'storageState', ['sb_term_reports']);
    expect(stored.sb_term_reports).toHaveLength(1);
    expect(stored.sb_term_reports[0]).toMatchObject({
      reportSchemaVersion: 1,
      capture: 'manual',
      signal: 'negative',
      originalText: null,
      translatedText: 'legacy translation',
      selectedText: 'legacy translation',
      wrongText: 'legacy translation',
      retainedField: 'keep me',
    });

    await evalInContentWorld(extCtx.context, 'removeReportAt', 0);
    await page.waitForTimeout(100);
    expect(await evalInContentWorld(extCtx.context, 'readReportsList')).toEqual([]);
  });

  test('reporting a term with a correction persists and renders both fields', async () => {
    const opened = await evalInContentWorld(extCtx.context, 'openReportCompose');
    expect(opened.ok).toBe(true);

    const saved = await evalInContentWorld(extCtx.context, 'writeAndSaveReport', [
      '토큰',
      'Should stay "token" — not translated.',
    ]);
    expect(saved.ok).toBe(true);
    await page.waitForTimeout(200);

    const list = await evalInContentWorld(extCtx.context, 'readReportsList');
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({ wrongText: '토큰', correction: 'Should stay "token" — not translated.' });

    const stored = await evalInContentWorld(extCtx.context, 'storageState', ['sb_term_reports']);
    expect(stored.sb_term_reports).toHaveLength(1);
    expect(stored.sb_term_reports[0]).toMatchObject({
      wrongText: '토큰',
      correction: 'Should stay "token" — not translated.',
      url: page.url(),
    });
  });

  test('a second report on the same lesson is a distinct queue entry, not an edit', async () => {
    await evalInContentWorld(extCtx.context, 'openReportCompose');
    await evalInContentWorld(extCtx.context, 'writeAndSaveReport', ['prompt', '']);
    await page.waitForTimeout(200);

    const list = await evalInContentWorld(extCtx.context, 'readReportsList');
    expect(list).toHaveLength(2);
    // Newest first.
    expect(list[0]).toEqual({ wrongText: 'prompt', correction: '' });
    expect(list[1].wrongText).toBe('토큰');
  });

  test('cancel discards the compose without adding an entry', async () => {
    await evalInContentWorld(extCtx.context, 'openReportCompose');
    const cancelled = await evalInContentWorld(extCtx.context, 'cancelReportCompose');
    expect(cancelled.ok).toBe(true);
    expect(await evalInContentWorld(extCtx.context, 'readReportsList')).toHaveLength(2);
  });

  test('saving with a blank "wrong text" field is a no-op', async () => {
    await evalInContentWorld(extCtx.context, 'openReportCompose');
    await evalInContentWorld(extCtx.context, 'writeAndSaveReport', ['   ', 'this should not be saved']);
    await page.waitForTimeout(200);
    expect(await evalInContentWorld(extCtx.context, 'readReportsList')).toHaveLength(2);
  });

  test('exporting downloads a JSON file containing the queued reports', async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      evalInContentWorld(extCtx.context, 'clickExportReports'),
    ]);
    expect(download.suggestedFilename()).toMatch(/^skillbridge-term-reports-\d{4}-\d{2}-\d{2}\.json$/);

    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'));

    expect(exported).toHaveLength(2);
    expect(exported.map((r) => r.wrongText).sort()).toEqual(['prompt', '토큰']);
  });

  test('remove deletes a report from the list and from storage', async () => {
    const removed = await evalInContentWorld(extCtx.context, 'removeReportAt', 0);
    expect(removed.ok).toBe(true);
    await evalInContentWorld(extCtx.context, 'removeReportAt', 0);
    await page.waitForTimeout(200);

    expect(await evalInContentWorld(extCtx.context, 'readReportsList')).toEqual([]);
    const stored = await evalInContentWorld(extCtx.context, 'storageState', ['sb_term_reports']);
    expect(stored.sb_term_reports).toEqual([]);
  });

  test('helpful feedback from a real translated DOM selection saves immediately', async () => {
    await evalInContentWorld(extCtx.context, 'switchLanguage', 'ko');
    await expect
      .poll(async () => (await evalInContentWorld(extCtx.context, 'pageText')).p1)
      .toBe('이 강의는 프롬프트 엔지니어링의 기초와 Claude가 사용자 요청을 처리하는 방법을 다룹니다.');

    const toolbar = await evalInContentWorld(extCtx.context, 'selectTranslatedText', '#p-1');
    expect(toolbar).toMatchObject({ visible: true, askTutor: true, helpful: true, needsWork: true });

    const saved = await evalInContentWorld(extCtx.context, 'clickTranslationFeedback', 'positive');
    expect(saved.ok).toBe(true);
    expect(saved.status).toBe('피드백 저장됨');

    const stored = await evalInContentWorld(extCtx.context, 'storageState', ['sb_term_reports']);
    expect(stored.sb_term_reports).toHaveLength(1);
    expect(stored.sb_term_reports[0]).toMatchObject({
      reportSchemaVersion: 1,
      capture: 'selection',
      signal: 'positive',
      originalText: 'This lesson covers prompt engineering fundamentals and how Claude processes user requests.',
      translatedText: '이 강의는 프롬프트 엔지니어링의 기초와 Claude가 사용자 요청을 처리하는 방법을 다룹니다.',
      selectedText: '이 강의는 프롬프트 엔지니어링의 기초와 Claude가 사용자 요청을 처리하는 방법을 다룹니다.',
      correction: '',
      url: page.url(),
    });
  });

  test('needs-work feedback prefills Reports and saves an optional correction', async () => {
    const toolbar = await evalInContentWorld(extCtx.context, 'selectTranslatedText', '#p-1');
    expect(toolbar).toMatchObject({ visible: true, helpful: true, needsWork: true });

    const opened = await evalInContentWorld(extCtx.context, 'clickTranslationFeedback', 'negative');
    expect(opened).toMatchObject({ ok: true, reportsPanelOpen: true, sidebarVisible: true });

    const compose = await evalInContentWorld(extCtx.context, 'readReportCompose');
    expect(compose).toEqual({
      open: true,
      originalText: 'This lesson covers prompt engineering fundamentals and how Claude processes user requests.',
      translatedText: '이 강의는 프롬프트 엔지니어링의 기초와 Claude가 사용자 요청을 처리하는 방법을 다룹니다.',
      selectedText: '이 강의는 프롬프트 엔지니어링의 기초와 Claude가 사용자 요청을 처리하는 방법을 다룹니다.',
      correction: '',
    });

    await evalInContentWorld(
      extCtx.context,
      'saveFeedbackCorrection',
      '이 강의에서는 프롬프트 작성의 기초를 다룹니다.',
    );
    await page.waitForTimeout(200);

    const stored = await evalInContentWorld(extCtx.context, 'storageState', ['sb_term_reports']);
    expect(stored.sb_term_reports).toHaveLength(2);
    expect(stored.sb_term_reports[0]).toMatchObject({
      capture: 'selection',
      signal: 'negative',
      correction: '이 강의에서는 프롬프트 작성의 기초를 다룹니다.',
    });

    const list = await evalInContentWorld(extCtx.context, 'readReportDetails');
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      capture: 'selection',
      selectedText: '이 강의는 프롬프트 엔지니어링의 기초와 Claude가 사용자 요청을 처리하는 방법을 다룹니다.',
      correction: '이 강의에서는 프롬프트 작성의 기초를 다룹니다.',
    });
    expect(list[0].original).toContain('This lesson covers prompt engineering fundamentals');
    expect(list[0].translation).toContain('이 강의는 프롬프트 엔지니어링의 기초');
  });

  test('selection-feedback export retains evidence fields, then delete clears local storage', async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      evalInContentWorld(extCtx.context, 'clickExportReports'),
    ]);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'));

    expect(exported).toHaveLength(2);
    expect(exported.map((record) => record.signal).sort()).toEqual(['negative', 'positive']);
    for (const record of exported) {
      expect(record).toEqual(
        expect.objectContaining({
          reportSchemaVersion: 1,
          capture: 'selection',
          originalText: expect.any(String),
          translatedText: expect.any(String),
          selectedText: expect.any(String),
        }),
      );
    }

    await evalInContentWorld(extCtx.context, 'removeReportAt', 0);
    await evalInContentWorld(extCtx.context, 'removeReportAt', 0);
    await page.waitForTimeout(200);
    const stored = await evalInContentWorld(extCtx.context, 'storageState', ['sb_term_reports']);
    expect(stored.sb_term_reports).toEqual([]);
  });
});
