/*
 * Store-asset harness — caption / disclaimer band compositor.
 *
 * Stacks a caption band UNDER a captured screenshot rather than overlaying it,
 * so no product UI is ever hidden (the chat input at the bottom of a sidebar,
 * a header control at the top, etc.). The scene is captured at the preset
 * height minus the band height; this compositor stacks the two back to the
 * exact preset dimensions (e.g. 1280×800).
 *
 * Trademark note: the disclaimer half of the band is the structural place a
 * "not affiliated" line lives — putting it here (not relying on the page) means
 * every screenshot carries it whether or not the extension UI shows one.
 *
 * Compositing is done with Playwright itself (HTML → screenshot), so there's
 * no native image dependency.
 */

const DEFAULT_BAND_HEIGHT = 56;

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * @param {object} o
 * @param {import('playwright').BrowserContext} o.context
 * @param {Buffer} o.imageBuffer  PNG captured at width × (height - bandHeight)
 * @param {number} o.width        final width (e.g. 1280)
 * @param {number} o.height       final height (e.g. 800)
 * @param {number} [o.bandHeight]
 * @param {string} [o.caption]    per-scene feature line (left)
 * @param {string} [o.disclaimer] persistent disclaimer line (right)
 * @returns {Promise<Buffer>} final PNG (width × height)
 */
async function compositeCaption({ context, imageBuffer, width, height, bandHeight = DEFAULT_BAND_HEIGHT, caption, disclaimer }) {
  const imgHeight = height - bandHeight;
  const dataUri = `data:image/png;base64,${imageBuffer.toString('base64')}`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:#111}
    img{display:block;width:${width}px;height:${imgHeight}px}
    .band{box-sizing:border-box;width:${width}px;height:${bandHeight}px;
      display:flex;align-items:center;justify-content:space-between;gap:24px;
      padding:0 28px;background:#14151a;border-top:2px solid #4285f4;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fff}
    .caption{font-size:19px;font-weight:600;letter-spacing:.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .disclaimer{font-size:12px;font-weight:500;color:#aab;opacity:.85;text-align:right;white-space:nowrap}
    .center{justify-content:center}
  </style></head><body>
    <img src="${dataUri}">
    <div class="band${caption ? '' : ' center'}">
      ${caption ? `<div class="caption">${escapeHtml(caption)}</div>` : ''}
      ${disclaimer ? `<div class="disclaimer">${escapeHtml(disclaimer)}</div>` : ''}
    </div>
  </body></html>`;

  const page = await context.newPage();
  try {
    await page.setViewportSize({ width, height });
    await page.setContent(html, { waitUntil: 'load' });
    return await page.screenshot({ clip: { x: 0, y: 0, width, height } });
  } finally {
    await page.close();
  }
}

module.exports = { compositeCaption, DEFAULT_BAND_HEIGHT };
