<div align="center">

🌐 [English](../../README.md) · [한국어](README_KO.md) · [日本語](README_JA.md) · **中文** · [Español](README_ES.md) · [Français](README_FR.md) · [Deutsch](README_DE.md)

</div>

---

<div align="center">

<img src="../../assets/icons/icon128.png" alt="SkillBridge" width="90" />

# SkillBridge for Anthropic Academy

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](../../LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Extension_MV3-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![GitHub stars](https://img.shields.io/github/stars/heznpc/skillbridge?style=social)](https://github.com/heznpc/skillbridge/stargazers)
[![GitHub contributors](https://img.shields.io/github/contributors/heznpc/skillbridge)](https://github.com/heznpc/skillbridge/graphs/contributors)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](../../CONTRIBUTING.md)

**将 Anthropic Academy 翻译成你的语言 — 即时翻译。**

打破 Anthropic 免费 AI 课程的语言障碍。

[安装](#安装) · [报告错误](https://github.com/heznpc/skillbridge/issues) · [请求功能](https://github.com/heznpc/skillbridge/issues)

</div>

---

<div align="center">

<img src="../../assets/screenshots/skillbridge-demo.gif" alt="SkillBridge 演示 — 实时翻译 Anthropic Academy" width="720" />

*安装 SkillBridge，访问 Anthropic Academy，整个页面即时翻译。*

</div>

---

## 问题

[Anthropic Academy](https://anthropic.skilljar.com/) 是学习 Claude、提示词工程和 AI 安全的最佳免费教育平台。SkillBridge 让每个人都能无障碍地使用这些课程，无论使用什么语言。

但课程**仅提供英语**，通用翻译工具力不从心:

| | Google 翻译 (页面) | SkillBridge |
|---|---|---|
| AI 术语 | ❌ "Prompt" → "迅速的" (错误) | ✅ "Prompt" → "提示词" (正确) |
| 技术准确性 | ❌ 通用机器翻译 | ✅ 570+ 手工策划术语 + AI 验证 |
| 上下文感知帮助 | ❌ 无 | ✅ AI 导师回答关于课程的问题 |
| 视频字幕 | ❌ 单独手动切换 | ✅ 自动翻译字幕 |
| UI 保留 | ❌ 破坏复选框、进度条 | ✅ 保留所有交互元素 |
| 成本 | 免费 | 免费 — 无需 API 密钥 |

> **无 API 密钥。无成本。安装即可开始学习。**

## 快速开始

1. 安装扩展程序 ([见下方](#安装))
2. 访问 [Anthropic Academy](https://anthropic.skilljar.com/)
3. SkillBridge 自动翻译整个页面

就这么简单。

## 功能

### 🌐 全页翻译

页面上的每个文本元素都被翻译，AI 特定术语通过策划字典准确处理。进度复选框、图标、导航和 CJK 字体都保持不变。

<div align="center">
<img src="../../assets/screenshots/01-lesson-translated.png" alt="课程完整翻译的课程页面" width="720" />
<br/>
<em>课程页面完整翻译 — UI 元素完好保留。</em>
</div>

### 🤖 AI 导师

通过 [Puter.js](https://docs.puter.com/) 由 **Claude Sonnet 4** 驱动的侧边栏聊天机器人。它知道你在哪个课程和课时。用你的语言提问，获得流式答案。

### 🎬 自动字幕

播放课程视频时，翻译字幕自动激活 — 无需手动切换。

### 🔍 智能检测

首次访问时检测浏览器语言并提供翻译。无需设置。

### 🛡️ 受保护术语

通用翻译工具经常**误翻品牌名和技术术语**。SkillBridge 在翻译后自动纠正这些错误:

<div align="center">

| 之前 (Google 翻译) | 之后 (SkillBridge) |
|:---:|:---:|
| ❌ 人文课程 | ✅ Anthropic 课程 |
| ❌ 克劳德 | ✅ Claude |
| ❌ 迅速工程 | ✅ 提示词工程 |

</div>

<div align="center">
<img src="../../assets/screenshots/catalog-translated.png" alt="翻译为韩语的 Anthropic Academy 课程目录页面（正确术语）" width="720" />
<br/>
<em>翻译为韩语的课程目录 — 品牌名称和 AI 术语准确保留。</em>
</div>

## 安装

> Chrome 网上应用店即将上线 — 为此仓库加星以获取通知。

**手动安装** (开发者模式):

```bash
git clone https://github.com/heznpc/skillbridge.git
```

1. 在 Chrome 中打开 `chrome://extensions/`
2. 启用**开发者模式** (右上角切换)
3. 点击**加载已解压的扩展程序** → 选择克隆的文件夹
4. 访问 [anthropic.skilljar.com](https://anthropic.skilljar.com/) 并开始学习!

也适用于 Edge、Brave、Arc 及其他基于 Chromium 的浏览器。

## 工作原理

SkillBridge 使用**五层翻译引擎**来优先考虑速度和准确性:

```
页面文本
  │
  ├─ 570+ 策划术语字典 ──→ 即时 (AI 术语准确翻译)
  │
  ├─ 本地缓存 (IndexedDB) ───────→ 即时 (之前验证的)
  │
  ├─ 有内联 HTML 标签吗? (<strong>, <a>, <code>...)
  │     └─ 是 → Gemini 2.0 Flash 翻译保留标签
  │
  └─ 纯文本 → Google 翻译 ─→ ~200ms
       │
       ├─ 受保护术语自动修复 ─→ 恢复 GT 误翻的品牌/技术术语
       │
       └─ 复杂句子? → Gemini 2.0 Flash 验证 → 必要时修正
```

翻译请求通过 [Puter.js](https://docs.puter.com/) 发送到 Google 翻译和 Gemini/Claude API — 我们的服务器不存储任何数据，无需账户或 API 密钥。

## 支持的语言

### 高级 — 策划字典 + Google 翻译 + AI 验证

| 语言 | 代码 | 字典 |
|------|------|------|
| 🇰🇷 한국어 (Korean) | `ko` | 570+ 条目 |
| 🇯🇵 日本語 (Japanese) | `ja` | 570+ 条目 |
| 🇨🇳 中文简体 (Chinese Simplified) | `zh-CN` | 570+ 条目 |
| 🇪🇸 Español (Spanish) | `es` | 570+ 条目 |
| 🇫🇷 Français (French) | `fr` | 570+ 条目 |
| 🇩🇪 Deutsch (German) | `de` | 570+ 条目 |

### 标准 — Google 翻译 + AI 验证

🇹🇼 中文繁體 · 🇧🇷 Português (BR) · 🇵🇹 Português (PT) · 🇮🇹 Italiano · 🇳🇱 Nederlands · 🇷🇺 Русский · 🇵🇱 Polski · 🇺🇦 Українська · 🇨🇿 Čeština · 🇸🇪 Svenska · 🇩🇰 Dansk · 🇫🇮 Suomi · 🇳🇴 Norsk · 🇹🇷 Türkçe · 🇸🇦 العربية · 🇮🇳 हिन्दी · 🇹🇭 ภาษาไทย · 🇻🇳 Tiếng Việt · 🇮🇩 Bahasa Indonesia · 🇲🇾 Bahasa Melayu · 🇵🇭 Filipino · 🇧🇩 বাংলা · 🇮🇱 עברית · 🇷🇴 Română · 🇭🇺 Magyar · 🇬🇷 Ελληνικά

> 想为你的语言添加高级版? 贡献一份策划字典 — 参见 [CONTRIBUTING.md](../../CONTRIBUTING.md)。

## 架构

```
skillbridge/
├── manifest.json              # Chrome MV3 清单
├── _locales/                  # Chrome i18n (en, ko, ja, zh_CN)
├── src/
│   ├── background/            # Google Translate API 代理
│   ├── bridge/                # Puter.js AI 桥接 (Gemini, Claude)
│   ├── content/               # DOM 翻译 + 侧边栏 UI + 字体
│   ├── popup/                 # 扩展弹出窗口 UI
│   ├── lib/                   # 翻译引擎、字幕、常量
│   └── data/                  # 策划字典 (6 种语言 × 570+)
└── assets/icons/
```

## 技术栈

| 组件 | 技术 |
|------|------|
| 页面翻译 | Google Translate API |
| 内联标签翻译 | Gemini 2.0 Flash (保留 `<strong>`、`<a>`、`<code>`) |
| 质量验证 | 通过 [Puter.js](https://docs.puter.com/) 的 Gemini 2.0 Flash |
| 受保护术语 | 每种语言的 GT 品牌/技术术语错误自动修正 |
| AI 导师 | 通过 Puter.js 的 Claude Sonnet 4 |
| 策划字典 | 手工调整的 JSON (570+ × 6 种语言) |
| 翻译缓存 | IndexedDB |
| CJK 字体渲染 | Google Fonts Noto Sans |

> **使用 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 构建。**
> 此项目 — 从架构设计和功能实现到调试和演示 GIF — 都是使用 Claude Code 作为 AI 配对编程伙伴开发的。

## 翻译哲学

每种语言的字典都经过精心策划，以便对母语使用者听起来自然。我们与 [Anthropic 官方多语言文档](https://docs.anthropic.com)保持一致作为基线，但社区惯例也很重要 — 如果中国开发者说"提示词"而不是"prompt"，那就是我们使用的。

不同意术语选择? 那正是我们想要的 PR 类型 — 参见 [CONTRIBUTING.md](../../CONTRIBUTING.md)。

> [!IMPORTANT]
> **为此仓库加星**以获取新功能和语言更新的通知。

## 贡献

**寻找母语使用者!** 最有影响力的贡献方式是改进你的语言的翻译字典 — 无需代码，只需编辑 JSON 文件。即使修复一个错误的翻译也能帮助使用该语言的每个学习者。

参见 [CONTRIBUTING.md](../../CONTRIBUTING.md) 了解完整指南，从 [Good First Issues](https://github.com/heznpc/skillbridge/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) 开始。

## 免责声明

SkillBridge 是一个个人翻译工具，类似于浏览器的内置翻译功能。文本在浏览器中实时翻译 — 永远不会存储或重新分发。

> **SkillBridge for Anthropic Academy** 是一个非官方社区项目。它与 Anthropic 无关，未获得 Anthropic 的认可或赞助。"Anthropic"、"Claude" 和 "Skilljar" 是各自所有者的商标。

## 许可证

[MIT](../../LICENSE)
