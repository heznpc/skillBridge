/**
 * Regression tests for scripts/check-dicts.js.
 *
 * nativeReview=recruiting means the dictionary is honest review debt, not a
 * completed native review. A stale recruiting dictionary should warn and
 * appear in the CI report, but it must not block unrelated PRs.
 */

/* global describe, test, expect */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'check-dicts.js');

function writeDict(dir, name, meta) {
  fs.writeFileSync(
    path.join(dir, `${name}.json`),
    JSON.stringify(
      {
        _meta: {
          lang: name,
          lastUpdated: '2026-01-01',
          ...meta,
        },
      },
      null,
      2,
    ),
  );
}

function runWithFixture(dir) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-dict-freshness-cwd-'));
  const r = spawnSync(process.execPath, [SCRIPT], {
    env: {
      ...process.env,
      CI: 'true',
      SB_DICT_FRESHNESS_DIR: dir,
    },
    cwd,
    encoding: 'utf8',
  });
  let report = '';
  const reportPath = path.join(cwd, 'dict-check-report.txt');
  if (fs.existsSync(reportPath)) report = fs.readFileSync(reportPath, 'utf8');
  return { code: r.status ?? 1, out: (r.stdout || '') + (r.stderr || ''), report };
}

describe('dictionary freshness native review policy', () => {
  test('stale recruiting dictionaries warn without failing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-dict-freshness-'));
    writeDict(dir, 'ko', { nativeReview: 'recruiting' });

    const res = runWithFixture(dir);
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/REVIEW_NEEDED|REVIEW/);
    expect(res.out).toMatch(/No review-complete dictionaries are stale/);
    expect(res.report).toMatch(/REVIEW_NEEDED/);
  });

  test('stale reviewed dictionaries fail the gate', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-dict-freshness-'));
    writeDict(dir, 'ko', { nativeReview: 'reviewed' });

    const res = runWithFixture(dir);
    expect(res.code).toBe(1);
    expect(res.out).toMatch(/STALE/);
    expect(res.out).toMatch(/review-complete dictionary/);
    expect(res.report).toMatch(/Blocking stale dictionaries/);
  });
});
