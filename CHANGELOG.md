# Changelog

All notable changes to SkillBridge are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed
- Migrate AI tutor model from Claude Sonnet 4 to Claude Sonnet 4.6 (deprecation June 15)
- Refactor DOM health check to load selectors from source-of-truth, parallelize page fetches

### Fixed
- Add fallback DOM selectors for Skilljar courseTime and courseOverview changes
- Add missing course slug `model-context-protocol-advanced-topics` to flashcard map
- Update YouTube InnerTube client version to 2.20260415.01.00

### Added
- Claude Code 101 course support (flashcard mapping + store listing)

## [3.4.0] - 2026-04-02

### Added
- Full course coverage across all 17 Anthropic Academy modules
- DX tooling improvements for local development

### Changed
- Architecture hardening for long-term maintainability
- Apply Prettier formatting to all source files
- Update store listing metadata

## [3.3.0] - 2026-04-02

### Added
- Flashcard mode for vocabulary review
- 4 new premium languages (pt-BR, ru, vi, zh-TW)
- Code comment translation support
- Dictionary expansion with broader term coverage

### Fixed
- Resolve memory leaks and concurrency issues

### Security
- Fix XSS vulnerabilities

## [2.1.0] - 2026-03-25

### Added
- Certification safety guards — extension fully disables on proctored exams
- New course support (Claude Cowork, Subagents, MCP Advanced)
- UX overhaul
- 6 new test suites (+750 tests)

### Changed
- QA checklist and contributing guide

## [2.0.0] - 2026-03-17

### Added
- Keyboard shortcuts (Ctrl+Shift+S/L/?)
- Firefox and Edge browser support
- Exam mode for course quizzes (skip answer choice translation)
- Maintenance automation via Chrome Alarms (cache cleanup, version check)
- Glossary checker tool
- Chrome Web Store CD workflow

### Changed
- Centralize Skilljar selectors into `selectors.js`
- Extract hardcoded values to constants
- Refine AI Fluency Korean terminology

### Fixed
- Performance and CWS compliance fixes
- Accessibility improvements for WCAG 2.1 AA compliance

### Security
- Security hardening — nonce on all postMessage, UUID request IDs
- Exam prompt guard for AI tutor

## [3.0.0] - 2026-03-04

### Added
- Major rebrand and rewrite as SkillBridge for Anthropic Academy
- Block-level translation with inline tag preservation (Gemini)
- Tutor conversation history with IndexedDB storage
- Drag-to-ask tutor — select text to ask the AI tutor
- YouTube auto-translated subtitles via InnerTube API
- Privacy policy and GDPR compliance

### Fixed
- Korean font rendering
- YouTube subtitle reliability
- XSS sanitization hardening

## [2.1.0-alpha] - 2026-03-03

### Changed
- Static JSON translation system replacing LLM-based pipeline (instant, 0ms lookups)

## [2.0.0-alpha] - 2026-03-03

### Added
- Persistent translation cache (IndexedDB)
- Dynamic tutor language selection

### Fixed
- IME (Input Method Editor) composition handling
- Rewrite translation pipeline for correct API calls and speed

## [1.0.0] - 2026-03-03

### Added
- Initial release of Skilljar i18n Assistant
- Puter.js bridge for in-page AI translation
- Multi-language support via Google Translate + LLM verification
