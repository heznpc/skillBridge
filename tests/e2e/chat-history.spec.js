/**
 * Tutor conversation lifecycle E2E.
 *
 * Proves the full rendered path over the real MV3 extension: published v1
 * rows remain readable, consecutive turns group into one conversation, New
 * and SPA lesson changes create boundaries, detail/list navigation works,
 * individual delete and clear commit to IDB, and export downloads only local
 * grouped history.
 */
const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

test.describe('SkillBridge — Tutor conversation lifecycle', () => {
  /** @type {Awaited<ReturnType<typeof launchExtension>>} */
  let extCtx;
  /** @type {import('@playwright/test').Page} */
  let page;
  /** @type {{server: import('http').Server, baseUrl: string}} */
  let fixture;
  const pageErrors = [];
  const consoleErrors = [];

  test.beforeAll(async () => {
    fixture = await startFixtureServer();
    extCtx = await launchExtension();
    await registerStubs(extCtx.context);
    page = await extCtx.context.newPage();
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
      console.log('[page:pageerror]', err.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
        console.log('[page:error]', msg.text());
      }
    });
    await page.goto(`${fixture.baseUrl}/lesson`);

    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const snap = await evalInContentWorld(extCtx.context, 'snapshot');
      const bridge = await evalInContentWorld(extCtx.context, 'bridgeReady');
      if (snap?.init && snap?.sb && snap?.methods?.chat?.startNewConversation === 'function' && bridge?.isReady) {
        break;
      }
      await page.waitForTimeout(250);
    }
    expect((await evalInContentWorld(extCtx.context, 'bridgeReady'))?.isReady).toBe(true);
    await evalInContentWorld(extCtx.context, 'suppressOnboarding');

    // Exact row shape written by published v1 builds: no conversationId,
    // lessonKey, title, or schema version. It must survive as one conversation.
    const legacy = await evalInContentWorld(extCtx.context, 'seedLegacyTutorHistory', [
      {
        question: 'Legacy stored question',
        answer: 'Legacy stored answer',
        lang: 'en',
        chapter: 'Legacy lesson',
        timestamp: Date.now() - 60_000,
        url: `${fixture.baseUrl}/legacy-lesson?source=old#part`,
      },
    ]);
    expect(legacy).toMatchObject({ ok: true, count: 1 });

    await evalInContentWorld(extCtx.context, 'injectSidebar');
    await evalInContentWorld(extCtx.context, 'toggleSidebar');
  });

  test.afterAll(async () => {
    if (extCtx) await closeExtension(extCtx);
    if (fixture) await stopFixtureServer(fixture.server);
  });

  async function sendAndWait(text) {
    expect(await evalInContentWorld(extCtx.context, 'sendChat', text)).toMatchObject({ ok: true });
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const log = await evalInContentWorld(extCtx.context, 'readChatLog');
      const lastBot = log.filter((message) => message.role === 'bot').at(-1);
      if (lastBot?.text?.includes('주는 입력입니다')) return;
      await page.waitForTimeout(100);
    }
    throw new Error(`Tutor reply did not complete for "${text}"`);
  }

  async function waitForHistoryCount(count) {
    const deadline = Date.now() + 8_000;
    let items = [];
    while (Date.now() < deadline) {
      items = await evalInContentWorld(extCtx.context, 'readHistoryList');
      if (items.length === count) return items;
      await page.waitForTimeout(100);
    }
    throw new Error(`Expected ${count} history conversations, found ${items.length}`);
  }

  test('manages grouped conversations per lesson from migration through export and clear', async () => {
    await sendAndWait('What is a prompt?');
    await sendAndWait('How does chain-of-thought work?');
    const cloudPrompt = (await evalInContentWorld(extCtx.context, 'lastTutorPrompt')).prompt;
    expect(cloudPrompt).toContain('How does chain-of-thought work?');
    expect(cloudPrompt).not.toContain('What is a prompt?');
    expect(cloudPrompt).not.toContain('주는 입력입니다');
    await evalInContentWorld(extCtx.context, 'toggleHistoryPanel');

    let items = await waitForHistoryCount(2);
    const firstConversation = items.find((item) => item.title === 'What is a prompt?');
    const legacyConversation = items.find((item) => item.title === 'Legacy stored question');
    expect(firstConversation?.turns).toContain('2');
    expect(firstConversation?.current).toBe(true);
    expect(firstConversation?.deleteLabel).toContain('What is a prompt?');
    expect(legacyConversation?.id).toMatch(/^legacy:/);

    const panel = await evalInContentWorld(extCtx.context, 'readHistoryPanel');
    expect(panel.groups).toEqual(expect.arrayContaining(['Introduction to Claude', 'Legacy lesson']));
    expect(panel).toMatchObject({ exportPresent: true, clearPresent: true });

    expect(await evalInContentWorld(extCtx.context, 'openHistoryDetail', firstConversation.id)).toMatchObject({
      ok: true,
    });
    let detail = { present: false };
    const detailDeadline = Date.now() + 3_000;
    while (Date.now() < detailDeadline) {
      detail = await evalInContentWorld(extCtx.context, 'readHistoryDetail');
      if (detail.present) break;
      await page.waitForTimeout(50);
    }
    expect(detail.userTexts).toEqual(['What is a prompt?', 'How does chain-of-thought work?']);
    expect(detail.botTexts).toHaveLength(2);
    expect(detail.botTexts.every((text) => text.includes('주는 입력입니다'))).toBe(true);
    expect(detail.deleteLabel).toContain('What is a prompt?');
    await page.screenshot({ path: '/tmp/skillbridge-conversation-detail-desktop.png' });

    expect(await evalInContentWorld(extCtx.context, 'closeHistoryDetail')).toMatchObject({ ok: true });
    items = await waitForHistoryCount(2);
    expect(items.map((item) => item.id)).toContain(firstConversation.id);

    // New is a real user-facing header action. It must restore the chat from
    // any learning-tool subpanel, not only History, before resetting it.
    await evalInContentWorld(extCtx.context, 'closeSubPanel');
    await evalInContentWorld(extCtx.context, 'toggleDashboardPanel');
    expect((await evalInContentWorld(extCtx.context, 'snapshot')).methods.chat.state.dashboardPanelOpen).toBe(true);
    expect(await evalInContentWorld(extCtx.context, 'startNewConversation')).toMatchObject({ ok: true });
    expect((await evalInContentWorld(extCtx.context, 'snapshot')).methods.chat.state.dashboardPanelOpen).toBe(false);
    let chat = await evalInContentWorld(extCtx.context, 'readChatLog');
    expect(chat.filter((message) => message.role === 'user')).toHaveLength(0);
    await sendAndWait('Start fresh here');
    await evalInContentWorld(extCtx.context, 'toggleHistoryPanel');
    items = await waitForHistoryCount(3);
    expect(items.find((item) => item.title === 'Start fresh here')?.turns).toContain('1');

    // A same-tab SPA lesson change is another automatic boundary. With the
    // sidebar hidden, it must reset the transcript without stealing page focus.
    await evalInContentWorld(extCtx.context, 'closeSubPanel');
    await evalInContentWorld(extCtx.context, 'toggleSidebar');
    await page.evaluate(() => {
      const heading = document.querySelector('h1');
      heading.tabIndex = -1;
      heading.focus();
    });
    expect(
      await evalInContentWorld(extCtx.context, 'pushTutorLesson', {
        path: '/lesson-two',
        title: 'Second Lesson',
      }),
    ).toMatchObject({ title: 'Second Lesson' });
    await page.waitForTimeout(250);
    expect(
      await page.evaluate(() => ({
        documentElement: document.activeElement?.tagName || '',
        shadowElement: document.getElementById('skillbridge-root')?.shadowRoot?.activeElement?.id || '',
      })),
    ).toEqual({ documentElement: 'H1', shadowElement: '' });
    await evalInContentWorld(extCtx.context, 'toggleSidebar');
    chat = await evalInContentWorld(extCtx.context, 'readChatLog');
    expect(chat.filter((message) => message.role === 'user')).toHaveLength(0);
    await sendAndWait('Question on lesson two');
    await evalInContentWorld(extCtx.context, 'toggleHistoryPanel');
    items = await waitForHistoryCount(4);
    expect((await evalInContentWorld(extCtx.context, 'readHistoryPanel')).groups).toContain('Second Lesson');

    await evalInContentWorld(extCtx.context, 'suppressOnboarding');
    await page.screenshot({ path: '/tmp/skillbridge-conversation-list-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    const mobileLayout = await evalInContentWorld(extCtx.context, 'uiLayoutProbe');
    expect(mobileLayout.overflowX).toBeLessThanOrEqual(1);
    expect(mobileLayout.sidebar.left).toBeGreaterThanOrEqual(0);
    expect(mobileLayout.sidebar.right).toBeLessThanOrEqual(390);
    await page.screenshot({ path: '/tmp/skillbridge-conversation-list-mobile.png' });
    await page.setViewportSize({ width: 1280, height: 720 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      evalInContentWorld(extCtx.context, 'clickHistoryExport'),
    ]);
    expect(download.suggestedFilename()).toMatch(/^skillbridge-tutor-history-\d{4}-\d{2}-\d{2}\.json$/);
    const stream = await download.createReadStream();
    let json = '';
    for await (const chunk of stream) json += chunk.toString();
    const exported = JSON.parse(json);
    expect(exported.schemaVersion).toBe(2);
    expect(exported.conversations).toHaveLength(4);
    expect(exported.conversations.find((conversation) => conversation.id === firstConversation.id)?.turns).toHaveLength(
      2,
    );
    expect(exported.conversations.every((conversation) => !Object.hasOwn(conversation, 'prompt'))).toBe(true);
    expect(
      exported.conversations.flatMap((conversation) => conversation.turns).every((turn) => !turn.courseContext),
    ).toBe(true);

    const fresh = items.find((item) => item.title === 'Start fresh here');
    page.once('dialog', (dialog) => dialog.accept());
    expect(await evalInContentWorld(extCtx.context, 'deleteHistoryConversation', fresh.id)).toMatchObject({ ok: true });
    items = await waitForHistoryCount(3);
    expect(items.map((item) => item.title)).not.toContain('Start fresh here');
    expect(items.map((item) => item.title)).toContain('Legacy stored question');

    page.once('dialog', (dialog) => dialog.accept());
    expect(await evalInContentWorld(extCtx.context, 'clickHistoryClear')).toMatchObject({ ok: true });
    items = await waitForHistoryCount(0);
    expect(items).toEqual([]);
    expect((await evalInContentWorld(extCtx.context, 'readHistoryPanel')).empty).toBeTruthy();
    expect(await evalInContentWorld(extCtx.context, 'readTutorHistoryRows')).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
