/**
 * Self-test for scripts/check-permission-docs.js.
 *
 * The gate exists because six claims about a removed `api.github.com` capability
 * survived in the privacy policy, the published privacy page, and the store
 * listing. Without coverage of the checker itself, a parser regression turns it
 * into a green light that verifies nothing — which is exactly what happened
 * during development: an end-pattern that matched its own start heading
 * produced an empty section, reported as "every permission is undisclosed".
 * Case 5 below pins that failure mode.
 */

/* global describe, test, expect */

const { findPermissionDocMismatches, manifestTokens } = require('../scripts/check-permission-docs');

const MANIFEST = {
  permissions: ['storage', 'alarms'],
  host_permissions: ['https://*.skilljar.com/*', 'https://translate.googleapis.com/*'],
  optional_host_permissions: ['http://localhost/*', 'http://127.0.0.1/*'],
  content_scripts: [
    { matches: ['https://*.skilljar.com/*', 'https://claude.com/resources/tutorials/*'] },
    { matches: ['https://anthropic.skilljar.com/*'] },
  ],
};

const ROWS = [
  ['`storage`', 'Save preferences in `chrome.storage.local`'],
  ['`alarms`', 'Run periodic translation-cache cleanup'],
  ['`*.skilljar.com`', 'Translate supported course pages'],
  ['`claude.com/resources/tutorials` (content-script match)', 'Translate Claude tutorial pages'],
  ['`translate.googleapis.com`', 'Send page text to Google Translate'],
  ['`http://localhost/*`, `http://127.0.0.1/*` (**optional**)', 'Reach a local AI server'],
];

const privacyMd = (rows = ROWS, extraProse = '') => `# Privacy

## Currently Published Chrome Web Store Version: v1.0.1 (Legacy)

### Permissions Declared by v1.0.1
| Permission or site access | v1.0.1 scope |
|---|---|
| \`activeTab\` | Legacy access |
| \`*.youtube.com\` | Legacy YouTube access |

## Next Chrome Web Store Candidate (Unpublished)

### Unpublished Source-Build Permissions
| Permission or site access | Purpose |
|---|---|
${rows.map(([a, b]) => `| ${a} | ${b} |`).join('\n')}

### Retention
${extraProse}

## Raw Source and Developer Builds
`;

const privacyHtml = (rows = ROWS) => `<h1>Privacy</h1>
  <h2>Next Chrome Web Store Candidate (Unpublished)</h2>
  <h3>Unpublished Source-Build Permissions</h3>
  <table>
    <tr><th>Permission or site access</th><th>Purpose</th></tr>
${rows.map(([a, b]) => `    <tr><td>${a.replace(/`([^`]+)`/g, '<code>$1</code>')}</td><td>${b}</td></tr>`).join('\n')}
  </table>
  <h2>Raw Source</h2>
`;

const storeListing = (extra = '') => `# Store Listing

## Description
Body copy.${extra}

## Permission Justifications

### storage
Stores preferences.

### alarms
Schedules cache cleanup.

### Host permission: *.skilljar.com
Runs on course pages.

### Content-script match: claude.com/resources/tutorials
Runs on Claude tutorials.

### Host permission: translate.googleapis.com
Sends text to Google Translate.

### Optional host permission: http://localhost/*, http://127.0.0.1/*
Reaches a local server.

## Category
Education
`;

const inputs = (over = {}) => ({
  manifest: MANIFEST,
  privacyMd: privacyMd(),
  privacyHtml: privacyHtml(),
  storeListing: storeListing(),
  ...over,
});

describe('manifestTokens', () => {
  test('collapses host patterns and keeps only uncovered content-script matches', () => {
    expect([...manifestTokens(MANIFEST)].sort()).toEqual([
      '*.skilljar.com',
      '127.0.0.1',
      'alarms',
      'claude.com/resources/tutorials',
      'localhost',
      'storage',
      'translate.googleapis.com',
    ]);
  });

  test('a content-script match already covered by a host permission needs no separate entry', () => {
    // `https://anthropic.skilljar.com/*` falls under `*.skilljar.com`, so it
    // must not demand its own justification field.
    expect(manifestTokens(MANIFEST).has('anthropic.skilljar.com')).toBe(false);
  });
});

