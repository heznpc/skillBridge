const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { assertNoRemoteHostedCode } = require('./check-rhc');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'bundled');

async function build() {
  // Clean
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  // Read manifest
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

  // Bundle content scripts into a single file
  const contentScripts = manifest.content_scripts[0].js;
  // Create a combined entry that loads all content scripts in order
  const cwsBuildGate =
    "Object.defineProperty(globalThis,'__SKILLBRIDGE_AI_GATEWAY_ENABLED__',{value:false,writable:false,configurable:false});";
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

  // Copy other web-accessible resources
  fs.mkdirSync(path.join(DIST, 'src/lib'), { recursive: true });
  fs.mkdirSync(path.join(DIST, 'src/shared'), { recursive: true });
  fs.mkdirSync(path.join(DIST, 'src/content/styles'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'src/content/styles/fab.css'), path.join(DIST, 'src/content/styles/fab.css'));
  fs.copyFileSync(
    path.join(ROOT, 'src/shared/runtime-constants.js'),
    path.join(DIST, 'src/shared/runtime-constants.js'),
  );
  if (fs.existsSync(path.join(ROOT, 'src/shared/constants.json'))) {
    fs.copyFileSync(path.join(ROOT, 'src/shared/constants.json'), path.join(DIST, 'src/shared/constants.json'));
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
    entry.resources = entry.resources.filter((r) => r !== 'src/lib/page-bridge.js' && r !== 'src/bridge/puter.js');
    entry.resources = [...new Set(entry.resources)];
  }
  fs.writeFileSync(path.join(DIST, 'manifest.json'), JSON.stringify(bundledManifest, null, 2));

  // Clean up temp entry
  fs.unlinkSync(contentEntryPath);
  fs.unlinkSync(cssEntryPath);

  assertNoRemoteHostedCode(DIST);

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

  console.log(`\nBundled extension ready at: ${DIST}`);
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

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
