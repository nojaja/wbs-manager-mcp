# Architecture Overview

## System Architecture

WBS MCP 拡張は、拡張本体とローカル MCP サーバ（stdio/JSON-RPC）の2コンポーネントで構成されます。

1. VS Code Extension — UI（TreeView/Webview）と MCP クライアント
2. Local MCP Server — 標準入出力(JSON-RPC 2.0)でツールを公開する Node.js プロセス

```
┌─────────────────────────────────────────────────────────────┐
│                      VS Code Extension                       │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ extension  │  │  WBS Tree    │  │  Task/Artifact   │   │
│  │ (activate) │→→│ Provider     │  │  Webview Panel   │   │
│  └────────────┘  └──────────────┘  └──────────────────┘   │
│        │                                                     │
│        │ spawn + stdio (JSON-RPC 2.0)                        │
│        ↓                                                     │
└────────┼─────────────────────────────────────────────────────┘
         │ child_process.spawn(process.execPath, [out/server/index.js])
         ↓
┌─────────────────────────────────────────────────────────────┐
│                 Local MCP Server (stdio JSON-RPC)            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │            Stdio MCP Server (src/server/index.ts)    │  │
│  │  methods: initialize | tools/list | tools/call ...   │  │
│  └──────────────────────────────────────────────────────┘  │
│                            │                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   Repository Layer                   │  │
│  │            (src/server/db-simple.ts)                 │  │
│  │   • SQLite (data/wbs.db)                             │  │
│  │   • CRUD/queries for tasks & artifacts               │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Component Descriptions

### VS Code Extension

#### extension.ts
- 拡張のエントリポイント（activate/deactivate）
- ローカル MCP サーバ（out/server/index.js）を child_process.spawn で起動・監視
- `.vscode/mcp.json` を作成（WBS_MCP_DATA_DIR="${workspaceFolder}" を設定し、汎用 MCP クライアントとの互換を確保）
- TreeView（WBS/Artifacts）・Webview（Task/Artifact 詳細）を登録

#### views/wbsTree.ts
- `TreeDataProvider` 実装
- ルート直下（parent_id IS NULL）のタスクリストと、各ノード直下の子タスクを `wbs.listTasks` で取得
- ノードクリックで `TaskDetailPanel` を開く、ドラッグ&ドロップで `wbs.moveTask` を呼び出し親子変更

#### panels/taskDetailPanel.ts
- タスク詳細 Webview の生成・編集フォーム（Ctrl+S で保存）
- 保存時に `wbs.updateTask` を呼び出し、`ifVersion` による楽観ロック競合を解決（競合時は再読込を促す）
- 成果物の候補は `artifacts.listArtifacts` の結果から datalist で提示

### Local MCP Server（stdio JSON-RPC）

#### server/index.ts
- 標準入出力で JSON-RPC 2.0 を処理するシンプルな MCP サーバ
- 実装メソッド例：
    - `initialize`（初期化）
    - `tools/list`（利用可能ツール一覧）
    - `tools/call`（ツール呼び出し分岐: wbs.* / artifacts.*）

#### server/db-simple.ts
- SQLite 初期化・スキーマ定義（PRAGMA foreign_keys = ON）
- `WBSRepository` に CRUD/クエリを集約
- DB ファイルは `${WBS_MCP_DATA_DIR || process.cwd()}/data/wbs.db`

（注）HTTP ルータ／SSE／セッションの実装は現行コードにはありません。

## Data Model（現行スキーマ）

### tasks
```sql
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    parent_id TEXT,  -- NULL = root
    title TEXT NOT NULL,
    description TEXT,
    assignee TEXT,
    status TEXT DEFAULT 'pending',
    estimate TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE
);
```

### artifacts
```sql
CREATE TABLE artifacts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    uri TEXT,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    UNIQUE(title)
);
```

### task_artifacts（タスクと成果物の割当）
```sql
CREATE TABLE task_artifacts (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    artifact_id TEXT NOT NULL,
    role TEXT NOT NULL,                -- 'deliverable' | 'prerequisite'
    crud_operations TEXT,              -- 'C','R','U','D' の組合せ等
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE
);
```

### task_completion_conditions（完了条件）
```sql
CREATE TABLE task_completion_conditions (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    description TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
```

### dependencies
```sql
CREATE TABLE dependencies (
    id TEXT PRIMARY KEY,
    from_task_id TEXT NOT NULL,
    to_task_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (from_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (to_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    UNIQUE(from_task_id, to_task_id)
);
```

### task_history
```sql
CREATE TABLE task_history (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    title TEXT,
    description TEXT,
    status TEXT,
    assignee TEXT,
    changed_by TEXT,
    changed_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
```

## Realtime/Event

現行実装にサーバー側のプッシュ配信（SSE/WebSocket）はありません。UI 更新はユーザー操作（保存・移動後の refresh、手動リロード）で反映します。

## Version Control（楽観ロック）

- エンティティ（tasks, artifacts）は `version` を持ちます。
- 更新時に `ifVersion` を指定し、サーバ側が一致を検証します。
- 一致: 更新成功し version をインクリメント。結果は tool の text に JSON で返却。
- 不一致: `❌ Task has been modified by another user ...` などのメッセージを返却（HTTP ステータスは存在せず、JSON-RPC 応答内テキストで表現）。

更新フロー（JSON-RPC / tools/call）:
```
Client (extension)                      Server (tools/call)
    │                                           │
    │ send: { name: 'wbs.getTask', ... }        │
    │──────────────────────────────────────────▶│
    │ ◀─────────────────────────────────────────│
    │   result.content[0].text = JSON(task)     │
    │                                           │
    │ send: { name: 'wbs.updateTask',           │
    │         arguments: { taskId, ifVersion }} │
    │──────────────────────────────────────────▶│
    │ ◀─────────────────────────────────────────│
    │   ✅ or ❌ メッセージ/JSON を含む text     │
```

## Dependency / Move Constraints

現行コードでは、タスク移動（`wbs.moveTask`）において「自分自身を親にする」「子孫配下へ移動する」といった循環を DB 側で親チェーンを遡って検出し拒否します（`Cannot move task into its descendant`）。
dependencies テーブルは存在しますが、依存関係の検証ロジックは未実装です。

## Security Considerations

1. ローカル専用: child_process + stdio 接続。ネットワークに露出しません。
2. 認証なし（ローカル開発向け）。
3. 入力検証とパラメタライズドクエリで SQL インジェクションを抑止。
4. 外部キー制約を有効化して参照整合性を担保。

将来の拡張候補:
- 認証/認可の導入、SecretStorage 利用
- 依存関係管理の厳格化・ルール化

## Performance Considerations

1. 頻出列へのインデックス検討
2. SQLite 単一接続（ローカル用途では十分）
3. ツリー構築は map を用いた O(n) で実装（`getTask`）

## Scalability Notes

現行はローカル・小中規模向け（～数千タスク目安）。
大規模化する場合:
- SQLite→RDB（PostgreSQL/MySQL 等）への移行
- 認証/認可、監査ログ
- キャッシュ導入

## MCP Integration（JSON-RPC over stdio）

- initialize / tools/list / tools/call を実装。
- 利用可能ツール例（tools/list より）:
    - wbs.createTask / wbs.getTask / wbs.updateTask / wbs.listTasks / wbs.deleteTask / wbs.moveTask / wbs.impotTask
    - artifacts.listArtifacts / artifacts.getArtifact / artifacts.createArtifact / artifacts.updateArtifact / artifacts.deleteArtifact

ツール呼び出しは `tools/call` 経由で `name` と `arguments` を渡します。結果は `result.content[0].text` に JSON 文字列またはメッセージとして返ります。

## Error Handling

クライアント（拡張）側
- 送受信のパース失敗やタイムアウトは OutputChannel に記録し、UI に通知

サーバ側
- JSON-RPC エラーは `error` に格納
- ツール結果の論理エラーは `content[0].text` に `❌` プレフィックス付きのメッセージで返却

## Testing Strategy

ユニットテスト
- リポジトリ CRUD、タスク移動の検証（循環防止）、楽観ロック

統合/E2E
- 拡張の起動・サーバ spawn・TreeView 描画・Webview 編集/保存

## Development Workflow

1. TypeScript を編集
2. `npm run build` でコンパイル
3. VS Code で F5（Extension Development Host を起動）
4. Extension 側 Output channel「MCP-WBS」でログ確認
5. サーバ側ログは stderr（同 Output に転送）

## Deployment

拡張は `.vsix` としてパッケージ可能です。

（参考）vsce でのパッケージング:
```
vsce package
```
生成された `.vsix` を VS Code にインストールするか、マーケットプレースに公開します。
