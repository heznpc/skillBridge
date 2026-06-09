/*
 * Store-asset harness — promo-tile renderer.
 *
 * A promo tile is a self-contained HTML graphic (the project owns its look)
 * screenshotted at fixed CWS dimensions. We load it via file:// so the page's
 * origin is file:// and relative asset paths (icon, fonts) actually load — a
 * document built with setContent() has an about:blank origin and is blocked
 * from fetching file:// subresources. {{placeholders}} are substituted in the
 * loaded DOM (which keeps the file:// base), then we wait for images to finish
 * before capturing. Deliberately a "tidy graphic," not agency-grade artwork.
 */

const fs = require('fs');
const { pathToFileURL } = require('url');

/**
 * @param {object} o
 * @param {import('playwright').BrowserContext} o.context
 * @param {string} o.template  absolute path to the promo HTML template
 * @param {number} o.width
 * @param {number} o.height
 * @param {Record<string,string>} [o.replacements]  {{key}} → value substitutions
 * @returns {Promise<Buffer>} PNG (width × height)
 */
async function renderPromoTile({ context, template, width, height, replacements }) {
  if (!fs.existsSync(template)) throw new Error(`renderPromoTile: template not found at ${template}`);

  const page = await context.newPage();
  try {
    await page.setViewportSize({ width, height });
    await page.goto(pathToFileURL(template).href, { waitUntil: 'load' });

    if (replacements && Object.keys(replacements).length) {
      // Trusted, build-time content only: the template and replacements are
      // repo-committed config (store.config.js), never user input, rendered in
      // a throwaway page that is screenshotted and closed. The innerHTML
      // round-trip is what re-resolves relative <img> paths against the file://
      // base after substitution.
      await page.evaluate((reps) => {
        let html = document.documentElement.innerHTML;
        for (const [k, v] of Object.entries(reps)) html = html.split(`{{${k}}}`).join(v);
        document.documentElement.innerHTML = html;
      }, replacements);
    }

    // Wait until every image has actually loaded (or errored) — relative paths
    // resolve against the file:// document, but the load is async.
    await page.evaluate(() =>
      Promise.all(
        Array.from(document.images).map((img) =>
          img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }),
        ),
      ),
    );

    return await page.screenshot({ clip: { x: 0, y: 0, width, height } });
  } finally {
    await page.close();
  }
}

module.exports = { renderPromoTile };
