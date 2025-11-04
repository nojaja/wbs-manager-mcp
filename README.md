# wbs-manager-mcp

A WBS (Work Breakdown Structure) management tool combining a VS Code extension and a local MCP server (stdio/JSON-RPC).

## Overview

This VS Code extension is a WBS tool that allows intuitive management of task hierarchies, deliverables, and dependencies directly within VS Code.
It also functions as a locally launched MCP server, enabling agents such as GitHub Copilot to perform large-scale task decomposition and planning,
and to execute tasks or audit deliverables step by step through MCP integration.

## Main Features

* VS Code extension + local MCP server (stdio/JSON-RPC)
* Create, edit, and drag & drop task hierarchies (parent-child relationships)
* Register, edit, and delete deliverables (artifacts)
* Link tasks and deliverables (deliverable/prerequisite)
* Manage task dependencies (cycle prevention)
* Edit task details via Webview (Ctrl+S to save, optimistic locking supported)
* TreeView UI (“WBS Projects” and “Artifacts” in Explorer sidebar)
* Persistent storage using SQLite database
* MCP tool invocation (operable via natural language from Copilot, etc.)

## Usage (UI Operations)

* Display and edit the task hierarchy in the “WBS Projects” view

  * Right-click or use the inline menu for “Open”, “Delete”, “Add Child Task”
  * Change hierarchy via drag & drop
* Add, edit, or delete deliverables in the “Artifacts” view
* Click a task to open its detail Webview (Ctrl+S to save; version mismatches are notified with ❌)

## Copilot / MCP Integration Examples

Since `.vscode/mcp.json` is auto-generated, the tool is automatically detected by MCP clients such as Copilot.
Responses are returned in `result.content[0].text` as JSON or text with ✅/❌ indicators.


**Example 1: Identifying Tasks**

```
You are a Project Manager.  
From now on, you need to create a project work plan based on the following instructions.  
Use the mcp tool 'wbs.planMode.createTask' to identify all necessary tasks.  
Tasks should be divided into up to three levels, and you must register them step by step starting from the first level.  
After registering up to the third level, confirm the results with the user.  
Developers will refer only to the task descriptions during implementation, so you need to transcribe all information required for the work from the instruction document into the descriptions.  

Below is the specification document:  
＊＊＊＊
```

**Example 2: Task Breakdown and Information Completion**

```
Execute `wbs.planmode.listDraftTasks` to find incomplete tasks, and use `wbs.planMode.updateTask` to update the required fields (title/description/estimate/completionConditions/artifacts/dependency).  
Once all required fields are set via `wbs.planMode.updateTask`, the task status will be updated and it will be removed from the `wbs.planmode.listDraftTasks` list.  
You need to continue updating tasks until the result of `wbs.planmode.listDraftTasks` becomes empty.  
Artifacts should be registered using `wbs.planMode.createArtifact`, and an ID will be generated at the time of registration.  
You must pre-register artifacts that are expected deliverables based on the task contents.
```

**Example 3: Task Execution**

```
You are a developer — please start your work.  
The next task to perform can be retrieved using `wbs.agentmode.getNextTask`,  
and completion should be reported using `wbs.agentmode.taskCompletionRequest`, with the arguments being the taskId obtained from getNextTask and the completion conditions (audits).  
If you cannot complete the task, it may be due to missing completion conditions.  
Repeat this process until `wbs.agentmode.getNextTask` no longer returns a task.
```

See `docs/copilot_examples.md` for detailed examples.

## MCP Tool List

* `wbs.createTask` — Create a task ({ title, description?, parentId?, assignee?, estimate?, deliverables?, prerequisites?, completionConditions? })
* `wbs.getTask` — Get task details ({ taskId })
* `wbs.updateTask` — Update task ({ taskId, ...updates, ifVersion })
* `wbs.listTasks` — List tasks ({ parentId? })
* `wbs.deleteTask` — Delete a task ({ taskId })
* `wbs.moveTask` — Move a task ({ taskId, newParentId })
* `wbs.importTask` — Bulk import multiple tasks ({ tasks: [...] })
* `artifacts.listArtifacts` — List all artifacts
* `artifacts.getArtifact` — Get artifact details ({ artifactId })
* `artifacts.createArtifact` — Create an artifact ({ title, uri?, description? })
* `artifacts.updateArtifact` — Update an artifact ({ artifactId, ...updates, ifVersion })
* `artifacts.deleteArtifact` — Delete an artifact ({ artifactId })

(See `docs/architecture.md` for detailed specifications and parameter examples.)

## Data Storage

* Persisted in a SQLite database at `./data/wbs.db`
* The location can be specified via the `WBS_MCP_DATA_DIR` environment variable (workspace root by default)
* Schema is automatically initialized at first launch
* Tables: tasks, artifacts, task_artifacts, task_completion_conditions, dependencies, task_history

## Development & Testing

### Requirements

* Node.js 18.x or later (tested with Node.js v18.20.7)
* VS Code 1.85.0 or later

### Building from Source and Key Scripts

The root `package.json` defines the following main scripts.
When running on PowerShell, use `;` to separate multiple commands.

* `npm install` — Install dependencies
* `npm test` — Run unit tests with Jest (mapped to `npm run test:unit`)
* `npm run build` — Build (TypeScript compilation, Webview bundling, docs generation, dependency graph creation)
* `npm run build:ts` — Build TypeScript (`tsc -p ./`)
* `npm run build:webview` — Build Webview with webpack (`webpack.webview.config.js`)
* `npm run watch:webview` — Watch build for Webview development
* `npm run start-server-dev` — Launch local MCP server standalone (executes `out/mcpServer/index.js`)
* `npm run start-extension-dev` — Launch VS Code in extension development mode
* `npm run lint` — Run static analysis via eslint and dependency-cruiser
* `npm run docs` — Generate API documentation via typedoc

Example: install dependencies and run unit tests (PowerShell)

```powershell
npm install ; npm run test
```

## Directory Structure (Key Files)

```
wbs-manager-mcp/
├── docs/
│   ├── architecture.md
│   └── copilot_examples.md
├── src/
│   ├── extension/
│   │   ├── index.ts                # VS Code extension entry point (spawn server, register views/commands)
│   │   ├── CommandRegistry.ts
│   │   ├── ExtensionController.ts
│   │   └── panels/                 # Webview panel-related code
│   ├── mcpServer/                  # Local MCP server implementation (runs as subprocess)
│   │   ├── index.ts
│   │   └── db/
│   ├── views/                      # TreeView / UI logic
│   │   ├── wbsTree.ts
│   │   └── artifactTree.ts
├── test/                           # Jest tests (unit / e2e / integration)
├── __mocks__/vscode.ts             # VS Code API mock for tests
├── coverage/                       # Jest coverage reports
├── jest.config.js
├── jest.e2e.config.js
├── package.json
├── tsconfig.json
└── README.md / QUICKSTART.md
```

## Contribution

Contributions are welcome!
Please submit issues or pull requests.
Before contributing, run `npm install`, `npm run lint`, and `npm run test` locally to verify your environment.

## License

MIT License — see `LICENSE`.
