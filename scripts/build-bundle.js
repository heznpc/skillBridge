const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { assertNoRemoteHostedCode } = require('./check-rhc');
const { assertSafeBuildOutput } = require('./lib/safe-build-output');

const ROOT = path.resolve(__dirname, '..');
const outputArgIndex = process.argv.indexOf('--out-dir');
if (outputArgIndex !== -1 && !process.argv[outputArgIndex + 1]) {
  throw new Error('--out-dir requires a directory path');
}
const DIST =
  outputArgIndex === -1 ? path.join(ROOT, 'dist', 'bundled') : path.resolve(process.argv[outputArgIndex + 1]);

async function build() {
  assertSafeBuildOutput(DIST, { repoRoot: ROOT });

  // Clean
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  // Read manifest
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

  // Bundle content scripts into a single file
  const contentScripts = manifest.content_scripts[0].js;
  // Create a combined entry that loads all content scripts in order
  // v4: the AI tutor (bundled Puter bridge) ships in the CWS build. The gate
  // stays as the single chokepoint but is flipped ON; per-host `bridge`
  // capability + host_permissions still scope where the bridge actually runs.
  const cwsBuildGate =
    "Object.defineProperty(globalThis,'__SKILLBRIDGE_AI_GATEWAY_ENABLED__',{value:true,writable:false,configurable:false});";
  const contentEntry = [
    cwsBuildGate,
    ...contentScripts.map((f) => `// --- ${f} ---\n` + fs.readFileSync(path.join(ROOT, f), 'utf8')),
  ].join('\n\n');

  const contentEntryPath = path.join(DIST, '_content-entry.js');
  fs.writeFileSync(contentEntryPath, contentEntry);

  // `pure: ['console.debug', 'console.info']` lets minify drop those calls
  // entirely from the production bundle (their return values are unused, so
  // marking them pure tree-shakes the call-sites). `console.warn`/`error` are
  // preserved on purpose so real degradation/errors still reach DevTools.
  const PROD_PURE = ['console.debug', 'console.info'];

  await esbuild.build({
    entryPoints: [contentEntryPath],
    outfile: path.join(DIST, 'content.bundle.js'),
    bundle: false, // Already concatenated, just minify
    minify: true,
    target: ['chrome120'],
    format: 'iife',
    pure: PROD_PURE,
  });

  // Bundle background service worker
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'src/background/background.js')],
    outfile: path.join(DIST, 'background.bundle.js'),
    bundle: false,
    minify: true,
    target: ['chrome120'],
    format: 'iife',
    pure: PROD_PURE,
  });

  // Bundle CSS
  const contentCssFiles = manifest.content_scripts[0].css || [];
  const cssEntryPath = path.join(DIST, '_content-entry.css');
  const cssEntry = contentCssFiles
    .map((f) => `/* --- ${f} --- */\n` + fs.readFileSync(path.join(ROOT, f), 'utf8'))
    .join('\n\n');
  fs.writeFileSync(cssEntryPath, cssEntry);

  await esbuild.build({
    entryPoints: [cssEntryPath],
    outfile: path.join(DIST, 'content.bundle.css'),
    minify: true,
  });

  // Copy only extension runtime assets. README/store screenshots are repo
  // marketing artifacts, not package resources, and should not ship in the
  // CWS upload bundle.
  copyDir(path.join(ROOT, 'assets', 'icons'), path.join(DIST, 'assets', 'icons'));
  copyDir(path.join(ROOT, '_locales'), path.join(DIST, '_locales'));
  copyDir(path.join(ROOT, 'src/data'), path.join(DIST, 'src/data'));
  fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(DIST, 'LICENSE'));
  fs.copyFileSync(path.join(ROOT, 'THIRD_PARTY_NOTICES.md'), path.join(DIST, 'THIRD_PARTY_NOTICES.md'));
  copyDir(path.join(ROOT, 'licenses'), path.join(DIST, 'licenses'));

  // Copy other web-accessible resources
  fs.mkdirSync(path.join(DIST, 'src/lib'), { recursive: true });
  fs.mkdirSync(path.join(DIST, 'src/shared'), { recursive: true });
  fs.mkdirSync(path.join(DIST, 'src/bridge'), { recursive: true });
  fs.mkdirSync(path.join(DIST, 'src/content/styles'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'src/content/styles/fab.css'), path.join(DIST, 'src/content/styles/fab.css'));
  // AI Tutor broker (v4): Puter runs as a declarative ISOLATED-world content
  // script on the one trusted course host. The host main world receives
  // neither the SDK object nor Tutor prompts/chunks, and the SDK's synchronous
  // storage calls are redirected to the private facade installed by init.
  for (const name of ['puter-content-init.js', 'puter-content-broker.js']) {
    fs.copyFileSync(path.join(ROOT, 'src/bridge', name), path.join(DIST, 'src/bridge', name));
  }
  writeCwsSafePuter(path.join(ROOT, 'src/bridge/puter.js'), path.join(DIST, 'src/bridge/puter.js'));
  fs.copyFileSync(
    path.join(ROOT, 'src/shared/runtime-constants.js'),
    path.join(DIST, 'src/shared/runtime-constants.js'),
  );
  if (fs.existsSync(path.join(ROOT, 'src/shared/constants.json'))) {
    fs.copyFileSync(path.join(ROOT, 'src/shared/constants.json'), path.join(DIST, 'src/shared/constants.json'));
  }
  // Everything else the manifest declares web-accessible, driven by the
  // manifest rather than by another hand-maintained list.
  //
  // The hand-maintained list is how the lesson-identity table shipped absent:
  // it was added to `web_accessible_resources`, the runtime fetched it, the
  // fetch 404'd, and the failure path was a warning plus a graceful fallback
  // to URL identity — so the bundled build silently lost cross-platform
  // continuity and every test that ran against `src/` still passed. Declaring
  // a resource and then not shipping it is now a build failure.
  const declaredResources = (manifest.web_accessible_resources || []).flatMap((entry) => entry.resources || []);
  for (const resource of new Set(declaredResources)) {
    // Globs and the generated bundle outputs are handled by the copies above.
    if (resource.includes('*') || !resource.startsWith('src/')) continue;
    const from = path.join(ROOT, resource);
    const to = path.join(DIST, resource);
    if (fs.existsSync(to)) continue;
    if (!fs.existsSync(from)) {
      throw new Error(
        `manifest declares web-accessible resource "${resource}" but it does not exist — ` +
          'a resource the runtime can fetch must be in the artifact, or the fetch 404s at runtime',
      );
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  // Copy the popup and every local asset it references. Keeping this driven by
  // action.default_popup prevents a new classic-script dependency from being
  // added to the HTML without also landing in the CWS artifact.
  copyHtmlEntrypoint(manifest.action?.default_popup);
  fs.writeFileSync(path.join(DIST, 'src', 'shared', 'build-config.js'), `${cwsBuildGate}\n`);

  // Create bundled manifest
  const bundledManifest = JSON.parse(JSON.stringify(manifest));
  bundledManifest.content_scripts[0].js = ['content.bundle.js'];
  bundledManifest.content_scripts[0].css = ['content.bundle.css'];
  bundledManifest.background.service_worker = 'background.bundle.js';
  // The shadow UI fetches the manifest CSS via web_accessible_resources to
  // adopt it into the shadow root. In the bundle the content CSS partials are
  // replaced by content.bundle.css; the FAB keeps its own shadow-only CSS file.
  for (const entry of bundledManifest.web_accessible_resources || []) {
    entry.resources = entry.resources.flatMap((r) =>
      r === 'src/content/styles/*.css' ? ['content.bundle.css', 'src/content/styles/fab.css'] : [r],
    );
    entry.resources = [...new Set(entry.resources)];
  }
  fs.writeFileSync(path.join(DIST, 'manifest.json'), JSON.stringify(bundledManifest, null, 2));

  // Clean up temp entry
  fs.unlinkSync(contentEntryPath);
  fs.unlinkSync(cssEntryPath);

  // Report sizes
  const origSize = contentScripts.reduce((sum, f) => {
    try {
      return sum + fs.statSync(path.join(ROOT, f)).size;
    } catch {
      return sum;
    }
  }, 0);
  const bundleSize = fs.statSync(path.join(DIST, 'content.bundle.js')).size;
  console.log(
    `Content scripts: ${(origSize / 1024).toFixed(1)} KB → ${(bundleSize / 1024).toFixed(1)} KB (${Math.round((1 - bundleSize / origSize) * 100)}% reduction)`,
  );

  const bgOrigSize = fs.statSync(path.join(ROOT, 'src/background/background.js')).size;
  const bgBundleSize = fs.statSync(path.join(DIST, 'background.bundle.js')).size;
  console.log(`Background: ${(bgOrigSize / 1024).toFixed(1)} KB → ${(bgBundleSize / 1024).toFixed(1)} KB`);

  // Last gate before the artifact is considered ready.
  assertNoRemoteHostedCode(DIST);
  console.log('Remote-hosted-code check: clean');

  console.log(`\nBundled extension ready at: ${DIST}`);
}

// The bundled Puter SDK reaches for THREE remotely-hosted modules — an
// unpkg-hosted web-streams polyfill, and `rustls.js` + `rustls.wasm` from
// puter-net.b-cdn.net — inside one place: the TLS-socket class's "open"
// handler (`puter.net` sockets). SkillBridge only ever calls `puter.ai.chat`,
// so that class is dead code here, but shipping the URLs makes the CWS
// artifact contain remotely-hosted code, which Chrome's MV3 policy forbids
// regardless of whether the path executes.
//
// Neutralize it in the shipped artifact: the dynamic imports become a throw,
// so no remote fetch is reachable and no CDN URL survives in the package. If
// a future SDK build changes this expression the pattern stops matching and
// the build FAILS rather than silently shipping remote-code URLs again.
const PUTER_REMOTE_IMPORT_EXPR =
  'en||(globalThis.ReadableByteStreamController||await import("https://unpkg.com/web-streams-polyfill@3.0.2/dist/polyfill.js"),' +
  'en=await import("https://puter-net.b-cdn.net/rustls.js"),' +
  'await en.default("https://puter-net.b-cdn.net/rustls.wasm"))';
const PUTER_REMOTE_IMPORT_REPLACEMENT =
  'en||(()=>{throw new Error("SkillBridge: Puter TLS sockets are not bundled")})()';
const PUTER_GLOBAL_FUNCTION_FALLBACK =
  'const ve="undefined"!=typeof self?self:"undefined"!=typeof window?window:Function("return this")();';
const PUTER_GLOBAL_FUNCTION_REPLACEMENT =
  'const ve="undefined"!=typeof self?self:"undefined"!=typeof window?window:globalThis;';
const PUTER_GLOBAL_STORAGE_REF = 'globalThis.localStorage';
const PUTER_GLOBAL_STORAGE_REF_COUNT = 4;
const PUTER_HOST_QUERY_PARAMS = 'new URLSearchParams(globalThis.location?.search)';
const PUTER_HOST_INDEXEDDB_INIT =
  'constructor(){this._cache=new n({dbName:"puter_cache"}),this._opscache=new n,this.modules_=[];';
const PUTER_PRIVATE_CACHE_INIT =
  'constructor(){this._cache={flushall:()=>{}},this._opscache=this._cache,this.modules_=[];';
// Removing this line is what makes the SDK loadable at all, not just tidier.
//
// A content script's ISOLATED world has NO custom-element registry —
// `customElements` is null there while `HTMLElement` is still a function — and
// the SDK guards this registration on the prototype only, so the guard passes
// and the call throws. Everything after it in the SDK's init IIFE is then
// lost, including its auth-state wiring, and the Tutor answers "Sorry, an
// error occurred" with nothing on the wire.
//
// The consequence is worth stating because it costs debugging time otherwise:
// loading the repo as an UNPACKED extension gives you the raw SDK with this
// line intact, so the Cloud Tutor cannot work there. Only the bundled artifact
// is a working Tutor build. Reproduce Tutor behaviour against `dist/bundled`,
// and read a failure in an unpacked load as this, not as a product defect.
const PUTER_CUSTOM_ELEMENT_REGISTRATION =
  'cn.__proto__===globalThis.HTMLElement&&customElements.define("puter-dialog",cn);';
const PUTER_PREFIX_LOGGER_PROFILE_LOOKUP =
  '(async()=>{try{const e=await this.auth.whoami(),n=`[${e?.app_name??this.appInstanceID??"HOST"}]`;t=t.fields({prefix:n}),this.logger=t}catch(e){this.debugMode&&console.error("Failed to initialize prefix logger",e)}})(),';
const PUTER_AUTO_USER_PROFILE_LOOKUP = ',this.getUser().then(e=>{this.whoami=e})';
const PUTER_INSTANCE_AUTH_PROFILE_CALLBACK =
  ',puter.onAuth&&"function"==typeof puter.onAuth&&puter.getUser().then(e=>{puter.onAuth(e)})';
const PUTER_SINGLETON_AUTH_PROFILE_CALLBACK =
  ',xn.onAuth&&"function"==typeof xn.onAuth&&xn.getUser().then(e=>{xn.onAuth(e)})';
const PUTER_FS_CONSTRUCTOR_SOCKET_INIT = 'this.cacheUpdateTimer=null,this.initializeSocket();const t={}';
const PUTER_FS_SET_TOKEN_SOCKET_INIT =
  'setAuthToken(e){this.authToken=e,"gui"===this.puter.env&&(this.checkCacheAndPurge(),this.startCacheUpdateTimer()),this.initializeSocket()}';
const PUTER_FS_SET_ORIGIN_SOCKET_INIT = 'setAPIOrigin(e){this.APIOrigin=e,this.initializeSocket()}';
const PUTER_SINGLETON_SET_TOKEN_RAO =
  ',this.updateSubmodules(),this.request_rao_(),this.getUser().then(e=>{this.whoami=e})';
const PUTER_INTERNAL_TOKEN_REAUTH =
  'if("token_auth_failed"===h?.code&&"web"===puter.env)try{puter.resetAuthToken(),await puter.ui.authenticateWithPuter()}catch(e){return n({error:{code:"auth_canceled",message:"Authentication canceled"}})}';
const PUTER_MODIFICATION_NOTICE = `/*
 * SkillBridge CWS modification notice (2026-07-29): Heznpc changed this
 * @heyputer/puter.js 2.2.11 distribution by disabling unused remotely hosted
 * TLS-socket imports, replacing its Function-constructor global fallback, and
 * disabling automatic user-profile, RAO, and filesystem-socket initialization
 * that AI chat does not need, plus hidden internal token reauthentication so
 * SkillBridge's visible Tutor recovery owns that user interaction. All SDK
 * localStorage references are scoped to SkillBridge's in-memory facade and
 * the unused host IndexedDB cache is disabled; the broker alone persists the
 * minimum session fields in extension storage. Host-page Puter bootstrap
 * query parameters are ignored. The unused SDK dialog custom element is also
 * disabled because ISOLATED content scripts have no registry.
 * See THIRD_PARTY_NOTICES.md and licenses/Apache-2.0.txt.
 */\n`;

function writeCwsSafePuter(srcPath, destPath) {
  const src = fs.readFileSync(srcPath, 'utf8');
  if (!src.includes(PUTER_REMOTE_IMPORT_EXPR)) {
    throw new Error(
      'Puter SDK remote-import pattern not found — the vendored SDK changed. ' +
        'Re-derive PUTER_REMOTE_IMPORT_EXPR in scripts/build-bundle.js before shipping, ' +
        'or the artifact may ship remotely-hosted code.',
    );
  }
  if (!src.includes(PUTER_GLOBAL_FUNCTION_FALLBACK)) {
    throw new Error(
      'Puter SDK Function-constructor fallback not found — the vendored SDK changed. ' +
        'Re-audit its global-scope fallback before shipping.',
    );
  }
  if (src.split(PUTER_GLOBAL_STORAGE_REF).length - 1 !== PUTER_GLOBAL_STORAGE_REF_COUNT) {
    throw new Error(
      'Puter SDK global localStorage pattern changed — refusing to ship an SDK that may touch host storage.',
    );
  }
  if (src.split(PUTER_HOST_QUERY_PARAMS).length - 1 !== 1) {
    throw new Error(
      'Puter SDK host-query bootstrap pattern changed — refusing to ship an SDK that may redirect auth traffic.',
    );
  }
  if (src.split(PUTER_HOST_INDEXEDDB_INIT).length - 1 !== 1) {
    throw new Error(
      'Puter SDK host IndexedDB initialization pattern changed — refusing to ship an SDK that may touch host storage.',
    );
  }
  if (src.split(PUTER_CUSTOM_ELEMENT_REGISTRATION).length - 1 !== 1) {
    throw new Error(
      'Puter SDK dialog registration pattern changed — refusing to ship an unreviewed isolated-world UI path.',
    );
  }
  if (src.split(PUTER_PREFIX_LOGGER_PROFILE_LOOKUP).length - 1 !== 1) {
    throw new Error('Puter SDK prefix-logger /whoami pattern changed — refusing to ship an unreviewed profile lookup.');
  }
  if (src.split(PUTER_AUTO_USER_PROFILE_LOOKUP).length - 1 !== 1) {
    throw new Error(
      'Puter SDK automatic getUser profile pattern changed — refusing to ship an unreviewed profile lookup.',
    );
  }
  for (const pattern of [PUTER_INSTANCE_AUTH_PROFILE_CALLBACK, PUTER_SINGLETON_AUTH_PROFILE_CALLBACK]) {
    if (src.split(pattern).length - 1 !== 1) {
      throw new Error(
        'Puter SDK auth profile callback pattern changed — refusing to ship an unreviewed profile lookup.',
      );
    }
  }
  for (const pattern of [
    PUTER_FS_CONSTRUCTOR_SOCKET_INIT,
    PUTER_FS_SET_TOKEN_SOCKET_INIT,
    PUTER_FS_SET_ORIGIN_SOCKET_INIT,
    PUTER_SINGLETON_SET_TOKEN_RAO,
    PUTER_INTERNAL_TOKEN_REAUTH,
  ]) {
    if (src.split(pattern).length - 1 !== 1) {
      throw new Error(
        'Puter SDK automatic network-init pattern changed — refusing to ship an unreviewed startup request.',
      );
    }
  }
  const sanitized = src
    .split(PUTER_REMOTE_IMPORT_EXPR)
    .join(PUTER_REMOTE_IMPORT_REPLACEMENT)
    .split(PUTER_GLOBAL_FUNCTION_FALLBACK)
    .join(PUTER_GLOBAL_FUNCTION_REPLACEMENT)
    .split(PUTER_GLOBAL_STORAGE_REF)
    .join('globalThis.__SKILLBRIDGE_PUTER_STORAGE__')
    .split(PUTER_HOST_QUERY_PARAMS)
    .join('new URLSearchParams()')
    .split(PUTER_HOST_INDEXEDDB_INIT)
    .join(PUTER_PRIVATE_CACHE_INIT)
    .split(PUTER_CUSTOM_ELEMENT_REGISTRATION)
    .join('void 0;')
    .split(PUTER_FS_CONSTRUCTOR_SOCKET_INIT)
    .join('this.cacheUpdateTimer=null;const t={}')
    .split(PUTER_FS_SET_TOKEN_SOCKET_INIT)
    .join(
      'setAuthToken(e){this.authToken=e,"gui"===this.puter.env&&(this.checkCacheAndPurge(),this.startCacheUpdateTimer())}',
    )
    .split(PUTER_FS_SET_ORIGIN_SOCKET_INIT)
    .join('setAPIOrigin(e){this.APIOrigin=e}')
    .split(PUTER_SINGLETON_SET_TOKEN_RAO)
    .join(',this.updateSubmodules(),this.getUser().then(e=>{this.whoami=e})')
    .split(PUTER_INTERNAL_TOKEN_REAUTH)
    .join('')
    .split(PUTER_PREFIX_LOGGER_PROFILE_LOOKUP)
    .join('')
    .split(PUTER_AUTO_USER_PROFILE_LOOKUP)
    .join(',this.whoami=null')
    .split(PUTER_INSTANCE_AUTH_PROFILE_CALLBACK)
    .join('')
    .split(PUTER_SINGLETON_AUTH_PROFILE_CALLBACK)
    .join('');
  if (
    [
      PUTER_PREFIX_LOGGER_PROFILE_LOOKUP,
      PUTER_AUTO_USER_PROFILE_LOOKUP,
      PUTER_INSTANCE_AUTH_PROFILE_CALLBACK,
      PUTER_SINGLETON_AUTH_PROFILE_CALLBACK,
      PUTER_FS_CONSTRUCTOR_SOCKET_INIT,
      PUTER_FS_SET_TOKEN_SOCKET_INIT,
      PUTER_FS_SET_ORIGIN_SOCKET_INIT,
      PUTER_SINGLETON_SET_TOKEN_RAO,
      PUTER_INTERNAL_TOKEN_REAUTH,
      PUTER_HOST_QUERY_PARAMS,
    ].some((pattern) => sanitized.includes(pattern))
  ) {
    throw new Error('Puter SDK automatic profile lookup survived sanitization.');
  }
  const privateStorageWrapper =
    '((localStorage)=>{\n' +
    '"use strict";\n' +
    'if(!localStorage)throw new Error("SkillBridge: private Puter storage unavailable");\n' +
    sanitized +
    '\n})(globalThis.__SKILLBRIDGE_PUTER_STORAGE__);\n';
  fs.writeFileSync(destPath, `${PUTER_MODIFICATION_NOTICE}${privateStorageWrapper}`);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyRelativeFile(relativePath) {
  const src = path.resolve(ROOT, relativePath);
  const dest = path.resolve(DIST, relativePath);
  const rootPrefix = `${ROOT}${path.sep}`;
  const distPrefix = `${DIST}${path.sep}`;
  if (!src.startsWith(rootPrefix) || !dest.startsWith(distPrefix)) {
    throw new Error(`Refusing to copy path outside extension roots: ${relativePath}`);
  }
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
    throw new Error(`Missing extension runtime asset: ${relativePath}`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function localHtmlReferences(html) {
  const refs = [];
  const tagPattern = /<(?:script|link|img)\b[^>]*?\b(?:src|href)=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(tagPattern)) {
    const ref = match[1].split(/[?#]/, 1)[0];
    if (!ref || /^(?:[a-z]+:|\/\/|#)/i.test(ref)) continue;
    refs.push(ref);
  }
  return refs;
}

function copyHtmlEntrypoint(relativeHtmlPath) {
  if (!relativeHtmlPath) throw new Error('manifest.action.default_popup is required');
  copyRelativeFile(relativeHtmlPath);
  const html = fs.readFileSync(path.join(ROOT, relativeHtmlPath), 'utf8');
  const htmlDir = path.posix.dirname(relativeHtmlPath.replaceAll(path.sep, '/'));
  for (const ref of localHtmlReferences(html)) {
    copyRelativeFile(path.posix.normalize(path.posix.join(htmlDir, ref)));
  }
}

if (require.main === module) {
  build().catch((err) => {
    console.error('Build failed:', err);
    process.exit(1);
  });
}

module.exports = { writeCwsSafePuter };
