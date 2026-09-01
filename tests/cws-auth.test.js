/**
 * Behavioral tests for the Chrome Web Store OAuth helper.
 */

/* global describe, test, expect, jest */

const {
  EXTENSION_ID,
  ITEM_URL,
  TOKEN_URL,
  exchangeAuthorizationCode,
  mask,
  postForm,
  saveSecrets,
  verify,
} = require('../scripts/cws-auth');

function failingDie() {
  return jest.fn((message, hint) => {
    const error = new Error(message);
    error.hint = hint;
    throw error;
  });
}

describe('CWS credential masking and form transport', () => {
  test('fully masks short secrets and reveals only bounded edges of long ones', () => {
    expect(mask('')).toBe('');
    expect(mask('123456789012')).toBe('************');

    const secret = 'abcdef1234567';
    const masked = mask(secret);
    expect(masked).toBe('abcdef…4567 (13 chars)');
    expect(masked).not.toContain(secret);
  });

  test('posts URL-encoded form data and parses a JSON response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"access_token":"token"}',
    });

    await expect(postForm(TOKEN_URL, { code: 'a+b & c', client_secret: 's=ecret' }, fetchImpl)).resolves.toEqual({
      ok: true,
      status: 200,
      json: { access_token: 'token' },
      text: '{"access_token":"token"}',
    });
    const [, options] = fetchImpl.mock.calls[0];
    expect(options).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    expect(Object.fromEntries(new URLSearchParams(options.body))).toEqual({
      code: 'a+b & c',
      client_secret: 's=ecret',
    });
  });

  test('preserves a non-JSON response body for OAuth error reporting', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 502, text: async () => '<html>bad gateway</html>' });

    await expect(postForm(TOKEN_URL, { code: 'one-use-code' }, fetchImpl)).resolves.toEqual({
      ok: false,
      status: 502,
      json: null,
      text: '<html>bad gateway</html>',
    });
  });
});

describe('CWS OAuth code exchange', () => {
  test('returns the refresh token and sends the exact authorization-code form', async () => {
    const post = jest.fn().mockResolvedValue({ ok: true, status: 200, json: { refresh_token: 'refresh' }, text: '' });

    await expect(
      exchangeAuthorizationCode('client', 'secret', 'code', 'http://localhost:8976/', { post }),
    ).resolves.toBe('refresh');
    expect(post).toHaveBeenCalledWith(TOKEN_URL, {
      client_id: 'client',
      client_secret: 'secret',
      code: 'code',
      grant_type: 'authorization_code',
      redirect_uri: 'http://localhost:8976/',
    });
  });

  test('reports structured and raw OAuth errors without losing the response detail', async () => {
    const cases = [
      {
        response: {
          ok: false,
          status: 400,
          json: { error: 'invalid_grant', error_description: 'code expired' },
          text: '',
        },
        detail: 'invalid_grant — code expired',
      },
      {
        response: { ok: false, status: 502, json: null, text: 'gateway body' },
        detail: 'HTTP 502  — gateway body',
      },
    ];

    for (const { response, detail } of cases) {
      const fail = failingDie();
      await expect(
        exchangeAuthorizationCode('client', 'secret', 'code', 'redirect', {
          post: jest.fn().mockResolvedValue(response),
          fail,
        }),
      ).rejects.toThrow(detail);
      expect(fail.mock.calls[0][1]).toMatch(/single-use and short-lived/);
    }
  });

  test('turns a successful non-JSON or tokenless response into a clear missing-token error', async () => {
    for (const json of [null, {}]) {
      const fail = failingDie();
      await expect(
        exchangeAuthorizationCode('client', 'secret', 'code', 'redirect', {
          post: jest.fn().mockResolvedValue({ ok: true, status: 200, json, text: 'not a token' }),
          fail,
        }),
      ).rejects.toThrow('Google returned no refresh_token');
    }
  });
});

describe('CWS live token verification', () => {
  test('refreshes the token and reads the owned listing with the required headers', async () => {
    const post = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: { access_token: 'live-access-token' },
      text: '',
    });
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{"status":"OK"}' });

    await expect(verify('client', 'secret', 'refresh', { post, fetchImpl })).resolves.toEqual({
      accessToken: 'live-access-token',
      item: '{"status":"OK"}',
    });
    expect(post).toHaveBeenCalledWith(TOKEN_URL, {
      client_id: 'client',
      client_secret: 'secret',
      refresh_token: 'refresh',
      grant_type: 'refresh_token',
    });
    expect(fetchImpl).toHaveBeenCalledWith(ITEM_URL(EXTENSION_ID), {
      headers: { Authorization: 'Bearer live-access-token', 'x-goog-api-version': '2' },
    });
  });

  test('does not send a listing request when a successful refresh has no access token', async () => {
    const fail = failingDie();
    const fetchImpl = jest.fn();

    await expect(
      verify('client', 'secret', 'refresh', {
        post: jest.fn().mockResolvedValue({ ok: true, status: 200, json: null, text: 'bad JSON' }),
        fetchImpl,
        fail,
      }),
    ).rejects.toThrow('Google returned no access_token');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('distinguishes invalid refresh credentials from listing ownership failure', async () => {
    const invalidGrant = failingDie();
    await expect(
      verify('client', 'secret', 'refresh', {
        post: jest.fn().mockResolvedValue({
          ok: false,
          status: 400,
          json: { error: 'invalid_grant', error_description: 'revoked' },
          text: '',
        }),
        fetchImpl: jest.fn(),
        fail: invalidGrant,
      }),
    ).rejects.toThrow('token refresh failed');
    expect(invalidGrant.mock.calls[0][1]).toMatch(/expired, revoked/);

    const noOwnership = failingDie();
    await expect(
      verify('client', 'secret', 'refresh', {
        post: jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: { access_token: 'access' },
          text: '',
        }),
        fetchImpl: jest.fn().mockResolvedValue({ ok: false, status: 403, text: async () => 'forbidden' }),
        fail: noOwnership,
      }),
    ).rejects.toThrow('listing read failed: HTTP 403');
    expect(noOwnership.mock.calls[0][1]).toContain('cannot see item');
  });
});

describe('GitHub secret storage command boundary', () => {
  test('passes all secret values on stdin and never in gh command arguments', () => {
    const run = jest.fn();
    const logger = { log: jest.fn() };
    const values = ['client-id-value', 'client-secret-value', 'refresh-token-value'];

    saveSecrets(...values, run, logger);

    expect(run.mock.calls).toEqual([
      ['gh', ['secret', 'set', 'CWS_CLIENT_ID'], { input: values[0], stdio: ['pipe', 'inherit', 'inherit'] }],
      ['gh', ['secret', 'set', 'CWS_CLIENT_SECRET'], { input: values[1], stdio: ['pipe', 'inherit', 'inherit'] }],
      ['gh', ['secret', 'set', 'CWS_REFRESH_TOKEN'], { input: values[2], stdio: ['pipe', 'inherit', 'inherit'] }],
    ]);
    const commandArguments = run.mock.calls.flatMap(([command, args]) => [command, ...args]).join(' ');
    for (const value of values) expect(commandArguments).not.toContain(value);
  });
});
