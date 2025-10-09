import * as child_process from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';

interface JsonRpcRequest {
    jsonrpc: string;
    id: number;
    method: string;
    params?: any;
}

interface JsonRpcResponse {
    jsonrpc: string;
    id?: number;
    result?: any;
    error?: {
        code: number;
        message: string;
    };
}

/**
 *
 */
export class MCPClient {
    private serverProcess: child_process.ChildProcess | null = null;
    private requestId = 0;
    private pendingRequests: Map<number, { resolve: (value: any) => void; reject: (error: any) => void }> = new Map();
    private outputChannel: vscode.OutputChannel;

    /**
     *
     * @param outputChannel
     */
    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /**
     *
     * @param serverPath
     * @param options
     * @param options.cwd
     * @param options.env
     */
    async start(serverPath: string, options?: { cwd?: string; env?: NodeJS.ProcessEnv }): Promise<void> {
        if (this.serverProcess) {
            return; // Already started
        }

        return new Promise((resolve, reject) => {
            this.serverProcess = child_process.spawn(process.execPath, [serverPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: options?.cwd,
                env: options?.env
            });

            let buffer = '';

            this.serverProcess.stdout?.setEncoding('utf8');
            this.serverProcess.stdout?.on('data', (chunk) => {
                buffer += chunk;
                let lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const response = JSON.parse(line.trim()) as JsonRpcResponse;
                            this.handleResponse(response);
                        } catch (error) {
                            this.outputChannel.appendLine(`[MCP Client] Failed to parse response: ${error}`);
                        }
                    }
                }
            });

            this.serverProcess.stderr?.on('data', (data) => {
                const error = data.toString().trim();
                this.outputChannel.appendLine(`[MCP Server] ${error}`);
            });

            this.serverProcess.on('exit', (code, signal) => {
                this.outputChannel.appendLine(`[MCP Client] Server process exited with code ${code}, signal: ${signal}`);
                this.serverProcess = null;
                // Reject all pending requests
                for (const [id, { reject }] of this.pendingRequests) {
                    reject(new Error('Server process exited'));
                }
                this.pendingRequests.clear();
            });

            this.serverProcess.on('error', (err) => {
                this.outputChannel.appendLine(`[MCP Client] Server process error: ${err.message}`);
                reject(err);
            });

            // Initialize the MCP connection
            setTimeout(async () => {
                try {
                    await this.initialize();
                    resolve();
                } catch (error) {
                    reject(error);
                }
            }, 1000);
        });
    }

    /**
     *
     */
    private async initialize(): Promise<void> {
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

        // Send initialized notification
        this.sendNotification('notifications/initialized', {});
    }

    /**
     *
     * @param method
     * @param params
     * @returns Promise<JsonRpcResponse>
     */
    private sendRequest(method: string, params?: any): Promise<JsonRpcResponse> {
        if (!this.serverProcess) {
            return Promise.reject(new Error('MCP server not started'));
        }

        const id = ++this.requestId;
        const request: JsonRpcRequest = {
            jsonrpc: '2.0',
            id,
            method,
            params
        };

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });

            const requestStr = JSON.stringify(request) + '\n';
            this.outputChannel.appendLine(`[MCP Client] Sending: ${method}`);
            
            this.serverProcess!.stdin?.write(requestStr, (error) => {
                if (error) {
                    this.pendingRequests.delete(id);
                    reject(error);
                }
            });

            // Timeout after 10 seconds
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`Request timeout: ${method}`));
                }
            }, 10000);
        });
    }

    /**
     *
     * @param method
     * @param params
     */
    private sendNotification(method: string, params?: any): void {
        if (!this.serverProcess) {
            return;
        }

        const notification = {
            jsonrpc: '2.0',
            method,
            params
        };

        const notificationStr = JSON.stringify(notification) + '\n';
        this.serverProcess.stdin?.write(notificationStr);
    }

    /**
     *
     * @param response
     */
    private handleResponse(response: JsonRpcResponse): void {
        if (response.id !== undefined) {
            const pending = this.pendingRequests.get(response.id as number);
            if (pending) {
                this.pendingRequests.delete(response.id as number);
                if (response.error) {
                    pending.reject(new Error(response.error.message));
                } else {
                    pending.resolve(response);
                }
            }
        }
    }

    /**
     *
     * @param toolName
     * @param args
     * @returns Promise<any>
     */
    async callTool(toolName: string, args: any): Promise<any> {
        const response = await this.sendRequest('tools/call', {
            name: toolName,
            arguments: args
        });

        if (response.error) {
            throw new Error(response.error.message);
        }

        return response.result;
    }

    /**
     *
     * @returns Promise<any[]>
     */
    async listProjects(): Promise<any[]> {
        try {
            const result = await this.callTool('wbs.listProjects', {});
            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return [];
        } catch (error) {
            this.outputChannel.appendLine(`[MCP Client] Failed to list projects: ${error}`);
            return [];
        }
    }

    /**
     *
     * @param projectId
     * @returns Promise<any[]>
     */
    async listTasks(projectId: string): Promise<any[]> {
        try {
            const result = await this.callTool('wbs.listTasks', { projectId });
            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return [];
        } catch (error) {
            this.outputChannel.appendLine(`[MCP Client] Failed to list tasks: ${error}`);
            return [];
        }
    }

    /**
     *
     * @param taskId
     * @returns Promise<any | null>
     */
    async getTask(taskId: string): Promise<any | null> {
        try {
            const result = await this.callTool('wbs.getTask', { taskId });
            const content = result.content?.[0]?.text;
            if (content && !content.includes('❌')) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            this.outputChannel.appendLine(`[MCP Client] Failed to get task: ${error}`);
            return null;
        }
    }

    /**
     *
     * @param taskId
     * @param updates
     * @returns Promise<{ success: boolean; conflict?: boolean; error?: string }>
     */
    async updateTask(taskId: string, updates: any): Promise<{ success: boolean; conflict?: boolean; error?: string }> {
        try {
            const result = await this.callTool('wbs.updateTask', { taskId, ...updates });
            const content = result.content?.[0]?.text;
            
            if (content?.includes('✅')) {
                return { success: true };
            } else if (content?.includes('modified by another user')) {
                return { success: false, conflict: true };
            } else {
                return { success: false, error: content || 'Unknown error' };
            }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    /**
     *
     */
    stop(): void {
        if (this.serverProcess) {
            this.serverProcess.kill();
            this.serverProcess = null;
        }
        this.pendingRequests.clear();
    }
}