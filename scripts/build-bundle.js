const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

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
  const contentEntry = contentScripts
    .map((f) => `// --- ${f} ---\n` + fs.readFileSync(path.join(ROOT, f), 'utf8'))
    .join('\n\n');

  const contentEntryPath = path.join(DIST, '_content-entry.js');
  fs.writeFileSync(contentEntryPath, contentEntry);

  await esbuild.build({
    entryPoints: [contentEntryPath],
    outfile: path.join(DIST, 'content.bundle.js'),
    bundle: false, // Already concatenated, just minify
    minify: true,
    target: ['chrome120'],
    format: 'iife',
  });

  // Bundle background service worker
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'src/background/background.js')],
    outfile: path.join(DIST, 'background.bundle.js'),
    bundle: false,
    minify: true,
    target: ['chrome120'],
    format: 'iife',
  });

  // Bundle CSS
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'src/content/content.css')],
    outfile: path.join(DIST, 'content.bundle.css'),
    minify: true,
  });

  // Copy static assets
  copyDir(path.join(ROOT, 'assets'), path.join(DIST, 'assets'));
  copyDir(path.join(ROOT, '_locales'), path.join(DIST, '_locales'));
  copyDir(path.join(ROOT, 'src/data'), path.join(DIST, 'src/data'));

  // Copy other web-accessible resources
  fs.mkdirSync(path.join(DIST, 'src/lib'), { recursive: true });
  fs.mkdirSync(path.join(DIST, 'src/bridge'), { recursive: true });
  fs.mkdirSync(path.join(DIST, 'src/shared'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'src/lib/page-bridge.js'), path.join(DIST, 'src/lib/page-bridge.js'));
  fs.copyFileSync(path.join(ROOT, 'src/bridge/puter.js'), path.join(DIST, 'src/bridge/puter.js'));
  if (fs.existsSync(path.join(ROOT, 'src/shared/constants.json'))) {
    fs.copyFileSync(path.join(ROOT, 'src/shared/constants.json'), path.join(DIST, 'src/shared/constants.json'));
  }
  // Copy popup
  fs.mkdirSync(path.join(DIST, 'src/popup'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'src/popup/popup.html'), path.join(DIST, 'src/popup/popup.html'));
  fs.copyFileSync(path.join(ROOT, 'src/popup/popup.js'), path.join(DIST, 'src/popup/popup.js'));

  // Create bundled manifest
  const bundledManifest = JSON.parse(JSON.stringify(manifest));
  bundledManifest.content_scripts[0].js = ['content.bundle.js'];
  bundledManifest.content_scripts[0].css = ['content.bundle.css'];
  bundledManifest.background.service_worker = 'background.bundle.js';
  fs.writeFileSync(path.join(DIST, 'manifest.json'), JSON.stringify(bundledManifest, null, 2));

  // Clean up temp entry
  fs.unlinkSync(contentEntryPath);

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

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
