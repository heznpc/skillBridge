<div align="center">

🌐 [English](../../README.md) · [한국어](README_KO.md) · **日本語** · [中文](README_ZH-CN.md) · [Español](README_ES.md) · [Français](README_FR.md) · [Deutsch](README_DE.md)

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

**Anthropic Academy をあなたの言語に翻訳 — 即座に。**

Anthropic の無料 AI コースの言語の壁を取り払う。

[インストール](#インストール) · [バグ報告](https://github.com/heznpc/skillbridge/issues) · [機能リクエスト](https://github.com/heznpc/skillbridge/issues)

</div>

---

<div align="center">

<img src="../../assets/screenshots/skillbridge-demo.gif" alt="SkillBridge デモ — Anthropic Academy をリアルタイムで翻訳" width="720" />

*SkillBridge をインストールし、Anthropic Academy にアクセスするだけで、ページ全体が即座に翻訳されます。*

</div>

---

## 課題

[Anthropic Academy](https://anthropic.skilljar.com/) は Claude、プロンプトエンジニアリング、AI 安全性を学ぶための最高の無料教育プラットフォームです。SkillBridge は言語に関係なく、すべての人がこれらのコースにアクセスできるようにします。

しかしコースは**英語のみ**で提供されており、汎用翻訳ツールでは不十分です:

| | Google 翻訳 (ページ) | SkillBridge |
|---|---|---|
| AI 用語 | ❌ "Prompt" → "迅速な" (誤り) | ✅ "Prompt" → "プロンプト" (正確) |
| 技術的正確性 | ❌ 汎用機械翻訳 | ✅ 570+ キュレーション用語 + AI 検証 |
| コンテキスト認識ヘルプ | ❌ なし | ✅ AI チューターがレッスンについての質問に回答 |
| 動画字幕 | ❌ 別途手動トグル | ✅ 自動翻訳字幕 |
| UI 保持 | ❌ チェックボックス、プログレスバーが破損 | ✅ すべての対話要素を保持 |
| コスト | 無料 | 無料 — API キー不要 |

> **API キー不要。コスト無し。インストールして学習を始めましょう。**

## クイックスタート

1. 拡張機能をインストール ([下記参照](#インストール))
2. [Anthropic Academy](https://anthropic.skilljar.com/) にアクセス
3. SkillBridge がページ全体を自動的に翻訳

それだけです。

## 機能

### 🌐 フルページ翻訳

ページのすべてのテキスト要素が翻訳され、AI 固有の用語はキュレーション辞書を通じて正確に処理されます。進捗チェックボックス、アイコン、ナビゲーション、CJK フォントすべてがそのまま保持されます。

<div align="center">
<img src="../../assets/screenshots/01-lesson-translated.png" alt="カリキュラムが完全に翻訳されたレッスンページ" width="720" />
<br/>
<em>カリキュラムが完全に翻訳されたレッスンページ — UI 要素が保持されます。</em>
</div>

### 🤖 AI チューター

[Puter.js](https://docs.puter.com/) 経由で **Claude Sonnet 4** を搭載したサイドバーチャットボットです。現在のコースとレッスンを認識します。選択した言語で質問するとストリーミング回答を取得します。

### 🎬 自動字幕

コース動画を再生すると、翻訳字幕が自動的にアクティブになります — 手動トグルは不要です。

### 🔍 スマート検出

初回訪問時にブラウザ言語を検出し、翻訳を提案します。セットアップ不要です。

### 🛡️ 保護用語

汎用翻訳ツールはしばしば**ブランド名と技術用語を誤訳します**。SkillBridge は翻訳後にこれらのエラーを自動修正します:

<div align="center">

| 前 (Google 翻訳) | 後 (SkillBridge) |
|:---:|:---:|
| ❌ 人道的コース | ✅ Anthropic コース |
| ❌ クロード | ✅ Claude |
| ❌ 迅速な工学 | ✅ プロンプトエンジニアリング |

</div>

<div align="center">
<img src="../../assets/screenshots/catalog-translated.png" alt="韓国語に翻訳された Anthropic Academy コースカタログページ（正しい用語）" width="720" />
<br/>
<em>韓国語に翻訳されたコースカタログ — ブランド名と AI 用語が正確に保持されます。</em>
</div>

## インストール

> Chrome ウェブストア掲載準備中 — このリポジトリにスターを付けて通知を受け取りましょう。

**手動インストール** (デベロッパーモード):

```bash
git clone https://github.com/heznpc/skillbridge.git
```

1. Chrome で `chrome://extensions/` を開く
2. **デベロッパーモード**を有効化 (右上のトグル)
3. **パッケージ化されていない拡張機能を読み込む** → クローンしたフォルダを選択
4. [anthropic.skilljar.com](https://anthropic.skilljar.com/) にアクセスして学習を開始!

Edge、Brave、Arc、その他の Chromium ベースのブラウザでも動作します。

## 仕組み

SkillBridge は**5 段階の翻訳エンジン**を使用して、速度と精度を優先します:

```
ページテキスト
  │
  ├─ 570+ キュレーション用語辞書 ──→ 即時 (AI 用語正確翻訳)
  │
  ├─ ローカルキャッシュ (IndexedDB) ───────→ 即時 (以前検証済み)
  │
  ├─ インライン HTML タグあり? (<strong>, <a>, <code>...)
  │     └─ はい → Gemini 2.0 Flash がタグ保持して翻訳
  │
  └─ プレーンテキスト → Google 翻訳 ─→ ~200ms
       │
       ├─ 保護用語自動修正 ─→ GT が誤訳したブランド/技術用語復元
       │
       └─ 複雑な文章? → Gemini 2.0 Flash 検証 → 必要に応じ修正
```

翻訳リクエストは [Puter.js](https://docs.puter.com/) を通じて Google 翻訳および Gemini/Claude API に送信されます — 当方のサーバーにデータは保存されず、アカウントや API キーも不要です。

## サポート言語

### プレミアム — キュレーション辞書 + Google 翻訳 + AI 検証

| 言語 | コード | 辞書 |
|------|--------|------|
| 🇰🇷 한국어 (Korean) | `ko` | 570+ 項目 |
| 🇯🇵 日本語 (Japanese) | `ja` | 570+ 項目 |
| 🇨🇳 中文简体 (Chinese Simplified) | `zh-CN` | 570+ 項目 |
| 🇪🇸 Español (Spanish) | `es` | 570+ 項目 |
| 🇫🇷 Français (French) | `fr` | 570+ 項目 |
| 🇩🇪 Deutsch (German) | `de` | 570+ 項目 |

### スタンダード — Google 翻訳 + AI 検証

🇹🇼 中文繁體 · 🇧🇷 Português (BR) · 🇵🇹 Português (PT) · 🇮🇹 Italiano · 🇳🇱 Nederlands · 🇷🇺 Русский · 🇵🇱 Polski · 🇺🇦 Українська · 🇨🇿 Čeština · 🇸🇪 Svenska · 🇩🇰 Dansk · 🇫🇮 Suomi · 🇳🇴 Norsk · 🇹🇷 Türkçe · 🇸🇦 العربية · 🇮🇳 हिन्दी · 🇹🇭 ภาษาไทย · 🇻🇳 Tiếng Việt · 🇮🇩 Bahasa Indonesia · 🇲🇾 Bahasa Melayu · 🇵🇭 Filipino · 🇧🇩 বাংলা · 🇮🇱 עברית · 🇷🇴 Română · 🇭🇺 Magyar · 🇬🇷 Ελληνικά

> 言語をプレミアムとして追加したいですか? キュレーション辞書を提供してください — [CONTRIBUTING.md](../../CONTRIBUTING.md) を参照してください。

## アーキテクチャ

```
skillbridge/
├── manifest.json              # Chrome MV3 manifest
├── _locales/                  # Chrome i18n (en, ko, ja, zh_CN)
├── src/
│   ├── background/            # Google Translate API プロキシ
│   ├── bridge/                # Puter.js AI ブリッジ (Gemini, Claude)
│   ├── content/               # DOM 翻訳 + サイドバー UI + フォント
│   ├── popup/                 # 拡張機能ポップアップ UI
│   ├── lib/                   # 翻訳エンジン、字幕、定数
│   └── data/                  # キュレーション辞書 (6 言語 × 570+)
└── assets/icons/
```

## 技術スタック

| コンポーネント | 技術 |
|-------------|------|
| ページ翻訳 | Google Translate API |
| インラインタグ翻訳 | Gemini 2.0 Flash (`<strong>`、`<a>`、`<code>` を保持) |
| 品質検証 | [Puter.js](https://docs.puter.com/) 経由の Gemini 2.0 Flash |
| 保護用語 | 言語ごとの GT ブランド/技術用語エラー自動修正 |
| AI チューター | Puter.js 経由の Claude Sonnet 4 |
| キュレーション辞書 | 手動調整 JSON (570+ × 6 言語) |
| 翻訳キャッシュ | IndexedDB |
| CJK フォントレンダリング | Google Fonts Noto Sans |

> **[Claude Code](https://docs.anthropic.com/en/docs/claude-code) で開発されました。**
> このプロジェクト — アーキテクチャ設計と機能実装からデバッグとデモ GIF まで — Claude Code を AI ペアプログラミングパートナーとして使用して開発されました。

## 翻訳哲学

各言語の辞書は、ネイティブスピーカーに自然に聞こえるようにキュレーションされています。[Anthropic の公式多言語ドキュメント](https://docs.anthropic.com)と合致することを目指していますが、コミュニティの慣例も重要です — 日本の開発者が「プロンプト」と言えば、それが私たちが使う表現です。

用語の選択に同意しませんか? それはまさに私たちが望む PR です — [CONTRIBUTING.md](../../CONTRIBUTING.md) を参照してください。

> [!IMPORTANT]
> **このリポジトリにスターを付けて**新機能と言語アップデートの通知を受け取りましょう。

## 貢献

**ネイティブスピーカー募集中!** 最も影響力のある貢献方法は、言語翻訳辞書を改善することです — コード不要、JSON ファイルを編集するだけです。1 つの誤った翻訳を修正することでも、その言語を使用するすべての学習者に役立ちます。

完全なガイドは [CONTRIBUTING.md](../../CONTRIBUTING.md) を参照し、[Good First Issues](https://github.com/heznpc/skillbridge/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) で始めてください。

## 免責事項

SkillBridge はブラウザの組み込み翻訳機能と同様の個人用翻訳ツールです。テキストはブラウザ内でリアルタイムで翻訳されます — 決して保存または再配布されません。

> **SkillBridge for Anthropic Academy** は非公式なコミュニティプロジェクトです。Anthropic と提携しておらず、Anthropic から承認または後援を受けていません。「Anthropic」「Claude」「Skilljar」は各所有者の商標です。

## ライセンス

[MIT](../../LICENSE)
