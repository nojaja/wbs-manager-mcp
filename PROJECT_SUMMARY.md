# WBS MCP Extension - Project Summary

## Overview

VS Code で WBS（Work Breakdown Structure）を管理する拡張機能です。Model Context Protocol (MCP) による GitHub Copilot 連携を備え、ローカルの MCP サーバ（stdio/JSON-RPC）と通信してタスク/成果物を操作します。

## Current Status

コア機能（タスクの作成/更新/移動/削除、成果物の作成/更新/削除、楽観ロック、ツリー UI、Webview 編集、MCP ツール公開）は実装済みです。詳細は `docs/architecture.md` を参照してください。

## Project Structure (excerpt)

```
wbs-mcp/
├── docs/
│   ├── architecture.md
│   └── copilot_examples.md
├── src/
│   ├── extension.ts                # VS Code extension entry point (spawn server, register views/commands)
│   ├── mcpClient.ts                # VS Code extension JSON-RPC client (stdio) + tool wrappers
│   ├── panels/
│   │   ├── taskDetailPanel.ts      # Task detail webview (edit/save)
│   │   └── artifactDetailPanel.ts  # Artifact detail webview
│   ├── server/
│   │   ├── index.ts                # Stdio JSON-RPC MCP server (initialize/tools.list/tools.call)
│   │   └── db-simple.ts            # SQLite repository and schema
│   └── views/
│       ├── wbsTree.ts              # WBS tree view (drag&drop move)
│       └── artifactTree.ts         # Artifact list view
├── test/                           # Jest tests (unit/integration)
├── __mocks__/vscode.ts             # VS Code API mock for tests
├── coverage/                       # Jest coverage reports
├── jest.config.js
├── package.json
├── tsconfig.json
└── README.md / QUICKSTART.md
```

## Key Features

1) Task Management
- 親子階層タスクの作成/更新/削除
- 担当者/状態/見積などの属性編集
- ツリー上のドラッグ＆ドロップで親子変更（循環はサーバ側で拒否）

2) Artifact Management
- 成果物の作成/更新/削除
- タスクへの割当（deliverable/prerequisite, CRUD指定）
- Webview でのサジェスト（datalist）

3) Version Control (Optimistic Locking)
- tasks / artifacts は version を保持
- `ifVersion` による競合検出（競合時は❌メッセージ）

4) VS Code Integration
- Explorer に WBS/Artifacts の TreeView
- タスク詳細は Webview で編集（Ctrl+S 保存）

5) MCP / Copilot
- stdio の JSON-RPC（`initialize` / `tools/list` / `tools/call`）
- 公開ツール: `wbs.*`, `artifacts.*`（一覧は docs 参照）

## Technology Stack

- Language: TypeScript
- Runtime: Node.js
- DB: SQLite（`sqlite3` + `sqlite`）
- VS Code API（拡張開発）
- Testing: Jest（カバレッジ有）

## JSON-RPC Interface (MCP over stdio)

- `initialize` … 初期化
- `tools/list` … 利用可能ツール一覧
- `tools/call` … ツール呼び出し（例: `wbs.createTask`, `wbs.updateTask`, `wbs.listTasks`, `wbs.moveTask`, `wbs.deleteTask`, `wbs.impotTask`, `artifacts.*`）

各ツールの返却は `result.content[0].text` に JSON 文字列またはメッセージが入ります（✅/❌ 表示を含む）。

## Database Schema (current)

Tables（抜粋）:
- `tasks` … 階層タスク（parent_id, status, estimate, version など）
- `artifacts` … 成果物（title, uri, description, version）
- `task_artifacts` … タスクと成果物の割当（role='deliverable'/'prerequisite', crud_operations, order_index）
- `task_completion_conditions` … 完了条件
- `dependencies` … タスク間依存（テーブルは存在、ロジックは未使用）
- `task_history` … タスク変更履歴

Notes: 外部キー制約 ON、基本操作はトランザクションで整合性を確保。

## Testing

- Jest によるユニット/統合テストを多数実装（`test/` ディレクトリ）。
- モック（`__mocks__/vscode.ts`）とカバレッジ（`coverage/`）あり。

## Documentation

- README.md / QUICKSTART.md … セットアップ・概要
- docs/architecture.md … 実装アーキテクチャ・データモデル
- docs/copilot_examples.md … MCP ツールの使い方サンプル

## Performance Characteristics

- DB: SQLite（ローカル用途、数千タスク規模を想定）
- Version Control: O(1) 版数検査
- Move Constraints: 親チェーンの遡り検査
- Tree Building: O(n)（ハッシュと配列で構築）

## Security Considerations

- child_process + stdio（ネットワーク非公開）
- パラメタライズド SQL / 外部キー制約
- 入力検証
- 認証なし（ローカル開発前提）

## Known Limitations

1. 単一プロセスのローカルサーバ（水平スケールなし）
2. SQLite（高い同時書き込みには不向き）
3. 認証/認可なし
4. SSE/WS 等のプッシュ配信なし（手動リロード/操作後更新で反映）
5. 依存関係（dependencies）の編集 UI/ツールは未提供

## Future Enhancements

- [ ] 依存関係編集・可視化（dependencies の活用）
- [ ] 認証/認可の追加
- [ ] RDB（PostgreSQL 等）対応
- [ ] ガントチャート表示
- [ ] エクスポート（MS Project など）
- [ ] リソース/リスク管理
- [ ] 競合解消支援（CRDT 等の検討）
- [ ] 指標ダッシュボード/分析
- [ ] カスタムフィールド/権限管理

## Quick Start (Windows / PowerShell)

```
# 初期化
npm install
npm run build

# 開発
code .
# VS Code で F5（Extension Development Host 起動）
# サーバは拡張起動時に自動 spawn されます（必要に応じてコマンドパレットから再起動も可）。
```

## Build and Package

```
# Build
npm run build

# Package (optional)
# vsce が導入済みの場合
vsce package
# => .vsix を生成
```

## Success Notes

✅ WBS/Artifacts UI と編集フローを実装
✅ MCP（stdio/JSON-RPC）ツール群を実装
✅ 楽観ロック・移動制約・基本 CRUD を実装
✅ Jest によるテスト/カバレッジ

## Conclusion

本プロジェクトは、VS Code 上での WBS 管理に必要な UI とサーバ機能を、MCP（stdio/JSON-RPC）でシンプルに統合しています。楽観ロックや親子移動制約、成果物割当など、日常運用に必要なコア機能を備え、Copilot からのツール呼び出しにも対応しています。

License: MIT

