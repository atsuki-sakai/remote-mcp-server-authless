# Cloudflare上で動作する認証なしリモートMCPサーバー

このサンプルは、Cloudflare Workers上に認証を必要としないリモートMCP（Model Context Protocol）サーバーをデプロイする方法を示しています。

## はじめに

[![Deploy to Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/ai/tree/main/demos/remote-mcp-authless)

これによりMCPサーバーが以下のようなURLにデプロイされます：`remote-mcp-server-authless.<your-account>.workers.dev/sse`

または、以下のコマンドラインを使用してローカルマシン上にリモートMCPサーバーを作成することもできます：
```bash
npm create cloudflare@latest -- my-mcp-server --template=cloudflare/ai/demos/remote-mcp-authless
```

## MCPサーバーのカスタマイズ

独自の[ツール](https://developers.cloudflare.com/agents/model-context-protocol/tools/)をMCPサーバーに追加するには、`src/index.ts`の`init()`メソッド内で`this.server.tool(...)`を使用して各ツールを定義します。

### 利用可能なツール

このMCPサーバーには以下のツールが含まれています：

1. **add** - 2つの数値の加算
   - パラメータ: `a: number`, `b: number`
   - 戻り値: 加算結果

2. **calculate** - 基本的な数学演算
   - パラメータ: `operation: "add"|"subtract"|"multiply"|"divide"`, `a: number`, `b: number`
   - 戻り値: 演算結果

3. **langchain_request** - FastAPI/Langchain統合
   - パラメータ: 
     - `endpoint: string` (URL形式)
     - `method: "GET"|"POST"` (デフォルト: "POST")
     - `payload: any` (オプション)
     - `headers: object` (オプション)
   - 戻り値: 外部APIレスポンス

4. **generate_blog** - ブログ生成専用ツール
   - パラメータ:
     - `fastapi_base_url: string` (FastAPIベースURL、環境変数FASTAPI_BASE_URLでも設定可能)
     - `keyword: string` (ブログキーワード、必須)
     - `language: string` (言語、デフォルト: "ja")
     - `target_audience: string` (ターゲット読者層、オプション)
     - `writing_style: string` (文体、オプション)
     - `section_count: number` (セクション数、1-10、デフォルト: 4)
     - `provider: string` (LLMプロバイダー、デフォルト: "openai")
     - `model: string` (モデル名、オプション)
     - `clarification_answers: string[]` (確認質問への回答、デフォルト: [])
     - `api_key: string` (認証キー、環境変数FASTAPI_API_KEYでも設定可能)
   - 戻り値: 整形されたブログ記事または確認質問

## Cloudflare AI Playgroundに接続

Cloudflare AI Playgroundからリモート MCPクライアントとしてMCPサーバーに接続できます：

1. https://playground.ai.cloudflare.com/ にアクセス
2. デプロイされたMCPサーバーのURL (`remote-mcp-server-authless.<your-account>.workers.dev/sse`) を入力
3. Playgroundから直接MCPツールを使用できます！

## Claude DesktopをMCPサーバーに接続

[mcp-remote proxy](https://www.npmjs.com/package/mcp-remote)を使用して、ローカルMCPクライアントからリモートMCPサーバーに接続することもできます。

Claude DesktopからMCPサーバーに接続するには、[AnthropicのQuickstart](https://modelcontextprotocol.io/quickstart/user)に従い、Claude Desktop内で Settings > Developer > Edit Config に移動します。

以下の設定で更新してください：

```json
{
  "mcpServers": {
    "calculator": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:8787/sse"  // または remote-mcp-server-authless.your-account.workers.dev/sse
      ]
    }
  }
}
```

## FastAPI/Langchain統合の使用例

### 1. `generate_blog`ツール（推奨）

```json
{
  "fastapi_base_url": "https://langchain-fastapi-1.onrender.com",
  "keyword": "機械学習",
  "language": "ja",
  "target_audience": "初心者向け",
  "writing_style": "わかりやすい",
  "section_count": 4,
  "provider": "openai",
  "model": "gpt-4"
}
```

### 2. `langchain_request`ツール（汎用）

```json
{
  "endpoint": "https://langchain-fastapi-1.onrender.com/api/v1/llm/blog/generate",
  "method": "POST",
  "payload": {
    "keyword": "機械学習",
    "language": "ja",
    "target_audience": "初心者向け",
    "writing_style": "わかりやすい",
    "section_count": 4,
    "provider": "openai",
    "model": "gpt-4",
    "clarification_answers": []
  }
}
```

## 環境変数の設定

Cloudflare Workersの環境変数で以下を設定できます：

- `FASTAPI_BASE_URL` - FastAPIサーバーのベースURL
- `FASTAPI_API_KEY` - FastAPI認証用のAPIキー

### Cloudflare Dashboard での設定方法

1. Cloudflare Dashboard → Workers & Pages
2. 該当のWorkerを選択
3. Settings → Variables
4. Environment Variables セクションで変数を追加

### wrangler.tomlでの設定例

```toml
[vars]
FASTAPI_BASE_URL = "https://langchain-fastapi-1.onrender.com"

[env.production.vars]
FASTAPI_API_KEY = "your-production-api-key"
```

環境変数が設定されている場合、`generate_blog`ツールは以下のように簡潔に使用できます：

```json
{
  "keyword": "機械学習",
  "target_audience": "初心者向け"
}
```

## 開発とデプロイ

```bash
# 依存関係のインストール
npm install

# ローカル開発サーバーの起動
npm run dev

# プロダクションにデプロイ
npm run deploy
```

## エンドポイント

- `/sse` - Server-Sent Events（ストリーミング通信）
- `/mcp` - 標準HTTPリクエスト/レスポンス通信 
