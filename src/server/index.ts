
import { initializeDatabase, WBSRepository } from './db-simple';

interface JsonRpcRequest {
    jsonrpc: string;
    id?: number | string;
    method: string;
    params?: any;
}

interface JsonRpcResponse {
    jsonrpc: string;
    id?: number | string;
    result?: any;
    error?: {
        code: number;
        message: string;
    };
}

interface JsonRpcNotification {
    jsonrpc: string;
    method: string;
    params?: any;
}

/**
 *
 */
class StdioMCPServer {
    private repo: WBSRepository;

    /**
     *
     */
    constructor() {
        this.repo = new WBSRepository();
        this.setupStdioHandlers();
    }

    /**
     *
     */
    private setupStdioHandlers() {
        process.stdin.setEncoding('utf8');
        let buffer = '';

        process.stdin.on('data', (chunk) => {
            buffer += chunk;
            let lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const message = JSON.parse(line.trim());
                        this.handleMessage(message);
                    } catch (error) {
                        console.error('[MCP Server] Failed to parse message:', error);
                    }
                }
            }
        });

        process.stdin.on('end', () => {
            process.exit(0);
        });

        // Handle process termination
        process.on('SIGINT', () => process.exit(0));
        process.on('SIGTERM', () => process.exit(0));
    }

    /**
     *
     * @param message
     */
    private async handleMessage(message: JsonRpcRequest | JsonRpcNotification) {
        try {
            console.error(`[MCP Server] Received: ${message.method}`, message.params);

            if ('id' in message) {
                // Request - needs response
                const response = await this.handleRequest(message as JsonRpcRequest);
                this.sendResponse(response);
            } else {
                // Notification - no response needed
                await this.handleNotification(message as JsonRpcNotification);
            }
        } catch (error) {
            console.error('[MCP Server] Error handling message:', error);
            if ('id' in message) {
                this.sendResponse({
                    jsonrpc: '2.0',
                    id: message.id,
                    error: {
                        code: -32603,
                        message: error instanceof Error ? error.message : String(error)
                    }
                });
            }
        }
    }

    /**
     *
     * @param request
     * @returns Promise<JsonRpcResponse>
     */
    private async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
        const { method, params, id } = request;

        switch (method) {
            case 'initialize':
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        protocolVersion: '2024-11-05',
                        capabilities: {
                            tools: {}
                        },
                        serverInfo: {
                            name: 'wbs-mcp-server',
                            version: '0.1.0'
                        }
                    }
                };

            case 'tools/list':
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        tools: [
                            {
                                name: 'wbs.createProject',
                                description: 'Create a new WBS project',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        title: { type: 'string', description: 'Project title' },
                                        description: { type: 'string', description: 'Project description' }
                                    },
                                    required: ['title']
                                }
                            },
                            {
                                name: 'wbs.listProjects',
                                description: 'List all WBS projects',
                                inputSchema: {
                                    type: 'object',
                                    properties: {}
                                }
                            },
                            {
                                name: 'wbs.createTask',
                                description: 'Create a new task in a project',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        projectId: { type: 'string', description: 'Project ID' },
                                        title: { type: 'string', description: 'Task title' },
                                        description: { type: 'string', description: 'Task description' },
                                        assignee: { type: 'string', description: 'Assignee name' },
                                        estimate: { type: 'string', description: 'Time estimate' }
                                    },
                                    required: ['projectId', 'title']
                                }
                            },
                            {
                                name: 'wbs.getTask',
                                description: 'Get task details by ID',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        taskId: { type: 'string', description: 'Task ID' }
                                    },
                                    required: ['taskId']
                                }
                            },
                            {
                                name: 'wbs.updateTask',
                                description: 'Update a task',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        taskId: { type: 'string', description: 'Task ID' },
                                        title: { type: 'string', description: 'Task title' },
                                        description: { type: 'string', description: 'Task description' },
                                        assignee: { type: 'string', description: 'Assignee name' },
                                        status: { type: 'string', description: 'Task status' },
                                        estimate: { type: 'string', description: 'Time estimate' },
                                        ifVersion: { type: 'number', description: 'Expected version for optimistic locking' }
                                    },
                                    required: ['taskId']
                                }
                            },
                            {
                                name: 'wbs.listTasks',
                                description: 'List tasks for a project',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        projectId: { type: 'string', description: 'Project ID' }
                                    },
                                    required: ['projectId']
                                }
                            }
                        ]
                    }
                };

            case 'tools/call':
                const toolResult = await this.handleToolCall(params);
                return {
                    jsonrpc: '2.0',
                    id,
                    result: toolResult
                };

            case 'ping':
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {}
                };

            case 'resources/list':
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        resources: []
                    }
                };

            case 'prompts/list':
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        prompts: []
                    }
                };

            default:
                return {
                    jsonrpc: '2.0',
                    id,
                    error: {
                        code: -32601,
                        message: `Method not found: ${method}`
                    }
                };
        }
    }

    /**
     *
     * @param notification
     */
    private async handleNotification(notification: JsonRpcNotification) {
        const { method } = notification;

        switch (method) {
            case 'notifications/initialized':
                console.error('[MCP Server] Client initialized successfully');
                break;
            default:
                console.error(`[MCP Server] Unknown notification: ${method}`);
                break;
        }
    }

    /**
     * Handles project creation
     * @param args - Project creation arguments
     * @returns Tool response
     */
    private async handleCreateProject(args: any) {
        try {
            const project = await this.repo.createProject(args.title, args.description || '');
            return {
                content: [{
                    type: 'text',
                    text: `✅ Project created successfully!\n\nTitle: ${project.title}\nID: ${project.id}\nDescription: ${project.description || 'None'}\nCreated: ${project.created_at}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `❌ Failed to create project: ${error instanceof Error ? error.message : String(error)}`
                }]
            };
        }
    }

    /**
     * Handles project listing
     * @returns Tool response
     */
    private async handleListProjects() {
        try {
            const projects = await this.repo.listProjects();
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(projects, null, 2)
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `❌ Failed to list projects: ${error instanceof Error ? error.message : String(error)}`
                }]
            };
        }
    }

    /**
     * Handles task creation
     * @param args - Task creation arguments
     * @returns Tool response
     */
    private async handleCreateTask(args: any) {
        try {
            const task = await this.repo.createTask(
                args.projectId,
                args.title,
                args.description || '',
                args.parentId || null,
                args.assignee || null,
                args.estimate || null
            );
            return {
                content: [{
                    type: 'text',
                    text: `✅ Task created successfully!\n\nTitle: ${task.title}\nID: ${task.id}\nProject: ${task.project_id}\nAssignee: ${task.assignee || 'Unassigned'}\nEstimate: ${task.estimate || 'Not set'}\nCreated: ${task.created_at}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `❌ Failed to create task: ${error instanceof Error ? error.message : String(error)}`
                }]
            };
        }
    }

    /**
     * Handles task retrieval
     * @param args - Task get arguments
     * @returns Tool response
     */
    private async handleGetTask(args: any) {
        try {
            const task = await this.repo.getTask(args.taskId);
            if (!task) {
                return {
                    content: [{
                        type: 'text',
                        text: `❌ Task not found: ${args.taskId}`
                    }]
                };
            }
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(task, null, 2)
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `❌ Failed to get task: ${error instanceof Error ? error.message : String(error)}`
                }]
            };
        }
    }

    /**
     * Checks if task exists and returns it
     * @param taskId - Task ID
     * @returns Task or null
     */
    private async getTaskForUpdate(taskId: string) {
        const task = await this.repo.getTask(taskId);
        if (!task) {
            return {
                error: {
                    content: [{
                        type: 'text',
                        text: `❌ Task not found: ${taskId}`
                    }]
                }
            };
        }
        return { task };
    }

    /**
     * Validates version for optimistic locking
     * @param args - Update arguments
     * @param currentTask - Current task
     * @returns Error response or null
     */
    private validateTaskVersion(args: any, currentTask: any) {
        if (args.ifVersion !== undefined && currentTask.version !== args.ifVersion) {
            return {
                content: [{
                    type: 'text',
                    text: `❌ Task has been modified by another user. Expected version ${args.ifVersion}, but current version is ${currentTask.version}`
                }]
            };
        }
        return null;
    }

    /**
     * Builds update object for task
     * @param args - Update arguments
     * @param currentTask - Current task
     * @returns Update object
     */
    private buildTaskUpdate(args: any, currentTask: any) {
        return {
            title: args.title !== undefined ? args.title : currentTask.title,
            description: args.description !== undefined ? args.description : currentTask.description,
            assignee: args.assignee !== undefined ? args.assignee : currentTask.assignee,
            status: args.status !== undefined ? args.status : currentTask.status,
            estimate: args.estimate !== undefined ? args.estimate : currentTask.estimate,
            ifVersion: args.ifVersion
        };
    }

    /**
     * Handles task update
     * @param args - Task update arguments
     * @returns Tool response
     */
    private async handleUpdateTask(args: any) {
        try {
            const taskResult = await this.getTaskForUpdate(args.taskId);
            if (taskResult.error) {
                return taskResult.error;
            }

            const currentTask = taskResult.task;
            const versionError = this.validateTaskVersion(args, currentTask);
            if (versionError) {
                return versionError;
            }

            const updateData = this.buildTaskUpdate(args, currentTask);
            const updatedTask = await this.repo.updateTask(args.taskId, updateData);

            return {
                content: [{
                    type: 'text',
                    text: `✅ Task updated successfully!\n\n${JSON.stringify(updatedTask, null, 2)}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `❌ Failed to update task: ${error instanceof Error ? error.message : String(error)}`
                }]
            };
        }
    }

    /**
     * Handles task listing
     * @param args - Task list arguments
     * @returns Tool response
     */
    private async handleListTasks(args: any) {
        try {
            const tasks = await this.repo.listTasks(args.projectId);
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(tasks, null, 2)
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `❌ Failed to list tasks: ${error instanceof Error ? error.message : String(error)}`
                }]
            };
        }
    }

    /**
     * @param params - Tool call parameters
     * @returns Promise<any>
     */
    private async handleToolCall(params: any) {
        const { name, arguments: args = {} } = params ?? {};

        console.error(`[MCP Server] Tool call: ${name}`, args);

        switch (name) {
            case 'wbs.createProject':
                return this.handleCreateProject(args);
            case 'wbs.listProjects':
                return this.handleListProjects();
            case 'wbs.createTask':
                return this.handleCreateTask(args);
            case 'wbs.getTask':
                return this.handleGetTask(args);
            case 'wbs.updateTask':
                return this.handleUpdateTask(args);
            case 'wbs.listTasks':
                return this.handleListTasks(args);
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }

    /**
     *
     * @param response
     */
    private sendResponse(response: JsonRpcResponse) {
        const responseStr = JSON.stringify(response);
        console.error(`[MCP Server] Sending: ${responseStr}`);
        process.stdout.write(responseStr + '\n');
    }
}

// Start the MCP server once the database is ready
(async () => {
    console.error('[MCP Server] Starting stdio MCP server...');
    try {
        await initializeDatabase();
        new StdioMCPServer();
    } catch (error) {
        console.error('[MCP Server] Failed to start server:', error);
        process.exit(1);
    }
})();