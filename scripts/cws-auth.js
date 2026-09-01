#!/usr/bin/env node
/**
 * Mint and VERIFY a Chrome Web Store API refresh token, then store it.
 *
 * Why this exists: the CD workflow has never uploaded anything. A
 * `CWS_REFRESH_TOKEN` secret was never issued, and because the workflow's
 * readiness check only tests that the secrets are non-empty, the gap stayed
 * invisible until a dispatch failed at the token exchange with a bare
 * `HTTP 400`. This script closes the loop the slow way round: it gets a token,
 * proves it against the real API, and only then writes it to the repo. No more
 * "set the secret and find out in CI".
 *
 * The Google consent click cannot be automated — that is what a refresh token
 * is for. Everything on either side of that click is automated here.
 *
 * ONE-TIME SETUP in Google Cloud Console (per the official guide at
 * https://developer.chrome.com/docs/webstore/using-api):
 *   1. Enable the "Chrome Web Store API" in a project.
 *   2. Configure an OAuth consent screen (External), and add your own Google
 *      account under "Test users" so no verification review is needed.
 *   3. Create an OAuth client. Either:
 *        - Application type "Desktop app"  → loopback works with no extra step
 *        - or "Web application"            → add this exact Authorized redirect
 *                                            URI:  http://localhost:8976/
 *   4. The publishing account must have 2-Step Verification enabled.
 *
 * USAGE
 *   CWS_CLIENT_ID=... CWS_CLIENT_SECRET=... node scripts/cws-auth.js
 *     Opens a consent URL, captures the code on localhost, exchanges it,
 *     verifies it against the live listing, prints a masked result.
 *
 *   ... node scripts/cws-auth.js --save
 *     Same, and on success writes CWS_CLIENT_ID / CWS_CLIENT_SECRET /
 *     CWS_REFRESH_TOKEN as GitHub repo secrets via `gh secret set`.
 *
 *   ... node scripts/cws-auth.js --code <AUTH_CODE>
 *     Skip the browser step and exchange a code obtained elsewhere (for
 *     example from the OAuth Playground). Use --redirect to match it.
 *
 *   ... node scripts/cws-auth.js --verify-only
 *     Verify an EXISTING refresh token from CWS_REFRESH_TOKEN. Use this to
 *     answer "are the repo secrets actually good?" without minting anything.
 *
 * The token is never written to disk and never printed in full unless
 * --print-token is passed. `gh secret set` receives it on stdin.
 */

'use strict';

const http = require('http');
const { execFileSync } = require('child_process');

const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
// v1.1 needs only the extension id. The v2 endpoints additionally require a
// publisher id, which is dashboard-only — keep verification dependency-free.
const ITEM_URL = (id) => `https://www.googleapis.com/chromewebstore/v1.1/items/${id}?projection=DRAFT`;
const PORT = 8976;
const REDIRECT = `http://localhost:${PORT}/`;
// Kept in sync with scripts/check-cws-drift.js by the CD workflow's target check.
const EXTENSION_ID = 'oancfldkbnajdadgekkjpdnhepjjcdln';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : (process.argv[i + 1] ?? true);
}
const has = (name) => process.argv.includes(`--${name}`);

function die(message, hint) {
  console.error(`\n[cws-auth] ${message}`);
  if (hint) console.error(`  → ${hint}`);
  process.exit(1);
}

function mask(secret) {
  const s = String(secret);
  return s.length <= 12 ? '*'.repeat(s.length) : `${s.slice(0, 6)}…${s.slice(-4)} (${s.length} chars)`;
}

async function postForm(url, form, fetchImpl = fetch) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep the raw body for the error path */
  }
  return { ok: res.ok, status: res.status, json, text };
}

/** Wait for Google to redirect back with ?code=… and answer the browser. */
function captureCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, REDIRECT);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      const body = code
        ? 'SkillBridge: authorization received. You can close this tab and return to the terminal.'
        : `SkillBridge: authorization failed (${error || 'no code returned'}). Return to the terminal.`;
      res.writeHead(code ? 200 : 400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(body);
      server.close();
      if (code) resolve(code);
      else reject(new Error(error || 'no authorization code in the redirect'));
    });
    server.on('error', (err) =>
      reject(
        new Error(
          err.code === 'EADDRINUSE'
            ? `port ${PORT} is in use — free it, or use --code with a manually obtained code`
            : err.message,
        ),
      ),
    );
    server.listen(PORT);
    setTimeout(() => {
      server.close();
      reject(new Error('timed out after 5 minutes waiting for the consent redirect'));
    }, 300_000).unref();
  });
}

/**
 * Proves the token can actually do the job: exchange it for an access token,
 * then read the real listing. A refresh token that mints an access token but
 * cannot see the item means the OAuth client is fine and the ACCOUNT lacks
 * access to this listing — a distinct failure worth naming separately.
 */
