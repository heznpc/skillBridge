'use strict';

/**
 * Build an isolated environment for a browser subprocess.
 *
 * Browser automation is quiet unless a caller explicitly opts into headed
 * mode. This also prevents a PWDEBUG value left in the parent shell from
 * silently opening the Playwright inspector and stealing focus.
 */
function createBrowserLaunchEnv(baseEnv = process.env, { headed = false, headedVariable = 'E2E_HEADED' } = {}) {
  const env = { ...baseEnv, [headedVariable]: headed ? '1' : '0', PWDEBUG: '0' };
  delete env.PWTEST_INSPECTOR;
  return env;
}

module.exports = { createBrowserLaunchEnv };
