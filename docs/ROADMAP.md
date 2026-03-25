# SkillBridge for Anthropic Academy — Product Roadmap

## Vision

SkillBridge for Anthropic Academy aims to make Anthropic's educational content accessible to learners worldwide, regardless of their native language. We believe that language should never be a barrier to learning AI fundamentals and advanced techniques from the Anthropic Academy.

---

## v1.0.0 ✅

The initial release with comprehensive translation capabilities:

- **3-Tier Translation Engine**: Static curated translations → Cached translations → Google Translate with Gemini 2.0 Flash verification
- **6 Premium Languages**: Korean (ko), Japanese (ja), Chinese - Simplified (zh-CN), Spanish (es), French (fr), German (de) with meticulously curated JSON dictionaries for technical accuracy
- **27 Standard Languages**: All other languages powered by Google Translate for broad coverage
- **AI Tutor**: Powered by Claude Sonnet 4, providing personalized explanations and learning support in the user's selected language
- **Video Enhancements**:
  - YouTube subtitle auto-translation with synchronized playback
  - Video transcript panel with click-to-seek functionality for deep learning
- **Architecture**: Manifest V3 compliant, modern Chrome extension standards
- **Translation Memory & Community Contributions**: GitHub Issue templates, validation scripts, CI integration
- **Glossary Consistency Checker**: Cross-language consistency validation
- **Keyboard Shortcuts**: `Ctrl+Shift+S` (toggle sidebar), `Ctrl+Shift+L` (dark mode), `Ctrl+Shift+/` (help), `Escape` (close), `/` (focus chat)
- **Dark Mode Support**: Full dark theme for the entire Academy site
- **Performance Optimization**: Viewport-first translation with `IntersectionObserver`, `requestIdleCallback` chunking

---

## v2.0.0 ✅

Major release with exam support and cross-browser compatibility:

- [x] **Exam Mode**: Auto-detect quiz/assessment pages, skip answer choice translation, AI Tutor exam-safe mode with academic integrity warnings
- [x] **Cross-Browser Support**: Firefox and Edge via `npm run build:firefox`, browser polyfill for API compatibility
- [x] **Security Hardening**: DOM-based XSS sanitizer with attribute allowlist, FETCH_URL domain allowlist, nonce-based postMessage validation
- [x] **Accessibility**: WCAG 2.1 AA compliance — ARIA roles, keyboard navigation, focus management
- [x] **Maintenance Automation**: Chrome Alarms for cache cleanup (24h) and version check (7d)

**Status**: Shipped (March 2026)

---

## v2.1.0 (Current) ✅

Anthropic Academy platform updates (new courses, CCA-F certification) and robustness improvements:

- [x] **Certification Exam Kill-Switch**: Proctored exams (CCA-F etc.) fully disable the extension — no translation, no UI, no AI tutor — to prevent being flagged as a cheating tool
- [x] **Course Quiz / Certification Separation**: Course-completion quizzes retain exam mode (answer protection), while proctored certification exams get full disable
- [x] **New Course Support**: Added translations for "Introduction to Claude Cowork", "Introduction to subagents", "MCP Advanced Topics" across all 6 premium languages
- [x] **New Protected Terms**: Cowork, Dispatch, Computer Use, Subagent added to dictionaries and auto-correction
- [x] **SPA Navigation Handling**: `popstate`, `hashchange`, `pushState`/`replaceState` detection — translations re-apply on route change without reload
- [x] **Cache Cleanup**: Expired IndexedDB entries are now deleted on access (not just skipped)
- [x] **Test Coverage**: Added CERT_DISABLE_PATTERNS tests with certification vs course URL separation validation

**Status**: Shipped (March 2026)

---

## v2.2 (Planned)

Expansion of translation capabilities and multi-platform support:

- [ ] **Community Translation Portal**: A dedicated web-based tool allowing native speakers to collaboratively create and refine language dictionaries
- [ ] **Additional Premium Languages**: Expand the premium tier based on community demand (e.g., Portuguese, Russian, Mandarin Traditional, Vietnamese)
- [ ] **Full Assessment Translation**: Expand exam mode with question text translation, dynamic counter handling (Question X of Y), score/result page translations
- [ ] **Export as PDF**: Allow learners to download translated course materials as polished PDF documents for offline study

**Estimated Timeline**: Q4 2026 - Q1 2027

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

| Version | Status | Date |
|---------|--------|------|
| v1.0.0 | ✅ Released | Q1 2026 |
| v2.0.0 | ✅ Released | March 2026 |
| v2.1.0 | ✅ Released | March 2026 |
| v2.2 | 📋 Planned | Q4 2026 - Q1 2027 |
| v3.0 | 🎯 Vision | 2027+ |

---

## Feedback & Questions?

Open an issue or start a discussion on GitHub. We read every comment and consider community input seriously when planning releases.

Thank you for helping us make learning accessible to the world! 🌍
