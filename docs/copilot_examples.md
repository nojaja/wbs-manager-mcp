# GitHub Copilot Integration Examples

This document provides example prompts and payloads for using GitHub Copilot with the WBS MCP extension.

## MCP Tool Discovery

The extension provides several MCP tools that can be discovered at:
```
GET http://127.0.0.1:8000/mcp/discover
```

## Available MCP Tools

### 1. wbs.createProject
Create a new WBS project

**Example Copilot Prompt:**
```
"Create a new project called 'E-commerce Platform' with description 'Build a modern e-commerce platform'"
```

**Expected Tool Call:**
```json
{
  "tool": "wbs.createProject",
  "parameters": {
    "title": "E-commerce Platform",
    "description": "Build a modern e-commerce platform"
  }
}
```

### 2. wbs.listProjects
List all available projects

**Example Copilot Prompt:**
```
"Show me all WBS projects"
```

**Expected Tool Call:**
```json
{
  "tool": "wbs.listProjects",
  "parameters": {}
}
```

### 3. wbs.createTask
Create a task in a project

**Example Copilot Prompt:**
```
"Create a task 'Implement login' under project X with assignee @taro and estimate 3d"
```

**Expected Tool Call:**
```json
{
  "tool": "wbs.createTask",
  "parameters": {
    "projectId": "<project-id>",
    "title": "Implement login",
    "assignee": "taro",
    "estimate": "3d"
  }
}
```

**More Examples:**
```
"Add a subtask 'Design database schema' under task Y with estimate 2d"
"Create a task 'Set up CI/CD pipeline' assigned to @hanako"
"Add task 'Write API documentation' with description 'Document all REST endpoints'"
```

### 4. wbs.updateTask
Update an existing task

**Example Copilot Prompts:**
```
"Mark task X as completed"
"Change the assignee of task Y to @satoshi"
"Update the estimate for task Z to 5 days"
"Set status of login task to in-progress"
```

**Expected Tool Call:**
```json
{
  "tool": "wbs.updateTask",
  "parameters": {
    "taskId": "<task-id>",
    "status": "completed",
    "ifVersion": 1
  }
}
```

### 5. wbs.getProject
Get project details with task tree

**Example Copilot Prompts:**
```
"Show me the WBS for project X"
"What tasks are in the e-commerce project?"
"Display the project structure for Y"
```

**Expected Tool Call:**
```json
{
  "tool": "wbs.getProject",
  "parameters": {
    "projectId": "<project-id>"
  }
}
```

## Complex Workflow Examples

### Example 1: Create a Full Project Structure

**Copilot Prompt:**
```
Create a project "Mobile App Development" with the following tasks:
1. Design phase (3d)
   - UI/UX mockups (2d, @designer)
   - Database schema (1d, @backend)
2. Development phase (10d)
   - Backend API (5d, @backend)
   - Frontend app (5d, @frontend)
3. Testing phase (3d)
   - Unit tests (1d, @backend)
   - Integration tests (2d, @qa)
```

**Expected Sequence:**
1. Call `wbs.createProject` with title "Mobile App Development"
2. Call `wbs.createTask` for "Design phase"
3. Call `wbs.createTask` for "UI/UX mockups" with parentId from step 2
4. Call `wbs.createTask` for "Database schema" with parentId from step 2
5. Continue for remaining tasks...

### Example 2: Query and Update

**Copilot Prompt:**
```
Show me all pending tasks in project X, then mark any assigned to @taro as in-progress
```

**Expected Sequence:**
1. Call `wbs.getProject` to get project structure
2. Filter tasks with status="pending" and assignee="taro"
3. For each matching task, call `wbs.updateTask` with status="in-progress"

### Example 3: Team Collaboration

**Copilot Prompt:**
```
Start a new work session for project X with user @john, then add @mary and @alice to the session
```

**Tool Calls:**
```json
[
  {
    "tool": "wbs.startSession",
    "parameters": {
      "projectId": "<project-id>",
      "userId": "john"
    }
  },
  {
    "tool": "wbs.joinSession",
    "parameters": {
      "sessionId": "<session-id>",
      "userId": "mary"
    }
  },
  {
    "tool": "wbs.joinSession",
    "parameters": {
      "sessionId": "<session-id>",
      "userId": "alice"
    }
  }
]
```

## Natural Language to Tool Mapping

| User Intent | MCP Tool | Key Parameters |
|-------------|----------|----------------|
| "Create project..." | wbs.createProject | title, description |
| "List projects" | wbs.listProjects | none |
| "Add task..." | wbs.createTask | projectId, title, assignee, estimate |
| "Update task..." | wbs.updateTask | taskId, status/assignee/etc |
| "Show project..." | wbs.getProject | projectId |
| "Mark as complete" | wbs.updateTask | taskId, status="completed" |
| "Assign to @user" | wbs.updateTask | taskId, assignee="user" |
| "Create subtask..." | wbs.createTask | projectId, parentId, title |

## API Response Formats

### Success Response (createProject)
```json
{
  "id": "uuid-v4",
  "title": "Project Title",
  "description": "Description",
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "version": 1
}
```

### Success Response (createTask)
```json
{
  "id": "uuid-v4",
  "project_id": "uuid-v4",
  "parent_id": "uuid-v4 or null",
  "title": "Task Title",
  "description": "Description",
  
  "assignee": "username",
  "status": "pending|in-progress|completed|blocked",
  "estimate": "3d",
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "version": 1
}
```

### Error Response (Version Conflict)
```json
{
  "error": "Version mismatch",
  "currentTask": {
    "id": "uuid-v4",
    "version": 2,
    ...
  }
}
```

## Real-time Updates (SSE)

When connected to the SSE stream, clients receive events like:

```json
{
  "eventType": "taskCreated|taskUpdated|taskDeleted|userJoined|userLeft",
  "payload": { /* task or event data */ },
  "eventId": "evt-timestamp",
  "version": 2,
  "timestamp": "ISO-8601"
}
```

## Best Practices for Copilot Integration

1. **Always include version**: When updating tasks, include the `ifVersion` parameter to prevent conflicts
2. **Handle conflicts gracefully**: If a 409 response is received, fetch the current version and present merge options
3. **Use descriptive titles**: Clear task titles help Copilot understand context better
4. **Leverage estimates**: Use standard formats like "3d", "5h", "2w" for time estimates
5. **Natural language**: Copilot can parse natural language; be conversational in prompts

## Testing Copilot Integration

You can test MCP tool calls using curl:

```bash
# Discover available tools
curl http://127.0.0.1:8000/mcp/discover

# Create a project
curl -X POST http://127.0.0.1:8000/api/wbs/createProject \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Project"}'

# Create a task
curl -X POST http://127.0.0.1:8000/api/wbs/createTask \
  -H "Content-Type: application/json" \
  -d '{"projectId":"<id>","title":"Test Task","assignee":"taro","estimate":"3d"}'

# Subscribe to updates
curl -N http://127.0.0.1:8000/mcp/stream?projectId=<id>
```

## Troubleshooting

### Issue: Copilot doesn't see the tools
- Ensure the MCP server is running (`MCP WBS: Start Local Server`)
- Check that `.vscode/mcp.json` exists in your workspace
- Verify the server is accessible at `http://127.0.0.1:8000`

### Issue: Version conflicts
- This is expected when multiple users edit the same task
- Always fetch the latest version before updating
- Use the `ifVersion` parameter to ensure optimistic locking

### Issue: Dependency cycle errors
- The system prevents circular dependencies
- Review your task dependencies before adding new ones
- Use the API to check existing dependencies first
