import { MCPBaseClient } from './baseClient';

/**
 * MCP初期化処理を司るクラス。writerが準備できるまで待機し、initializeリクエストを1度だけ送信する。
 */
export class MCPInitializeClient extends MCPBaseClient {
    private initialized = false;

    /**
     * writerのセットを待機した上で初期化を実行する。
     */
    public async start(): Promise<void> {
        // wait for writer to be set by ServerService. タイムアウトは baseClient の requestTimeoutMs をデフォルトとする
        try {
            await this.waitForWriter();
        } catch (err) {
            throw new Error('MCPClient.start: writer not set by ServerService (timeout)');
        }

        await this.initialize();
    }

    /**
     * initializeリクエストを1度だけ送信する。
     */
    protected async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        const response = await this.sendRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
                name: 'wbs-mcp-extension',
                version: '0.1.0'
            }
        });

        if (response.error) {
            throw new Error(`Failed to initialize MCP: ${response.error.message}`);
        }

        this.sendNotification('notifications/initialized', {});
        this.initialized = true;
    }
}
