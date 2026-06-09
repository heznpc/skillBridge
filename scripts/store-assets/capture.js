#!/usr/bin/env node
/*
 * Store-asset generator — entry point (`npm run capture:store`).
 *
 * Reads store.config.js from the project root and produces, into outDir:
 *   - <scene>.png      one screenshot per scene (preset CWS dimensions)
 *   - <promoTile>.png  one promo tile per promoTiles entry
 *   - <demo>.webm      a clean screencast (unless --no-video)
 *   - description.md   copy/paste listing copy extracted from STORE_LISTING.md
 *
 * Because it runs the project's real `build` first and loads the BUILT
 * extension, a successful run doubles as a real-bundle smoke test: every
 * screenshot that appears proves that feature rendered from the shipped code.
 *
 * Flags:
 *   --scene <name>   only capture the named scene(s); repeatable or comma-list.
 *                    Also matches a promoTile / demo name, or the literal
 *                    "description". When given, nothing else runs.
 *   --no-video       skip the demo screencast (faster; CI-friendly).
 *   --no-build       skip the build step (use an already-built bundle).
 *   --live-gt        passed through to config as flags.liveGt (e.g. use live
 *                    translation instead of the frozen offline map).
 *   --freeze         passed through as flags.freeze (re-record the frozen map).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const { launchWithExtension, closeContext } = require('./lib/launch');
const { compositeCaption, DEFAULT_BAND_HEIGHT } = require('./lib/caption');
const { renderPromoTile } = require('./lib/promo');
const { extractListing, renderDescriptionDoc } = require('./lib/describe');

const DEFAULT_VIEWPORT = { width: 1280, height: 800 };

function parseArgs(argv) {
  const flags = { scenes: [], noVideo: false, noBuild: false, liveGt: false, freeze: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scene') flags.scenes.push(...(argv[++i] || '').split(',').filter(Boolean));
    else if (a === '--no-video') flags.noVideo = true;
    else if (a === '--no-build') flags.noBuild = true;
    else if (a === '--live-gt') flags.liveGt = true;
    else if (a === '--freeze') flags.freeze = true;
  }
  return flags;
}

const log = (msg) => console.log(`[store] ${msg}`);

/** Normalize whatever setup() returns into { env, teardown }. */
function normalizeSetup(result) {
  if (!result) return { env: {}, teardown: async () => {} };
  if (typeof result.teardown === 'function') return { env: result.env || {}, teardown: result.teardown };
  return { env: result.env || result, teardown: async () => {} };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const only = new Set(args.scenes);
  const wants = (name) => only.size === 0 || only.has(name);

  const configPath = path.resolve(process.cwd(), 'store.config.js');
  if (!fs.existsSync(configPath)) throw new Error(`No store.config.js in ${process.cwd()}`);
  const config = require(configPath);

  const passFlags = { liveGt: args.liveGt, freeze: args.freeze };
  const outDir = path.resolve(process.cwd(), config.outDir || 'store-assets');
  fs.mkdirSync(outDir, { recursive: true });
  const defaultViewport = config.viewport || DEFAULT_VIEWPORT;
  const bandHeight = config.bandHeight || DEFAULT_BAND_HEIGHT;
  const produced = [];
  const tempDirs = [];

  // 1. Build — the smoke test starts here. A build failure aborts the run.
  // `config.build` is a repo-committed command string from store.config.js
  // (same trust boundary as a package.json script), intentionally run through
  // a shell so projects can write `npm run build:bundle`, chained commands,
  // etc. It is never derived from external/user input.
  if (config.build && !args.noBuild) {
    log(`build: ${config.build}`);
    execSync(config.build, { stdio: 'inherit' });
  }

  // 2. Prepare the unpacked extension dir to load.
  const extensionDir = await config.prepareExtension(passFlags);
  tempDirs.push(extensionDir);

  // 3. Screenshots + promo + description run in a no-video context.
  const main = await launchWithExtension({ extensionDir, viewport: defaultViewport });
  const setup = normalizeSetup(config.setup ? await config.setup({ context: main.context, extensionId: main.extensionId, flags: passFlags }) : null);
  try {
    for (const scene of config.scenes || []) {
      if (!wants(scene.name)) continue;
      const viewport = scene.viewport || defaultViewport;
      const captioned = !!(config.disclaimer || scene.caption);
      const captureHeight = captioned ? viewport.height - bandHeight : viewport.height;

      const page = await main.context.newPage();
      try {
        await page.setViewportSize({ width: viewport.width, height: captureHeight });
        await scene.run({ page, context: main.context, extensionId: main.extensionId, env: setup.env, baseUrl: setup.env.baseUrl, flags: passFlags });
        let buf = await page.screenshot({ clip: { x: 0, y: 0, width: viewport.width, height: captureHeight } });
        if (captioned) {
          buf = await compositeCaption({
            context: main.context, imageBuffer: buf,
            width: viewport.width, height: viewport.height, bandHeight,
            caption: scene.caption, disclaimer: config.disclaimer,
          });
        }
        const out = path.join(outDir, `${scene.name}.png`);
        fs.writeFileSync(out, buf);
        produced.push(out);
        log(`✓ ${scene.name}.png (${viewport.width}×${viewport.height})`);
      } finally {
        await page.close();
      }
    }

    for (const tile of config.promoTiles || []) {
      if (!wants(tile.name)) continue;
      const buf = await renderPromoTile({ context: main.context, template: tile.template, width: tile.width, height: tile.height, replacements: tile.replacements });
      const out = path.join(outDir, `${tile.name}.png`);
      fs.writeFileSync(out, buf);
      produced.push(out);
      log(`✓ ${tile.name}.png (${tile.width}×${tile.height})`);
    }

    if (config.description && config.description.from && wants('description')) {
      const listing = extractListing(path.resolve(process.cwd(), config.description.from));
      const out = path.join(outDir, 'description.md');
      fs.writeFileSync(out, renderDescriptionDoc(listing));
      produced.push(out);
      if (listing.warnings.length) log(`⚠️  ${listing.warnings.join('; ')}`);
      log('✓ description.md');
    }
  } finally {
    // Close the context (drops the browser's sockets) BEFORE the fixture server:
    // server.close() waits for open connections to drain, and a still-open page
    // keeps a keep-alive socket that would otherwise deadlock the close.
    await closeContext(main);
    await setup.teardown();
  }

  // 4. Demo screencast — separate context so only the demo records video.
  if (config.demo && !args.noVideo && wants(config.demo.name)) {
    const viewport = config.demo.viewport || defaultViewport;
    const videoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-video-'));
    tempDirs.push(videoDir);
    const demoCtx = await launchWithExtension({ extensionDir, viewport, recordVideoDir: videoDir, recordVideoSize: viewport });

    // Keep a small "unofficial" badge on screen across navigations.
    if (config.disclaimer) {
      await demoCtx.context.addInitScript((text) => {
        const add = () => {
          if (document.getElementById('__store_badge__') || !document.body) return;
          const b = document.createElement('div');
          b.id = '__store_badge__';
          b.textContent = text;
          b.style.cssText = 'position:fixed;top:10px;left:10px;z-index:2147483647;background:rgba(20,21,26,.86);color:#fff;font:600 11px -apple-system,Segoe UI,Roboto,sans-serif;padding:5px 9px;border-radius:6px;pointer-events:none';
          document.body.appendChild(b);
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add, { once: true });
        else add();
      }, config.disclaimer);
    }

    const setup2 = normalizeSetup(config.setup ? await config.setup({ context: demoCtx.context, extensionId: demoCtx.extensionId, flags: passFlags }) : null);
    const page = await demoCtx.context.newPage();
    await page.setViewportSize(viewport);
    await config.demo.run({ page, context: demoCtx.context, extensionId: demoCtx.extensionId, env: setup2.env, baseUrl: setup2.env.baseUrl, flags: passFlags });
    // Ordering matters on three axes:
    //   1. page.close() before server teardown — a still-open page keeps a
    //      keep-alive socket that deadlocks server.close().
    //   2. video.saveAs() needs the browser connection ALIVE, so it must run
    //      after page.close() (finalizes the recording) but before closeContext.
    //   3. server teardown last — by then no page holds a socket.
    const video = page.video();
    await page.close();
    if (video) {
      const out = path.join(outDir, `${config.demo.name}.webm`);
      await video.saveAs(out);
      produced.push(out);
      log(`✓ ${config.demo.name}.webm (${viewport.width}×${viewport.height})`);
    }
    await closeContext(demoCtx);
    await setup2.teardown();
  }

  // 5. Cleanup temp dirs.
  for (const d of tempDirs) fs.rmSync(d, { recursive: true, force: true });

  log(`done — ${produced.length} asset(s) in ${path.relative(process.cwd(), outDir) || '.'}/`);
}

main().catch((err) => {
  console.error('[store] FAILED:', err && err.stack ? err.stack : err);
  process.exit(1);
});
