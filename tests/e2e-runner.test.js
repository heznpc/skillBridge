/* global describe, test, expect, jest */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { batches, cleanupE2ETempState, main, run } = require('../scripts/run-e2e');

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
        runId: 'unit-run',
      }),
    ).toBe(0);

    expect(spawn).toHaveBeenCalledTimes(1 + batches.length);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1 + batches.length * 2);
    const buildDir = spawn.mock.calls[0][2].env.SB_EXTENSION_BUNDLE;
    expect(path.isAbsolute(buildDir)).toBe(true);
    expect(path.basename(buildDir)).toMatch(/^skillbridge-e2e-build-unit-run-/);
    expect(fs.existsSync(buildDir)).toBe(false);
    for (const call of spawn.mock.calls) {
      expect(call[2].env).toEqual({
        E2E_HEADED: '0',
        PWDEBUG: '0',
        E2E_WORKERS: '3',
        KEEP: 'yes',
        SB_E2E_RUN_ID: 'unit-run',
        SB_EXTENSION_BUNDLE: buildDir,
      });
    }
    expect(spawn.mock.calls[0][1]).toEqual(['run', 'build:bundle', '--', '--out-dir', buildDir]);
    for (const call of spawn.mock.calls.slice(1)) {
      expect(call[1]).toContain('--workers=3');
      expect(call[1]).toContainEqual(expect.stringMatching(/^test-results\/e2e-unit-run-batch-\d+$/));
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
        runId: 'headed-run',
      }),
    ).toBe(0);

    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn.mock.calls[1][1]).toEqual(
      expect.arrayContaining(['tests/e2e/first-user-flow.spec.js', 'tests/e2e/popup.spec.js']),
    );
    const buildDir = spawn.mock.calls[0][2].env.SB_EXTENSION_BUNDLE;
    expect(spawn.mock.calls[1][2].env).toEqual({
      E2E_HEADED: '1',
      PWDEBUG: '0',
      SB_E2E_RUN_ID: 'headed-run',
      SB_EXTENSION_BUNDLE: buildDir,
    });
  });
});

describe('E2E temp cleanup ownership', () => {
  test('removes only directories created by the current run', () => {
    const suffix = `${process.pid}-${Date.now()}`;
    const ownRun = `jest-own-${suffix}`;
    const otherRun = `jest-other-${suffix}`;
    const own = fs.mkdtempSync(path.join(os.tmpdir(), `skillbridge-e2e-${ownRun}-`));
    const other = fs.mkdtempSync(path.join(os.tmpdir(), `skillbridge-e2e-${otherRun}-`));

    try {
      cleanupE2ETempState(ownRun);
      expect(fs.existsSync(own)).toBe(false);
      expect(fs.existsSync(other)).toBe(true);
    } finally {
      fs.rmSync(own, { recursive: true, force: true });
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  test('rejects an unsafe or absent cleanup id', () => {
    expect(() => cleanupE2ETempState()).toThrow(/safe E2E run id/);
    expect(() => cleanupE2ETempState('../other-run')).toThrow(/safe E2E run id/);
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
