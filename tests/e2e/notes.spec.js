/**
 * E2E — Lesson notes (Tools ▸ Notes)
 *
 * Boots the bundle on the lesson fixture, opens the sidebar, and drives the
 * Notes sub-panel end to end: compose → save → list → re-open-prefills →
 * cancel-discards → remove. Also checks the underlying `sb_notes` write
 * directly, so a DOM-only bug (e.g. a render that doesn't reflect what got
 * persisted) can't hide behind a passing list assertion.
 */

const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

test.describe('SkillBridge — lesson notes', () => {
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
    await evalInContentWorld(extCtx.context, 'toggleNotesPanel');
    await page.waitForTimeout(200);
    expect(await evalInContentWorld(extCtx.context, 'readNotesList')).toEqual([]);
  });

  test('composing and saving a note for the current lesson persists it and renders it', async () => {
    const opened = await evalInContentWorld(extCtx.context, 'openNoteCompose');
    expect(opened.ok).toBe(true);

    const saved = await evalInContentWorld(extCtx.context, 'writeAndSaveNote', 'Remember: prompt !== token.');
    expect(saved.ok).toBe(true);
    await page.waitForTimeout(200); // storage write + re-render

    const list = await evalInContentWorld(extCtx.context, 'readNotesList');
    expect(list).toHaveLength(1);
    expect(list[0].preview).toBe('Remember: prompt !== token.');

    // The DOM list reflects what actually landed in chrome.storage.local —
    // not just what the render function was told to draw.
    const stored = await evalInContentWorld(extCtx.context, 'storageState', ['sb_notes']);
    expect(stored.sb_notes).toHaveLength(1);
    expect(stored.sb_notes[0]).toMatchObject({
      url: page.url(),
      text: 'Remember: prompt !== token.',
    });
  });

  test('re-opening compose on the same lesson pre-fills the existing note (edit, not duplicate)', async () => {
    const opened = await evalInContentWorld(extCtx.context, 'openNoteCompose');
    expect(opened.ok).toBe(true);
    const compose = await evalInContentWorld(extCtx.context, 'readNoteComposeValue');
    expect(compose).toEqual({ open: true, value: 'Remember: prompt !== token.' });
  });

  test('cancel discards edits and leaves the stored note untouched', async () => {
    // Compose is already open (previous test) and pre-filled; cancel without
    // saving must not create a second entry or clear the existing one.
    const cancelled = await evalInContentWorld(extCtx.context, 'cancelNoteCompose');
    expect(cancelled.ok).toBe(true);
    const list = await evalInContentWorld(extCtx.context, 'readNotesList');
    expect(list).toHaveLength(1);
    expect(list[0].preview).toBe('Remember: prompt !== token.');
  });

  test('saving an empty note deletes it instead of storing a blank entry', async () => {
    await evalInContentWorld(extCtx.context, 'openNoteCompose');
    const saved = await evalInContentWorld(extCtx.context, 'writeAndSaveNote', '   ');
    expect(saved.ok).toBe(true);
    await page.waitForTimeout(200);
    expect(await evalInContentWorld(extCtx.context, 'readNotesList')).toEqual([]);
  });

  test('remove deletes a note from the list and from storage', async () => {
    await evalInContentWorld(extCtx.context, 'openNoteCompose');
    await evalInContentWorld(extCtx.context, 'writeAndSaveNote', 'Second note, to be removed.');
    await page.waitForTimeout(200);
    expect(await evalInContentWorld(extCtx.context, 'readNotesList')).toHaveLength(1);

    const removed = await evalInContentWorld(extCtx.context, 'removeNoteAt', 0);
    expect(removed.ok).toBe(true);
    await page.waitForTimeout(200);

    expect(await evalInContentWorld(extCtx.context, 'readNotesList')).toEqual([]);
    const stored = await evalInContentWorld(extCtx.context, 'storageState', ['sb_notes']);
    expect(stored.sb_notes).toEqual([]);
  });
});
