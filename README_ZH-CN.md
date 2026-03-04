# SkillBridge for Anthropic Academy

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Good First Issues](https://img.shields.io/github/issues/heznpc/skillbridge/good%20first%20issue)](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)

**打破Anthropic免费AI课程的语言障碍。**

[Anthropic Skilljar课程](https://anthropic.skilljar.com/)提供关于Claude、提示工程和AI安全的顶级免费培训，但仅提供英语版本。**SkillBridge for Anthropic Academy** 是社区开发的Chrome扩展程序，将整个学习体验翻译为30多种语言，AI导师实时回答您的问题。

> 无需API密钥。完全免费。安装即可开始学习。

<p align="center">
  <img src="assets/icons/icon128.png" alt="SkillBridge" width="96" />
</p>

[English](README.md) · [한국어](README_KO.md) · [日本語](README_JA.md) · [Español](README_ES.md) · [Français](README_FR.md) · [Deutsch](README_DE.md)

---

## 主要功能

### 三层翻译引擎

1. **静态词典** — 每种语言559+条人工调优翻译，零延迟即时加载
2. **IndexedDB缓存** — 从本地存储即时调取已验证的翻译
3. **Google翻译 + Gemini验证** — 剩余文本由Google翻译处理，复杂句子由Gemini 2.0 Flash后台验证

### AI导师 (Claude Sonnet 4)

基于[Puter.js](https://docs.puter.com/)的Claude Sonnet 4聊天机器人，提供感知当前页面上下文的流式响应。

### YouTube字幕自动翻译

嵌入式课程视频的字幕会自动激活并匹配您选择的语言。

---

## 支持语言

### 高级版 (静态词典 + Google翻译 + AI验证)

한국어, 日本語, 中文简体, Español, Français, Deutsch — 各含559条静态词典

### 标准版 (Google翻译 + AI验证)

中文繁體, Português, Italiano, Nederlands, Русский, Polski, Türkçe, العربية, हिन्दी, ภาษาไทย, Tiếng Việt, Bahasa Indonesia 等25+种语言

---

## 安装

1. 克隆仓库: `git clone https://github.com/heznpc/skillbridge.git`
2. Chrome → `chrome://extensions/` → 启用**开发者模式**
3. 点击**加载已解压的扩展程序** → 选择克隆的文件夹
4. 访问 [anthropic.skilljar.com](https://anthropic.skilljar.com/)！

## 技术栈

| 组件 | 技术 | 作用 |
|------|------|------|
| 页面翻译 | Google Translate API | 快速首次翻译 |
| 质量验证 | Gemini 2.0 Flash (Puter.js) | 后台精度验证 |
| AI导师 | Claude Sonnet 4 (Puter.js) | 对话式学习助手 |
| AI网关 | [Puter.js](https://docs.puter.com/) | 免费访问Claude和Gemini |

## 版权说明

SkillBridge 是一个个人翻译工具，类似于浏览器的内置翻译功能。文本在浏览器中实时翻译，不存储或重新分发任何内容。静态词典仅包含 UI 字符串，不包含课程内容。

> **免责声明:** SkillBridge for Anthropic Academy 是一个非官方社区项目。它与 Anthropic 无关，未获得 Anthropic 的认可或赞助。此扩展程序仅用于个人学习的实时内容翻译，不存储或重新分发任何原始课程内容。"Anthropic"、"Claude" 和 "Skilljar" 是各自所有者的商标。

## 贡献

SkillBridge 由社区构建，服务于社区。我们欢迎各种形式的贡献！

- **翻译改进** — 修复错误翻译或向静态词典添加条目
- **新语言** — 添加标准语言或通过策划词典升级为高级语言
- **代码贡献** — 改进翻译引擎、AI 导师或 YouTube 功能
- **文档** — 改进 README、编写教程、添加截图

详细指南请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)。从 [Good First Issues](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) 开始吧。

项目方向请参阅 [ROADMAP.md](ROADMAP.md)。

## 许可证

MIT — 参见 [LICENSE](LICENSE)

---

**为全球AI学习社区而建。**
