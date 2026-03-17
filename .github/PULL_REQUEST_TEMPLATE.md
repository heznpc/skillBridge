## What does this PR do?

<!-- Brief description of the changes -->

## Type of Change

- [ ] 🐛 Bug fix
- [ ] ✨ New feature
- [ ] 🌍 Translation/i18n
- [ ] 📝 Documentation
- [ ] 🔧 Refactoring
- [ ] 🎨 UI/Style

## Testing

- [ ] `npm test` passes
- [ ] Tested on anthropic.skilljar.com
- [ ] Extension loads without errors
- [ ] No console errors in DevTools
- [ ] Tested in target language (if i18n change)

### QA Checklist (check items affected by your changes)

<details>
<summary>Expand checklist</summary>

**Core Translation**
- [ ] Page translates after selecting language
- [ ] Switch to English restores original
- [ ] Protected terms stay in English

**AI Tutor**
- [ ] Sidebar opens, streaming response works
- [ ] Text selection "Ask Tutor" works

**Keyboard Shortcuts**
- [ ] Ctrl+Shift+S/L/? all work
- [ ] No interference with text input fields

**Exam Mode**
- [ ] Answer choices NOT translated on quiz pages
- [ ] AI Tutor shows integrity warning

**Dark Mode**
- [ ] Theme applies to all UI elements

**Cross-Browser** (if touching manifest/polyfill/background)
- [ ] Chrome: works
- [ ] Firefox: `npm run build:firefox` → loads without errors
- [ ] Edge: works

</details>

## Screenshots (if UI change)

<!-- Paste before/after screenshots here -->

## Related Issues

<!-- Closes #XX -->
