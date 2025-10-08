import express from 'express';
import { Request, Response } from 'express';
import { initializeDatabase, WBSRepository } from './db-simple'; // Use simple in-memory database

// Initialize database
initializeDatabase();

// For now, skip API router and stream functionality to focus on MCP
// import apiRouter from './api';
// import { addClient, removeClient } from './stream';

console.log('All imports successful, starting server setup...');

const app = express();
const PORT = 8000;

console.log('Express app created, setting up middleware...');

// Middleware
app.use(express.json({ limit: '10mb' }));
console.log('JSON middleware added');

// CORS for MCP clients
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
    }
    next();
});

// API routes (temporarily disabled)
// console.log('Setting up API routes...');
// app.use('/api', apiRouter);
// console.log('API routes configured');

console.log('Setting up MCP endpoint...');

// MCP JSON-RPC endpoint
app.post('/mcp', async (req: Request, res: Response) => {
    try {
        const { method, params, id } = req.body;
        
        console.log(`MCP Request: ${method}`, params);
        
        switch (method) {
            case 'initialize':
                res.json({
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
                });
                break;
                
            case 'tools/list':
                res.json({
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
                            }
                        ]
                    }
                });
                break;
                
            case 'tools/call':
                const toolResult = await handleToolCall(params);
                res.json({
                    jsonrpc: '2.0',
                    id,
                    result: toolResult
                });
                break;
                
            case 'notifications/initialized':
                // This is a notification, no response needed
                console.log('Client initialized successfully');
                res.status(200).end();
                break;
                
            case 'ping':
                res.json({
                    jsonrpc: '2.0',
                    id,
                    result: {}
                });
                break;
                
            case 'resources/list':
                res.json({
                    jsonrpc: '2.0',
                    id,
                    result: {
                        resources: []
                    }
                });
                break;
                
            case 'prompts/list':
                res.json({
                    jsonrpc: '2.0',
                    id,
                    result: {
                        prompts: []
                    }
                });
                break;
                
            default:
                res.status(400).json({
                    jsonrpc: '2.0',
                    id,
                    error: {
                        code: -32601,
                        message: `Method not found: ${method}`
                    }
                });
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('MCP Error:', errorMessage);
        res.status(500).json({
            jsonrpc: '2.0',
            id: req.body?.id,
            error: {
                code: -32603,
                message: errorMessage
            }
        });
    }
});

