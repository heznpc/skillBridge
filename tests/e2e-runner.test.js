/* global describe, test, expect, jest */

const { batches, main, run } = require('../scripts/run-e2e');

function successfulSpawn() {
  return { status: 0 };
}

describe('E2E runner browser isolation', () => {
  test('sanitizes the environment for the build and every browser batch', () => {
    const spawn = jest.fn(successfulSpawn);
    const cleanup = jest.fn();
    const verify = jest.fn();

    expect(
      main({
        argv: [],
        baseEnv: {
          E2E_HEADED: '1',
          PWDEBUG: '1',
          PWTEST_INSPECTOR: '1',
          E2E_WORKERS: '3',
          KEEP: 'yes',
        },
        spawn,
        cleanup,
        verify,
        logger: { log: jest.fn() },
      }),
    ).toBe(0);

    expect(spawn).toHaveBeenCalledTimes(1 + batches.length);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1 + batches.length * 2);
    for (const call of spawn.mock.calls) {
      expect(call[2].env).toEqual({
        E2E_HEADED: '0',
        PWDEBUG: '0',
        E2E_WORKERS: '3',
        KEEP: 'yes',
      });
    }
    for (const call of spawn.mock.calls.slice(1)) {
      expect(call[1]).toContain('--workers=3');
    }
  });

  test('opens only the focused first-user batch when headed mode is explicit', () => {
    const spawn = jest.fn(successfulSpawn);

    expect(
      main({
        argv: ['--first-user', '--headed'],
        baseEnv: { E2E_HEADED: '0', PWDEBUG: '1' },
        spawn,
        cleanup: jest.fn(),
        verify: jest.fn(),
        logger: { log: jest.fn() },
      }),
    ).toBe(0);

    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn.mock.calls[1][1]).toEqual(
      expect.arrayContaining(['tests/e2e/first-user-flow.spec.js', 'tests/e2e/popup.spec.js']),
    );
    expect(spawn.mock.calls[1][2].env).toEqual({ E2E_HEADED: '1', PWDEBUG: '0' });
  });
});

describe('E2E command failures', () => {
  test('reports spawn errors, signals, and nonzero exit codes', () => {
    expect(() => run('browser', [], { spawn: () => ({ error: new Error('launch failed') }) })).toThrow(/launch failed/);
    expect(() => run('browser', [], { spawn: () => ({ signal: 'SIGTERM' }) })).toThrow(/SIGTERM/);
    try {
      run('browser', ['test'], { spawn: () => ({ status: 7 }) });
      throw new Error('expected run to fail');
    } catch (err) {
      expect(err.message).toMatch(/status=7/);
      expect(err.exitCode).toBe(7);
    }
  });
});
