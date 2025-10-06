# Testing Procedures

This document provides manual acceptance testing procedures for the WBS MCP extension.

## Prerequisites

- Node.js 20.x or later installed
- VS Code 1.85.0 or later
- Git
- curl or similar HTTP client

## Setup

1. Clone and install:
   ```bash
   git clone https://github.com/nojaja/wbs-mcp.git
   cd wbs-mcp
   npm install
   npm run build
   ```

2. Verify build succeeded:
   ```bash
   ls -la out/extension.js out/server/index.js
   ```

## Test Suite 1: Server Functionality

### Test 1.1: Server Startup
**Objective**: Verify the server starts correctly

**Steps**:
1. Run: `npm run start-server-dev`
2. Verify output shows:
   ```
   Database initialized successfully
   MCP server started on http://127.0.0.1:8000
   ```

**Expected Result**: Server starts without errors

### Test 1.2: MCP Discovery Endpoint
**Objective**: Verify MCP tool metadata is available

**Steps**:
1. With server running, execute:
   ```bash
   curl http://127.0.0.1:8000/mcp/discover | jq '.tools | length'
   ```

**Expected Result**: Returns number > 0 (should be 5 tools)

### Test 1.3: Health Check
**Objective**: Verify health endpoint responds

**Steps**:
1. Execute: `curl http://127.0.0.1:8000/health`

**Expected Result**: Returns JSON with `{"status":"ok"}`

### Test 1.4: Project Creation
**Objective**: Verify project can be created via API

**Steps**:
```bash
curl -X POST http://127.0.0.1:8000/api/wbs/createProject \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Project","description":"A test project"}'
```

**Expected Result**: 
- Status: 201 Created
- Response includes `id`, `version: 1`, `title: "Test Project"`

### Test 1.5: Task Creation
**Objective**: Verify task can be created

**Steps**:
```bash
# Replace <PROJECT_ID> with ID from previous test
curl -X POST http://127.0.0.1:8000/api/wbs/createTask \
  -H "Content-Type: application/json" \
  -d '{
    "projectId":"<PROJECT_ID>",
    "title":"Test Task",
    "assignee":"testuser",
    "estimate":"2d"
  }'
```

**Expected Result**:
- Status: 201 Created
- Response includes `id`, `version: 1`, `status: "pending"`

### Test 1.6: Version Conflict Detection
**Objective**: Verify optimistic locking works

**Steps**:
```bash
# Get task ID from previous test
TASK_ID="<TASK_ID>"

# Update 1: Should succeed
curl -X POST http://127.0.0.1:8000/api/wbs/updateTask \
  -H "Content-Type: application/json" \
  -d "{\"taskId\":\"$TASK_ID\",\"status\":\"in-progress\",\"ifVersion\":1}"

# Update 2: Should fail (version now 2)
curl -X POST http://127.0.0.1:8000/api/wbs/updateTask \
  -H "Content-Type: application/json" \
  -d "{\"taskId\":\"$TASK_ID\",\"status\":\"completed\",\"ifVersion\":1}"
```

**Expected Result**:
- First update: Status 200, version becomes 2
- Second update: Status 409, error message "Version mismatch"

### Test 1.7: Circular Dependency Prevention
**Objective**: Verify cycle detection prevents circular dependencies

**Steps**:
```bash
# Create two tasks
PROJECT_ID="<PROJECT_ID>"
TASK1=$(curl -s -X POST http://127.0.0.1:8000/api/wbs/createTask \
  -H "Content-Type: application/json" \
  -d "{\"projectId\":\"$PROJECT_ID\",\"title\":\"Task A\"}" | jq -r '.id')

TASK2=$(curl -s -X POST http://127.0.0.1:8000/api/wbs/createTask \
  -H "Content-Type: application/json" \
  -d "{\"projectId\":\"$PROJECT_ID\",\"title\":\"Task B\"}" | jq -r '.id')

# Add dependency A -> B (should succeed)
curl -X POST http://127.0.0.1:8000/api/wbs/addDependency \
  -H "Content-Type: application/json" \
  -d "{\"fromTaskId\":\"$TASK1\",\"toTaskId\":\"$TASK2\"}"

# Try to add B -> A (should fail)
curl -X POST http://127.0.0.1:8000/api/wbs/addDependency \
  -H "Content-Type: application/json" \
  -d "{\"fromTaskId\":\"$TASK2\",\"toTaskId\":\"$TASK1\"}"
```

**Expected Result**:
- First dependency: Status 201
- Second dependency: Status 409, error "Circular dependency detected"

### Test 1.8: SSE Streaming
**Objective**: Verify real-time updates via Server-Sent Events

**Steps**:
1. In one terminal, connect to SSE:
   ```bash
   curl -N http://127.0.0.1:8000/mcp/stream?projectId=<PROJECT_ID>
   ```

2. In another terminal, create a task:
   ```bash
   curl -X POST http://127.0.0.1:8000/api/wbs/createTask \
     -H "Content-Type: application/json" \
     -d '{"projectId":"<PROJECT_ID>","title":"SSE Test Task"}'
   ```

**Expected Result**: First terminal receives SSE event with `eventType: "taskCreated"`

### Test 1.9: Session Management
**Objective**: Verify session creation and member management

