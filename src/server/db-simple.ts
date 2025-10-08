// Temporary in-memory database for MCP server testing
interface Project {
    id: string;
    title: string;
    description?: string;
    created_at: string;
    updated_at: string;
    version: number;
}

interface Task {
    id: string;
    project_id: string;
    parent_id?: string;
    title: string;
    description?: string;
    assignee?: string;
    status: string;
    estimate?: string;
    created_at: string;
    updated_at: string;
    version: number;
}

let projects: Project[] = [];
let tasks: Task[] = [];
let nextId = 1;

export function initializeDatabase() {
    console.log('In-memory database initialized successfully');
}

export class WBSRepository {
    createProject(title: string, description: string = ''): Project {
        const now = new Date().toISOString();
        const project: Project = {
            id: `proj_${nextId++}`,
            title,
            description,
            created_at: now,
            updated_at: now,
            version: 1
        };
        projects.push(project);
        return project;
    }

    listProjects(): Project[] {
        return [...projects];
    }

    getProject(id: string): Project | null {
        return projects.find(p => p.id === id) || null;
    }

    getProjectWithTasks(projectId: string) {
        const project = this.getProject(projectId);
        if (!project) {
            throw new Error(`Project not found: ${projectId}`);
        }
        
        const projectTasks = tasks.filter(t => t.project_id === projectId);
        return {
            ...project,
            tasks: projectTasks
        };
    }

    createTask(
        projectId: string,
        title: string,
        description: string = '',
        parentId: string | null = null,
        assignee: string | null = null,
        estimate: string | null = null
    ): Task {
        const project = this.getProject(projectId);
        if (!project) {
            throw new Error(`Project not found: ${projectId}`);
        }

        const now = new Date().toISOString();
        const task: Task = {
            id: `task_${nextId++}`,
            project_id: projectId,
            parent_id: parentId || undefined,
            title,
            description,
            assignee: assignee || undefined,
            status: 'pending',
            estimate: estimate || undefined,
            created_at: now,
            updated_at: now,
            version: 1
        };
        tasks.push(task);
        return task;
    }

    listTasks(projectId?: string): Task[] {
        if (projectId) {
            return tasks.filter(t => t.project_id === projectId);
        }
        return [...tasks];
    }

    getTask(taskId: string): Task | null {
        return tasks.find(t => t.id === taskId) || null;
    }

    updateTask(taskId: string, updates: Partial<Task>): Task {
        const taskIndex = tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) {
            throw new Error(`Task not found: ${taskId}`);
        }

        const currentTask = tasks[taskIndex];
        const now = new Date().toISOString();
        
        const updatedTask: Task = {
            ...currentTask,
            ...updates,
            updated_at: now,
            version: currentTask.version + 1
        };

        tasks[taskIndex] = updatedTask;
        return updatedTask;
    }
}