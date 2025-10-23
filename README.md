
# wbs-mcp

VS Code拡張＋ローカルMCPサーバ（stdio/JSON-RPC）によるWBS（Work Breakdown Structure）管理ツール

## 概要

このVS Code拡張は、VS Code上でタスク階層・成果物・依存関係を直感的に管理できるWBSツールです。
ローカル起動型のMCPサーバとしても動作し、Github-Copilotなどのagentにて大きな作業の分解とプランニングを行ったり
Github-Copilotなどのagentにステップごとにタスクの実行と成果物の監査を行うことが出来ます。

-## 主な機能

- VS Code拡張＋ローカルMCPサーバ（stdio/JSON-RPC）
- タスク階層（親子関係）の作成・編集・ドラッグ&ドロップ移動
- 成果物（Artifacts）の登録・編集・削除
- タスクと成果物の関連付け（deliverable/prerequisite）
- タスクの依存関係管理（サイクル防止）
- Webviewによるタスク詳細編集（Ctrl+Sで保存、楽観ロック対応）
- TreeView UI（Explorerサイドバーに「WBS Projects」「Artifacts」）
- SQLiteデータベースによる永続化
- MCPツール呼び出し（Copilot等から自然言語で操作可能）


## 使い方（UI操作）

- 「WBS Projects」ビューでタスク階層を表示・編集
  - 右クリックやインラインメニューで「開く」「削除」「子タスク追加」
  - ノードのドラッグ&ドロップで親子関係を変更
- 「Artifacts」ビューで成果物の追加・編集・削除
- タスクをクリックで詳細Webview（Ctrl+Sで保存、バージョン不一致は❌で通知）

## Copilot/MCP連携例

`.vscode/mcp.json`が自動生成されるため、Copilot等のMCPクライアントからツールが自動検出されます。
応答は `result.content[0].text` にJSONまたは✅/❌付きテキストで返ります。

例:
- 「ルートに『設計』タスクを作成して」→ `wbs.createTask { title }`
- 「子タスク『画面設計』を『設計』の下に追加して」→ `wbs.createTask { title, parentId }`
- 「成果物『仕様書.md』を登録して」→ `artifacts.createArtifact { title: "仕様書.md" }`

詳細例は `docs/copilot_examples.md` を参照。

## MCPツール一覧（代表例）

- `wbs.createTask` — タスク作成（{ title, description?, parentId?, assignee?, estimate?, deliverables?, prerequisites?, completionConditions? }）
- `wbs.getTask` — タスク詳細取得（{ taskId }）
- `wbs.updateTask` — タスク更新（{ taskId, ...updates, ifVersion }）
- `wbs.listTasks` — タスク一覧取得（{ parentId? }）
- `wbs.deleteTask` — タスク削除（{ taskId }）
- `wbs.moveTask` — タスク移動（{ taskId, newParentId }）
- `wbs.impotTask` — 複数タスク一括登録（{ tasks: [...] }）
- `artifacts.listArtifacts` — 成果物一覧取得
- `artifacts.getArtifact` — 成果物詳細取得（{ artifactId }）
- `artifacts.createArtifact` — 成果物作成（{ title, uri?, description? }）
- `artifacts.updateArtifact` — 成果物更新（{ artifactId, ...updates, ifVersion }）
- `artifacts.deleteArtifact` — 成果物削除（{ artifactId }）

（ツールの詳細・引数例は `docs/architecture.md` も参照）

## データ保存

- SQLiteデータベース `./data/wbs.db` に永続化
- 保存先は `WBS_MCP_DATA_DIR` 環境変数で指定（拡張からはワークスペースルート）
- 初回起動時にスキーマは自動初期化されます。
- テーブル: tasks, artifacts, task_artifacts, task_completion_conditions, dependencies, task_history

## 開発・テスト
### 前提

- Node.js 18.x 以上（開発時は Node.js v18.20.7 を想定しています）
- VS Code 1.85.0 以上

### ソースからのビルドと主なスクリプト
以下はルートの `package.json` に定義されている主要なスクリプトです。PowerShell 環境で実行する際は、複数コマンドを連結する場合に `;` を使用してください。

- `npm install` — 依存関係をインストール
- `npm test` — ユニットテスト（Jest）を実行。実際は `npm run test:unit` にマッピングされています。
- `npm run build` — ビルド（TypeScript コンパイル、webview バンドル、ドキュメント出力、依存グラフ生成）
- `npm run build:ts` — TypeScript のビルド (`tsc -p ./`)
- `npm run build:webview` — Webview の webpack ビルド（`webpack.webview.config.js` を使用）
- `npm run watch:webview` — Webview の開発ウォッチビルド
- `npm run start-server-dev` — ローカル MCP サーバを単体で起動（出力ディレクトリの `out/mcpServer/index.js` を実行）
- `npm run start-extension-dev` — VS Code を拡張開発モードで起動
- `npm run lint` — eslint と dependency-cruiser による静的解析
- `npm run docs` — typedoc による API ドキュメント生成

例: 依存インストールしてユニットテストを実行する（PowerShell）:

```powershell
npm install ; npm run test
```

## ディレクトリ構成（主要ファイル）
```
wbs-mcp/
├── docs/
│   ├── architecture.md
│   └── copilot_examples.md
├── src/
│   ├── extension/
│   │   ├── index.ts                # VS Code extension entry point (spawn server, register views/commands)
│   │   ├── CommandRegistry.ts
│   │   ├── ExtensionController.ts
│   │   └── panels/                 # webview パネル関連
│   ├── mcpServer/                  # 子プロセスとして起動するローカル MCP サーバ実装
│   │   ├── index.ts
│   │   └── db/
│   ├── views/                      # TreeView / UI ロジック
│   │   ├── wbsTree.ts
│   │   └── artifactTree.ts
├── test/                           # Jest テスト（unit / e2e / integration）
├── __mocks__/vscode.ts             # VS Code API mock for tests
├── coverage/                       # Jest coverage reports
├── jest.config.js
├── jest.e2e.config.js
├── package.json
├── tsconfig.json
└── README.md / QUICKSTART.md

## 貢献

貢献歓迎します。Issue や Pull Request を送ってください。開発にあたっては、まず `npm install` → `npm run lint` → `npm run test` を実行してローカルで検証してください。

## ライセンス

MIT License - `LICENSE` を参照