# wbs-mcp

MCP対応のVS Code拡張のWBS作成ツール

## 概要

この拡張は、VS CodeからWBS（Work Breakdown Structure）を作成・編集・共有するためのツールです。
主な特徴として、拡張ホストから起動されるローカルサーバ（サーバプロセスとはstdio経由のJSON-RPCで通信）、TreeViewによるプロジェクト/タスクの可視化、タスク詳細用のWebviewパネル、依存関係管理などを提供します。

## 主な変更点（最近のコミットより）

- WBSツリーで子タスクをドラッグ&ドロップによる移動（親の付け替え）に対応しました（2025-10-09）。
- タスクのコンテキストメニューに「開く」「削除」「子タスク追加」を実装しました（2025-10-09）。
- エクスプローラに「新しいタスク」ボタンを追加しました（2025-10-09）。
- プロジェクト削除機能を実装しました（2025-10-09）。
- WBSツリーのタスクノードをクリックするとタスク詳細が開くようになりました（2025-10-09）。
- サーバ実装を Express/HTTP ベースから、拡張ホストが子プロセスとして起動する stdio 経由の JSON-RPC に移行しました（2025-10-09）。これにより拡張とサーバ間の通信方式が変更されています。

## Features

- ローカル MCP サーバ（拡張が子プロセスとして起動し、stdio 上で JSON-RPC により通信）
- プロジェクト管理（複数プロジェクトの作成・削除）
- タスク階層（親子関係）の作成・編集・ドラッグ&ドロップでの親付け替え
- リアルタイム更新（開発用に SSE 等を使う実装箇所あり）
- 楽観的ロックによるバージョン管理（競合防止）
- 依存関係管理（サイクル検出等）
- TreeView UI（Explorer サイドバーに `WBS Projects`）
- Webview によるタスク詳細編集パネル

## インストール & セットアップ

### 前提

- Node.js 18.x 以上（開発時は Node.js v18.20.7 を想定しています）
- VS Code 1.85.0 以上

### ソースからのビルド

1. リポジトリをクローン:
  ```powershell
  git clone https://github.com/nojaja/wbs-mcp.git ; cd wbs-mcp
  ```

2. 依存関係をインストール:
  ```powershell
  npm install
  ```

3. ビルド:
  ```powershell
  npm run build
  ```

4. 開発用に VS Code で開く:
  ```powershell
  code .
  ```

5. F5 で Extension Development Host を起動

## 使い方（概要）

### ローカル MCP サーバの起動

- 通常は拡張内のコマンド `MCP WBS: Start Local Server` を使うと、拡張がサーバプロセスを子プロセスとして起動し、stdio を使って JSON-RPC ベースで通信します（HTTP ポートで待ち受けない構成になっているため、従来の HTTP ベースの `/mcp/discover` 等のエンドポイントは内部実装として移行しています）。
- 開発やデバッグ目的で HTTP モードのサーバを手動で起動できる場合があります（`npm run start-server-dev` が利用可能で、`out/server/index.js` を直接起動します）。

### TreeView の利用

- サイドバーに `WBS Projects` ビューが表示されます。
- リフレッシュアイコンでプロジェクト・タスクを再読み込みできます。
- タスクノードのクリックやコンテキストメニュー（「開く」「削除」「子タスク追加」）で操作できます。
- エクスプローラのタイトル部分には「新しいタスク」ボタンが追加されています。

### 注意: API / MCP 発見

- 以前はローカルサーバが HTTP で MCP 発見（/mcp/discover）を提供していましたが、2025-10-09 の変更により拡張は子プロセスと stdio/JSON-RPC で直接通信するようになっています。外部 MCP クライアントからの HTTP 発見が必要な場合は、開発用の HTTP モード（`npm run start-server-dev`）を利用してください。

## MCP Integration

本拡張は標準モードとして、拡張ホストからサーバープロセスを子プロセスとして起動し、stdio 上で JSON-RPC による双方向通信を行います。