async function verify(clientId, clientSecret, refreshToken, { post = postForm, fetchImpl = fetch, fail = die } = {}) {
  const refreshed = await post(TOKEN_URL, {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  if (!refreshed.ok) {
    const code = refreshed.json?.error;
    const detail = refreshed.json?.error_description || refreshed.text.slice(0, 200);
    const hint =
      code === 'invalid_grant'
        ? 'The refresh token is expired, revoked, or was issued for a different client. Mint a new one.'
        : code === 'invalid_client'
          ? 'CWS_CLIENT_ID / CWS_CLIENT_SECRET do not match the OAuth client. Re-copy them from Cloud Console.'
          : 'Check that the Chrome Web Store API is enabled on the project.';
    return fail(`token refresh failed: HTTP ${refreshed.status} ${code || ''} — ${detail}`, hint);
  }

  const accessToken = refreshed.json?.access_token;
  if (!accessToken) {
    return fail(
      'token refresh succeeded but Google returned no access_token.',
      'Check that the OAuth token endpoint returned the expected JSON response.',
    );
  }
  const item = await fetchImpl(ITEM_URL(EXTENSION_ID), {
    headers: { Authorization: `Bearer ${accessToken}`, 'x-goog-api-version': '2' },
  });
  const itemText = await item.text();
  if (!item.ok) {
    return fail(
      `listing read failed: HTTP ${item.status} — ${itemText.slice(0, 300)}`,
      item.status === 403 || item.status === 404
        ? `The token works but this account cannot see item ${EXTENSION_ID}. Authorize with the Google account that owns the SkillBridge listing (or that is a publisher-group member).`
        : 'Unexpected API response; re-run with the raw body above for context.',
    );
  }
  return { accessToken, item: itemText };
}

function saveSecrets(clientId, clientSecret, refreshToken, run = execFileSync, logger = console) {
  const set = (name, value) => {
    run('gh', ['secret', 'set', name], { input: value, stdio: ['pipe', 'inherit', 'inherit'] });
    logger.log(`  stored ${name}`);
  };
  set('CWS_CLIENT_ID', clientId);
  set('CWS_CLIENT_SECRET', clientSecret);
  set('CWS_REFRESH_TOKEN', refreshToken);
}

async function exchangeAuthorizationCode(clientId, clientSecret, code, redirect, { post = postForm, fail = die } = {}) {
  const exchanged = await post(TOKEN_URL, {
    client_id: clientId,
    client_secret: clientSecret,
    code: String(code),
    grant_type: 'authorization_code',
    redirect_uri: redirect,
  });
  if (!exchanged.ok) {
    return fail(
      `code exchange failed: HTTP ${exchanged.status} ${exchanged.json?.error || ''} — ` +
        `${exchanged.json?.error_description || exchanged.text.slice(0, 200)}`,
      'Authorization codes are single-use and short-lived. Re-run to get a fresh one.',
    );
  }
  const refreshToken = exchanged.json?.refresh_token;
  if (!refreshToken) {
    return fail(
      'Google returned no refresh_token.',
      'This happens when the account already granted consent. Re-run — this script sends prompt=consent — or revoke the app at https://myaccount.google.com/permissions and retry.',
    );
  }
  return refreshToken;
}

async function main() {
  const clientId = process.env.CWS_CLIENT_ID;
  const clientSecret = process.env.CWS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    die(
      'CWS_CLIENT_ID and CWS_CLIENT_SECRET must be set in the environment.',
      'See the one-time Cloud Console setup in the header of this file.',
    );
  }

  if (has('verify-only')) {
    const existing = process.env.CWS_REFRESH_TOKEN;
    if (!existing) die('--verify-only needs CWS_REFRESH_TOKEN in the environment.');
    await verify(clientId, clientSecret, existing);
    console.log(`\n[cws-auth] OK — the existing refresh token works and can read ${EXTENSION_ID}.`);
    return;
  }

  const redirect = arg('redirect') || REDIRECT;
  let code = arg('code');

  if (!code) {
    const url =
      `${AUTH_URL}?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirect)}` +
      `&response_type=code&scope=${encodeURIComponent(SCOPE)}` +
      // offline + consent are what actually produce a refresh token. Without
      // them Google returns an access token only and CI has nothing durable.
      `&access_type=offline&prompt=consent`;
    console.log('\n[cws-auth] Open this URL and approve with the account that owns the SkillBridge listing:\n');
    console.log(`  ${url}\n`);
    console.log(`  Waiting for the redirect to ${redirect} (5 min timeout)…`);
    try {
      execFileSync('open', [url], { stdio: 'ignore' });
    } catch {
      /* headless or non-macOS — the printed URL is the fallback */
    }
    code = await captureCode().catch((err) =>
      die(
        `consent flow failed: ${err.message}`,
        `If the browser reported redirect_uri_mismatch, add exactly ${redirect} to the OAuth client's Authorized redirect URIs.`,
      ),
    );
    console.log('  authorization code received');
  }

  const refreshToken = await exchangeAuthorizationCode(clientId, clientSecret, code, redirect);

  await verify(clientId, clientSecret, refreshToken);

  console.log(`\n[cws-auth] OK — minted and verified against listing ${EXTENSION_ID}.`);
  console.log(`  refresh token: ${has('print-token') ? refreshToken : mask(refreshToken)}`);

  if (has('save')) {
    console.log('\n[cws-auth] Writing repo secrets:');
    saveSecrets(clientId, clientSecret, refreshToken);
    console.log('\n  Next: npm run deploy:cws:draft   (uploads a draft; does not publish)');
  } else {
    console.log('\n  Re-run with --save to store it as a repo secret, or copy it manually.');
  }
}

if (require.main === module) main().catch((err) => die(err.stack || err.message));

module.exports = {
  EXTENSION_ID,
  ITEM_URL,
  TOKEN_URL,
  exchangeAuthorizationCode,
  main,
  mask,
  postForm,
  saveSecrets,
  verify,
};
