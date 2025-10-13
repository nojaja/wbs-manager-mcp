
// VSCode APIをインポート
import * as vscode from 'vscode';
// 型のみのインポート: 循環参照を避けるため型注釈はimport typeを使用
// Use the WBSServicePublic interface to avoid depending on service implementation
// and keep a clear boundary between view and service.
import type { WBSServicePublic } from '../services/wbsService.interface';
import type { MCPClient } from '../mcpClient';


/**
 * タスク情報を表現するインターフェース
 * プロジェクト管理の各タスクの属性を定義
 */
interface Task {
    id: string; // タスクID
    parent_id?: string; // 親タスクID（サブタスクの場合）
    title: string; // タイトル
    description?: string; // 詳細説明
    assignee?: string; // 担当者
    status: string; // 状態（例: in-progress, completed）
    estimate?: string; // 見積もり
    version: number; // バージョン
    childCount?: number; // 子タスク数（wbs.listTasks返却用）
}

type DropDecision =
    | { kind: 'parent'; parentId: string | null }
    | { kind: 'warning'; message: string }
    | { kind: 'noop' };


/**
 * WBSツリープロバイダクラス
 * タスクのツリー表示・データ取得を行う
 * VSCode拡張のエクスプローラ部にWBS（Work Breakdown Structure）を表示するためのメインクラス
 */
