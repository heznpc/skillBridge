/*
 * Store-asset harness — minimal localhost fixture server.
 *
 * Why a real HTTP server and not Playwright route().fulfill(): fulfilled
 * responses do NOT trigger MV3 content-script injection in Chromium, so
 * screenshot fixtures have to come from a real http:// origin. This server
 * is deliberately tiny — it serves static files from one directory, with a
 * permissive CSP so fixtures can use inline styles/scripts, and an optional
 * fallback file so any path (e.g. a faux course-slug URL) resolves to a page
 * the content script will match.
 *
 * Projects with richer needs (path-routed fixtures, request stubbing) bring
 * their own server in store.config.js's setup() instead.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

// Permissive CSP so fixtures can carry inline <style>/<script> and the
// extension's web-accessible resources load without policy friction.
const FIXTURE_CSP =
  "default-src * data: blob: 'unsafe-eval' 'unsafe-inline'; " +
  "script-src * 'unsafe-eval' 'unsafe-inline' data: blob:; " +
  "style-src * 'unsafe-inline'";

/**
 * Serve `dir` over http on a random loopback port.
 *
 * @param {string} dir
 * @param {object} [opts]
 * @param {string} [opts.fallback] filename (relative to dir) served for any
 *   path that doesn't map to an existing file — lets a single fixture answer
 *   arbitrary URLs (handy for faking deep/slug paths).
 * @returns {Promise<{baseUrl: string, close: () => Promise<void>}>}
 */
function serveDirectory(dir, opts = {}) {
  const root = path.resolve(dir);
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      // Path-traversal sanitizer (CodeQL js/path-injection): normalize, then
      // strip any leading `../` segments so the join can't escape `root`.
      const rel = path.normalize(urlPath === '/' ? '/index.html' : urlPath).replace(/^(\.\.(\/|\\|$))+/, '');
      let filePath = path.join(root, rel);
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = opts.fallback ? path.join(root, opts.fallback) : null;
      }
      if (!filePath || !fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
        'Content-Security-Policy': FIXTURE_CSP,
      });
      res.end(fs.readFileSync(filePath));
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        baseUrl: `http://localhost:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

module.exports = { serveDirectory, FIXTURE_CSP };
