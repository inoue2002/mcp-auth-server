# MCP Auth Server

研究室メンバー限定のMCPサーバー。Entra ID（Azure AD）を使った認証と、メンバーリストによる認可を組み合わせています。

## アーキテクチャ

```
Claude ←→ MCPサーバー（Vercel）←→ Entra ID
             │
             ▼
       研究室メンバーDB
       （JSONファイル）
```

## セットアップ

### 1. Entra ID アプリケーション登録

1. [Azure Portal](https://portal.azure.com/) > App registrations > 新規登録
2. 名前を入力（例：lab-mcp-server）
3. サポートされるアカウントの種類を選択（Single tenant 推奨）
4. リダイレクトURIを設定：`https://<your-app>.vercel.app/callback`
5. Certificates & secrets でClient Secretを作成
6. 以下の値をメモ：
   - Application (client) ID
   - Directory (tenant) ID
   - Client Secret

### 2. 環境変数の設定

Vercelで以下の環境変数を設定：

| 変数名 | 説明 |
|--------|------|
| `AZURE_CLIENT_ID` | Application (client) ID |
| `AZURE_CLIENT_SECRET` | Client Secret |
| `AZURE_TENANT_ID` | Directory (tenant) ID |
| `JWT_SECRET` | JWTの署名キー（`openssl rand -base64 32` で生成） |

### 3. メンバーリストの設定

`src/data/members.json` に研究室メンバーのメールアドレスを追加：

```json
{
  "members": [
    "tanaka@xxx.ac.jp",
    "suzuki@xxx.ac.jp"
  ]
}
```

### 4. デプロイ

```bash
npm install
vercel --prod
```

## Claude での設定

```
Server URL:     https://<your-app>.vercel.app/mcp
Authentication: OAuth 2.0
Client ID:      lab-mcp-client
```

## エンドポイント

| パス | メソッド | 説明 |
|------|----------|------|
| `/authorize` | GET | OAuth認可リクエスト受付 |
| `/callback` | GET | Entra IDからのコールバック |
| `/token` | POST | トークン発行 |
| `/mcp` | POST | MCPプロトコル |

## 利用可能なツール

### generate_image

テキストプロンプトから画像を生成します。

```json
{
  "name": "generate_image",
  "arguments": {
    "prompt": "A beautiful sunset over the ocean",
    "size": "1024x1024",
    "style": "natural"
  }
}
```

**注意**: 現在はプレースホルダー実装です。実際の画像生成APIと連携するには `src/mcp/tools/imageGen.ts` を編集してください。

## 開発

```bash
# ローカル開発
npm run dev

# ビルド
npm run build
```

## セキュリティ

- PKCE必須
- JWTによるトークン管理（アクセストークン: 1時間、リフレッシュトークン: 7日）
- メンバーリストによる認可
- HTTPS必須（Vercelがデフォルトで対応）
