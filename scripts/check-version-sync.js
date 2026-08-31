#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

const manifest = readJson('manifest.json');
const pkg = readJson('package.json');
const lock = readJson('package-lock.json');

const versions = new Map([
  ['manifest.json', manifest.version],
  ['package.json', pkg.version],
  ['package-lock.json', lock.version],
  ['package-lock.json packages[""]', lock.packages?.['']?.version],
]);
const unique = new Set(versions.values());

if (unique.size !== 1 || unique.has(undefined)) {
  console.error('Release version identity is out of sync:');
  for (const [surface, version] of versions) {
    console.error(`- ${surface}: ${JSON.stringify(version)}`);
  }
  process.exit(1);
}

console.log(`✓ release version identity is synchronized at ${manifest.version}`);