- 標準モードの特徴:
  - 拡張（VS Code 側）がサーバープロセスを管理・起動します。
  - 拡張とサーバーは標準入出力（stdin/stdout）を使って JSON-RPC メッセージをやり取りします。
  - この構成では拡張内部の機能は VS Code の UI（コマンド、TreeView、Webview）経由で利用されます。
  - 外部からの HTTP ベースの自動発見（/mcp/discover）や直接 HTTP リクエストによる呼び出しは、標準モードの運用下では想定されていません。

この章では標準モードの利用を前提とした説明を行っています。外部ツールとの連携方法や別の起動モードが必要な場合は、別途運用ガイドを参照してください。

## Available MCP Tools

以下は本プロジェクトが提供する MCP ツール（代表的なもの）です。ツール名・入力/出力は実装やサーバの起動モードによって変わる可能性があります。

- `wbs.createProject` — 新しいプロジェクトを作成します。入力: { title, description }。出力: 作成された project オブジェクト。
- `wbs.listProjects` — 既存プロジェクトの一覧を返します。出力: project[]。
- `wbs.getProject` — プロジェクトIDを指定して、タスクツリーを含むプロジェクト情報を取得します。入力: { projectId }。出力: project (with tasks)。
- `wbs.createTask` — タスクを作成します。入力: { projectId, parentId?, title, assignee?, estimate? }。出力: 作成された task オブジェクト。
- `wbs.updateTask` — タスクを更新します（バージョンチェック/楽観ロック対応）。入力: { taskId, updates, version }。
- `wbs.deleteTask` — タスクを削除します。入力: { taskId }。
- `wbs.addDependency` — タスク間の依存を追加します。入力: { fromTaskId, toTaskId }。
- `wbs.removeDependency` — 依存関係を削除します。入力: { dependencyId }。
- `wbs.deleteProject` — プロジェクトごと削除します（注意: データ損失）。入力: { projectId }。
- `wbs.openTask` — 指定したタスクを拡張内で開き、詳細パネルを表示します（主に拡張内操作用）。入力: { taskId }。

ツールは、拡張の起動モード（stdio/JSON-RPC か HTTP）やバージョンによって追加・変更されることがあります。外部から自動発見する場合は、HTTP モードでサーバを起動し、`.vscode/mcp.json` を用意してください。

## データ保存

- SQLite データベースを `./data/wbs.db` に格納します。
- テーブル: projects, tasks, dependencies, sessions, task_history 等
- 初回起動時にスキーマは自動初期化されます。

## 開発

### 利用可能なスクリプト（package.json より）

- `npm run build` - TypeScript をコンパイル（テスト・lint を含む）
- `npm run watch` - 開発用のウォッチビルド（tsc -w）
- `npm run start-server-dev` - サーバを独立起動（開発・デバッグ用：`out/server/index.js` を直接起動）
- `npm run start-extension-dev` - 拡張の開発用起動補助（VS Code の拡張開発ディレクトリ指定コマンド）
- `npm test` - lint と jest によるテスト実行（カバレッジ出力あり）

### アーキテクチャ（概略）

```
src/
├── extension.ts          # VS Code extension entry point
├── mcpClient.ts          # 拡張側の MCP/JSON-RPC クライアント実装
├── views/
│   └── wbsTree.ts       # TreeView データプロバイダ
├── panels/
│   └── taskDetailPanel.ts  # Webview for task editing
└── server/
   ├── index.ts         # サーバ本体（開発用 HTTP モードや stdio JSON-RPC 実装を含む）
   ├── db-simple.ts     # SQLite 初期化等
   ├── repository.ts    # データアクセス層
   ├── api.ts           # REST/HTTP API（開発用に残存する場合あり）
   └── stream.ts        # SSE などイベント配信の実装（開発用）
```

## 貢献

貢献歓迎です。Issue や Pull Request を送ってください。

## ライセンス

MIT License - `LICENSE` を参照