**Steps**:
```bash
PROJECT_ID="<PROJECT_ID>"

# Start session
SESSION=$(curl -s -X POST http://127.0.0.1:8000/api/wbs/startSession \
  -H "Content-Type: application/json" \
  -d "{\"projectId\":\"$PROJECT_ID\",\"userId\":\"user1\"}" | jq -r '.id')

# User2 joins
curl -X POST http://127.0.0.1:8000/api/wbs/joinSession \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION\",\"userId\":\"user2\"}"

# List members
curl http://127.0.0.1:8000/api/wbs/getSession/$SESSION | jq '.members'
```

**Expected Result**: Session has 2 members (user1, user2)

## Test Suite 2: VS Code Extension

### Test 2.1: Extension Activation
**Objective**: Verify extension can be loaded in VS Code

**Steps**:
1. Open VS Code in the project directory
2. Press `F5` to launch Extension Development Host
3. New VS Code window should open

**Expected Result**: Extension Development Host opens without errors

### Test 2.2: Server Startup via Command
**Objective**: Verify extension can spawn the server

**Steps**:
1. In Extension Development Host, open Command Palette (`Ctrl+Shift+P`)
2. Type: "MCP WBS: Start Local Server"
3. Execute the command
4. Open Output panel and select "MCP-WBS" channel

**Expected Result**:
- Output shows "MCP server started"
- `.vscode/mcp.json` file is created in workspace
- Server is accessible at http://127.0.0.1:8000

### Test 2.3: TreeView Display
**Objective**: Verify WBS Projects tree appears in Explorer

**Steps**:
1. With server running, open Explorer sidebar
2. Look for "WBS Projects" section
3. Click refresh icon if needed

**Expected Result**: 
- "WBS Projects" view appears
- Previously created projects are listed
- Can expand/collapse nodes

### Test 2.4: Task Details Webview
**Objective**: Verify task details can be opened and edited

**Steps**:
1. In WBS Projects tree, expand a project
2. Click on a task
3. Task detail webview should open
4. Modify task fields
5. Click "Save"

**Expected Result**:
- Webview opens with task details
- Form fields are populated
- Save succeeds and shows success message
- Tree updates to reflect changes

### Test 2.5: Concurrent Editing
**Objective**: Verify version conflict handling

**Steps**:
1. Open Extension Development Host #1
2. Open Extension Development Host #2 (same workspace)
3. In both, start the server and open a task's webview
4. In #1: Change status to "in-progress" and save
5. In #2: Change status to "completed" and save

**Expected Result**:
- #1 save succeeds
- #2 save shows version conflict warning
- User is prompted to reload

## Test Suite 3: Data Persistence

### Test 3.1: Database Persistence
**Objective**: Verify data survives server restart

**Steps**:
1. Create a project and task
2. Note the IDs
3. Stop the server
4. Restart the server
5. Query the project/task

**Expected Result**: Data is still available after restart

### Test 3.2: Project Tree Structure
**Objective**: Verify hierarchical task structure

**Steps**:
```bash
# Create project
PROJECT=$(curl -s -X POST http://127.0.0.1:8000/api/wbs/createProject \
  -H "Content-Type: application/json" \
  -d '{"title":"Hierarchy Test"}' | jq -r '.id')

# Create parent task
PARENT=$(curl -s -X POST http://127.0.0.1:8000/api/wbs/createTask \
  -H "Content-Type: application/json" \
  -d "{\"projectId\":\"$PROJECT\",\"title\":\"Parent\"}" | jq -r '.id')

# Create child task
curl -X POST http://127.0.0.1:8000/api/wbs/createTask \
  -H "Content-Type: application/json" \
  -d "{\"projectId\":\"$PROJECT\",\"parentId\":\"$PARENT\",\"title\":\"Child\"}"

# Get project tree
curl http://127.0.0.1:8000/api/wbs/getProject/$PROJECT | jq '.tasks'
```

**Expected Result**: 
- Parent task has `children` array
- Child task appears in parent's children

## Test Suite 4: Error Handling

### Test 4.1: Invalid Project ID
**Objective**: Verify proper error for non-existent project

**Steps**:
```bash
curl http://127.0.0.1:8000/api/wbs/getProject/invalid-id
```

**Expected Result**: Status 404, error message

### Test 4.2: Missing Required Parameters
**Objective**: Verify validation of required fields

**Steps**:
```bash
curl -X POST http://127.0.0.1:8000/api/wbs/createProject \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Result**: Status 400, error about missing title

### Test 4.3: Server Not Running
**Objective**: Verify extension handles server unavailability

**Steps**:
1. Ensure server is NOT running
2. In VS Code, try to refresh TreeView

**Expected Result**: Error message shown to user

## Cleanup

After testing, clean up test data:
```bash
rm -rf data/wbs.db
```

## Automated Testing

To run automated tests (when implemented):
```bash
npm test
```

## Continuous Integration

The project includes a GitHub Actions workflow (`.github/workflows/ci.yml`) that:
1. Installs dependencies
2. Builds the project
3. Runs tests
4. Verifies build artifacts exist

Check the Actions tab on GitHub to see CI results.

## Known Issues

- Tests are currently placeholders (implementation needed)
- E2E tests require VS Code extension testing framework
- Better-sqlite3 may require build tools on some systems

## Future Test Improvements

1. Add comprehensive unit tests for repository layer
2. Implement integration tests for API endpoints
3. Add E2E tests using @vscode/test-electron
4. Set up code coverage reporting
5. Add performance benchmarks
6. Implement load testing for concurrent users
