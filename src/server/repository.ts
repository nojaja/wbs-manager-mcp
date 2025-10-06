import { getDatabase } from './db';
import { v4 as uuidv4 } from 'uuid';

export interface Project {
    id: string;
    title: string;
    description?: string;
    created_at: string;
    updated_at: string;
    version: number;
}

export interface Task {
    id: string;
    project_id: string;
    parent_id?: string;
    title: string;
    description?: string;
    goal?: string;
    assignee?: string;
    status: string;
    estimate?: string;
    created_at: string;
    updated_at: string;
    version: number;
}

export interface Dependency {
    id: string;
    from_task_id: string;
    to_task_id: string;
    created_at: string;
}

const db = getDatabase();

// Project CRUD operations
export function createProject(title: string, description?: string): Project {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    const stmt = db.prepare(`
        INSERT INTO projects (id, title, description, created_at, updated_at, version)
        VALUES (?, ?, ?, ?, ?, 1)
    `);
    
    stmt.run(id, title, description || null, now, now);
    
    return getProject(id)!;
}

export function getProject(id: string): Project | null {
    const stmt = db.prepare('SELECT * FROM projects WHERE id = ?');
    return stmt.get(id) as Project | null;
}

export function listProjects(): Project[] {
    const stmt = db.prepare('SELECT * FROM projects ORDER BY created_at DESC');
    return stmt.all() as Project[];
}

export function updateProject(id: string, title?: string, description?: string, ifVersion?: number): Project | null {
    const current = getProject(id);
    if (!current) return null;
    
    // Version check
    if (ifVersion !== undefined && current.version !== ifVersion) {
        throw new Error('Version mismatch');
    }
    
    const now = new Date().toISOString();
    const newVersion = current.version + 1;
    
    const stmt = db.prepare(`
        UPDATE projects 
        SET title = ?, description = ?, updated_at = ?, version = ?
        WHERE id = ?
    `);
    
    stmt.run(
        title ?? current.title,
        description ?? current.description,
        now,
        newVersion,
        id
    );
    
    return getProject(id);
}

export function deleteProject(id: string): boolean {
    const stmt = db.prepare('DELETE FROM projects WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
}

// Task CRUD operations
export function createTask(
    projectId: string,
    title: string,
    parentId?: string,
    description?: string,
    goal?: string,
    assignee?: string,
    estimate?: string
): Task {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    const stmt = db.prepare(`
        INSERT INTO tasks (id, project_id, parent_id, title, description, goal, assignee, status, estimate, created_at, updated_at, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, 1)
    `);
    
    stmt.run(id, projectId, parentId || null, title, description || null, goal || null, assignee || null, estimate || null, now, now);
    
    return getTask(id)!;
}

export function getTask(id: string): Task | null {
    const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
    return stmt.get(id) as Task | null;
}

export function listTasksByProject(projectId: string): Task[] {
    const stmt = db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at ASC');
    return stmt.all(projectId) as Task[];
}

export function getProjectTree(projectId: string): any {
    const project = getProject(projectId);
    if (!project) return null;
    
    const tasks = listTasksByProject(projectId);
    
    // Build tree structure
    const taskMap = new Map<string, any>();
    const rootTasks: any[] = [];
    
    // Create task nodes
    tasks.forEach(task => {
        taskMap.set(task.id, { ...task, children: [] });
    });
    
    // Build hierarchy
    tasks.forEach(task => {
        const node = taskMap.get(task.id);
        if (task.parent_id && taskMap.has(task.parent_id)) {
            taskMap.get(task.parent_id).children.push(node);
        } else {
            rootTasks.push(node);
        }
    });
    
    return {
        ...project,
        tasks: rootTasks
    };
}

export function updateTask(
    id: string,
    updates: {
        title?: string;
        description?: string;
        goal?: string;
        assignee?: string;
        status?: string;
        estimate?: string;
    },
    ifVersion?: number
): Task | null {
    const current = getTask(id);
    if (!current) return null;
    
    // Version check
    if (ifVersion !== undefined && current.version !== ifVersion) {
        throw new Error('Version mismatch');
    }
    
    const now = new Date().toISOString();
    const newVersion = current.version + 1;
    
    const stmt = db.prepare(`
        UPDATE tasks 
        SET title = ?, description = ?, goal = ?, assignee = ?, status = ?, estimate = ?, updated_at = ?, version = ?
        WHERE id = ?
    `);
    
    stmt.run(
        updates.title ?? current.title,
        updates.description ?? current.description,
        updates.goal ?? current.goal,
        updates.assignee ?? current.assignee,
        updates.status ?? current.status,
        updates.estimate ?? current.estimate,
        now,
        newVersion,
        id
    );
    
    // Record history
    const historyStmt = db.prepare(`
        INSERT INTO task_history (id, task_id, version, title, description, status, assignee, changed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    historyStmt.run(
        uuidv4(),
        id,
        newVersion,
        updates.title ?? current.title,
        updates.description ?? current.description,
        updates.status ?? current.status,
        updates.assignee ?? current.assignee,
        now
    );
    
    return getTask(id);
}

export function deleteTask(id: string): boolean {
    const stmt = db.prepare('DELETE FROM tasks WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
}

// Dependency operations
export function addDependency(fromTaskId: string, toTaskId: string): Dependency | null {
    // Check if tasks exist
    const fromTask = getTask(fromTaskId);
    const toTask = getTask(toTaskId);
    
    if (!fromTask || !toTask) {
        throw new Error('Task not found');
    }
    
    // Cannot depend on self
    if (fromTaskId === toTaskId) {
        throw new Error('Circular dependency detected');
    }
    
    // Check for cycles: if we can reach fromTaskId from toTaskId, adding this edge would create a cycle
    if (canReach(toTaskId, fromTaskId)) {
        throw new Error('Circular dependency detected');
    }
    
    const id = uuidv4();
    const now = new Date().toISOString();
    
    try {
        const stmt = db.prepare(`
            INSERT INTO dependencies (id, from_task_id, to_task_id, created_at)
            VALUES (?, ?, ?, ?)
        `);
        
        stmt.run(id, fromTaskId, toTaskId, now);
        
        return getDependency(id);
    } catch (error) {
        // Handle duplicate constraint
        return null;
    }
}

export function getDependency(id: string): Dependency | null {
    const stmt = db.prepare('SELECT * FROM dependencies WHERE id = ?');
    return stmt.get(id) as Dependency | null;
}

export function listDependencies(taskId: string): Dependency[] {
    const stmt = db.prepare('SELECT * FROM dependencies WHERE from_task_id = ? OR to_task_id = ?');
    return stmt.all(taskId, taskId) as Dependency[];
}

export function removeDependency(id: string): boolean {
    const stmt = db.prepare('DELETE FROM dependencies WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
}

// Check if we can reach targetTaskId from startTaskId by following dependencies
function canReach(startTaskId: string, targetTaskId: string): boolean {
    const visited = new Set<string>();
    const queue = [startTaskId];
    
    while (queue.length > 0) {
        const current = queue.shift()!;
        
        if (current === targetTaskId) {
            return true;
        }
        
        if (visited.has(current)) {
            continue;
        }
        
        visited.add(current);
        
        // Get all tasks that current depends on (to_task_id)
        const stmt = db.prepare('SELECT to_task_id FROM dependencies WHERE from_task_id = ?');
        const deps = stmt.all(current) as { to_task_id: string }[];
        
        for (const dep of deps) {
            if (!visited.has(dep.to_task_id)) {
                queue.push(dep.to_task_id);
            }
        }
    }
    
    return false;
}
