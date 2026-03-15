# SkillBridge for Anthropic Academy — Product Roadmap

## Vision

SkillBridge for Anthropic Academy aims to make Anthropic's educational content accessible to learners worldwide, regardless of their native language. We believe that language should never be a barrier to learning AI fundamentals and advanced techniques from the Anthropic Academy.

---

## v2.0 (Current) ✅

Major release with certification support, cross-browser compatibility, security hardening, and accessibility overhaul:

- **Certification/Exam Page Support**: Full translation of assessment and certification pages with tutor safety guards (AI tutor refuses to answer exam questions directly)
- **Firefox + Edge Support**: Cross-browser compatibility — works natively on Firefox and Microsoft Edge in addition to all Chromium browsers
- **Security Hardening**: Passed 4 expert security audits; CSP compliance, input sanitization, secure message passing
- **WCAG 2.1 AA Accessibility**: Accessibility grade improved from D to A- — keyboard navigation, ARIA labels, focus management, screen reader support
- **content.js Modular Split**: Refactored monolithic content script from 885 lines to 405 lines with dedicated modules (header-controls, text-selection, sidebar-chat)
- **98 Tests**: Expanded test suite from 66 to 98 tests covering translation, protected terms, accessibility, and security
- **Maintenance Automation**: 5 scheduled CI/CD jobs for translation audits, dependency checks, and store deployment
- **Selector Abstraction Layer**: Decoupled DOM selectors from logic for resilience against Skilljar UI changes
- **Landing Page Redesign**: Modernized README and store listing with feature comparison tables and visual demos
- **Dark Mode (Beta)**: Full dark theme for the Academy site
- **Keyboard Shortcuts**: Intuitive keyboard navigation for the AI Tutor interface
- **Performance Optimization**: Smart DOM batching and caching for pages with 500+ translatable elements

### Previous: v1.x (Legacy)

The original release featured the core 3-tier translation architecture:

- 3-Tier Translation Engine: Static curated translations, cached translations, Google Translate with Gemini 2.0 Flash verification
- 6 Premium Languages with curated JSON dictionaries
- 27 Standard Languages via Google Translate
- AI Tutor powered by Claude Sonnet 4
- YouTube subtitle auto-translation
- Manifest V3 compliant architecture

---

## v2.1 (Next)

Focus on community engagement and remaining expansion:

- [ ] **Translation Memory & Community Contributions**: Allow users to submit verified translations back to the system, building a community-driven translation database
- [ ] **Glossary Consistency Checker**: Ensure technical AI terms are consistently translated across all materials
- [ ] **Community Translation Portal**: A dedicated web-based tool for collaborative dictionary creation
- [ ] **Additional Premium Languages**: Expand the premium tier based on community demand (Portuguese, Russian, Traditional Chinese, Vietnamese)
- [ ] **Export as PDF**: Allow learners to download translated course materials as polished PDF documents for offline study

**Estimated Timeline**: Q2-Q3 2026

---

## v3.0 (Vision — Long Term)

Become the global learning platform enablement layer:

- [ ] **Multi-LMS Platform Support**: Extend beyond Skilljar to other Learning Management Systems (Canvas, Moodle, Blackboard, etc.)
- [ ] **Real-Time Collaborative Translation Editing**: Multiple translators working simultaneously on the same content with conflict resolution
- [ ] **Translation Quality Analytics**: Automated scoring of translation quality, community review metrics, and contributor reputation system
- [ ] **Mobile Companion App**: Native iOS/Android app for offline study, allowing learners to continue on any device
- [ ] **Advanced ML Integration**: Leverage custom fine-tuned models for domain-specific terminology and cultural adaptation

**Vision Timeline**: 2027+

---

## How to Influence the Roadmap

Your feedback directly shapes SkillBridge's future! Here's how to get involved:

### File a Feature Request
Have an idea? Open a [feature request](https://github.com/heznpc/skillbridge/issues/new?template=feature_request.yml) and describe the problem and your proposed solution.

### Vote on Existing Issues
See an issue you care about? React with a 👍 to show support. High-engagement issues get prioritized.

### Request a Language
Need translations in your native language? File a [language request](https://github.com/heznpc/skillbridge/issues/new?template=language_request.yml) and let us know if you can contribute as a translator.

### Contribute to the Code
Interested in development? Check out our [Contributing Guide](CONTRIBUTING.md) and grab a ["good first issue"](https://github.com/heznpc/skillbridge/issues?q=label%3A%22good+first+issue%22).

### Join Discussions
Visit our [GitHub Discussions](https://github.com/heznpc/skillbridge/discussions) to chat with the community about upcoming features and translation priorities.

---

## Release Schedule

| Version | Status | ETA |
|---------|--------|-----|
| v2.0 | ✅ Released | Now |
| v2.1 | 🚧 In Progress | Q2-Q3 2026 |
| v3.0 | 🎯 Vision | 2027+ |

---

## Feedback & Questions?

Open an issue or start a discussion on GitHub. We read every comment and consider community input seriously when planning releases.

Thank you for helping us make learning accessible to the world! 🌍