async function handleToolCall(params: any) {
    const { name, arguments: args } = params;
    
    console.log(`Tool call: ${name}`, args);
    
    const repo = new WBSRepository();
    
    switch (name) {
        case 'wbs.createProject':
            try {
                const project = repo.createProject(args.title, args.description || '');
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
            
        case 'wbs.listProjects':
            try {
                const projects = repo.listProjects();
                if (projects.length === 0) {
                    return {
                        content: [{
                            type: 'text',
                            text: '📝 No projects found. Create a project first using wbs.createProject.'
                        }]
                    };
                }
                
                const projectList = projects.map(p => 
                    `• **${p.title}** (ID: ${p.id})\n  ${p.description || 'No description'}\n  Created: ${new Date(p.created_at).toLocaleDateString()}`
                ).join('\n\n');
                
                return {
                    content: [{
                        type: 'text',
                        text: `📁 Found ${projects.length} project(s):\n\n${projectList}`
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
            
        case 'wbs.createTask':
            try {
                const task = repo.createTask(
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
            
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// MCP Discovery endpoint (for HTTP clients)
app.get('/mcp/discover', (req: Request, res: Response) => {
    res.json({
        tools: [
            {
                name: 'wbs.createProject',
                description: 'Create a new WBS project'
            },
            {
                name: 'wbs.listProjects',
                description: 'List all WBS projects'
            },
            {
                name: 'wbs.createTask',
                description: 'Create a new task'
            }
        ]
    });
});

// SSE endpoint for real-time updates (temporarily disabled)
/*
app.get('/mcp/stream', (req: Request, res: Response) => {
    const projectId = req.query.projectId as string || 'default';
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    addClient(projectId, res);
    
    res.write(`data: ${JSON.stringify({ type: 'connected', projectId })}\n\n`);
    
    req.on('close', () => {
        removeClient(projectId, res);
    });
});
*/

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// REST API endpoints for VS Code TreeView
app.get('/api/projects', (req: Request, res: Response) => {
    try {
        const repo = new WBSRepository();
        const projects = repo.listProjects();
        console.log(`[Server] REST API: GET /api/projects - returning ${projects.length} projects`);
        res.json(projects);
    } catch (error) {
        console.error('[Server] Error in GET /api/projects:', error);
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});

app.get('/api/projects/:projectId/tasks', (req: Request, res: Response) => {
    try {
        const { projectId } = req.params;
        const repo = new WBSRepository();
        const tasks = repo.listTasks(projectId);
        console.log(`[Server] REST API: GET /api/projects/${projectId}/tasks - returning ${tasks.length} tasks`);
        res.json(tasks);
    } catch (error) {
        console.error(`[Server] Error in GET /api/projects/${req.params.projectId}/tasks:`, error);
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
});

app.post('/api/projects', (req: Request, res: Response) => {
    try {
        const { title, description } = req.body;
        if (!title) {
            return res.status(400).json({ error: 'Title is required' });
        }
        const repo = new WBSRepository();
        const project = repo.createProject(title, description);
        console.log(`[Server] REST API: POST /api/projects - created project ${project.id}`);
        res.status(201).json(project);
    } catch (error) {
        console.error('[Server] Error in POST /api/projects:', error);
        res.status(500).json({ error: 'Failed to create project' });
    }
});

app.post('/api/projects/:projectId/tasks', (req: Request, res: Response) => {
    try {
        const { projectId } = req.params;
        const { title, description, priority } = req.body;
        if (!title) {
            return res.status(400).json({ error: 'Title is required' });
        }
        const repo = new WBSRepository();
        const task = repo.createTask(
            projectId,
            title,
            description || '',
            null, // parentId
            null, // assignee
            null  // estimate
        );
        console.log(`[Server] REST API: POST /api/projects/${projectId}/tasks - created task ${task.id}`);
        res.status(201).json(task);
    } catch (error) {
        console.error(`[Server] Error in POST /api/projects/${req.params.projectId}/tasks:`, error);
        res.status(500).json({ error: 'Failed to create task' });
    }
});

// Task detail endpoints
app.get('/api/tasks/:taskId', (req: Request, res: Response) => {
    try {
        const { taskId } = req.params;
        const repo = new WBSRepository();
        const task = repo.getTask(taskId);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        console.log(`[Server] REST API: GET /api/tasks/${taskId} - returning task details`);
        res.json(task);
    } catch (error) {
        console.error(`[Server] Error in GET /api/tasks/${req.params.taskId}:`, error);
        res.status(500).json({ error: 'Failed to fetch task' });
    }
});

app.put('/api/tasks/:taskId', (req: Request, res: Response) => {
    try {
        const { taskId } = req.params;
        console.log(`[Server] REST API: PUT /api/tasks/${taskId} - received data:`, req.body);
        
        const { title, description, assignee, status, estimate, ifVersion } = req.body;
        const repo = new WBSRepository();
        
        const currentTask = repo.getTask(taskId);
        if (!currentTask) {
            return res.status(404).json({ error: 'Task not found' });
        }
        
        // Version check for optimistic locking
        if (ifVersion && currentTask.version !== ifVersion) {
            return res.status(409).json({ error: 'Task has been modified by another user' });
        }
        
        const updatedTask = repo.updateTask(taskId, {
            title: title !== undefined ? title : currentTask.title,
            description: description !== undefined ? description : currentTask.description,
            assignee: assignee !== undefined ? assignee : currentTask.assignee,
            status: status !== undefined ? status : currentTask.status,
            estimate: estimate !== undefined ? estimate : currentTask.estimate
        });
        
        console.log(`[Server] REST API: PUT /api/tasks/${taskId} - task updated successfully`);
        res.json(updatedTask);
    } catch (error) {
        console.error(`[Server] Error in PUT /api/tasks/${req.params.taskId}:`, error);
        res.status(500).json({ error: 'Failed to update task' });
    }
});

// Error handling for server startup
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Start server
const server = app.listen(PORT, '127.0.0.1', () => {
    console.log(`MCP server started on http://127.0.0.1:${PORT}`);
    console.log(`Discovery endpoint: http://127.0.0.1:${PORT}/mcp/discover`);
    console.log(`MCP endpoint: http://127.0.0.1:${PORT}/mcp`);
    console.log(`Health endpoint: http://127.0.0.1:${PORT}/health`);
    console.log(`REST API endpoints:`);
    console.log(`  GET    http://127.0.0.1:${PORT}/api/projects`);
    console.log(`  POST   http://127.0.0.1:${PORT}/api/projects`);
    console.log(`  GET    http://127.0.0.1:${PORT}/api/projects/:projectId/tasks`);
    console.log(`  POST   http://127.0.0.1:${PORT}/api/projects/:projectId/tasks`);
    console.log(`  GET    http://127.0.0.1:${PORT}/api/tasks/:taskId`);
    console.log(`  PUT    http://127.0.0.1:${PORT}/api/tasks/:taskId`);
    console.log(`Server process ID: ${process.pid}`);
});

server.on('error', (error) => {
    console.error('Server error:', error);
    process.exit(1);
});