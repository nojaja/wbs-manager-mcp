# GitHub Copilot Integration Examples

WBS MCP 拡張で利用できる MCP ツール（stdio JSON-RPC）のプロンプト例と、Copilot からの期待ツール呼び出しの例を示します。

## MCP ツール一覧（抜粋）

- wbs.createTask
- wbs.getTask
- wbs.updateTask
- wbs.listTasks
- wbs.deleteTask
- wbs.moveTask
- wbs.impotTask（複数タスク一括登録）
- artifacts.listArtifacts
- artifacts.getArtifact
- artifacts.createArtifact
- artifacts.updateArtifact
- artifacts.deleteArtifact

拡張は JSON-RPC の `tools/list` に対応しており、Copilot はこれを介してツール情報を取得します。実際の呼び出しは `tools/call` で行われ、結果テキストは `result.content[0].text` に含まれます。

## 代表的なツールの使い方

### 1) wbs.createTask（タスク作成）

例: 「ルート直下に 'Implement login' を3日（3d）見積で作って、担当は @taro」

期待される呼び出し:
```json
{
  "tool": "wbs.createTask",
  "parameters": {
    "title": "Implement login",
    "assignee": "taro",
    "estimate": "3d",
    "parentId": null
  }
}
```

サーバ応答（text 内の JSON）:
```json
{
  "id": "uuid-v4",
  "parent_id": null,
  "title": "Implement login",
  "status": "pending",
  "version": 1,
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601"
}
```

サブタスク例: 「タスク X の配下に 'Design database schema'（2d, @backend）」
```json
{
  "tool": "wbs.createTask",
  "parameters": {
    "title": "Design database schema",
    "assignee": "backend",
    "estimate": "2d",
    "parentId": "<task-X>"
  }
}
```

### 2) wbs.updateTask（タスク更新/楽観ロック）

例: 「タスク X を in-progress に変更」
```json
{
  "tool": "wbs.updateTask",
  "parameters": {
    "taskId": "<task-X>",
    "status": "in-progress",
    "ifVersion": 1
  }
}
```

応答テキスト（成功）:
```
✅ Task updated successfully!\n\n{ ...updatedTask json... }
```

応答テキスト（競合例）:
```
❌ Task has been modified by another user. Expected version 1, but current version is 2
```

### 3) wbs.listTasks（子タスク一覧）

ルート直下を取得:
```json
{ "tool": "wbs.listTasks", "parameters": { "parentId": null } }
```
特定タスク直下を取得:
```json
{ "tool": "wbs.listTasks", "parameters": { "parentId": "<task-id>" } }
```

返却は text に JSON 配列（各要素に childCount, deliverables, prerequisites, completionConditions を含む）。

### 4) wbs.moveTask（親子付け替え）

例: 「タスク A をタスク B の配下へ」
```json
{
  "tool": "wbs.moveTask",
  "parameters": { "taskId": "A", "newParentId": "B" }
}
```
応答（成功）:
```
✅ Task moved successfully!\n\n{ ...updatedTask json... }
```
循環検出（子孫配下への移動）:
```
❌ Failed to move task: Cannot move task into its descendant
```

### 5) 成果物関連（artifacts.*）

- 一覧: `{ "tool": "artifacts.listArtifacts", "parameters": {} }`
- 詳細: `{ "tool": "artifacts.getArtifact", "parameters": { "artifactId": "..." } }`
- 作成: `{ "tool": "artifacts.createArtifact", "parameters": { "title": "Spec Doc", "uri": "src/specs/design.md" } }`
- 更新（楽観ロック）: `{ "tool": "artifacts.updateArtifact", "parameters": { "artifactId": "...", "title": "Spec v2", "ifVersion": 3 } }`
- 削除: `{ "tool": "artifacts.deleteArtifact", "parameters": { "artifactId": "..." } }`

Webview のタスク編集では、`deliverables`/`prerequisites` を artifactId[:CRUD] の改行列挙で入力できます。拡張はタイトル→IDの補完も行います。

## 複合ワークフロー例

### 例1: タスク構造の作成

プロンプト:
```
ルート直下に "Design phase (3d)" を作り、その配下に "UI/UX mockups (2d, @designer)" と "Database schema (1d, @backend)" を作成
```
期待シーケンス（概念）:
1. `wbs.createTask`（Design phase, parentId=null）
2. `wbs.createTask`（UI/UX mockups, parentId=1の戻り値）
3. `wbs.createTask`（Database schema, parentId=1の戻り値）

### 例2: 一括インポート

プロンプト:
```
次の一覧をタスクとして取り込んで。トップレベル: "Setup", 子: "Install Node.js", "Initialize repo"
```
期待呼び出し:
```json
{
  "tool": "wbs.impotTask",
  "parameters": {
    "tasks": [
      { "title": "Setup" },
      { "title": "Install Node.js", "parentId": "<id-of-Setup>" },
      { "title": "Initialize repo", "parentId": "<id-of-Setup>" }
    ]
  }
}
```

## ベストプラクティス（Copilot 連携）

1. 更新系は `ifVersion` を付けて競合を防ぐ
2. 競合時は最新取得→再編集を促す（UI では自動でリロードを案内）
3. 時間見積は "3d", "5h", "2w" のような簡潔表現
4. 成果物は必要に応じて CRUD を付与（例: `spec-doc:UD`）

## 動作確認のヒント

- 本拡張は stdio（JSON-RPC）でサーバと接続するため、HTTP の curl 検証は不要です。
- 拡張を起動（F5）し、エクスプローラの WBS/Artifacts ビューから作成・編集・削除を行ってください。
- ログは Output チャネル「MCP-WBS」に出力されます。

PowerShell 環境メモ（開発用）:
- 複数コマンドは `;` 区切り（`&&` は使用しない）
- `curl` ではなく `Invoke-WebRequest` を使用（ただし本拡張の検証に HTTP は不要）

トラブルシューティング（抜粋）:
- ツールが見えない: 拡張起動直後はサーバ初期化に少し時間がかかります。`MCP-WBS` のログを確認してください。
- 保存できない: 競合メッセージ（❌）の際は再読込→再編集してください。
