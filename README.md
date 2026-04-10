# Moulin-R 美容カウンセラー Rena チャットボット

ムーランRの美容カウンセラーAI「Rena（レナ）」のチャットボットです。

---

## 📁 ファイル構成

```
moulin-r-netlify/
├── netlify.toml              ← Netlifyの設定ファイル
├── public/
│   └── index.html            ← チャットボットのページ
├── netlify/
│   └── functions/
│       └── chat.js           ← APIキーを安全に管理するサーバー機能
└── README.md                 ← このファイル
```

---

## 🚀 公開手順（ステップバイステップ）

### ステップ1：GitHubにコードをアップロード

1. GitHub（https://github.com）にログイン
2. 右上の「+」→「New repository」をクリック
3. Repository name に `moulin-r-chatbot` と入力
4. 「Create repository」をクリック
5. このフォルダの全ファイルをアップロード
   - 「uploading an existing file」をクリック
   - フォルダ内のファイルをすべてドラッグ＆ドロップ
   - 「Commit changes」をクリック

**重要：** フォルダ構成を維持してください（netlify.toml はルート、index.html は public/ 内）

### ステップ2：Netlifyに登録＆連携

1. Netlify（https://app.netlify.com）にアクセス
2. 「Sign up」→「GitHub」でログイン
3. 「Add new site」→「Import an existing project」
4. 「GitHub」を選択
5. 先ほど作った `moulin-r-chatbot` リポジトリを選択
6. 設定はそのままで「Deploy site」をクリック

### ステップ3：APIキーを設定（最重要！）

1. Netlifyの管理画面でサイトを選択
2. 「Site configuration」→「Environment variables」
3. 「Add a variable」をクリック
4. Key に `ANTHROPIC_API_KEY` と入力
5. Value にAnthropicのAPIキーを貼り付け
6. 「Save」をクリック
7. 「Deploys」タブ→「Trigger deploy」→「Deploy site」で再デプロイ

### ステップ4：確認

- Netlifyが自動で発行するURL（例：`https://your-site-name.netlify.app`）にアクセス
- チャットボットが表示されれば成功です！

---

## 🌐 独自ドメインの設定（任意）

1. Netlify管理画面→「Domain management」
2. 「Add a custom domain」
3. お持ちのドメイン名を入力
4. DNSの設定を指示通りに変更

---

## 💰 費用の目安

- **Netlify**: 無料（月125,000リクエストまで）
- **Anthropic API**: 従量課金（1回の会話あたり約2〜10円）
- 小規模サロンの集客用途なら月数百〜数千円程度

---

## ⚠️ 注意事項

- APIキーは絶対にHTMLファイルに直接書かないでください
- APIキーはNetlifyの環境変数で安全に管理されます
- 利用量が増えた場合、Anthropicの管理画面で上限設定をおすすめします

---

## 📞 お問い合わせ

設定でお困りの場合は、お気軽にご相談ください。
