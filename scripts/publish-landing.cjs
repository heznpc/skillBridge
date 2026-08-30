/* global require, __dirname */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'site', 'dist');
const destination = path.join(root, 'docs');
const generatedPaths = ['index.html', 'ko', '_astro', 'images', 'favicon.svg', '.nojekyll'];

if (!fs.existsSync(source)) {
  throw new Error('Astro build output is missing. Run astro build before publishing.');
}

for (const relativePath of generatedPaths) {
  fs.rmSync(path.join(destination, relativePath), { recursive: true, force: true });
}

fs.cpSync(source, destination, { recursive: true, force: true });
console.log(`Published Astro landing from ${path.relative(root, source)} to ${path.relative(root, destination)}.`);
