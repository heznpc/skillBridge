# SkillBridge Discoverability Audit — 2026-07-24

This snapshot separates human-interest signals, search visibility, and automated
traffic. Search positions were observed from Korea on 2026-07-24 and may vary by
location, personalization, and index refresh timing.

## Executive read

SkillBridge is discoverable when the query includes its purpose, but the bare
name is dominated by the U.S. Department of Defense SkillBridge program and
unrelated products. Public reception is positive but too thin to describe the
project as broadly validated.

- The public CWS listing shows roughly 1,000 users and 5.0/5.0 from four ratings.
- GitHub has seven stars; four arrived from 2026-07-07 through 2026-07-23.
- GitHub recorded 41 views from 26 unique visitors during the latest available
  14-day window; Google delivered nine views from eight unique visitors.
- Public user feedback remains scarce: no external-human issue and only two
  merged external-human pull requests.
- Clone traffic is not a demand metric here. Scheduled Actions runs strongly
  correlate with clone counts because the workflows check out the repository.

## Search visibility

| Query | Observed result |
|---|---|
| `skillbridge` | Project absent from the first Google/Bing/DDG result page |
| `"SkillBridge AI Course Translator"` | Google: GitHub #1; Bing: Pages #1, GitHub #2 |
| `"SkillBridge" Chrome extension` | Google: CWS #1, GitHub #2; Bing/DDG: GitHub and Pages lead |
| `Anthropic Academy translator extension` | Google: CWS #1, GitHub #2; Bing/DDG: GitHub and Pages #1–2 |
| `AI course translator Chrome extension` | Bing: Pages #4; Google/DDG outside the first page |
| GitHub `skillbridge chrome extension` | heznpc/skillBridge is the only and first repository result |

The exact product descriptor works; the bare brand does not. Public copy should
therefore lead with **SkillBridge — AI Course Translator** and repeat the
supported-course / Chrome-extension intent in natural language.

## Public evaluation

- [Chrome Web Store](https://chromewebstore.google.com/detail/skillbridge-for-anthropic/oancfldkbnajdadgekkjpdnhepjjcdln):
  about 1,000 users, 5.0/5.0 from four ratings, still serving legacy v1.0.1.
- [External QA PR #25](https://github.com/heznpc/skillBridge/pull/25):
  an external contributor verified the extension on the live site and fixed a
  console-cleanliness issue.
- [Korean terminology PR #36](https://github.com/heznpc/skillBridge/pull/36):
  a Korean speaker replaced an overly literal translation with natural usage.
- [Italian LinkedIn article](https://it.linkedin.com/pulse/lintelligenza-artificiale-ora-offre-anche-i-compiti-casa-masiero-ahexf):
  describes the extension as less polished than official localization but
  functional.
- [Anthropic Academy guide](https://pasqualepillitteri.it/en/news/371/anthropic-academy-free-courses-claude):
  recommends it as a straightforward option for non-technical and business
  learners. Localized copies of the same article are one source, not multiple
  independent reviews.

No separate user review was found on Reddit, Hacker News, DEV, Medium, Product
Hunt, X, or YouTube under the exact product name. Automated extension-directory
mirrors are indexing signals, not independent evaluations.

## Search-surface defects found

1. The live Pages `<title>` and description expose documentation-generator HTML
   comments in Bing/DDG snippets. The source now uses marker-free generated SEO
   fields.
2. Pages, README, repository metadata, and the public CWS listing described
   different versions and AI-runtime boundaries. The repository description,
   homepage, and topics were corrected on 2026-07-24; the CWS listing and
   launch-timed copy still need to move together when the candidate is published.
3. Bing/DDG often rank Extwise or Extpose ahead of the official CWS page. The
   project cannot control those mirrors, so canonical Pages and CWS links should
   be prominent in the README and launch posts.
4. `skillBridge`/`skillbridge` URL casing is mixed. The Pages source now declares
   `https://heznpc.github.io/skillBridge/` as canonical.

## Promotion decisions

- Put the current proof image in the README first screen; 80.5% of measured
  repository views land on the overview page.
- Use “release candidate” until the CWS listing visibly reports v3.5.42.
- Safe proof statement: “The public CWS listing shows about 1,000 users and four
  5-star ratings.” Do not generalize four ratings into broad satisfaction.
- Never promote raw clone totals as adoption; automation explains much of them.
- Use `SkillBridge AI Course Translator`, `Chrome extension`, and `supported AI
  courses` in titles and descriptions. Do not compete on bare `skillbridge`.

## Data limits

GitHub Traffic API retains only 14 days, provides at most ten referrers/paths,
and exposes no search impressions, query terms, rank, user agents, or visitor
identities. Search positions above are observations, not a durable ranking
guarantee.
