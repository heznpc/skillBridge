/**
 * E2E — Term reports queue ("Report wrong term", Tools ▸ Reports)
 *
 * Boots the bundle on the lesson fixture, opens the sidebar, and drives the
 * Reports sub-panel end to end: compose (wrong text + optional correction)
 * → save → list → cancel-discards → empty-wrong-text is a no-op → remove →
 * export triggers a real file download whose content matches what was
 * queued. Export uses a client-side Blob + `<a download>` (no
 * chrome.downloads permission), so this is also the proof that path
 * actually produces a download in a real extension content-script context
 * rather than being silently blocked.
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

  test('the panel opens empty (zero-state)', async () => {
    await evalInContentWorld(extCtx.context, 'toggleReportsPanel');
    await page.waitForTimeout(200);
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
});
