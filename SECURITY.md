# Security Policy

## Reporting a vulnerability

**Do not open a public issue for suspected security vulnerabilities.**

SkillBridge uses GitHub's [Private Vulnerability Reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability).
File a private report from the repo's Security tab → "Report a
vulnerability" — this routes directly to the maintainer and keeps the
details out of public view until a fix lands.

If GitHub Private Vulnerability Reporting is unavailable for any reason
(corporate proxy, account lockout, etc.), open an issue titled "Security
disclosure request" with no details — the maintainer will respond with
an alternate intake channel within 72 hours.

## What's in scope

- **CWS translation pipeline** — anything that could leak lesson content or
  exam answers outside the browser beyond the documented Google Translate path
  ([README — Privacy & Security](README.md#privacy--security),
  [PRIVACY_POLICY.md](PRIVACY_POLICY.md)).
- **CWS package boundary** — remotely hosted executable code, origin or message
  spoofing, or any divergence between the sanitized bundled Puter/Tutor runtime
  and the scanned CWS ZIP.
- **Content-script injection** — XSS, CSP bypass, prototype pollution,
  or any path through translator output that reaches `innerHTML` without the
  matching safety gate. Plain generated text passes through
  `src/lib/gemini-block.js` `escapeHtml`; structure-preserving Google Translate
  HTML passes through the `src/lib/dom-safe.js` allowlist sanitizer and
  `src/content/gt-queue.js` structural-integrity check before reconciliation.
- **Exam-mode safety bypass** — anything that lets the extension
  translate proctored exam content or quiz answer choices in
  violation of the standing "will not do" list (see the README).
- **Developer-source supply chain** — tampering with the optional raw-source
  `src/bridge/puter.js` (hash-checked by `.github/workflows/maintenance.yml`), an npm
  devDependency, or a GitHub Action used in this repo.
- **Secret exposure** — any path where `CWS_*` / `AMO_*` credentials
  could leak from workflow logs or artifacts.

## What's out of scope

- Bugs in Anthropic Academy itself (report to Anthropic).
- Bugs in Google Translate or Puter's own service that do not cross a
  SkillBridge extension boundary — report those service bugs to the relevant
  vendor.
- Reports that concern only model output, without an extension
  security-boundary failure.
- Theoretical browser-engine bugs in Chrome / Firefox / Edge — report
  to the browser vendor.

## Response timeline

- **Acknowledge**: within 72 hours of a complete Private Vulnerability
  Report.
- **Initial triage** (confirm/reject + severity): within 7 days.
- **Patch + release** for confirmed criticals: within 14 days. Lower
  severity findings are scheduled into the normal release cadence and
  noted in the published advisory.
- **Public disclosure**: coordinated with the reporter via the GHSA. The
  default embargo lasts until a fixed release is publicly available. A manual
  developer-mode build is not treated as store publication; while the Chrome
  Web Store listing is paused, disclosure timing is agreed case by case.

## Hall of fame

Researchers credited in published advisories on this repo (via the
GHSA), listed publicly only with the researcher's explicit consent.

## Verifying releases

- Source: `git tag` of the form `vX.Y.Z` on `main`, signed by the
  GitHub-issued release token (`release.yml`).
- Chrome Web Store zip: SLSA build provenance attestation is generated
  for each CWS upload (`actions/attest-build-provenance` step in
  `cd.yml`). Verify via
  [`gh attestation verify`](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds).
- Chrome Web Store ZIP: the build pins the Tutor gateway on and runs the
  packaged Puter client in Chrome's ISOLATED content-script world on the exact
  trusted course host, connected through validated extension ports. The SDK
  object and extension-port payloads are isolated from the course page's main
  JavaScript world. The visible Tutor UI remains part of the shared page DOM,
  however, so host scripts may observe keyboard events and rendered chat text.
  Puter's HTTPS sign-in protocol returns its result to the opener through a
  window message, which the host page may be able to observe during sign-in;
  SkillBridge therefore makes no stronger claim that the token is never visible
  in transit. It persists the token only in extension storage. Packaging disables unused remote TLS-socket imports, the
  `Function`-constructor fallback, automatic User/profile lookups, and unused
  eager filesystem-socket/resource-access startup, host-page storage/cache
  initialization, plus hidden automatic token reauthentication so SkillBridge
  owns stale-session recovery, and must
  pass the automated RHC scan before upload. The ZIP also carries the third-party
  licenses and modification notice.
- Vendored source: the raw `src/bridge/puter.js` hash is recorded in
  `THIRD_PARTY_NOTICES.md` and checked by the maintenance workflow. The CWS
  artifact contains a build-time-sanitized copy, not this raw file byte-for-byte.