export class WBSTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    // ツリーの更新イベント管理用（ツリーの再描画を通知するために必要）
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    // ツリー更新イベント（外部から購読可能）
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    // ビジネスロジックサービス（WBS の操作はこのサービス経由で行う）
    private readonly wbsService?: WBSServicePublic;
    // 従来互換: 直接 MCPClient を受け取る場合の参照
    private readonly mcpClient?: MCPClient;

    /**
     * コンストラクタ
     * MCPクライアントを受け取り初期化する
     * @param mcpClient MCPクライアント
     * なぜ必要か: API経由でプロジェクト・タスク情報を取得するため
     */
    /**
     * コンストラクタ
     * @param serviceOrClient WBSService か MCPClient のいずれか（互換性のため）
     */
    constructor(serviceOrClient: WBSServicePublic | MCPClient) {
        // 互換性: serviceOrClient が listTasks を持つなら MCPClient と見なす
        if ((serviceOrClient as any)?.listTasks) {
            this.mcpClient = serviceOrClient as MCPClient;
        } else {
            this.wbsService = serviceOrClient as WBSServicePublic;
        }
    }

    /**
     * 処理名: ツリーリフレッシュ処理
     * 処理概要: ツリーデータの再取得・再描画を通知する
     * 実装理由(なぜ必要か): 外部でデータが更新された際に UI を即時更新し、ユーザに最新の状態を見せるため
     */
    refresh(): void {
        // イベント発火により TreeView に再描画を要求する
        // 処理概要: 内部のイベントエミッタを用いて購読者に通知する
        // 実装理由: VSCode の TreeDataProvider が onDidChangeTreeData を購読しているため
        this._onDidChangeTreeData.fire();
    }

    /**
     * 処理名: ツリーアイテム取得処理
     * 処理概要: 指定要素に対応する vscode.TreeItem を返す
     * 実装理由(なぜ必要か): VSCode の TreeDataProvider API がアイテム描画時にこのメソッドを呼び、表示情報を取得するため
     * @param element ツリー要素
     * @returns ツリーアイテム
     */
    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * 処理名: 子要素取得処理
     * 処理概要: 指定ノードの子要素をサービス経由で取得して TreeItem 配列として返す
     * 実装理由(なぜ必要か): ツリーの階層を動的に生成するため、必要時にのみ子要素を取得してパフォーマンスを維持するため
     * @param element ツリー要素
     * @returns Promise<TreeItem[]>
     */
    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        // ルートノードか子ノードかで処理を分岐
        if (!element) {
            // 処理概要: ルート直下のタスク一覧を取得し、TreeItem 配列で返す
            // 実装理由: ルート表示時に最上位のタスクのみを表示するため
            return this.getTasks();
        } else if (element.contextValue === 'task' && element.task) {
            // 処理概要: 指定タスクの子タスクをサービスから取得して TreeItem に変換する
            // 実装理由: 子タスクは必要に応じて遅延ロードすることで、初期描画コストを削減するため
            const children = this.wbsService
                ? await this.wbsService.listTasksApi(element.task.id)
                : await (this.mcpClient as any).listTasks(element.task.id);
            return children.map((child: Task) => new TreeItem(
                this.getTaskLabel(child),
                child.id,
                'task',
                child.childCount && child.childCount > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                this.getTaskDescription(child),
                child
            ));
        }

        // デフォルト: 子要素無し
        return [];
    }

    /**
     * 処理名: タスク一覧取得処理
     * 処理概要: ルート直下のタスク一覧を API から取得し、TreeItem 配列に変換して返す
     * 実装理由(なぜ必要か): TreeView の初期表示とルートレベル更新時に表示するデータを取得するため
     * @returns Promise<TreeItem[]>
     */
    private async getTasks(): Promise<TreeItem[]> {
        try {
            // 処理概要: WBS サービスまたは MCP クライアントを使ってルートタスクを取得する
            // 実装理由: バックエンドから最新のタスク一覧を取得して UI に反映するため
            const tasks = this.wbsService
                ? await this.wbsService.listTasksApi(null)
                : await (this.mcpClient as any).listTasks(null);
            return tasks.map((task: Task) => new TreeItem(
                this.getTaskLabel(task),
                task.id,
                'task',
                task.childCount && task.childCount > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                this.getTaskDescription(task),
                task
            ));
        } catch (error) {
            // 処理概要: エラー発生時はユーザにメッセージを表示し、空配列を返す
            // 実装理由: UI が壊れないようにフォールバックを提供し、ユーザに原因を通知するため
            vscode.window.showErrorMessage(`Failed to fetch tasks: ${error}`);
            return [];
        }
    }

    /**
     * タスク追加処理
     * 選択中のプロジェクトまたはタスク配下に新しいタスクを追加する
     * なぜ必要か: ツリー上から直接タスクを追加できるようにするため
     * @param target 選択中のツリーアイテム
     * @returns 作成結果（成功時はタスクIDを含む）
     */
    async createTask(target?: TreeItem): Promise<{ success: boolean; taskId?: string }> {
        // 処理名: タスク追加処理
        // 処理概要: 選択されたノードの下に新しいタスクを作成する
        // 実装理由: ユーザが UI 上から直接タスクを追加できるようにするため
        if (!target) {
            // 処理概要: 作成先が指定されていない場合は警告を表示して処理を中止する
            // 実装理由: 作成先が不明だと階層構造が不定になるため、明示的に指定させる
            vscode.window.showWarningMessage('作成先のプロジェクトまたはタスクを選択してください。');
            return { success: false };
        }

        const { parentId } = this.resolveCreationContext(target);

        try {
            // 処理概要: サービス経由でタスク作成 API を呼び出す
            // 実装理由: バックエンドにタスク情報を永続化するため
            const response = this.wbsService
                ? await this.wbsService.createTaskApi({ parentId: parentId ?? null, title: 'New Task' })
                : await (this.mcpClient as any).createTask({ parentId: parentId ?? null, title: 'New Task' });
            if (!response.success) {
                // 処理概要: API が失敗を返した場合はエラーメッセージを表示して失敗を返す
                // 実装理由: ユーザに失敗理由を伝え、UI を一貫した状態に保つため
                if (response.error) {
                    vscode.window.showErrorMessage(`タスクの作成に失敗しました: ${response.error}`);
                }
                return { success: false };
            }

            // 成功時はツリーを更新して作成完了を通知
            this.refresh();
            vscode.window.showInformationMessage('新しいタスクを作成しました。');
            return { success: true, taskId: response.taskId };
        } catch (error) {
            // 処理概要: 例外発生時はエラーメッセージを表示して失敗を返す
            // 実装理由: ネットワークや API 例外が発生しても UI を壊さず適切に通知するため
            vscode.window.showErrorMessage(`タスクの作成中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`);
            return { success: false };
        }
    }

    /**
     * タスク削除処理
     * 選択されたタスクとその子タスクを削除する
     * なぜ必要か: ツリー上から不要なタスク階層を直接削除できるようにするため
     * @param target 選択中のタスクアイテム
     * @returns 削除結果
     */
    async deleteTask(target?: TreeItem): Promise<{ success: boolean }> {
        // 処理名: タスク削除処理
        // 処理概要: 指定タスク（および子タスク）を削除するための確認と API 呼び出しを行う
        // 実装理由: ユーザが誤ってタスクを削除しないように確認を取り、サーバ側へ削除を反映するため
        if (!target || target.contextValue !== 'task' || !target.task) {
            // 処理概要: 対象が不正な場合は警告し中止
            // 実装理由: 不正な操作を防ぐため
            vscode.window.showWarningMessage('削除するタスクを選択してください。');
            return { success: false };
        }

        // 処理概要: ユーザ確認ダイアログを表示して、本当に削除して良いかを確認する
        // 実装理由: 破壊的操作のためモーダル確認を挟む
        const answer = await vscode.window.showWarningMessage(
            '選択したタスクとその子タスクを削除します。よろしいですか？',
            { modal: true },
            '削除'
        );

        if (answer !== '削除') {
            // 処理概要: ユーザがキャンセルした場合は何もしない
            // 実装理由: 操作の中断を尊重するため
            return { success: false };
        }
        try {
            // 処理概要: サービス経由で削除 API を呼び出す
            // 実装理由: サーバに永続データの変更を反映させるため
            const response = this.wbsService
                ? await this.wbsService.deleteTaskApi(target.task.id)
                : await (this.mcpClient as any).deleteTask(target.task.id);
            if (!response.success) {
                // 処理概要: API が失敗を返した場合はエラーメッセージを表示
                // 実装理由: ユーザに失敗理由を通知し UI の整合性を保つため
                if (response.error) {
                    vscode.window.showErrorMessage(`タスクの削除に失敗しました: ${response.error}`);
                }
                return { success: false };
            }

            // 成功時はツリーを更新して完了通知
            this.refresh();
            vscode.window.showInformationMessage('タスクを削除しました。');
            return { success: true };
        } catch (error) {
            // 処理概要: 例外発生時はエラーメッセージを表示して失敗を返す
            // 実装理由: ネットワークや実行時エラーに対してフォールバックを提供するため
            vscode.window.showErrorMessage(`タスクの削除中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`);
            return { success: false };
        }
    }

    /**
     * プロジェクト削除処理
     * 選択されたプロジェクトと配下のタスクを削除する
     * なぜ必要か: UI上から不要なプロジェクトを整理できるようにするため
     * @param target 選択中のプロジェクトアイテム
     * @returns 削除結果
     */
    // プロジェクト削除UIは不要になったため削除

    /**
     * タスク作成先の解決処理
     * 選択ノードに基づき親タスクIDを特定する
     * なぜ必要か: タスク作成時の分岐ロジックを整理し、複雑度を下げるため
     * @param target 選択中のツリーアイテム
     * @returns 親タスクID
     */
    private resolveCreationContext(target?: TreeItem): { parentId?: string } {
        if (!target) {
            // 処理概要: 対象未指定時は空を返す
            // 実装理由: 呼び出し元で未指定ケースを扱えるようにするため
            return {};
        }
        if (target.contextValue === 'project') {
            // 処理概要: プロジェクト直下に作成する場合は親無しを示す
            // 実装理由: ルートレベルのタスク作成と区別するため
            return { parentId: undefined };
        }
        if (target.contextValue === 'task' && target.task) {
            // 処理概要: 既存タスクの配下に子タスクを作るため親IDを返す
            // 実装理由: ツリーの階層構造を保持するため
            return { parentId: target.task.id };
        }

        return {};
    }

    /**
     * タスクドロップ処理
     * ドラッグ&ドロップで指定されたタスクの親子関係を更新する
     * なぜ必要か: ツリー上でのタスク移動をMCPサーバへ反映するため
     * @param taskId 移動対象タスクID
     * @param target ドロップ先ツリーアイテム
     */
    async handleTaskDrop(taskId: string, target: TreeItem): Promise<void> {
        // 処理名: タスクドロップ処理
        // 処理概要: ドラッグ&ドロップ操作により指定されたタスクの親子関係を更新する
        // 実装理由: UI 操作をサーバ側に反映させ、ツリーの構造を更新するため
        if (!target) {
            // 処理概要: ドロップ先が不明な場合は何もしない
            // 実装理由: 無効な操作を防ぐため
            return;
        }

        try {
            // 処理概要: ドラッグされたタスクを取得する
            // 実装理由: 移動可否の判定や API 呼び出しのために元データが必要
            const draggedTask = await this.fetchTaskById(taskId);
            if (!draggedTask) {
                // 処理概要: 取得できなければエラーを表示して中止
                // 実装理由: 不整合な操作を防ぐため
                vscode.window.showErrorMessage('移動対象のタスクを取得できませんでした。');
                return;
            }

            // 処理概要: ドロップ先の妥当性を判定する
            // 実装理由: 循環構造や無意味な移動を防止するため
            const decision = this.evaluateDropTarget(draggedTask, target);

            if (decision.kind === 'warning') {
                // 処理概要: 判定で警告が返された場合はユーザに通知
                // 実装理由: 操作が不正なケースをユーザに説明するため
                vscode.window.showWarningMessage(decision.message);
                return;
            }

            if (decision.kind === 'noop') {
                // 処理概要: 実質変更が無い場合は処理を中止
                // 実装理由: 無駄な API 呼び出しを避けるため
                return;
            }

            // 処理概要: 実際の移動 API を呼び出し、結果に応じて UI を更新
            // 実装理由: サーバに変更を反映し、成功ならツリーを再描画するため
            await this.performMove(taskId, decision.parentId ?? null);
        } catch (error) {
            // 処理概要: 例外発生時はエラーメッセージを表示
            // 実装理由: 予期せぬエラーが UI を壊さないようにするため
            vscode.window.showErrorMessage(`タスクの移動中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 指定IDのタスクを取得する（API呼び出しラッパー）
     * @param taskId 取得するタスクのID
     * @returns 取得したタスク（存在しない場合はundefined）
     */
    private async fetchTaskById(taskId: string): Promise<Task | undefined> {
        return this.wbsService
            ? await this.wbsService.getTaskApi(taskId)
            : await (this.mcpClient as any).getTask(taskId);
    }

    /**
     * タスク移動を実行し、結果に応じてメッセージ表示・リフレッシュを行う
     * @param taskId 移動対象のタスクID
     * @param parentId 新しい親タスクID（ルートに移動する場合はnull）
     * @returns 実行結果を示すPromise（完了時にresolve）
     */
    private async performMove(taskId: string, parentId: string | null): Promise<void> {
        const result = this.wbsService
            ? await this.wbsService.moveTaskApi(taskId, parentId)
            : await (this.mcpClient as any).moveTask(taskId, parentId);

        if (result.success) {
            this.refresh();
            vscode.window.showInformationMessage('タスクを移動しました。');
            return;
        }

        if (result.error) {
            vscode.window.showErrorMessage(`タスクの移動に失敗しました: ${result.error}`);
        }
    }

    /**
     * タスク木探索処理
     * 指定タスク配下に対象IDが含まれるかを判定する
     * なぜ必要か: ドラッグ対象の子孫に移動しようとした場合に循環を防ぐため
     * @param task タスク
     * @param searchId 探索対象ID
     * @returns 子孫に含まれていればtrue
     */
    private containsTask(task: Task, searchId: string): boolean {
        // 処理名: タスク木探索（簡易）
        // 処理概要: 指定タスク配下に searchId が含まれているかを判定する
        // 実装理由: 本来は循環チェックに使用するが、現在 UI 側では children を保持しないため無効化している
        // 将来的に子情報を保持する場合は再帰実装に差し替える
        return false;
    }

    /**
     * ドロップ先評価処理
     * ターゲットに応じて移動の可否と新しい親タスクIDを判定する
     * @param draggedTask ドラッグ中のタスク
     * @param target ドロップ先ツリーアイテム
     * @returns 判定結果
     */
    private evaluateDropTarget(draggedTask: Task, target: TreeItem): DropDecision {
        // 処理概要: ドロップ先の種別に応じて評価処理を振り分ける
        // 実装理由: プロジェクト／タスクごとに判定ロジックが異なるため
        if (target.contextValue === 'project') {
            return this.evaluateProjectDrop(draggedTask, target);
        }

        if (target.contextValue === 'task' && target.task) {
            return this.evaluateTaskDrop(draggedTask, target.task);
        }

        return { kind: 'noop' };
    }

    /**
     * プロジェクトノードへのドロップ評価
    * ドロップ先がルート（プロジェクト扱い）の場合に、親タスクを外すべきかを判定する
    * なぜ必要か: ツリー最上位への移動（親なし）を正しく表現し、無意味な更新を避けるため
     * @param draggedTask ドラッグ中のタスク
     * @param target プロジェクトノード
     * @returns 判定結果
     */
    private evaluateProjectDrop(draggedTask: Task, target: TreeItem): DropDecision {
        // 処理概要: ドロップ先がプロジェクト（ルート相当）の場合の評価
        // 実装理由: ルートに移動することで parentId を null に設定する必要があるため
        const currentParentId = draggedTask.parent_id ?? null;
        if (currentParentId === null) {
            // 処理概要: 既にルートなら何もしない
            // 実装理由: 不要な DB 更新を避けるため
            return { kind: 'noop' };
        }

        return { kind: 'parent', parentId: null };
    }

    /**
     * タスクノードへのドロップ評価
    * ドロップ先がタスクノードの場合に、循環や同一親などの無効ケースを排除して新しい親IDを決定する
    * なぜ必要か: 不正な親子関係の生成を防ぎ、Drag&Drop操作を安全に反映するため
     * @param draggedTask ドラッグ中のタスク
     * @param targetTask ドロップ先タスク
     * @returns 判定結果
     */
    private evaluateTaskDrop(draggedTask: Task, targetTask: Task): DropDecision {
        // 処理概要: タスク同士のドロップ判定（循環や無意味な移動を排除）
        // 実装理由: タスク階層の整合性を守り、不正な親子関係を作らないため
        const currentParentId = draggedTask.parent_id ?? null;
        // 自身や現在の親をドロップ先にする場合は変更無し
        if (draggedTask.id === targetTask.id || currentParentId === targetTask.id || draggedTask.parent_id === targetTask.id) {
            // 処理概要: 無意味な移動（同一ノードや現在の親への移動）は noop を返す
            // 実装理由: 無駄な更新を避けるため
            return { kind: 'noop' };
        }

        // 自分の子孫を新しい親にしようとしていないかをチェック
        if (this.containsTask(draggedTask, targetTask.id)) {
            // 処理概要: 子孫への移動は循環構造を作るため警告を返す
            // 実装理由: データ整合性を保つため
            return { kind: 'warning', message: '子孫タスクの下への移動はできません。' };
        }

        // 有効な移動先であれば parentId を設定して返す
        return { kind: 'parent', parentId: targetTask.id };
    }

    /**
     * タスク説明生成処理
     * タスクの状態・担当・見積もりを文字列化して返す
     * なぜ必要か: ツリー上でタスクの概要を簡潔に表示するため
     * @param task タスク情報
     * @returns 説明文字列
     */
    private getTaskDescription(task: Task): string {
        // 処理名: タスク説明生成処理
        // 処理概要: タスクの状態・担当・見積もりを組み合わせて説明文字列を作成する
        // 実装理由: ツリー上で簡潔にタスクの概要を表示するため
        const parts: string[] = [];
        if (task.status) parts.push(`[${task.status}]`);
        if (task.assignee) parts.push(`@${task.assignee}`);
        if (task.estimate) parts.push(task.estimate);
        return parts.join(' ');
    }

    /**
     * タスクラベル生成処理
     * タスクタイトルが空の場合はIDを表示ラベルとして返す
     * なぜ必要か: 初期状態でタイトル未設定のタスクがツリー上で識別できるようにするため
     * @param task タスク情報
     * @returns 表示用ラベル
     */
    private getTaskLabel(task: Task): string {
        // 処理名: タスクラベル生成処理
        // 処理概要: タイトルがあればそれを、無ければIDをラベルとして返す
        // 実装理由: タイトルが未設定のタスクでも識別できるようにするため
        if (task.title && task.title.trim().length > 0) {
            return task.title;
        }
        return task.id;
    }

}


/**
 * ツリーアイテムクラス
 * プロジェクト・タスクのツリー表示用アイテムを表現する
 * なぜ必要か: VSCodeのTreeViewに表示する各ノードの情報・見た目を制御するため
 */
class TreeItem extends vscode.TreeItem {
    /**
     * コンストラクタ
     * ラベル・ID・種別・状態・説明・タスク情報を受け取り初期化する
     * なぜ必要か: ツリー上の各ノードの表示内容・アイコン・ツールチップ等を柔軟に制御するため
     * @param label ラベル
     * @param itemId アイテムID
     * @param contextValue コンテキスト種別
     * @param collapsibleState ツリー折りたたみ状態
     * @param description 説明
     * @param task タスク情報
     */
    constructor(
        public readonly label: string,
        public readonly itemId: string,
        public readonly contextValue: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly description?: string,
        public readonly task?: Task
    ) {
        super(label, collapsibleState);
        // ツールチップに説明を設定
        this.tooltip = description;
        // ノードIDを設定
        this.id = itemId;

        // ノード種別・状態に応じてアイコンを設定
        if (contextValue === 'project') {
            // プロジェクト用アイコン
            this.iconPath = new vscode.ThemeIcon('project');
        } else if (contextValue === 'task') {
            // タスク状態ごとにアイコン切替
            if (task?.status === 'completed') {
                this.iconPath = new vscode.ThemeIcon('check');
            } else if (task?.status === 'in-progress') {
                this.iconPath = new vscode.ThemeIcon('play');
            } else {
                this.iconPath = new vscode.ThemeIcon('circle-outline');
            }
            // タスクノードクリック時に詳細パネルを開くコマンドを設定
            this.command = {
                title: 'Open Task Details',
                command: 'wbsTree.openTask',
                arguments: [this]
            };
        }
    }
}

/**
 * WBSツリードラッグ&ドロップコントローラ
 * ツリー内のタスク移動操作をハンドリングし、WBSTreeProviderへ委譲する
 */
export class WBSTreeDragAndDropController implements vscode.TreeDragAndDropController<TreeItem> {
    readonly dragMimeTypes = ['application/vnd.code.tree.wbsTree'];
    readonly dropMimeTypes = ['application/vnd.code.tree.wbsTree'];

    /**
     * コンストラクタ
    * ドロップ処理の委譲先プロバイダを受け取り初期化する
    * なぜ必要か: Drag&DropのUI制御とデータ更新（サーバ呼び出し）を分離し、責務を明確化するため
     * @param provider ドロップ処理を委譲するWBSツリープロバイダ
     */
    constructor(private readonly provider: WBSTreeProvider) {}

    /**
     * ドラッグ開始処理
     * データ転送にタスクID一覧を格納する
    * なぜ必要か: 複数ノードのドラッグ時にもターゲット側で正しくIDを復元できるようにするため
     * @param source ドラッグされたツリーアイテム
     * @param dataTransfer データ転送オブジェクト
     */
    async handleDrag(source: readonly TreeItem[], dataTransfer: vscode.DataTransfer): Promise<void> {
        const taskIds = source
            .filter(item => item.contextValue === 'task')
            .map(item => item.itemId);

        if (taskIds.length === 0) {
            return;
        }

        dataTransfer.set('application/vnd.code.tree.wbsTree', new vscode.DataTransferItem(JSON.stringify(taskIds)));
    }

    /**
     * ドロップ処理
     * データ転送からタスクIDを取得し、プロバイダへ処理を委譲する
    * なぜ必要か: UIイベントから実データ更新（親子関係変更）への橋渡しを行うため
     * @param target ドロップ先ツリーアイテム
     * @param dataTransfer データ転送オブジェクト
     */
    async handleDrop(target: TreeItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
        const item = dataTransfer.get('application/vnd.code.tree.wbsTree');
        if (!item) {
            return;
        }

        let taskIds: string[] = [];
        try {
            const raw = item.value as string | undefined;
            taskIds = raw ? JSON.parse(raw) : [];
        } catch (error) {
            console.error('[WBS Tree] Failed to parse drag data', error);
            return;
        }

        const taskId = taskIds[0];
        if (!taskId || !target) {
            return;
        }

        await this.provider.handleTaskDrop(taskId, target);
    }

    /**
     * リソース解放処理
     * コントローラ破棄時に呼び出される
     * なぜ必要か: TreeView破棄時のクリーンアップでメモリリークを防ぐため
     */
    dispose(): void {
        // no resources to dispose
    }
}
