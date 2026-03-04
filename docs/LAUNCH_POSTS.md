# Launch Posting Drafts — SkillBridge for Anthropic Academy

Use these when publishing the GitHub repo publicly.

---

## Reddit r/Anthropic

**Title:** I built a Chrome extension that translates Anthropic Academy courses into 30+ languages — open source, built with Claude

**Body:**

Hey everyone!

I've been taking courses on Anthropic's Skilljar platform (anthropic.skilljar.com) and noticed there's no multilingual support. As a non-native English speaker, I wanted to lower the barrier for learners worldwide — so I built SkillBridge.

**What it does:**
- Translates the entire Skilljar learning experience into 30+ languages
- Uses a 3-tier engine: curated AI/ML term dictionaries (559 entries per language) → Google Translate → Gemini 2.0 Flash verification
- Includes an AI Tutor powered by Claude Sonnet 4 that can answer questions about the course content in your language
- Auto-translates YouTube video subtitles and shows a clickable transcript panel below embedded videos

**The fun part:** The entire project was developed using Claude Code (with Co-Authored-By: Claude in every commit). So it's literally "learned from Anthropic's courses → built with Anthropic's AI → improves access to Anthropic's education." The loop completes itself.

**Why open source?** I want native speakers to contribute better translations for their languages. The static dictionaries are the heart of quality — Google Translate alone turns "Prompt Engineering" into weird literal translations in most languages. Community-curated terms fix that.

**Looking for contributors:**
- Native speakers to improve/add translation dictionaries
- Developers to help with dark mode, keyboard shortcuts, and translation quality improvements
- Anyone who wants to add their language as a "premium" tier

GitHub: https://github.com/heznpc/skillbridge
MIT Licensed | No build step needed | Good First Issues tagged

Would love feedback from the community!

---

## X/Twitter Thread

**Tweet 1 (Hook):**
I built an open-source Chrome extension that translates @AnthropicAI's Academy courses into 30+ languages.

The twist? It was built entirely with Claude Code. Every commit has "Co-Authored-By: Claude" in it.

Anthropic's courses → Claude builds the tool → more people access Anthropic's courses.

Thread 🧵

**Tweet 2 (Problem):**
Anthropic's Skilljar courses are English-only. Browser translate turns "Constitutional AI" into nonsensical literal translations.

For non-English speakers trying to learn about Claude, this is a real barrier.

**Tweet 3 (Solution):**
SkillBridge uses a 3-tier approach:

1️⃣ Curated dictionaries — 559 AI/ML terms per language, human-verified
2️⃣ Google Translate — for everything else
3️⃣ Gemini 2.0 Flash — AI-verifies complex translations

Plus: Claude Sonnet 4 AI Tutor that answers course questions in your language.

**Tweet 4 (Open source):**
It's open source because translation quality needs native speakers.

Looking for contributors:
- 🌍 Add your language
- 📖 Fix bad translations  
- 💻 Code improvements

No npm install. No build step. Clone → load in Chrome → done.

GitHub: https://github.com/heznpc/skillbridge

**Tweet 5 (CTA):**
If you know someone learning AI in a non-English language, share this.

The mission: make AI education accessible regardless of what language you think in.

⭐ Star the repo if you find it useful: https://github.com/heznpc/skillbridge

---

## Hacker News

**Title:** SkillBridge – Open-source Chrome extension translating Anthropic's AI courses into 30+ languages

**Body (text post):**

I built a Chrome extension that adds multilingual support to Anthropic's Skilljar-based learning platform (anthropic.skilljar.com).

The problem: Anthropic's courses on prompt engineering, Claude API, and AI safety are English-only. Standard browser translation mangles technical terms — "retrieval-augmented generation" becomes gibberish in most languages.

The approach: Three-tier translation engine:
1. Static dictionaries with 559 curated AI/ML terms per language (6 languages currently have these)
2. Google Translate API for general content
3. Gemini 2.0 Flash as a verification layer for complex passages

Additional features: AI Tutor (Claude Sonnet 4 via Puter.js), YouTube subtitle auto-translation with transcript panel.

Technical notes:
- Chrome Extension Manifest V3, vanilla JS, zero build dependencies
- Puter.js for "user-pays" AI model access (no API keys needed)
- IndexedDB for verified translation caching
- The entire project was developed with Claude Code — every commit is co-authored

Why open source: Translation quality depends on native speakers. The static dictionaries are the most impactful contribution — they override Google Translate for domain-specific terms. Currently looking for contributors to expand language coverage.

MIT Licensed. No build step — clone and load as unpacked extension.

GitHub: https://github.com/heznpc/skillbridge

---

## Reddit r/LanguageLearning (Alternative)

**Title:** Chrome extension that translates Anthropic's AI courses into 30+ languages — looking for native speaker contributors

**Body:**

If you're interested in AI and don't primarily work in English, you might find this useful.

I built SkillBridge, an open-source Chrome extension that translates Anthropic's online courses (their AI safety, prompt engineering, and Claude API courses) into 30+ languages.

What makes it different from just using Google Translate: We maintain curated dictionaries of 559 AI/ML technical terms for 6 languages (Korean, Japanese, Chinese, Spanish, French, German). These ensure that domain-specific terms like "retrieval-augmented generation" or "constitutional AI" get proper translations instead of literal nonsense.

**I'm looking for native speakers** who can:
- Review and improve existing term translations
- Add new AI/ML terms that Google Translate gets wrong
- Create dictionaries for new languages (we'll promote them to "premium" tier)

No coding required for translation contributions — it's just editing JSON files with key-value pairs.

GitHub: https://github.com/heznpc/skillbridge

