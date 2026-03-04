<div align="center">

🌐 [English](README.md) · [한국어](README_KO.md) · **日本語** · [中文](README_ZH-CN.md) · [Español](README_ES.md) · [Français](README_FR.md) · [Deutsch](README_DE.md)

</div>

---

<div align="center">

<img src="assets/icons/icon128.png" alt="SkillBridge" width="80" />

# SkillBridge for Anthropic Academy

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Extension_MV3-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**Anthropicの無料AIコースの言語の壁を取り払う。**

</div>

[Anthropic Academy](https://academy.anthropic.com/)は、Claude、プロンプトエンジニアリング、AI安全性に関する最高水準の無料トレーニングを提供しています。しかし英語のみです。**SkillBridge**はコミュニティが開発したChrome拡張機能で、学習体験全体を30以上の言語に翻訳し、AIチューターがリアルタイムで質問に答えます。

> APIキー不要。コストなし。インストールして学習を始めましょう。

---

## 主な機能

### 3段階翻訳エンジン

1. **静的辞書** — 言語あたり559以上の手動チューニング済み翻訳を遅延なく即時適用
2. **IndexedDBキャッシュ** — 以前検証された翻訳をローカルから即時取得
3. **Google翻訳 + Gemini検証** — 残りのテキストはGoogle翻訳後、複雑な文のみGemini 2.0 Flashがバックグラウンドで検証

### AIチューター (Claude Sonnet 4)

[Puter.js](https://docs.puter.com/)ベースのClaude Sonnet 4チャットボット。現在のページコンテキストを把握したストリーミング応答を提供します。

### YouTube字幕自動翻訳

埋め込み講義動画の字幕が選択した言語に合わせて自動的に有効化されます。

---

## 対応言語

### プレミアム (静的辞書 + Google翻訳 + AI検証)

한국어, 日本語, 中文简体, Español, Français, Deutsch — 各559項目の静的辞書を含む

### スタンダード (Google翻訳 + AI検証)

中文繁體, Português, Italiano, Nederlands, Русский, Polski, Türkçe, العربية, हिन्दी, ภาษาไทย, Tiếng Việt, Bahasa Indonesia など25以上の言語

---

## インストール

1. リポジトリをクローン: `git clone https://github.com/heznpc/skillbridge.git`
2. Chrome → `chrome://extensions/` → **デベロッパーモード**を有効化
3. **パッケージ化されていない拡張機能を読み込む** → クローンしたフォルダを選択
4. [anthropic.skilljar.com](https://anthropic.skilljar.com/)にアクセス！

## 技術スタック

| コンポーネント | 技術 | 役割 |
|--------------|------|------|
| ページ翻訳 | Google Translate API | 高速な一次翻訳 |
| 品質検証 | Gemini 2.0 Flash (Puter.js) | バックグラウンド精度検証 |
| AIチューター | Claude Sonnet 4 (Puter.js) | 対話型学習アシスタント |
| AIゲートウェイ | [Puter.js](https://docs.puter.com/) | Claude, Gemini無料アクセス |

## 著作権について

SkillBridgeはブラウザの組み込み翻訳機能と同様の個人用翻訳ツールです。テキストはブラウザ上でリアルタイム翻訳され、コンテンツは保存または再配布されません。静的辞書にはUIの文字列のみが含まれ、コースコンテンツは含まれません。

> **免責事項:** SkillBridge for Anthropic Academyは非公式なコミュニティプロジェクトです。Anthropicと提携しており、Anthropicから承認または後援を受けていません。この拡張機能は個人学習のためのリアルタイムコンテンツ翻訳のみを提供し、元のコースコンテンツの保存または再配布は行いません。「Anthropic」「Claude」「Skilljar」はそれぞれの所有者の商標です。

## コントリビューション

SkillBridgeはコミュニティによって作られた、コミュニティのためのプロジェクトです。あらゆる種類の貢献を歓迎します！

- **翻訳の改善** — 誤訳の修正や静的辞書へのエントリ追加
- **新言語の追加** — 標準言語の追加やキュレーション辞書によるプレミアム昇格
- **コード貢献** — 翻訳エンジン、AIチューター、YouTube機能の改善
- **ドキュメント** — READMEの改善、チュートリアルの作成、スクリーンショットの追加

詳細なガイドは [CONTRIBUTING.md](CONTRIBUTING.md) をご覧ください。[Good First Issues](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) から始めてみてください。

プロジェクトの方向性は [ROADMAP.md](ROADMAP.md) をご覧ください。

## ライセンス

MIT — [LICENSE](LICENSE)

---

**世界のAI学習コミュニティのために作りました。**
