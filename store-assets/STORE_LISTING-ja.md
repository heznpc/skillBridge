# Chrome Web Store — ストア掲載情報 (v3.5.33, 日本語)

英語原文: [STORE_LISTING.md](STORE_LISTING.md)

## タイトル (最大75文字)

SkillBridge — Anthropic Academyを日本語で完走 + AIチューター

## 要約 (最大132文字)

英語の講座を日本語で完走。AI用語辞書、母語AIチューター、試験安全モード搭載。APIキー不要、登録不要。

## 詳細説明

Anthropic AcademyはClaude、プロンプトエンジニアリング、AI安全性に関する世界最高水準の無料講座を提供しています。ただし英語のみ。SkillBridgeは、英語ネイティブでない学習者が実際に講座を完走し、認定証を取得するための最短ルートです。

これは汎用翻訳ツールではありません。SkillBridgeは10のプレミアム言語向けに手作業でキュレーションされたAI用語辞書を搭載しており、「Prompt」が「迅速な」ではなく「プロンプト」と正確に訳されます。さらに、現在のレッスンを把握している母語AIチューターが、質問に対してスライドの内容に正確に合致した回答を日本語で返します。

🎓 日本語で完走
ページ上のすべてのテキスト要素を翻訳 — 見出し、本文、リスト、ナビゲーション、講座カード、進捗ラベル、動画字幕、コードコメントまで。進捗トラッキングや小テスト送信などのインタラクティブ要素はそのまま動作します。

🤖 母語AIチューター (Claude Sonnet 4.6)
サイドバーのチャットボットは、現在の講座とレッスンを認識しています。日本語で質問すると、現在のレッスン内容に基づいたストリーミング回答が返ります。Puter.js経由でClaudeを呼び出すため、APIキー、登録、課金は一切不要です。

🃏 講座別語彙フラッシュカード
キュレーション辞書から自動生成された講座別フラッシュカードデッキ。3段階の学習システム (New → Learning → Mastered) がローカルに保存されます。

📝 テキスト選択 → チューターに質問
レッスン上の任意のテキストを選択し、「チューターに質問」をクリックすると日本語で解説が表示されます。チューターはレッスン全体のコンテキストを認識します。

💬 会話履歴
チャプター別にグループ化された会話履歴がIndexedDBにローカル保存されます。別のセッションからでも過去のQ&Aを参照できます。

🎓 試験モードと認定セキュリティ (安心して使えるためのルール)
講座の小テストでは選択肢は絶対に翻訳されません。選択した解答が常に英語の正規回答と一致します。AIチューターも試験安全モードに切り替わります。

監督付き認定試験 (例: Claude Certified Architect) では、拡張機能が自動的に完全無効化されます — 翻訳、UI、AIチューターのすべてが動作しないため、不正行為ツールと誤認される心配がありません。

✨ 保護用語 (Protected Terms)
プレミアム言語あたり570以上のキュレーション項目。Anthropic、Claude、Cowork、Dispatch、Computer Use、Subagentなどのブランド名・技術用語が正確に保持されます。既知の誤訳は自動修正されます。新しいAcademy講座は48時間以内に用語辞書に追加されます — オープンソースのドリフトウォッチャーが機械的に強制します。

💻 コードコメント翻訳
コードブロック内のコメントのみを翻訳し、コード自体はそのまま保持。Python、JavaScript、HTML、Bashなど対応。

🎬 自動字幕
講座動画の再生時に翻訳字幕が自動的に有効化されます。手動切り替え不要。

🔍 スマート検出
初回訪問時にブラウザの言語を検出して翻訳を提案します。SPAナビゲーションも処理 — レッスンを移動してもリロードなしで新しいページが自動翻訳されます。

📡 オフライン対応
インターネット接続が切れると、SkillBridgeはキャッシュされた翻訳に切り替えてオフラインバナーを表示します。AIチューターは無言で失敗するのではなく、わかりやすいオフライン通知を表示します。

⌨️ キーボードショートカット
Ctrl+Shift+S (チューター切替)、Ctrl+Shift+F (フラッシュカード)、Ctrl+Shift+L (ダークモード)、Ctrl+Shift+/ (ヘルプ)、Escape (閉じる)、/ (チャットフォーカス)。

