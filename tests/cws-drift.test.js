/**
 * Behavioral tests for the public Chrome Web Store drift check.
 */

/* global describe, test, expect, jest */

const { EventEmitter } = require('events');
const { extractLastUpdated, extractPublishedVersion, fetchListing, main } = require('../scripts/check-cws-drift');

function logger() {
  return { log: jest.fn(), warn: jest.fn() };
}

function fakeGet(responses) {
  return jest.fn((_url, _options, callback) => {
    const request = new EventEmitter();
    request.destroy = jest.fn((error) => request.emit('error', error));
    const responseSpec = responses.shift();

    Promise.resolve().then(() => {
      const response = new EventEmitter();
      response.statusCode = responseSpec.status;
      response.headers = responseSpec.headers || {};
      response.resume = jest.fn();
      response.setEncoding = jest.fn();
      callback(response);
      if (responseSpec.status === 200) {
        response.emit('data', responseSpec.body);
        response.emit('end');
      }
    });
    return request;
  });
}

describe('CWS listing parsing and redirects', () => {
  test('extracts primary and fallback version/date representations', () => {
    const primary = 'prefix,"4.2.0",[1788134400,0],suffix';
    expect(extractPublishedVersion(primary)).toBe('4.2.0');
    expect(extractLastUpdated(primary)).toBe('2026-08-31');

    expect(extractPublishedVersion('{"version":"4.1.9"}')).toBe('4.1.9');
    expect(extractPublishedVersion('<span>Version 4.1.8</span>')).toBe('4.1.8');
    expect(extractLastUpdated('<span>Updated August 31, 2026</span>')).toBe('August 31, 2026');
  });

  test('follows a relative redirect and returns the final listing body', async () => {
    const get = fakeGet([
      { status: 302, headers: { location: '/en-US/detail/extension-id' } },
      { status: 200, body: 'final listing' },
    ]);

    await expect(fetchListing('https://chromewebstore.google.com/detail/extension-id', 0, get)).resolves.toBe(
      'final listing',
    );
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[1][0]).toBe('https://chromewebstore.google.com/en-US/detail/extension-id');
  });
});

describe('CWS drift command behavior', () => {
  test('soft-fails a network error without marking the release failed', async () => {
    const output = logger();
    const code = await main({
      argv: ['node', 'check-cws-drift.js'],
      readVersion: () => '4.2.0',
      fetch: async () => {
        throw new Error('offline');
      },
      logger: output,
    });

    expect(code).toBe(0);
    expect(output.warn).toHaveBeenCalledWith(expect.stringContaining('CWS listing unreachable (offline)'));
  });

  test('soft-fails a parser miss and emits a structured JSON reason', async () => {
    const output = logger();
    const code = await main({
      argv: ['node', 'check-cws-drift.js', '--json'],
      readVersion: () => '4.2.0',
      fetch: async () => '<html>layout changed</html>',
      logger: output,
    });

    expect(code).toBe(0);
    expect(JSON.parse(output.log.mock.calls[0][0])).toEqual({
      status: 'soft-fail',
      reason: 'parser-miss',
      localVersion: '4.2.0',
    });
  });

  test('returns a failing status only when parsed listing data exceeds a threshold', async () => {
    const now = Date.parse('2026-09-01T00:00:00Z');
    const fresh = logger();
    const stale = logger();

    const okCode = await main({
      argv: ['node', 'check-cws-drift.js', '--json'],
      readVersion: () => '4.2.0',
      fetch: async () => 'x,"4.2.0",[1788134400,0],y',
      logger: fresh,
      now,
    });
    const driftCode = await main({
      argv: ['node', 'check-cws-drift.js', '--json', '--max-patch=5'],
      readVersion: () => '4.2.0',
      fetch: async () => 'x,"4.1.0",[1788134400,0],y',
      logger: stale,
      now,
    });

    expect(okCode).toBe(0);
    expect(JSON.parse(fresh.log.mock.calls[0][0])).toMatchObject({ status: 'ok', publishedAgeDays: 1 });
    expect(driftCode).toBe(1);
    expect(JSON.parse(stale.log.mock.calls[0][0])).toMatchObject({ status: 'drift', patchDriftScore: 100 });
  });
});
