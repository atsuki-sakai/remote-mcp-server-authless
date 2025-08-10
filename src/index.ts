// Cloudflare Workers 上で動作する MCP サーバーのランタイム
// このファイルは認証なしのModel Context Protocol (MCP) サーバーをCloudflare Workers上に設定します
// MCPはAIアシスタントが安全に外部ツールやリソースにアクセスすることを可能にします

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod"; // ランタイム型検証とスキーマ定義のためのZod

/**
 * MyMCP は McpAgent を拡張してカスタムMCPサーバーを作成します
 * このサーバーは計算ツールを提供し、追加機能で拡張することができます
 */
export class MyMCP extends McpAgent {
	// メタデータを含むMCPサーバーの初期化
	server = new McpServer({
		name: "Authless Calculator", // クライアントに表示されるサーバー名
		version: "1.0.0", // 互換性のためのセマンティックバージョン
	});

	/**
	 * すべてのMCPツールを初期化
	 * サーバー起動時に利用可能なツールを登録するために呼び出されます
	 */
	async init() {
		// ツール1: シンプルな足し算
		// 2つの数値を受け取り、その合計を返します
		this.server.tool("add", { a: z.number(), b: z.number() }, async ({ a, b }) => ({
			content: [{ type: "text", text: String(a + b) }],
		}));

		// ツール2: 多機能計算機
		// 加算、減算、乗算、除算の演算をサポートします
		this.server.tool(
			"calculate",
			{
				operation: z.enum(["add", "subtract", "multiply", "divide"]), // これらの演算に制限
				a: z.number(), // 第一オペランド
				b: z.number(), // 第二オペランド
			},
			async ({ operation, a, b }) => {
				let result: number;
				
				// 演算タイプに基づいて計算を実行
				switch (operation) {
					case "add":
						result = a + b;
						break;
					case "subtract":
						result = a - b;
						break;
					case "multiply":
						result = a * b;
						break;
					case "divide":
						// ゼロ除算エラーの処理
						if (b === 0)
							return {
								content: [
									{
										type: "text",
										text: "エラー: ゼロで割ることはできません",
									},
								],
							};
						result = a / b;
						break;
				}
				
				// MCP形式のレスポンスとして結果を返す
				return { content: [{ type: "text", text: String(result) }] };
			},
		);

		// ツール3: FastAPI/Langchain統合
		// Langchainを実行する外部のFastAPIサーバーにリクエストを送信します
		this.server.tool(
			"langchain_request",
			{
				endpoint: z.string().url(), // FastAPIサーバーのURL
				method: z.enum(["GET", "POST"]).default("POST"), // HTTPメソッド
				payload: z.any().optional(), // リクエストペイロード（オプション）
				headers: z.record(z.string()).optional(), // 追加ヘッダー（オプション）
			},
			async ({ endpoint, method, payload, headers }) => {
				try {
					// リクエスト設定の準備
					const requestConfig: RequestInit = {
						method: method,
						headers: {
							'Content-Type': 'application/json',
							...headers, // 追加ヘッダーをマージ
						},
					};

					// POSTリクエストの場合はペイロードを追加
					if (method === "POST" && payload) {
						requestConfig.body = JSON.stringify(payload);
					}

					// FastAPIサーバーにHTTPリクエストを送信
					const response = await fetch(endpoint, requestConfig);
					
					// 失敗レスポンスの処理
					if (!response.ok) {
						return {
							content: [
								{
									type: "text",
									text: `エラー: HTTP ${response.status} - ${response.statusText}`,
								},
							],
						};
					}

					// JSONレスポンスを解析して返す
					const data = await response.json();
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(data, null, 2), // JSONレスポンスを見やすくフォーマット
							},
						],
					};
				} catch (error) {
					// ネットワークエラーや解析エラーの処理
					return {
						content: [
							{
								type: "text",
								text: `エラー: ${error instanceof Error ? error.message : '不明なエラーが発生しました'}`,
							},
						],
					};
				}
			},
		);

		// ツール4: ブログ生成専用ツール
		// FastAPI/Langchainのブログ生成エンドポイントに特化したツール
		this.server.tool(
			"generate_blog",
			{
				fastapi_base_url: z.string().url().optional(), // FastAPIサーバーのベースURL（環境変数から取得可能）
				keyword: z.string().min(1), // ブログのキーワード（必須）
				language: z.string().default("ja"), // 言語（デフォルト: 日本語）
				target_audience: z.string().optional(), // ターゲット読者層
				writing_style: z.string().optional(), // 文体・スタイル
				section_count: z.number().min(1).max(10).default(4), // セクション数（1-10、デフォルト: 4）
				provider: z.string().default("openrouter"), // LLMプロバイダー
				model: z.string().optional(), // 使用するモデル
				clarification_answers: z.array(z.string()).default([]), // 確認質問への回答
				api_key: z.string().optional(), // FastAPI認証用APIキー（環境変数から取得可能）
			},
			async ({ 
				fastapi_base_url, 
				keyword, 
				language, 
				target_audience, 
				writing_style, 
				section_count, 
				provider, 
				model, 
				clarification_answers,
				api_key 
			}, extra: any = {}) => {
				const env = extra?.env;
				try {
					// 環境変数から設定を取得（パラメータが未指定の場合）
					const baseUrl = fastapi_base_url || env?.FASTAPI_BASE_URL;
					const authKey = api_key || env?.FASTAPI_API_KEY;
					
					// ベースURLが設定されていない場合はエラー
					if (!baseUrl) {
						return {
							content: [
								{
									type: "text",
									text: "エラー: FastAPIサーバーのベースURLが指定されていません。\nfastapi_base_urlパラメータまたはFASTAPI_BASE_URL環境変数を設定してください。",
								},
							],
						};
					}

					// エンドポイントURLを構築
					const endpoint = `${baseUrl.replace(/\/$/, '')}/api/v1/llm/blog/generate`;
					
					// リクエストペイロードを構築
					const payload = {
						keyword,
						language,
						target_audience: target_audience || undefined,
						writing_style: writing_style || undefined,
						section_count,
						provider,
						model: model || undefined,
						clarification_answers,
					};

					// ヘッダーを準備（APIキーがある場合は追加）
					const headers: Record<string, string> = {
						'Content-Type': 'application/json',
					};
					if (authKey) {
						headers['Authorization'] = `Bearer ${authKey}`;
					}

					// FastAPIサーバーにリクエストを送信
					const response = await fetch(endpoint, {
						method: 'POST',
						headers,
						body: JSON.stringify(payload),
					});

					// HTTPエラーレスポンスの処理
					if (!response.ok) {
						let errorMessage = `HTTP ${response.status} - ${response.statusText}`;
						try {
							const errorData = await response.json() as any;
							if (errorData?.detail) {
								errorMessage += `\n詳細: ${JSON.stringify(errorData.detail, null, 2)}`;
							}
						} catch {
							// JSONパースエラーは無視してデフォルトメッセージを使用
						}
						
						return {
							content: [
								{
									type: "text",
									text: `ブログ生成エラー: ${errorMessage}`,
								},
							],
						};
					}

					// 成功レスポンスを解析
					const result = await response.json() as any;
					
					// レスポンス形式に応じて結果を整形
					if (result?.success && result?.data) {
						const data = result.data;
						let output = `✅ ブログ生成完了\n\n`;

						// 確認質問がある場合
						if (data.need_clarification && data.questions?.length > 0) {
							output += `❓ 確認が必要です:\n`;
							data.questions.forEach((question: string, index: number) => {
								output += `${index + 1}. ${question}\n`;
							});
							output += `\n確認質問に回答後、clarification_answersパラメータで再実行してください。\n`;
						} else {
							// 完成したブログ記事
							if (data.title) {
								output += `📝 タイトル: ${data.title}\n\n`;
							}
							
							if (data.outline?.length > 0) {
								output += `📋 アウトライン:\n`;
								data.outline.forEach((item: string, index: number) => {
									output += `${index + 1}. ${item}\n`;
								});
								output += `\n`;
							}

							if (data.final_article) {
								output += `📄 完成記事:\n\n${data.final_article}`;
							} else if (data.sections?.length > 0) {
								output += `📄 各セクション:\n\n`;
								data.sections.forEach((section: { title: string; content: string }) => {
									output += `## ${section.title}\n\n${section.content}\n\n`;
								});
							}
						}

						return {
							content: [
								{
									type: "text",
									text: output,
								},
							],
						};
					} else {
						// 予期しないレスポンス形式
						return {
							content: [
								{
									type: "text",
									text: `予期しないレスポンス形式:\n${JSON.stringify(result, null, 2)}`,
								},
							],
						};
					}

				} catch (error) {
					// ネットワークエラーやその他の例外処理
					return {
						content: [
							{
								type: "text",
								text: `ブログ生成中にエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`,
							},
						],
					};
				}
			},
		);
	}
}

/**
 * Cloudflare Workersのメインエントリーポイント
 * リクエストをルーティングし、適切なMCPエンドポイントに転送します
 */
export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		// Server-Sent Events (SSE) エンドポイント
		// リアルタイム通信用のストリーミング接続を提供
		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		// 標準MCPエンドポイント
		// HTTP POST/GET リクエスト用の通常のMCP通信
		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		// 未知のパスの場合は404エラーを返す
		return new Response("Not found", { status: 404 });
	},
};
