<div align="center">

🌐 [English](../../README.md) · [한국어](README_KO.md) · **日本語** · [中文](README_ZH-CN.md) · [Español](README_ES.md) · [Français](README_FR.md) · [Deutsch](README_DE.md)

</div>

---

<div align="center">

<img src="../../assets/icons/icon128.png" alt="SkillBridge" width="80" />

# SkillBridge for Anthropic Academy

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](../../LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Extension_MV3-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](../../CONTRIBUTING.md)

**Anthropicの無料AIコースの言語の壁を取り払う。**

[インストール](#インストール) · [バグ報告](../../issues) · [機能リクエスト](../../issues)

</div>

---

<div align="center">

<img src="../../assets/screenshots/skillbridge-demo.gif" alt="SkillBridge デモ — Anthropic Academy をリアルタイムで翻訳" width="720" />

*SkillBridgeをインストールし、Anthropic Academyにアクセスするだけで、ページ全体が即座に翻訳されます。*

</div>

---

## SkillBridge を選ぶ理由

[Anthropic Academy](https://anthropic.skilljar.com/)は、Claude、プロンプトエンジニアリング、AI安全性に関する最高水準の無料トレーニングを提供しています。**しかし英語のみです。**

*「Google 翻訳を使えばいいのでは?」*と思うかもしれませんが、ここが限界です:

| | Google 翻訳 (ページ) | SkillBridge |
|---|---|---|
| AI 用語 | ❌ "Prompt" → "プロンプト" (誤り) | ✅ "Prompt" → "プロンプト" (正確) |
| 技術的正確性 | ❌ 汎用機械翻訳 | ✅ 言語ごと 560+ 手動キュレーション用語 + 保護用語自動修正 + Gemini AI 検証 |
| コンテキスト認識ヘルプ | ❌ なし | ✅ AI チューター (Claude Sonnet 4) がレッスンについての質問に回答 |
| 動画字幕 | ❌ 別途手動トグル | ✅ 選択した言語で自動翻訳字幕 |
| UI 保存 | ❌ チェックボックス、プログレスバーが破損 | ✅ すべての対話要素を保存 |
| コスト | 無料 | 無料 — API キー不要 |

> **API キー不要。コスト無し。インストールして学習を始めましょう。**

### 保護用語の実際の例

汎用ページ翻訳ツールはしばしば**ブランド名と技術用語を誤訳します**。たとえば、Google 翻訳は「Anthropic Courses」を「人道的コース」と翻訳します — 完全に間違っています。

SkillBridge の**保護用語**エンジンは翻訳後にこれらのエラーを自動修正し、「Anthropic」「Claude」などのブランド名と技術用語を正確に保持します:

<div align="center">

| 前 (Google 翻訳のみ) | 後 (SkillBridge 保護用語) |
|:---:|:---:|
| ❌ 人道的コース | ✅ Anthropic コース |
| ❌ クロード | ✅ Claude |
| ❌ 迅速な工学 | ✅ プロンプト エンジニアリング |

</div>

<div align="center">
<img src="../../assets/screenshots/catalog-translated.png" alt="韓国語に翻訳されたAnthropicコースカタログページ（正しい用語）" width="720" />
<br/>
<em>韓国語に翻訳されたコースカタログ — ブランド名とAI用語が正確に保持されます。</em>
</div>

## 実際の動作を確認

### 全ページ翻訳

ページのすべてのテキスト要素が翻訳され、AI 固有の用語はキュレーション辞書を通じて正確に処理されます。進捗チェックボックス、アイコン、ナビゲーションはすべてそのまま保持されます。

<div align="center">
<img src="../../assets/screenshots/01-lesson-translated.png" alt="カリキュラムが完全に翻訳されたレッスンページ" width="720" />
<br/>
<em>カリキュラムが完全に翻訳されたレッスンページ — UI要素が保持されます。</em>
</div>

### AI チューター

**Claude Sonnet 4** を搭載したサイドバーチャットボット ([Puter.js](https://docs.puter.com/) 経由)。現在のコースとレッスンを認識します。選択した言語で質問するとストリーミング回答を取得します。

<!-- TODO: ai-tutor.png 追加後にコメント解除
<div align="center">
<img src="../../assets/screenshots/ai-tutor.png" alt="日本語の質問に答える AI チューターサイドバー" width="720" />
<br/>
<em>レッスンについて AI チューターに質問する — Claude Sonnet 4 搭載。</em>
</div>
-->

### 自動字幕

コース動画を再生すると、選択した言語の翻訳字幕が自動的にアクティブになります — 手動トグルは不要です。

<!-- <div align="center">
<img src="../../assets/screenshots/subtitles.png" alt="自動翻訳された日本語字幕付きの YouTube 動画" width="720" />
<br/>
<em>動画字幕が選択した言語に自動翻訳されます。</em>
</div> -->

## 仕組み

SkillBridge は**5 段階の翻訳エンジン**を使用して、速度と精度を優先します:

```
ページテキスト
  │
  ├─ 560+ キュレーション用語辞書 ──→ 即時 (AI 用語正確翻訳)
  │
  ├─ ローカルキャッシュ (IndexedDB) ───────→ 即時 (以前検証)
  │
  ├─ インライン HTML タグあり? (<strong>, <a>, <code>...)
  │     └─ はい → Gemini 2.0 Flash がタグ保存して翻訳
  │
  └─ プレーンテキスト → Google 翻訳 ─→ ~200ms
       │
       ├─ 保護用語自動修正 ─→ GT が誤訳したブランド/技術用語復元
       │
       └─ 複雑な文章? → Gemini 2.0 Flash 検証 → 必要に応じ修正
```

**保護用語** — 各言語は GT の既知のエラーを定義します (例: GT が「Claude」を日本語で「クロード」と翻訳)。GT 実行後、拡張機能が正しい形に自動修正します。ブランド名、技術用語、製品階層は英語のままです — [Anthropic の公式多言語ドキュメント](https://docs.anthropic.com)と一致します。

すべての翻訳は**ブラウザ内で発生します** — サードパーティサーバーに保存または送信されません。

## 機能

**🌐 フルページ翻訳** — ページのすべてのテキスト要素が翻訳され、AI 固有の用語はキュレーション辞書で正確に処理されます。

**🤖 AI チューター** — [Puter.js](https://docs.puter.com/) 経由の Claude Sonnet 4 搭載サイドバーチャットボット。現在のコースとレッスンを認識します。選択した言語で質問するとストリーミング回答を取得します。

**🎬 自動字幕** — コース動画を再生すると、選択した言語の翻訳字幕が自動的にアクティブになります。

**🔍 スマート検出** — 初回訪問時にブラウザ言語を検出し、翻訳を提案します。セットアップ不要です。

**✨ 忠実な UI** — 進捗チェックボックス、アイコン、ナビゲーションはすべてそのまま保持されます。CJK フォントは元のデザインに合わせられます。

## サポート言語

### プレミアム — キュレーション辞書 + Google 翻訳 + AI 検証

| 言語 | コード | 辞書 |
|------|--------|------|
| 🇰🇷 한국어 (Korean) | `ko` | 560+ 項目 |
| 🇯🇵 日本語 (Japanese) | `ja` | 560+ 項目 |
| 🇨🇳 中文简体 (Chinese Simplified) | `zh-CN` | 560+ 項目 |
| 🇪🇸 Español (Spanish) | `es` | 560+ 項目 |
| 🇫🇷 Français (French) | `fr` | 560+ 項目 |
| 🇩🇪 Deutsch (German) | `de` | 560+ 項目 |

### スタンダード — Google 翻訳 + AI 検証

🇹🇼 中文繁體 · 🇧🇷 Português (BR) · 🇵🇹 Português (PT) · 🇮🇹 Italiano · 🇳🇱 Nederlands · 🇷🇺 Русский · 🇵🇱 Polski · 🇺🇦 Українська · 🇨🇿 Čeština · 🇸🇪 Svenska · 🇩🇰 Dansk · 🇫🇮 Suomi · 🇳🇴 Norsk · 🇹🇷 Türkçe · 🇸🇦 العربية · 🇮🇳 हिन्दी · 🇹🇭 ภาษาไทย · 🇻🇳 Tiếng Việt · 🇮🇩 Bahasa Indonesia · 🇲🇾 Bahasa Melayu · 🇵🇭 Filipino · 🇧🇩 বাংলা · 🇮🇱 עברית · 🇷🇴 Română · 🇭🇺 Magyar · 🇬🇷 Ελληνικά

> 言語をプレミアムとして追加したいですか? キュレーション辞書を提供してください — [CONTRIBUTING.md](../../CONTRIBUTING.md) を参照してください。

## インストール

<!-- **Chrome ウェブストア** (推奨): [SkillBridge をインストール](https://chrome.google.com/webstore/) — 近日公開 -->

**手動インストール** (デベロッパーモード):

```bash
git clone https://github.com/heznpc/skillbridge.git
```

1. Chrome で `chrome://extensions/` を開く
2. **デベロッパーモード**を有効化 (右上のトグル)
3. **パッケージ化されていない拡張機能を読み込む** → クローンしたフォルダを選択
4. [anthropic.skilljar.com](https://anthropic.skilljar.com/) にアクセスして学習を開始!

## アーキテクチャ

```
skillbridge/
├── manifest.json              # Chrome MV3 manifest
├── _locales/                  # Chrome i18n (en, ko, ja, zh_CN)
├── src/
│   ├── background/            # Google Translate API プロキシ
│   ├── content/               # DOM 翻訳 + サイドバー UI + フォント
│   ├── popup/                 # 拡張機能ポップアップ UI
│   ├── lib/                   # 翻訳エンジン、AI ブリッジ、字幕
│   └── data/                  # キュレーション辞書 (6 言語 × 560+)
└── assets/icons/
```

## 技術スタック

| コンポーネント | 技術 |
|-------------|------|
| ページ翻訳 | Google Translate API |
| インラインタグ翻訳 | Gemini 2.0 Flash (`<strong>`、`<a>`、`<code>` を保存) |
| 品質検証 | [Puter.js](https://docs.puter.com/) 経由の Gemini 2.0 Flash |
| 保護用語 | 言語ごとの GT ブランド/技術用語エラー自動修正 |
| AI チューター | Puter.js 経由の Claude Sonnet 4 |
| キュレーション辞書 | 手動調整 JSON (560+ × 6 言語) |
| 翻訳キャッシュ | IndexedDB |
| CJK フォントレンダリング | Google Fonts Noto Sans |

> **[Claude Code](https://docs.anthropic.com/en/docs/claude-code) で開発されました。**
> このプロジェクト — アーキテクチャ設計と機能実装から CI/CD パイプライン設定、ユニットテスト、デバッグ、さらにデモ GIF まで — Claude Code を AI ペアプログラミングパートナーとして使用して開発されました。

## 翻訳哲学

各言語の辞書は、ネイティブスピーカーに自然に聞こえるようにキュレーションされています。現在 [Anthropic の公式多言語ドキュメント](https://docs.anthropic.com)と合致することを目指していますが、コミュニティの慣例も重要です — 日本の開発者が「プロンプト」の代わりに「prompt」と言えば、それが私たちが使う表現です。

用語の選択に同意しませんか? それは正確には私たちが望む種の PR です — [CONTRIBUTING.md](../../CONTRIBUTING.md) で言語辞書を改善する方法を参照してください。

## 貢献

**ネイティブスピーカーが必要です!** 最も影響力のある貢献方法は、言語翻訳辞書を改善することです — コード不要、JSON ファイルを編集するだけです。1 つの誤った翻訳を修正することでも、その言語を使用するすべての学習者に役立ちます。

完全なガイドは [CONTRIBUTING.md](../../CONTRIBUTING.md) を参照し、[Good First Issues](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) で始め、プロジェクトの方向は [ROADMAP.md](../../docs/ROADMAP.md) を参照してください。

## 免責事項

SkillBridge はブラウザの組み込み翻訳機能と同様の個人用翻訳ツールです。テキストはブラウザ内でリアルタイムで翻訳されます — 決して保存または再配布されません。

> **SkillBridge for Anthropic Academy** は非公式なコミュニティプロジェクトです。Anthropic と提携しておらず、Anthropic から承認または後援を受けていません。「Anthropic」「Claude」「Skilljar」は各所有者の商標です。

## ライセンス

[MIT](../../LICENSE)