describe('check-permission-docs', () => {
  test('a consistent manifest and document set reports nothing', () => {
    expect(findPermissionDocMismatches(inputs())).toEqual([]);
  });

  test('a granted host that no document discloses is reported per surface', () => {
    const manifest = { ...MANIFEST, host_permissions: [...MANIFEST.host_permissions, 'https://api.example.com/*'] };
    const problems = findPermissionDocMismatches(inputs({ manifest }));
    expect(problems).toHaveLength(3);
    for (const problem of problems) expect(problem).toContain('api.example.com');
    expect(problems.join('\n')).toContain('no entry discloses it');
  });

  test('a document claiming a permission the manifest does not request is reported', () => {
    const rows = [...ROWS, ['`bookmarks`', 'Read the user bookmark tree']];
    const problems = findPermissionDocMismatches(inputs({ privacyMd: privacyMd(rows) }));
    expect(problems).toEqual([
      'PRIVACY_POLICY.md "Unpublished Source-Build Permissions": discloses `bookmarks`, which the manifest does not request',
    ]);
  });

  test('a dropped row is caught even though the other two surfaces still agree', () => {
    // Exact cell match, not a hostname substring search. A `.includes()` on a
    // host reads as the broken-URL-check antipattern (CodeQL
    // js/incomplete-url-substring-sanitization) even in a fixture filter, and a
    // test is a poor place to teach that shape.
    const DROPPED_CELL = '`translate.googleapis.com`';
    const rows = ROWS.filter(([cell]) => cell !== DROPPED_CELL);
    const problems = findPermissionDocMismatches(inputs({ privacyHtml: privacyHtml(rows) }));
    expect(problems).toEqual([
      'docs/privacy.html "Unpublished Source-Build Permissions": manifest declares `translate.googleapis.com` but no entry discloses it',
    ]);
  });

  // The regression this gate was written for. The permission tables were all
  // correct; the stale claim lived in prose and in a third-party services table,
  // where set equality never looks.
  test('a retired endpoint resurfacing in prose is caught with the permission tables intact', () => {
    const problems = findPermissionDocMismatches(
      inputs({ privacyMd: privacyMd(ROWS, 'We poll api.github.com weekly for new releases.') }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('PRIVACY_POLICY.md');
    expect(problems[0]).toContain('api\\.github\\.com');
    expect(problems[0]).toContain('removed in v4.0.0');
  });

  // Found the hard way: the gate passed on its first real run while the Limited
  // Use certification still covered "translation, local study, Tutor, and
  // update-check features". No hostname appears in that sentence, so patterns
  // naming only endpoints read it as clean. A retired capability has to be
  // catchable by the words used to describe it.
  test('a retired capability described without naming its endpoint is caught', () => {
    const problems = findPermissionDocMismatches(
      inputs({
        privacyMd: privacyMd(ROWS, 'Data supports our translation, study, and update-check features.'),
      }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('PRIVACY_POLICY.md');
    expect(problems[0]).toContain('Chrome updates installed extensions itself');
  });

  test('a retired third-party service name in the store listing is caught', () => {
    // Verbatim the bullet that shipped in the listing, so it trips both the
    // endpoint pattern and the capability pattern. One stale sentence matching
    // several retired entries is expected, not double-counting.
    const problems = findPermissionDocMismatches(
      inputs({ storeListing: storeListing('\n\n• GitHub Releases API — a periodic public update check.') }),
    );
    expect(problems).toHaveLength(2);
    for (const problem of problems) expect(problem).toContain('STORE_LISTING.md');
    expect(problems.join('\n')).toContain('GitHub Releases');
    expect(problems.join('\n')).toContain('Chrome updates installed extensions itself');
  });

  test('a retired host reappearing in the manifest itself is caught', () => {
    const manifest = { ...MANIFEST, host_permissions: [...MANIFEST.host_permissions, 'https://api.github.com/*'] };
    const problems = findPermissionDocMismatches(inputs({ manifest })).join('\n');
    expect(problems).toContain('manifest.json');
    expect(problems).toContain('api\\.github\\.com');
  });

  test('a section the parser cannot find fails instead of passing vacuously', () => {
    const problems = findPermissionDocMismatches(inputs({ privacyMd: '# Privacy\n\nNo candidate section here.\n' }));
    expect(problems).toEqual([
      'PRIVACY_POLICY.md "Unpublished Source-Build Permissions": section not found — the gate cannot verify what it cannot locate',
    ]);
  });

  test('the legacy v1.0.1 permission table is excluded from the comparison', () => {
    // `activeTab` and `*.youtube.com` appear in the fixture's legacy section and
    // are absent from the manifest. That record must survive while publication
    // is paused, so it must not read as an over-disclosure.
    const problems = findPermissionDocMismatches(inputs()).join('\n');
    expect(problems).not.toContain('activeTab');
    expect(problems).not.toContain('youtube');
  });

  test('an API name in a purpose cell is not mistaken for a permission', () => {
    // The storage row's purpose mentions `chrome.storage.local`.
    expect(findPermissionDocMismatches(inputs())).toEqual([]);
  });
});
