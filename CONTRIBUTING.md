# Contributing to Skilljar i18n Assistant

Thank you for your interest in contributing! This project aims to make Anthropic's educational content accessible to learners worldwide.

## How to Contribute

### Reporting Issues
- Use GitHub Issues to report bugs
- Include your browser version, OS, and steps to reproduce

### Adding/Improving Translations
1. Fork the repository
2. Add or improve locale files in `_locales/`
3. Test the translation quality
4. Submit a PR

### Code Contributions
1. Fork and clone the repo
2. Load the extension in Chrome (`chrome://extensions` → Developer Mode → Load Unpacked)
3. Navigate to `anthropic.skilljar.com` to test
4. Make your changes and test thoroughly
5. Submit a PR with a clear description

### Improving AI Translation Quality
- The translation engine uses Puter.js + GLM-4-Flash
- Prompt improvements in `src/lib/translator.js` are welcome
- Please test across multiple languages before submitting

## Code Style
- Use vanilla JavaScript (no build step required)
- Follow existing code formatting
- Comment complex logic
- Keep the extension lightweight

## Copyright Notice
This extension translates content on-the-fly for personal learning.
It does NOT store, cache permanently, or redistribute any original Skilljar content.
All contributions must maintain this copyright-respecting approach.

## License
By contributing, you agree that your contributions will be licensed under the MIT License.
