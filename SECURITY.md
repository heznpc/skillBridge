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
- **CWS package boundary** — any path that enables the optional AI gateway or
  packages `src/bridge/puter.js` / `src/lib/page-bridge.js` into the CWS ZIP.
- **Content-script injection** — XSS, CSP bypass, prototype pollution,
  or any path through translator output that lets remote content reach
  `innerHTML` without escaping (`src/lib/gemini-block.js` `escapeHtml`
  is the single chokepoint — bugs there are critical).
- **Exam-mode safety bypass** — anything that lets the extension
  translate proctored exam content or quiz answer choices in
  violation of the standing "things we will not do" list (see TODO.md).
- **Developer-source supply chain** — tampering with the optional raw-source
  `src/bridge/puter.js` (hash-checked by `.github/workflows/maintenance.yml`), an npm
  devDependency, or a GitHub Action used in this repo.
- **Secret exposure** — any path where `CWS_*` / `AMO_*` credentials
  could leak from workflow logs or artifacts.

## What's out of scope

- Bugs in Anthropic Academy itself (report to Anthropic).
- Bugs in Google Translate itself, or in Puter.js when testing the optional raw
  developer build — report those service bugs to the relevant vendor.
- Reports that concern only model output from the optional raw developer build,
  without an extension security-boundary failure.
- Theoretical browser-engine bugs in Chrome / Firefox / Edge — report
  to the browser vendor.

## Response timeline

- **Acknowledge**: within 72 hours of a complete Private Vulnerability
  Report.
- **Initial triage** (confirm/reject + severity): within 7 days.
- **Patch + release** for confirmed criticals: within 14 days. Lower
  severity findings are scheduled into the normal release cadence and
  noted in the published advisory.
- **Public disclosure**: coordinated with the reporter via the
  GHSA. Default embargo is until the fix is published in a release
  build that is live on at least one store (currently: the manual
  developer-mode install path, since the Chrome Web Store listing is
  pending re-publication after icon redesign — see `README.md`).

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
- Chrome Web Store ZIP: the build must pin the AI gateway off, omit
  `src/bridge/puter.js` and `src/lib/page-bridge.js`, and pass the automated RHC
  scan before upload.
- Raw developer source: the optional `src/bridge/puter.js` hash is recorded in
  `THIRD_PARTY_NOTICES.md` and checked by the maintenance workflow. This file is
  not part of the CWS artifact.
