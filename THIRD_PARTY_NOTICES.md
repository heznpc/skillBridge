# Third-Party Notices

This file documents third-party code bundled with SkillBridge.

## `@heyputer/puter.js` 2.2.11

- **Description:** Puter.js SDK used by the optional cloud AI Tutor
- **Copyright:** 2024-present Puter Technologies Inc. All rights reserved.
- **Repository:** https://github.com/HeyPuter/puter/tree/main/src/puter-js
- **npm package:** https://www.npmjs.com/package/@heyputer/puter.js/v/2.2.11
- **npm integrity:** `sha512-uqxdc6QMEYdiZZH4u6J1WTtR3u6QVcZLz3BWpZvmTo5UFiK6Qw2lvRb2qqXssrNB1Ob8b+uifT/jmn85Nt+KzQ==`
- **License:** Apache License 2.0
- **Bundled source:** `src/bridge/puter.js` (upstream `dist/puter.cjs`)
- **Vendored source SHA-256:** `a2d4ef368d536d45db152ceeb175c8c7aeec30b2f19c00e05f57015d8e68e5a3`
- **License text:** `licenses/Apache-2.0.txt`

The vendored file body matches the npm 2.2.11 package's `dist/puter.cjs`; the
generated timestamp header differs. The npm package did not contain a `NOTICE`
file when checked on 2026-07-28.

### SkillBridge CWS modifications

The Chrome Web Store build modifies the bundled file on 2026-07-28. It:

1. disables unused remotely hosted `web-streams-polyfill` and Rust TLS socket
   imports; and
2. replaces a `Function("return this")` global-object fallback with
   `globalThis`; and
3. disables automatic Puter User/profile lookups that the Tutor's AI chat path
   does not need; and
4. disables eager Puter filesystem-socket and resource-access initialization
   that the Tutor's AI chat path does not use; and
5. disables the SDK's hidden automatic token reauthentication so SkillBridge's
   visible isolated frame can own stale-session recovery and user consent.

These changes make the packaged SDK comply with Chrome Manifest V3's ban on
remotely hosted executable code. The modified packaged file carries the same
notice in its header. No claim is made that these modifications are endorsed by
Puter Technologies Inc.

## `@heyputer/kv.js` 0.2.1

- **Description:** In-memory key-value library bundled into the upstream
  Puter.js distribution
- **Copyright:** 2023-present Puter Technologies Inc.
- **Repository:** https://github.com/HeyPuter/kv.js
- **npm package:** https://www.npmjs.com/package/@heyputer/kv.js/v/0.2.1
- **npm integrity:** `sha512-YhVtzz7ZA/HmuaDvzZZhhUyQWBvp3/TXeY4jULssTdLJwT+tEM4BTYHXttORX+V5auvrYinjj8dNFQnby5T82w==`
- **License:** MIT
- **License text:** `licenses/heyputer-kv.js-MIT.txt`
