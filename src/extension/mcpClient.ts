import type * as vscode from 'vscode';

import { MCPArtifactClient } from './mcp/artifactClient';

export type {
    Artifact,
    ArtifactReferenceInput,
    CompletionConditionInput,
    TaskArtifactAssignment,
    TaskArtifactRole,
    TaskCompletionCondition
} from './mcp/types';

/**
 * エクスポート互換性のための統合クラス。
 * 基底クラスチェーンを継承しつつ、従来と同じエントリポイントを提供する。
 */
export class MCPClient extends MCPArtifactClient {
    /**
     * @param outputChannel 出力ログを流すVSCodeチャネル
     */
    constructor(outputChannel: vscode.OutputChannel) {
        super(outputChannel);
    }
}