🌙 ダークモード · 🔄 RTL対応 · 📱 モバイル対応
Academyサイト全体にフルダークテーマ。アラビア語・ヘブライ語向けの完全な右から左へのレイアウト。サイドバーはモバイル画面に自動適応。

━━━━━━━━━━━━━━━━━━━

対応講座
現在公開されている17のAnthropic Academy講座すべて。新しい講座が追加されると48時間以内に用語辞書が更新されます (オープンソースのドリフトウォッチャーが新しいslugを検出すると自動的にissueを起票):
Claude 101 · Claude Code 101 · Claude Code in Action · Introduction to Claude Cowork · Introduction to Agent Skills · Introduction to Subagents · Building with the Claude API · Introduction to MCP · MCP: Advanced Topics · Claude with Amazon Bedrock · Claude with Google Vertex AI · AI Fluency: Framework & Foundations · AI Fluency for Students · AI Fluency for Educators · Teaching AI Fluency · AI Fluency for Nonprofits · AI Capabilities and Limitations

━━━━━━━━━━━━━━━━━━━

プレミアム言語 (キュレーション辞書 + Google Translate + AI検証):
🇰🇷 한국어 · 🇯🇵 日本語 · 🇨🇳 中文简体 · 🇹🇼 中文繁體 · 🇪🇸 Español · 🇫🇷 Français · 🇩🇪 Deutsch · 🇧🇷 Português (BR) · 🇷🇺 Русский · 🇻🇳 Tiếng Việt

標準言語 (Google Translate + AI検証):
Português (PT) · Italiano · Nederlands · Polski · Українська · Čeština · Svenska · Dansk · Suomi · Norsk · Türkçe · العربية · हिन्दी · ภาษาไทย · Bahasa Indonesia · Bahasa Melayu · Filipino · বাংলা · עברית · Română · Magyar · Ελληνικά

━━━━━━━━━━━━━━━━━━━

動作の仕組み
1. キュレーション辞書ルックアップ (570以上の項目) → 即時、完全ローカル
2. ローカルキャッシュ (IndexedDB) → 即時、デバイス内に保存
3. インラインHTMLタグ → Gemini 2.0 Flashがタグを保持したまま翻訳 (Puter.js経由)
4. プレーンテキスト → Google Translate API (~200ms)
5. AI品質検証 → Gemini 2.0 Flashが複雑な文章をバックグラウンドで再検証
6. 保護用語の自動修正 → ブランド名・技術用語を復元

SkillBridgeサーバーにはいかなるデータも保存されません。翻訳にはGoogle TranslateとPuter.jsを使用します — 詳細は下記のプライバシーポリシーをご参照ください。

━━━━━━━━━━━━━━━━━━━

🔒 プライバシーとデータ
APIキー不要。アカウント不要。デフォルト設定では分析・トラッキングなし。

SkillBridgeは独自のサーバーを一切運営していません。ただし、翻訳およびAI機能の提供のため、以下のサードパーティにデータが送信されます:

• Google Translate — ページテキストがGoogleの翻訳エンドポイントに送信されます。Googleのプライバシーポリシーが適用されます。
• Puter.js → Gemini 2.0 Flash — 複雑な文章の品質検証のため、Puter.js経由で翻訳テキストが送信されます。Puterのプライバシーポリシーが適用されます。
• Puter.js → Claude Sonnet 4.6 — AIチューター機能のため、チャットメッセージとレッスンコンテキスト (最大2,000文字) がPuter.js経由で送信されます。Puterのプライバシーポリシーが適用されます。

すべての設定、翻訳キャッシュ、会話履歴はブラウザにローカル保存されます (chrome.storage および IndexedDB)。これらのデータはデバイス外に出ません。

完全なプライバシーポリシー: https://heznpc.github.io/skillBridge/privacy.html

📖 オープンソース
https://github.com/heznpc/skillbridge
MITライセンス — コントリビューション歓迎。戦略・スコープ・「行わないこと」の方針はPOSITIONING.mdで公開されています。

⚠️ 免責事項
SkillBridgeは非公式のコミュニティプロジェクトです。Anthropicとの提携、後援、推薦関係はありません。
