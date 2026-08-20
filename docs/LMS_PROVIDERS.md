# LMS provider architecture

SkillBridge resolves the current page through `src/lib/lms-provider.js` before
starting translation or learning tools. Skilljar is the first LMS provider.
Claude tutorial pages use a small compatibility provider because they are an
existing supported, non-LMS surface with different content roots.

## Contract

A provider has an `id` and exactly three required methods:

- `matches(context)` decides whether the provider owns the page.
- `probeRestricted(context)` performs the early restricted-page check.
- `getPageContext(context)` describes the current page for translation and
  learning tools.

The page context contains only variation points used by current supported
surfaces: page kind, content-root selector, translation target additions and
exclusions, quiz safeguards, page metadata, lesson identity, and UI anchors.
Do not add optional capabilities for a hypothetical LMS. Add a capability only
when a real supported surface demonstrates the variation.

`lessonIdentity.key` excludes query strings and fragments so navigation and
tracking parameters do not split one lesson into multiple identities. Tools
that migrate existing URL-keyed data must retain backward-compatible reads;
the provider seam itself does not rewrite stored user data.

## Safety and SPA ownership

Restricted certification detection is not a page kind. The provider probe runs
before the AI-content gate, translator, storage initialization, and UI
injection. Core also retains `CERT_DISABLE_PATTERNS` as a non-bypassable safety
floor, so a provider cannot weaken the existing certification safeguard.

Core owns `popstate`, `hashchange`, and History API wrapping. On a route change
it re-resolves provider context before continuing the existing lifecycle. A
provider must not install its own navigation listeners.

## Adding a provider

1. Confirm the real supported surface and its minimum host permission.
2. Implement the three required methods and register the provider.
3. Keep provider-specific selectors and route predicates in that provider.
4. Add a fixture proving page detection, stable lesson identity, translation
   targets, and restricted/quiz behavior as applicable.
5. Run the repository-standard validation and both extension builds.

Registering a provider does not grant a new host permission. Any permission
change requires a separate privacy/security review and an explicit rationale.
