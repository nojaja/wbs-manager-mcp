# Architecture Overview

## System Architecture

The WBS MCP extension consists of two main components:

1. **VS Code Extension** - Client-side UI and MCP integration
2. **Local MCP Server** - HTTP server with REST API and SSE streaming

```
┌─────────────────────────────────────────────────────────────┐
│                      VS Code Extension                       │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Extension  │  │  TreeView    │  │  Webview Panel   │   │
│  │  (main)    │→→│  Provider    │  │  (Task Details)  │   │
│  └────────────┘  └──────────────┘  └──────────────────┘   │
│        │                                                     │
│        │ spawn                                               │
│        ↓                                                     │
└────────┼─────────────────────────────────────────────────────┘
         │
         │ child_process.spawn
         ↓
┌─────────────────────────────────────────────────────────────┐
│                    Local MCP Server (Node.js)                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   Express HTTP Server                 │  │
│  │  ┌──────────┐  ┌─────────┐  ┌──────────┐  ┌──────┐ │  │
│  │  │   MCP    │  │   API   │  │  Stream  │  │ Auth │ │  │
│  │  │ Discover │  │ Routes  │  │  (SSE)   │  │      │ │  │
│  │  └──────────┘  └─────────┘  └──────────┘  └──────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
│                            │                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Business Logic Layer                     │  │
│  │  ┌────────────┐  ┌──────────┐  ┌──────────────────┐ │  │
│  │  │Repository  │  │ Session  │  │     Stream       │ │  │
│  │  │ (CRUD)     │  │ Manager  │  │   Management     │ │  │
│  │  └────────────┘  └──────────┘  └──────────────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
│                            │                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   Data Layer                          │  │
│  │  ┌───────────────────────────────────────────────┐   │  │
│  │  │          SQLite Database (wbs.db)             │   │  │
│  │  │  • projects                                   │   │  │
│  │  │  • tasks                                      │   │  │
│  │  │  • dependencies                               │   │  │
│  │  │  • sessions                                   │   │  │
│  │  │  • session_members                            │   │  │
│  │  │  • task_history                               │   │  │
│  │  └───────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Component Descriptions

### VS Code Extension

#### extension.ts
- Entry point for the extension
- Manages server lifecycle (spawn/kill)
- Creates `.vscode/mcp.json` configuration
- Registers commands and views

#### views/wbsTree.ts
- Implements `TreeDataProvider` interface
- Fetches projects and tasks from the server
- Displays hierarchical task tree
- Handles refresh and navigation

#### panels/taskDetailPanel.ts
- Creates Webview for task editing
- Handles form submissions
- Manages version conflicts
- Communicates with server API

### Local MCP Server

#### server/index.ts
- Express server initialization
- MCP discovery endpoint (`/mcp/discover`)
- SSE streaming endpoint (`/mcp/stream`)
- Route registration

#### server/db.ts
- SQLite database initialization
- Schema creation and migration
- Foreign key constraints

#### server/repository.ts
- Data access layer (DAO pattern)
- CRUD operations for all entities
- Business logic (cycle detection, version control)
- Transaction management

#### server/api.ts
- REST API route handlers
- Request validation
- Error handling
- Event emission after mutations

#### server/stream.ts
- SSE client management
- Event broadcasting
- Connection lifecycle management

#### server/session.ts
- Session creation and management
- Member join/leave operations
- Session state tracking

## Data Model

### Projects Table
```sql
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1
);
```

### Tasks Table
```sql
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    parent_id TEXT,  -- NULL for root tasks
    title TEXT NOT NULL,
    description TEXT,
    goal TEXT,
    assignee TEXT,
    status TEXT DEFAULT 'pending',
    estimate TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE
);
```

### Dependencies Table
```sql
CREATE TABLE dependencies (
    id TEXT PRIMARY KEY,
    from_task_id TEXT NOT NULL,
    to_task_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (from_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (to_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    UNIQUE(from_task_id, to_task_id)
);
```

### Sessions Table
```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

### Session Members Table
```sql
CREATE TABLE session_members (
    session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    joined_at TEXT NOT NULL,
    PRIMARY KEY (session_id, user_id),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
```

### Task History Table
```sql
CREATE TABLE task_history (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    title TEXT,
    description TEXT,
    status TEXT,
    assignee TEXT,
    changed_by TEXT,
    changed_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
```

## Event System

The system uses Server-Sent Events (SSE) for real-time updates.

### Event Types

1. **projectCreated** - New project created
2. **taskCreated** - New task created
3. **taskUpdated** - Task modified
4. **taskDeleted** - Task removed
5. **dependencyAdded** - New dependency created
6. **dependencyRemoved** - Dependency removed
7. **sessionStarted** - New session started
8. **userJoined** - User joined session
9. **userLeft** - User left session

### Event Format
```json
{
  "eventType": "taskCreated",
  "payload": { /* entity data */ },
  "eventId": "evt-1234567890",
  "version": 1,
  "timestamp": "2025-10-06T04:00:00.000Z"
}
```

## Version Control

The system implements **optimistic locking** using version numbers:

1. Each entity (project, task) has a `version` field
2. When updating, client sends `ifVersion` parameter
3. Server checks if current version matches
4. If match: update succeeds, version incremented
5. If mismatch: returns HTTP 409 with current state
6. Client must handle conflict (merge or reload)

### Update Flow
```
Client                          Server
  │                               │
  │  GET /api/wbs/getTask/:id    │
  │─────────────────────────────→│
  │←─────────────────────────────│
  │  { id, version: 1, ... }     │
  │                               │
  │  POST /api/wbs/updateTask    │
  │  { taskId, ifVersion: 1 }    │
  │─────────────────────────────→│
  │                               │
  │         (if version OK)       │
  │←─────────────────────────────│
  │  200 OK { version: 2, ... }  │
  │                               │
  │       (if conflict)           │
  │←─────────────────────────────│
  │  409 Conflict                │
  │  { error, currentTask }      │
```

## Dependency Management

### Cycle Detection Algorithm

Uses **Breadth-First Search (BFS)** to detect cycles:

```typescript
function canReach(startTaskId, targetTaskId) {
    visited = new Set()
    queue = [startTaskId]
    
    while (queue.length > 0) {
        current = queue.shift()
        
        if (current === targetTaskId) {
            return true  // Cycle detected!
        }
        
        if (visited.has(current)) {
            continue
        }
        
        visited.add(current)
        
        // Add all tasks that current depends on
        dependencies = getDependencies(current)
        queue.push(...dependencies)
    }
    
    return false  // No cycle
}
```

Before adding dependency `A → B`, check if `canReach(B, A)`. If true, reject.

## Security Considerations

1. **Local-only server**: Binds to 127.0.0.1, not accessible remotely
2. **No authentication** (current implementation): Suitable for local development only
3. **Input validation**: All API endpoints validate required parameters
4. **SQL injection prevention**: Uses parameterized queries
5. **Foreign key constraints**: Ensures referential integrity

### Future Security Enhancements

- Add authentication tokens
- Implement user authorization (project ownership, task permissions)
- Use `vscode.SecretStorage` for sensitive data
- Add HTTPS support for production deployments
- Rate limiting for API endpoints

## Performance Considerations

1. **Database indices**: Consider adding indices on frequently queried columns
2. **Connection pooling**: SQLite uses single connection (sufficient for local use)
3. **SSE cleanup**: Dead connections are removed when client disconnects
4. **Tree building**: Uses in-memory map for O(n) task tree construction

## Scalability Notes

Current implementation is designed for:
- Single user or small team
- Local development environment
- Projects with up to 1000 tasks

For larger scale:
- Replace SQLite with PostgreSQL or MySQL
- Add Redis for SSE client management
- Implement proper authentication/authorization
- Consider microservices architecture
- Add caching layer (Redis)

## MCP Integration

### Discovery Endpoint
```
GET /mcp/discover
```

Returns tool metadata that enables Copilot to understand available operations:
- Tool ID and name
- Input parameters (JSON Schema)
- Output format (JSON Schema)
- Description for AI interpretation

### Tool Invocation Flow
```
Copilot                    Extension                Server
   │                          │                        │
   │  Interpret user prompt   │                        │
   │──────────────────────────→                        │
   │                          │                        │
   │                          │  Discover tools        │
   │                          │──────────────────────→│
   │                          │←──────────────────────│
   │                          │  Tool metadata         │
   │                          │                        │
   │  Execute tool            │                        │
   │  (wbs.createTask)        │                        │
   │──────────────────────────→                        │
   │                          │  POST /api/wbs/...    │
   │                          │──────────────────────→│
   │                          │←──────────────────────│
   │                          │  Result                │
   │←──────────────────────────                        │
   │  Display result          │                        │
```

## Error Handling

### Client-side (Extension)
- Network errors: Show user-friendly messages
- Timeout: Retry with exponential backoff
- Invalid responses: Log and notify user

### Server-side (API)
- 400 Bad Request: Invalid parameters
- 404 Not Found: Entity doesn't exist
- 409 Conflict: Version mismatch or cycle detected
- 500 Internal Server Error: Unexpected errors

All errors return JSON:
```json
{
  "error": "Human-readable error message"
}
```

## Testing Strategy

### Unit Tests
- Repository layer (CRUD operations)
- Cycle detection algorithm
- Version control logic

### Integration Tests
- API endpoints (request/response)
- SSE streaming
- Database transactions

### E2E Tests
- Extension activation
- Server spawning
- TreeView population
- Webview interaction

## Development Workflow

1. Make changes to TypeScript files
2. Run `npm run build` to compile
3. Press F5 in VS Code to launch Extension Development Host
4. Test in the development environment
5. Use Output channel "MCP-WBS" for debugging
6. Check server logs in the terminal

## Deployment

The extension is designed to be packaged as a `.vsix` file:

```bash
npm install -g vsce
vsce package
```

This creates a `.vsix` file that can be installed in VS Code or published to the marketplace.
