  # Quick Start Guide

  最短5分でWBS MCPを動かすための手順です。現在の実装（VS Code拡張 + stdio/JSON-RPC MCP サーバ）に基づいて更新済みです。

  ## インストール

  ```powershell
  # リポジトリを取得
  git clone https://github.com/nojaja/wbs-mcp.git ; cd wbs-mcp

  # 依存をインストール
  npm install

  # ビルド（TypeScript → out/）
  npm run build
  ```

  ## 立ち上げ（推奨: VS Code拡張から）

  1) VS Codeでフォルダを開く
  ```powershell
  code .
  ```

  2) F5でExtension Development Hostを起動

  3) 立ち上がったVS Codeウィンドウでコマンドパレットを開く（Ctrl+Shift+P）→「MCP WBS: Start Local Server」を実行

  4) 出力ウィンドウ（表示 → 出力 → 「MCP-WBS」）で「MCP client connected successfully」などのログを確認

  この手順により、拡張がローカルMCPサーバ（`out/server/index.js`）を子プロセスとしてspawnし、stdio経由でJSON-RPC通信を開始します。併せて `.vscode/mcp.json` が作成され、次のようにstdio型で設定されます（`src/extension.ts`の`createMcpConfig`参照）。

  ```json
  {
    "servers": {
      "wbs-mcp": {
        "command": "${execPath}",
        "args": ["${workspaceFolder}/out/server/index.js"],
        "type": "stdio",
        "env": {
          "WBS_MCP_DATA_DIR": "${workspaceFolder}"
        }
      }
    }
  }
  ```

  補足: 開発・デバッグ目的でサーバ単体を起動するスクリプト（`npm run start-server-dev`）もありますが、現在の標準運用は「拡張→stdio/JSON-RPC」であり、HTTPでの待受は前提としていません。

  ## UIの使い方（VS Code内）

  - エクスプローラに「WBS Projects」「Artifacts」ビューが表示されます。
  - 「WBS Projects」
    - リフレッシュ（タイトルバーの再読み込み）でタスク一覧を取得（`wbs.listTasks`）。
    - 右クリックまたはインラインの「開く/削除/子タスク追加」で操作。
    - ノードのドラッグ&ドロップで親子関係を変更（`wbs.moveTask`）。
  - 「Artifacts」
    - 追加/編集/削除が可能（`artifacts.*`ツール）。
  - タスクをクリックすると詳細Webviewが開き、Ctrl+Sで保存（`wbs.updateTask` with ifVersion）。楽観ロック不一致の場合は❌メッセージで通知されます。

  ## Copilotで使う（MCP連携）

  上記の起動で`.vscode/mcp.json`が用意されるため、Copilot等のMCPクライアントからツールが自動検出されます。応答は `result.content[0].text` にJSONまたは✅/❌付きテキストで返ります。

  例:
  - 「ルートに『設計』タスクを作成して」→ `wbs.createTask { title }`
  - 「子タスク『画面設計』を『設計』の下に追加して」→ `wbs.createTask { title, parentId }`
  - 「成果物『仕様書.md』を登録して」→ `artifacts.createArtifact { title: "仕様書.md" }`

  より多くの例は `docs/copilot_examples.md` を参照してください。

  ## データ保存先

  - SQLiteデータベースは `./data/wbs.db` に保存されます。
  - 保存先は環境変数 `WBS_MCP_DATA_DIR` を基準に解決されます（`src/server/db-simple.ts`の`resolveDatabasePath`）。拡張からは `${workspaceFolder}` が設定されます。

  バックアップ例（PowerShell）:
  ```powershell
  Copy-Item -Path .\data\wbs.db -Destination .\data\wbs.db.backup -Force
  ```

  DBを初期化したい場合（再生成されます）:
  ```powershell
  Remove-Item -Path .\data\wbs.db -Force
  ```

  ## テスト

  Jestでユニットテストを実行できます（`jest.config.js`）。

  ```powershell
  npm test
  ```

  カバレッジは `coverage/` 配下に出力されます。VS Codeモック（`__mocks__/vscode.ts`）を使うため、外部サーバやブラウザは不要です。

  ## よくある質問（Troubleshooting）

  - サーバが起動しない／ツリーが空
    - コマンドパレットで「MCP WBS: Start Local Server」を実行。
    - 出力ウィンドウ「MCP-WBS」のログにエラーがないか確認。
    - ルートタスクが無い場合は、まず `wbs.createTask` で作成してください。

  - バージョン不一致で保存できない
    - 他の操作で`version`が進んでいる可能性があります。最新を再読込し、`ifVersion`に現在値が入る状態で保存してください（UIは自動で処理します）。

  - DBの場所を変えたい
    - `.vscode/mcp.json`の`env.WBS_MCP_DATA_DIR`を編集し、拡張を再起動してください。

  ## 開発モードのヒント

  - tscウォッチを回す場合:
  ```powershell
  npm run watch
  ```

  - 拡張だけ再起動したい場合:
  ```powershell
  npm run start-extension-dev
  ```

  - サーバ単体での動作確認（stdio出力を確認したい等）:
  ```powershell
  npm run build ; node .\out\server\index.js
  ```

  ## 次に読む

  - `docs/architecture.md` 現行アーキテクチャ（stdio JSON-RPC / データモデル）
  - `docs/copilot_examples.md` MCPツール一覧と実例
  - `PROJECT_SUMMARY.md` 全体像と開発メモ

  ---

  WBS MCPで、タスク管理をもっと軽やかに。🚀
