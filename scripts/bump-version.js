#!/usr/bin/env node
/**
 * Version Bump Script for SkillBridge
 *
 * Keeps manifest.json and package.json versions in sync.
 *
 * Usage:
 *   node scripts/bump-version.js patch   → 2.0.0 → 2.0.1
 *   node scripts/bump-version.js minor   → 2.0.0 → 2.1.0
 *   node scripts/bump-version.js major   → 2.0.0 → 3.0.0
 *
 * npm script:
 *   npm run version:bump -- minor
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');
const PACKAGE_PATH = path.join(ROOT, 'package.json');

const VALID_TYPES = ['patch', 'minor', 'major'];

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function bumpVersion(version, type) {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    console.error(`Invalid version format: "${version}". Expected semver (e.g., 2.0.0)`);
    process.exit(1);
  }

  let [major, minor, patch] = parts;

  switch (type) {
    case 'major':
      major++;
      minor = 0;
      patch = 0;
      break;
    case 'minor':
      minor++;
      patch = 0;
      break;
    case 'patch':
      patch++;
      break;
  }

  return `${major}.${minor}.${patch}`;
}

function main() {
  const type = process.argv[2];

  if (!type || !VALID_TYPES.includes(type)) {
    console.error(`Usage: node scripts/bump-version.js <${VALID_TYPES.join(' | ')}>`);
    console.error('');
    console.error('Examples:');
    console.error('  node scripts/bump-version.js patch   # 2.0.0 → 2.0.1');
    console.error('  node scripts/bump-version.js minor   # 2.0.0 → 2.1.0');
    console.error('  node scripts/bump-version.js major   # 2.0.0 → 3.0.0');
    process.exit(1);
  }

  // Read current version from manifest.json (source of truth)
  const manifest = readJSON(MANIFEST_PATH);
  const currentVersion = manifest.version;

  if (!currentVersion) {
    console.error('No "version" field found in manifest.json');
    process.exit(1);
  }

  const newVersion = bumpVersion(currentVersion, type);

  // Update manifest.json
  manifest.version = newVersion;
  writeJSON(MANIFEST_PATH, manifest);

  // Update package.json
  const pkg = readJSON(PACKAGE_PATH);
  pkg.version = newVersion;
  writeJSON(PACKAGE_PATH, pkg);

  console.log(`${currentVersion} → ${newVersion}`);
}

main();
