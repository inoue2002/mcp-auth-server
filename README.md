# MCP Auth Server

> このリポジトリは [MCP Authorization Specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization) を参考に、MCPにOAuth 2.0認証を実装した練習リポジトリです。

研究室メンバー限定のMCPサーバー。Entra ID（Azure AD）を使った認証と、メンバーリストによる認可を組み合わせています。

## アーキテクチャ

```
Claude ←→ MCPサーバー（Vercel）←→ Entra ID
             │
             ▼
       研究室メンバーDB
       （JSONファイル）
```

## 認証フロー

このリポジトリは MCP Authorization Specification の **Third-Party Authorization Flow** を実装しています。MCPサーバーが Claude に対しては認可サーバーとして、Entra ID に対してはOAuthクライアントとして動作します。

### 全体フロー

```mermaid
sequenceDiagram
    participant B as Browser
    participant C as Claude (MCP Client)
    participant M as MCP Server (Vercel)
    participant E as Entra ID

    Note over C,M: 1. メタデータ取得
    C->>M: GET /.well-known/oauth-authorization-server
    M->>C: メタデータ (endpoints, supported features)

    Note over C,M: 2. Dynamic Client Registration
    C->>M: POST /register
    M->>C: client_id発行

    Note over C,M: 3. 認可リクエスト開始
    C->>M: GET /authorize (client_id, redirect_uri, code_challenge, state)

    Note over M,E: 4. Entra IDへリダイレクト
    M->>B: Redirect to Entra ID /authorize
    B->>E: 認可リクエスト

    Note over E: 5. ユーザーがログイン・認可
    E->>B: Redirect to MCP Server /callback
    B->>M: Authorization code (from Entra ID)

    Note over M,E: 6. Entra IDトークン取得
    M->>E: POST /token (code, client_secret)
    E->>M: Access token + ID token

    Note over M: 7. ユーザー検証 & MCPトークン発行
    M->>B: Redirect to Claude callback with MCP auth code
    B->>C: MCP Authorization code

    Note over C,M: 8. トークン交換
    C->>M: POST /token (code, code_verifier)
    M->>C: MCP Access token + Refresh token

    Note over C,M: 9. MCP通信開始
    C->>M: MCP Request with Bearer token
    M->>C: MCP Response
```

### メタデータ取得フロー

```mermaid
flowchart TD
    A["Claude: MCPサーバーに接続"] --> B{"メタデータ取得"}
    B -->|"メタデータ取得"| C["メタデータ取得成功"]
    B -->|"404"| D["デフォルトエンドポイント使用"]

    C --> E{"registration_endpoint あり?"}
    D --> E

    E -->|"Yes"| F["Dynamic Client Registration"]
    E -->|"No"| G["手動で client_id 設定が必要"]

    F --> H["OAuth認可フロー開始"]
    G --> H

    H --> I["PKCE code_verifier, code_challenge 生成"]
    I --> J["authorize へリダイレクト"]
```

### PKCE (Proof Key for Code Exchange)

```mermaid
sequenceDiagram
    participant C as Claude
    participant M as MCP Server

    Note over C: code_verifier をランダム生成
    Note over C: code_challenge = SHA256(code_verifier)

    C->>M: /authorize?code_challenge=xxx&code_challenge_method=S256
    Note over M: code_challenge を保存

    M->>C: Authorization code

    C->>M: /token?code=xxx&code_verifier=yyy
    Note over M: SHA256(code_verifier) == 保存した code_challenge ?

    alt 検証成功
        M->>C: Access token
    else 検証失敗
        M->>C: Error: invalid_grant
    end
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

Vercelで以下の環境変数を設定（`.env.sample` 参照）：

| 変数名 | 説明 |
|--------|------|
| `AZURE_CLIENT_ID` | Application (client) ID |
| `AZURE_CLIENT_SECRET` | Client Secret |
| `AZURE_TENANT_ID` | Directory (tenant) ID |
| `JWT_SECRET` | JWTの署名キー（`openssl rand -base64 32` で生成） |
| `ALLOWED_MEMBERS` | 許可するメンバーのメールアドレス（カンマ区切り） |

例：
```bash
ALLOWED_MEMBERS=tanaka@xxx.ac.jp,suzuki@xxx.ac.jp,yamada@xxx.ac.jp
```

**注意**: `ALLOWED_MEMBERS` が未設定の場合、全ユーザーがアクセス可能になります（テスト用）。

### メンバーの追加・削除

メンバーを追加・削除するには、Vercelの環境変数 `ALLOWED_MEMBERS` を更新します。

**CLIで更新する場合：**

```bash
# 既存の環境変数を削除
npx vercel env rm ALLOWED_MEMBERS production -y

# 新しいメンバーリストを追加（カンマ区切り）
echo -n "member1@example.ac.jp,member2@example.ac.jp,newmember@example.ac.jp" | npx vercel env add ALLOWED_MEMBERS production

# 再デプロイ
npx vercel --prod
```

**ダッシュボードで更新する場合：**

1. [Vercel Dashboard](https://vercel.com) → プロジェクト → Settings → Environment Variables
2. `ALLOWED_MEMBERS` を編集
3. Deployments → 最新のデプロイを Redeploy

### 未登録ユーザーがログインした場合

`ALLOWED_MEMBERS` に登録されていないメールアドレスでログインすると、以下のエラーが表示されます：

```json
{
  "error": "access_denied",
  "error_description": "You are not a member of this lab"
}
```

### 3. デプロイ

```bash
npm install
vercel --prod
```

## Claude での設定

### Claude Code (CLI)

以下のコマンドでMCPサーバーを追加：

```bash
claude mcp add --transport http lab-mcp https://mcp-auth-server.vercel.app/api/mcp
```

追加後、`/mcp` コマンドで認証を開始できます。初回はEntra IDのログイン画面が表示されます。

### Claude.ai (Web)

Claude.aiの設定画面からMCPサーバーを追加：

```
Server URL:     https://mcp-auth-server.vercel.app/api/mcp
Authentication: OAuth 2.0
```

※ Dynamic Client Registrationに対応しているため、Client IDは自動で発行されます。

## エンドポイント

| パス | メソッド | 説明 |
|------|----------|------|
| `/.well-known/oauth-authorization-server` | GET | OAuth メタデータ |
| `/.well-known/oauth-protected-resource` | GET | Protected Resource メタデータ |
| `/register` | POST | Dynamic Client Registration |
| `/authorize` | GET | OAuth認可リクエスト受付 |
| `/callback` | GET | Entra IDからのコールバック |
| `/token` | POST | トークン発行 |
| `/api/mcp` | GET/POST | MCPプロトコル |

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
