# Quick Start Guide

Get started with WBS MCP in 5 minutes!

## Installation

```bash
# Clone the repository
git clone https://github.com/nojaja/wbs-mcp.git
cd wbs-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

## Running the Server

### Option 1: Via VS Code Extension (Recommended)

1. Open VS Code in the project directory:
   ```bash
   code .
   ```

2. Press `F5` to launch the Extension Development Host

3. In the new VS Code window:
   - Open Command Palette: `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
   - Type: `MCP WBS: Start Local Server`
   - Press Enter

4. Check the Output panel (View → Output → "MCP-WBS") to verify server started

### Option 2: Standalone Server

```bash
npm run start-server-dev
```

The server will start at `http://127.0.0.1:8000`

## Using the UI

### TreeView

1. Open the Explorer sidebar in VS Code
2. Look for the "WBS Projects" section
3. Click the refresh icon to load projects
4. Expand projects to see tasks
5. Click on a task to open its details

### Task Details

- Click any task in the tree to open the details panel
- Edit fields: title, description, goal, assignee, status, estimate
- Click "Save" to update the task
- Changes are synced in real-time via SSE

## Quick API Examples

### Create a Project

```bash
curl -X POST http://127.0.0.1:8000/api/wbs/createProject \
  -H "Content-Type: application/json" \
  -d '{"title":"My First Project","description":"Getting started with WBS"}'
```

### Create a Task

```bash
# Replace <PROJECT_ID> with the ID from the previous command
curl -X POST http://127.0.0.1:8000/api/wbs/createTask \
  -H "Content-Type: application/json" \
  -d '{
    "projectId":"<PROJECT_ID>",
    "title":"Setup development environment",
    "assignee":"developer",
    "estimate":"2d"
  }'
```

### View Project Structure

```bash
curl http://127.0.0.1:8000/api/wbs/getProject/<PROJECT_ID> | jq .
```

## Using with GitHub Copilot

Once the server is running and `.vscode/mcp.json` is created, you can use natural language with Copilot:

```
"Create a project 'E-commerce Platform' with tasks for frontend, backend, and testing"

"Add a task 'Implement user authentication' assigned to @john with estimate 5d"

"Show me all pending tasks in project X"

"Mark task Y as completed"
```

See [docs/copilot_examples.md](docs/copilot_examples.md) for more examples.

## Common Tasks

### Start a Collaboration Session

```bash
# Start session
SESSION_ID=$(curl -s -X POST http://127.0.0.1:8000/api/wbs/startSession \
  -H "Content-Type: application/json" \
  -d '{"projectId":"<PROJECT_ID>","userId":"alice"}' | jq -r '.id')

# Others join
curl -X POST http://127.0.0.1:8000/api/wbs/joinSession \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"userId\":\"bob\"}"
```

### Add Task Dependencies

```bash
# Task B depends on Task A
curl -X POST http://127.0.0.1:8000/api/wbs/addDependency \
  -H "Content-Type: application/json" \
  -d '{"fromTaskId":"<TASK_B_ID>","toTaskId":"<TASK_A_ID>"}'
```

### Subscribe to Real-time Updates

```bash
# Open in a terminal and leave running
curl -N http://127.0.0.1:8000/mcp/stream?projectId=<PROJECT_ID>

# You'll see events as tasks are created/updated/deleted
```

## Troubleshooting

### Server Won't Start

**Issue**: `EADDRINUSE: address already in use`

**Solution**: Another process is using port 8000. Kill it or change the port in `src/server/index.ts`

```bash
# Find process using port 8000
lsof -i :8000

# Kill it
kill -9 <PID>
```

### TreeView is Empty

**Issue**: No projects shown in WBS Projects view

**Solutions**:
1. Click the refresh icon
2. Ensure server is running (check Output panel)
3. Create a project using API or Copilot

### Build Errors

**Issue**: `better-sqlite3` build fails

**Solution**: Install build tools

**macOS**:
```bash
xcode-select --install
```

**Ubuntu/Debian**:
```bash
sudo apt-get install build-essential python3
```

**Windows**:
```bash
npm install --global windows-build-tools
```

### Database Errors

**Issue**: Corrupted database

**Solution**: Delete and restart
```bash
rm -rf data/wbs.db
# Server will recreate on next start
```

## Next Steps

- Read the [Architecture Overview](docs/architecture.md) to understand the system design
- Check [Copilot Examples](docs/copilot_examples.md) for integration patterns
- Review [Testing Procedures](TESTING.md) for comprehensive testing
- Explore the API at `http://127.0.0.1:8000/mcp/discover`

## Key Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/mcp/discover` | GET | MCP tool discovery |
| `/mcp/stream` | GET | SSE real-time updates |
| `/api/wbs/createProject` | POST | Create project |
| `/api/wbs/listProjects` | GET | List all projects |
| `/api/wbs/createTask` | POST | Create task |
| `/api/wbs/updateTask` | POST | Update task |
| `/api/wbs/getProject/:id` | GET | Get project with tasks |
| `/api/wbs/addDependency` | POST | Add task dependency |
| `/api/wbs/startSession` | POST | Start collaboration session |

## Configuration

The server creates a `.vscode/mcp.json` file in your workspace:

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

This enables MCP clients (like Copilot) to discover the tools automatically.

## Data Location

All data is stored in SQLite database at `./data/wbs.db`

To backup your data:
```bash
cp data/wbs.db data/wbs.db.backup
```

## Support

For issues, feature requests, or questions:
- Open an issue on GitHub
- Check existing documentation in the `docs/` folder
- Review the `TESTING.md` for testing procedures

## Development Mode

For active development:

1. Terminal 1 - Watch mode:
   ```bash
   npm run watch
   ```

2. Terminal 2 - Server:
   ```bash
   npm run start-server-dev
   ```

3. VS Code - Press `F5` to launch extension

Changes to TypeScript files will auto-compile in watch mode.

---

**Enjoy building structured work breakdowns with WBS MCP!** 🚀
