const fs = require('fs');
const path = require('path');
const { createInstrumenter } = require('istanbul-lib-instrument');

const ROOT = path.join(__dirname, '..', '..');

/**
 * Read a shipped classic-script/IIFE and instrument it before a test executes
 * it with `new Function`. Jest cannot see code loaded through fs on its own,
 * so without this bridge real production execution is reported as 0% and a
 * coverage threshold cannot protect the runtime test from being removed.
 */
function readProductionSource(...parts) {
  const filename = path.join(ROOT, ...parts);
  const source = fs.readFileSync(filename, 'utf8');
  return createInstrumenter({ coverageVariable: '__coverage__' }).instrumentSync(source, filename);
}

module.exports = { readProductionSource };
