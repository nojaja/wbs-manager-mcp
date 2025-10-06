import express from 'express';
import { Request, Response } from 'express';

const app = express();
const PORT = 8000;

// Middleware
app.use(express.json());

// Store for SSE clients
const sseClients: Map<string, Response[]> = new Map();

// MCP Discovery endpoint
app.get('/mcp/discover', (req: Request, res: Response) => {
    const tools = {
        tools: [
            {
                id: 'wbs.createProject',
                name: 'Create Project',
                description: 'Create a new WBS project',
                inputs: {
                    type: 'object',
                    properties: {
                        title: { type: 'string', description: 'Project title' },
                        description: { type: 'string', description: 'Project description' }
                    },
                    required: ['title']
                },
                outputs: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        title: { type: 'string' },
                        version: { type: 'number' }
                    }
                }
            },
            {
                id: 'wbs.listProjects',
                name: 'List Projects',
                description: 'List all WBS projects',
                inputs: {
                    type: 'object',
                    properties: {}
                },
                outputs: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            title: { type: 'string' }
                        }
                    }
                }
            },
            {
                id: 'wbs.createTask',
                name: 'Create Task',
                description: 'Create a new task in a project',
                inputs: {
                    type: 'object',
                    properties: {
                        projectId: { type: 'string', description: 'Project ID' },
                        parentId: { type: 'string', description: 'Parent task ID (optional)' },
                        title: { type: 'string', description: 'Task title' },
                        description: { type: 'string', description: 'Task description' },
                        assignee: { type: 'string', description: 'Assignee name' },
                        estimate: { type: 'string', description: 'Time estimate (e.g., "3d")' }
                    },
                    required: ['projectId', 'title']
                },
                outputs: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        title: { type: 'string' },
                        version: { type: 'number' }
                    }
                }
            },
            {
                id: 'wbs.updateTask',
                name: 'Update Task',
                description: 'Update an existing task',
                inputs: {
                    type: 'object',
                    properties: {
                        taskId: { type: 'string', description: 'Task ID' },
                        title: { type: 'string', description: 'Task title' },
                        description: { type: 'string', description: 'Task description' },
                        status: { type: 'string', description: 'Task status' },
                        assignee: { type: 'string', description: 'Assignee name' },
                        ifVersion: { type: 'number', description: 'Expected version for optimistic locking' }
                    },
                    required: ['taskId']
                },
                outputs: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        version: { type: 'number' }
                    }
                }
            },
            {
                id: 'wbs.getProject',
                name: 'Get Project',
                description: 'Get project with its task tree',
                inputs: {
                    type: 'object',
                    properties: {
                        projectId: { type: 'string', description: 'Project ID' }
                    },
                    required: ['projectId']
                },
                outputs: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        title: { type: 'string' },
                        tasks: { type: 'array' }
                    }
                }
            }
        ]
    };
    
    res.json(tools);
});

// SSE endpoint for real-time updates
app.get('/mcp/stream', (req: Request, res: Response) => {
    const projectId = req.query.projectId as string || 'default';
    
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Add client to list
    if (!sseClients.has(projectId)) {
        sseClients.set(projectId, []);
    }
    sseClients.get(projectId)!.push(res);
    
    console.log(`SSE client connected for project: ${projectId}`);
    
    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', projectId })}\n\n`);
    
    // Handle client disconnect
    req.on('close', () => {
        const clients = sseClients.get(projectId);
        if (clients) {
            const index = clients.indexOf(res);
            if (index > -1) {
                clients.splice(index, 1);
            }
            if (clients.length === 0) {
                sseClients.delete(projectId);
            }
        }
        console.log(`SSE client disconnected for project: ${projectId}`);
    });
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Helper function to emit SSE events
export function emitEvent(projectId: string, event: any) {
    const clients = sseClients.get(projectId);
    if (clients && clients.length > 0) {
        const eventData = JSON.stringify(event);
        clients.forEach(client => {
            try {
                client.write(`data: ${eventData}\n\n`);
            } catch (error) {
                console.error('Error writing to SSE client:', error);
            }
        });
    }
}

// Start server
app.listen(PORT, '127.0.0.1', () => {
    console.log(`MCP server started on http://127.0.0.1:${PORT}`);
    console.log(`Discovery endpoint: http://127.0.0.1:${PORT}/mcp/discover`);
    console.log(`Stream endpoint: http://127.0.0.1:${PORT}/mcp/stream`);
});
