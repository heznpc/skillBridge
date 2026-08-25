/**
 * Unit tests for the bundled Chrome Web Store artifact builder.
 *
 * The CWS upload path should contain only extension runtime resources. Repo
 * marketing screenshots live under assets/screenshots for README/store copy,
 * but they do not belong in dist/bundled or the upload zip.
 */

/* global describe, test, expect, beforeAll */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist', 'bundled');

function localHtmlReferences(html) {
  return Array.from(html.matchAll(/<(?:script|link|img)\b[^>]*?\b(?:src|href)=["']([^"']+)["'][^>]*>/gi))
    .map((match) => match[1].split(/[?#]/, 1)[0])
    .filter((ref) => ref && !/^(?:[a-z]+:|\/\/|#)/i.test(ref));
}

beforeAll(() => {
  execSync('node scripts/build-bundle.js', { cwd: ROOT, encoding: 'utf8' });
});

describe('bundled artifact shape', () => {
  test('keeps the generic ZIP command on the CWS-safe bundle path', () => {
    const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts;
    expect(scripts['build:zip']).toBe('npm run build:bundle:zip');
    expect(scripts['build:bundle:zip']).toContain('rm -f store-assets/skillbridge.zip');
    expect(scripts['build:developer:zip']).toContain('skillbridge-developer.zip');
    expect(scripts['build:developer:zip']).toContain('LICENSE THIRD_PARTY_NOTICES.md');
    expect(scripts['build:developer:zip']).toContain('licenses/');
  });

  test('creates a bundled manifest with bundled content and background paths', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIST_DIR, 'manifest.json'), 'utf8'));
    expect(manifest.content_scripts[0].js).toEqual(['content.bundle.js']);
    expect(manifest.content_scripts[0].css).toEqual(['content.bundle.css']);
    // Exact hosts, never a wildcard. The Tutor broker is the extension's only
    // outbound AI transport, and the background's port checks admit exactly
    // these origins — a pattern here that outgrew that list would mean a page
    // running the broker on a host the service worker will not talk to.
    expect(manifest.content_scripts[1]).toEqual(
      expect.objectContaining({
        matches: ['https://anthropic.skilljar.com/*', 'https://academy.claude.com/*'],
        world: 'ISOLATED',
        js: ['src/bridge/puter-content-init.js', 'src/bridge/puter.js', 'src/bridge/puter-content-broker.js'],
      }),
    );
    expect(manifest.background.service_worker).toBe('background.bundle.js');
    expect(manifest.host_permissions).not.toContain('https://*.youtube.com/*');
  });

  // The lesson-identity table shipped absent exactly once: it was declared
  // web-accessible, the runtime fetched it, the fetch 404'd, and the failure
  // path was a warning plus a graceful fallback — so the bundled build lost
  // cross-platform continuity silently while every test against src/ passed.
  // A declared resource that is not in the artifact is now a build failure;
  // this is the test that says so.
  test('every declared web-accessible resource is actually in the artifact', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIST_DIR, 'manifest.json'), 'utf8'));
    const missing = [];
    for (const entry of manifest.web_accessible_resources || []) {
      for (const resource of entry.resources || []) {
        if (resource.includes('*')) continue;
        if (!fs.existsSync(path.join(DIST_DIR, resource))) missing.push(resource);
      }
    }
    expect(missing).toEqual([]);
  });

  test('the lesson-identity table ships, and is the one the runtime expects', () => {
    const table = JSON.parse(fs.readFileSync(path.join(DIST_DIR, 'src/shared/canonical-lessons.json'), 'utf8'));
    expect(Object.keys(table.lessons || {}).length).toBeGreaterThan(100);
    expect(table).toEqual(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/shared/canonical-lessons.json'), 'utf8')));
  });

  test('keeps shadow CSS resources fetchable in the bundled manifest', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIST_DIR, 'manifest.json'), 'utf8'));
    for (const entry of manifest.web_accessible_resources) {
      if (!entry.resources.some((r) => r.includes('content'))) continue;
      expect(entry.resources).toContain('content.bundle.css');
      expect(entry.resources).toContain('src/content/styles/fab.css');
      expect(entry.resources).not.toContain('src/content/styles/*.css');
    }
    expect(fs.existsSync(path.join(DIST_DIR, 'src', 'content', 'styles', 'fab.css'))).toBe(true);
  });

  test('copies runtime constants used by bundled popup and background', () => {
    expect(fs.existsSync(path.join(DIST_DIR, 'src', 'shared', 'runtime-constants.js'))).toBe(true);
  });

  test('copies every local dependency referenced by the popup in load order', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIST_DIR, 'manifest.json'), 'utf8'));
    const popupPath = manifest.action.default_popup;
    const popupFile = path.join(DIST_DIR, popupPath);
    const popupHtml = fs.readFileSync(popupFile, 'utf8');
    const refs = localHtmlReferences(popupHtml);

    expect(refs).toEqual([
      '../lib/browser-polyfill.js',
      '../shared/build-config.js',
      '../shared/runtime-constants.js',
      '../lib/selectors.js',
      '../lib/constants.js',
      'popup.js',
    ]);
    for (const ref of refs) {
      expect(fs.existsSync(path.resolve(path.dirname(popupFile), ref))).toBe(true);
    }
  });

  test('copies extension icons but excludes repo marketing screenshots', () => {
    expect(fs.existsSync(path.join(DIST_DIR, 'assets', 'icons', 'icon128.png'))).toBe(true);
    expect(fs.existsSync(path.join(DIST_DIR, 'assets', 'screenshots'))).toBe(false);
  });

  test('ships all license and notice files for the bundled Puter dependencies', () => {
    expect(fs.existsSync(path.join(DIST_DIR, 'LICENSE'))).toBe(true);
    expect(fs.existsSync(path.join(DIST_DIR, 'THIRD_PARTY_NOTICES.md'))).toBe(true);
    expect(fs.existsSync(path.join(DIST_DIR, 'licenses', 'Apache-2.0.txt'))).toBe(true);
    expect(fs.existsSync(path.join(DIST_DIR, 'licenses', 'heyputer-kv.js-MIT.txt'))).toBe(true);

    const notices = fs.readFileSync(path.join(DIST_DIR, 'THIRD_PARTY_NOTICES.md'), 'utf8');
    expect(notices).toContain('@heyputer/puter.js` 2.2.11');
    expect(notices).toContain('Apache License 2.0');
    expect(notices).toContain('@heyputer/kv.js` 0.2.1');
  });

  test('ships the isolated-world Puter broker without a web-accessible bridge', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIST_DIR, 'manifest.json'), 'utf8'));
    const resources = manifest.web_accessible_resources.flatMap((entry) => entry.resources);
    expect(resources).not.toContain('src/bridge/puter-frame.html');
    expect(resources).not.toContain('src/lib/page-bridge.js');
    expect(resources).not.toContain('src/bridge/puter.js');
    expect(fs.existsSync(path.join(DIST_DIR, 'src', 'lib', 'page-bridge.js'))).toBe(false);
    expect(fs.existsSync(path.join(DIST_DIR, 'src', 'bridge', 'puter-frame.html'))).toBe(false);
    expect(fs.existsSync(path.join(DIST_DIR, 'src', 'bridge', 'puter-frame-init.js'))).toBe(false);
    expect(fs.existsSync(path.join(DIST_DIR, 'src', 'bridge', 'puter-frame.js'))).toBe(false);
    expect(fs.existsSync(path.join(DIST_DIR, 'src', 'bridge', 'puter-content-init.js'))).toBe(true);
    expect(fs.existsSync(path.join(DIST_DIR, 'src', 'bridge', 'puter-content-broker.js'))).toBe(true);
    expect(fs.existsSync(path.join(DIST_DIR, 'src', 'bridge', 'puter.js'))).toBe(true);
    const sdk = fs.readFileSync(path.join(DIST_DIR, 'src', 'bridge', 'puter.js'), 'utf8');
    expect(sdk).toContain('SkillBridge CWS modification notice (2026-07-29)');
    expect(sdk).toContain('globalThis.__SKILLBRIDGE_PUTER_STORAGE__');
    expect(sdk).not.toContain('globalThis.localStorage');
    expect(sdk).not.toContain('new URLSearchParams(globalThis.location?.search)');
    expect(sdk).toContain('new URLSearchParams()');
    expect(sdk).not.toContain('dbName:"puter_cache"');
    expect(sdk).not.toContain('customElements.define("puter-dialog",cn)');
    expect(sdk).not.toContain('(async()=>{try{const e=await this.auth.whoami()');
    expect(sdk).not.toContain(',this.getUser().then(e=>{this.whoami=e})');
    expect(sdk).not.toContain('puter.getUser().then(e=>{puter.onAuth(e)})');
    expect(sdk).not.toContain('xn.getUser().then(e=>{xn.onAuth(e)})');
    expect(sdk).not.toContain('this.cacheUpdateTimer=null,this.initializeSocket();const t={}');
    expect(sdk).not.toContain(
      'setAuthToken(e){this.authToken=e,"gui"===this.puter.env&&(this.checkCacheAndPurge(),this.startCacheUpdateTimer()),this.initializeSocket()}',
    );
    expect(sdk).not.toContain('setAPIOrigin(e){this.APIOrigin=e,this.initializeSocket()}');
    expect(sdk).not.toContain(',this.updateSubmodules(),this.request_rao_(),this.getUser().then(e=>{this.whoami=e})');
    expect(sdk).not.toContain(
      'if("token_auth_failed"===h?.code&&"web"===puter.env)try{puter.resetAuthToken(),await puter.ui.authenticateWithPuter()}',
    );
    // Keep the APIs themselves: Tutor auth/chat still need token/origin state;
    // only their eager FS/RAO side effects are removed.
    expect(sdk).toContain('setAuthToken(e){this.authToken=e');
    expect(sdk).toContain('setAPIOrigin(e){this.APIOrigin=e}');
    expect(sdk).toContain('async request_rao_(){');
    const init = fs.readFileSync(path.join(DIST_DIR, 'src', 'bridge', 'puter-content-init.js'), 'utf8');
    expect(init).toContain("'https://puter.com'");
    expect(init).toContain('event?.isTrusted !== true || event.origin !== PUTER_ORIGIN');
    expect(init).toContain('nativeAdd.call(this, type, wrapped, options)');
    expect(fs.readFileSync(path.join(DIST_DIR, 'content.bundle.js'), 'utf8')).toContain(
      '__SKILLBRIDGE_AI_GATEWAY_ENABLED__',
    );
    const content = fs.readFileSync(path.join(DIST_DIR, 'content.bundle.js'), 'utf8');
    expect(content).toContain('sb-cloud-chat-client');
    expect(content).not.toContain('CHAT_STREAM_CHUNK');
    expect(content).not.toContain('CHAT_STREAM_END');
    expect(content).not.toContain('systemPrompt');
    expect(fs.readFileSync(path.join(DIST_DIR, 'src', 'shared', 'build-config.js'), 'utf8')).toContain('value:true');
  });

  // `src/shared/build-config.js` is now the first entry in
  // content_scripts[].js (so the AI gateway flag is an explicit boolean in the
  // raw build too, letting the readers use `=== true` instead of failing open).
  // That means the bundled content script defines the flag TWICE: once from the
  // gate the builder prepends, once from the concatenated build-config.js.
  // build-config.js guards on `typeof === 'boolean'`; drop that guard and the
  // second Object.defineProperty throws on a non-configurable property — at the
  // very top of content.bundle.js, killing the extension on every page. No
  // other test would catch it, so execute the sequence here.
  test('the prepended gate and the concatenated build-config do not collide', () => {
    const gate =
      "Object.defineProperty(globalThis,'__SKILLBRIDGE_AI_GATEWAY_ENABLED__',{value:true,writable:false,configurable:false});";
    const buildConfig = fs.readFileSync(path.join(ROOT, 'src', 'shared', 'build-config.js'), 'utf8');
    const root = {};
    expect(() => new Function('globalThis', `${gate}\n${buildConfig}`)(root)).not.toThrow();
    expect(root.__SKILLBRIDGE_AI_GATEWAY_ENABLED__).toBe(true);
  });

  test('build-config runs before the modules that read the gateway flag', () => {
    const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).content_scripts[0].js;
    const configIndex = scripts.indexOf('src/shared/build-config.js');
    expect(configIndex).toBeGreaterThanOrEqual(0);
    // platform.js bakes the flag into a frozen _CAPS_FULL at evaluation time.
    expect(configIndex).toBeLessThan(scripts.indexOf('src/lib/platform.js'));
    expect(configIndex).toBeLessThan(scripts.indexOf('src/content/content.js'));
  });

  test('cloud broker messages never carry Puter tokens or account profiles', () => {
    const broker = fs.readFileSync(path.join(DIST_DIR, 'src', 'bridge', 'puter-content-broker.js'), 'utf8');
    const background = fs.readFileSync(path.join(DIST_DIR, 'background.bundle.js'), 'utf8');
    for (const forbidden of ['username:', 'uuid:', 'profile:', 'authToken:']) {
      expect(broker).not.toContain(forbidden);
      expect(background).not.toContain(forbidden);
    }
  });

  test('does not copy repo-only development surfaces', () => {
    for (const name of ['tests', 'scripts', 'coverage', 'test-results', 'package.json', 'package-lock.json']) {
      expect(fs.existsSync(path.join(DIST_DIR, name))).toBe(false);
    }
  });
});
