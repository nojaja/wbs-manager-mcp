# wbs-mcp

MCP対応のVS Code拡張のWBS作成ツール

A VS Code extension for Work Breakdown Structure (WBS) management with Model Context Protocol (MCP) support.

## Features

- **Local MCP Server**: Automatically spawns a local HTTP server that provides MCP tool discovery
- **Project Management**: Create and manage multiple WBS projects
- **Task Hierarchy**: Create tasks with parent-child relationships
- **Real-time Updates**: Server-Sent Events (SSE) for live collaboration
- **Version Control**: Optimistic locking to prevent concurrent update conflicts
- **Dependency Management**: Define task dependencies with cycle detection
- **TreeView UI**: Visual project and task explorer in VS Code
- **Task Details**: Webview panel for editing task details

## Installation & Setup

### Prerequisites

- Node.js 20.x or later
- VS Code 1.85.0 or later

### Building from Source

1. Clone the repository:
   ```bash
   git clone https://github.com/nojaja/wbs-mcp.git
   cd wbs-mcp
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Open in VS Code for development:
   ```bash
   code .
   ```

5. Press `F5` to launch the Extension Development Host

## Usage

### Starting the MCP Server

1. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Run: `MCP WBS: Start Local Server`
3. The server will start on `http://127.0.0.1:8000`
4. A `.vscode/mcp.json` file will be created in your workspace

### Using the TreeView

- The **WBS Projects** view appears in the Explorer sidebar
- Click the refresh icon to reload projects and tasks
- Click on a task to open its details in a webview panel

### API Endpoints

The local server provides these endpoints:

- `GET /mcp/discover` - MCP tool discovery
- `GET /mcp/stream?projectId=<id>` - SSE stream for real-time updates
- `POST /api/wbs/createProject` - Create a new project
- `GET /api/wbs/listProjects` - List all projects
- `GET /api/wbs/getProject/:projectId` - Get project with task tree
- `POST /api/wbs/createTask` - Create a new task
- `POST /api/wbs/updateTask` - Update a task (with version check)
- `DELETE /api/wbs/deleteTask/:taskId` - Delete a task
- `POST /api/wbs/addDependency` - Add a task dependency
- `DELETE /api/wbs/removeDependency/:dependencyId` - Remove a dependency

### Example: Creating a Project via API

```bash
curl -X POST http://127.0.0.1:8000/api/wbs/createProject \
  -H "Content-Type: application/json" \
  -d '{"title":"My Project","description":"Project description"}'
```

### Example: Creating a Task

```bash
curl -X POST http://127.0.0.1:8000/api/wbs/createTask \
  -H "Content-Type: application/json" \
  -d '{
    "projectId":"<project-id>",
    "title":"Implement login",
    "assignee":"taro",
    "estimate":"3d"
  }'
```

## MCP Integration

The extension creates an MCP configuration at `.vscode/mcp.json` that enables Copilot and other MCP clients to discover available tools:

```json
{
  "servers": [
    {
      "id": "local-wbs",
      "name": "Local WBS (MCP)",
      "type": "http",
      "url": "http://127.0.0.1:8000/mcp"
    }
  ]
}
```

### Available MCP Tools

- `wbs.createProject` - Create a new WBS project
- `wbs.listProjects` - List all projects
- `wbs.getProject` - Get project with full task tree
- `wbs.createTask` - Create a task with parent, assignee, estimate
- `wbs.updateTask` - Update task fields with version control

## Data Storage

- SQLite database stored in `./data/wbs.db`
- Includes tables for: projects, tasks, dependencies, sessions, task_history
- Automatic schema initialization on first run

## Development

### Scripts

- `npm run build` - Compile TypeScript
- `npm run watch` - Watch mode for development
- `npm run start-server-dev` - Run server independently
- `npm test` - Run tests (to be implemented)

### Architecture

```
src/
├── extension.ts          # VS Code extension entry point
├── views/
│   └── wbsTree.ts       # TreeView data provider
├── panels/
│   └── taskDetailPanel.ts  # Webview for task editing
└── server/
    ├── index.ts         # Express server & MCP discovery
    ├── db.ts            # SQLite database initialization
    ├── repository.ts    # Data access layer
    ├── api.ts           # REST API routes
    └── stream.ts        # SSE event streaming
```

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License - see LICENSE file for details

