import { Router, Request, Response } from 'express';
import * as repository from './repository';
import { emitEvent } from './stream';

const router = Router();

// Create project
router.post('/wbs/createProject', (req: Request, res: Response) => {
    try {
        const { title, description } = req.body;
        
        if (!title) {
            return res.status(400).json({ error: 'Title is required' });
        }
        
        const project = repository.createProject(title, description);
        
        // Emit event
        emitEvent('global', {
            eventType: 'projectCreated',
            payload: project,
            eventId: `evt-${Date.now()}`,
            timestamp: new Date().toISOString()
        });
        
        res.status(201).json(project);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: errorMessage });
    }
});

// List projects
router.get('/wbs/listProjects', (req: Request, res: Response) => {
    try {
        const projects = repository.listProjects();
        res.json(projects);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: errorMessage });
    }
});

// Get project tree
router.get('/wbs/getProject/:projectId', (req: Request, res: Response) => {
    try {
        const { projectId } = req.params;
        const project = repository.getProjectTree(projectId);
        
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        res.json(project);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: errorMessage });
    }
});

// Get single task
router.get('/wbs/getTask/:taskId', (req: Request, res: Response) => {
    try {
        const { taskId } = req.params;
        const task = repository.getTask(taskId);
        
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        
        res.json(task);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: errorMessage });
    }
});

// Create task
router.post('/wbs/createTask', (req: Request, res: Response) => {
    try {
        const { projectId, parentId, title, description, goal, assignee, estimate } = req.body;
        
        if (!projectId || !title) {
            return res.status(400).json({ error: 'projectId and title are required' });
        }
        
        const task = repository.createTask(projectId, title, parentId, description, goal, assignee, estimate);
        
        // Emit event
        emitEvent(projectId, {
            eventType: 'taskCreated',
            payload: task,
            eventId: `evt-${Date.now()}`,
            version: task.version,
            timestamp: new Date().toISOString()
        });
        
        res.status(201).json(task);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: errorMessage });
    }
});

// Update task
router.post('/wbs/updateTask', (req: Request, res: Response) => {
    try {
        const { taskId, title, description, goal, assignee, status, estimate, ifVersion } = req.body;
        
        if (!taskId) {
            return res.status(400).json({ error: 'taskId is required' });
        }
        
        const updates: any = {};
        if (title !== undefined) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (goal !== undefined) updates.goal = goal;
        if (assignee !== undefined) updates.assignee = assignee;
        if (status !== undefined) updates.status = status;
        if (estimate !== undefined) updates.estimate = estimate;
        
        const task = repository.updateTask(taskId, updates, ifVersion);
        
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        
        // Emit event
        emitEvent(task.project_id, {
            eventType: 'taskUpdated',
            payload: task,
            eventId: `evt-${Date.now()}`,
            version: task.version,
            timestamp: new Date().toISOString()
        });
        
        res.json(task);
    } catch (error) {
        if (error instanceof Error && error.message === 'Version mismatch') {
            // Get current task for response
            const task = repository.getTask(req.body.taskId);
            return res.status(409).json({
                error: 'Version mismatch',
                currentTask: task
            });
        }
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: errorMessage });
    }
});

// Delete task
router.delete('/wbs/deleteTask/:taskId', (req: Request, res: Response) => {
    try {
        const { taskId } = req.params;
        
        // Get task before deleting to emit event
        const task = repository.getTask(taskId);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        
        const success = repository.deleteTask(taskId);
        
        if (success) {
            // Emit event
            emitEvent(task.project_id, {
                eventType: 'taskDeleted',
                payload: { taskId },
                eventId: `evt-${Date.now()}`,
                timestamp: new Date().toISOString()
            });
            
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Task not found' });
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: errorMessage });
    }
});

// Add dependency
router.post('/wbs/addDependency', (req: Request, res: Response) => {
    try {
        const { fromTaskId, toTaskId } = req.body;
        
        if (!fromTaskId || !toTaskId) {
            return res.status(400).json({ error: 'fromTaskId and toTaskId are required' });
        }
        
        const dependency = repository.addDependency(fromTaskId, toTaskId);
        
        if (!dependency) {
            return res.status(400).json({ error: 'Dependency already exists or invalid' });
        }
        
        // Get task to find project
        const task = repository.getTask(fromTaskId);
        if (task) {
            // Emit event
            emitEvent(task.project_id, {
                eventType: 'dependencyAdded',
                payload: dependency,
                eventId: `evt-${Date.now()}`,
                timestamp: new Date().toISOString()
            });
        }
        
        res.status(201).json(dependency);
    } catch (error) {
        if (error instanceof Error && error.message === 'Circular dependency detected') {
            return res.status(409).json({ error: 'Circular dependency detected' });
        }
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: errorMessage });
    }
});

// Remove dependency
router.delete('/wbs/removeDependency/:dependencyId', (req: Request, res: Response) => {
    try {
        const { dependencyId } = req.params;
        
        const dependency = repository.getDependency(dependencyId);
        if (!dependency) {
            return res.status(404).json({ error: 'Dependency not found' });
        }
        
        const success = repository.removeDependency(dependencyId);
        
        if (success) {
            // Get task to find project
            const task = repository.getTask(dependency.from_task_id);
            if (task) {
                // Emit event
                emitEvent(task.project_id, {
                    eventType: 'dependencyRemoved',
                    payload: { dependencyId },
                    eventId: `evt-${Date.now()}`,
                    timestamp: new Date().toISOString()
                });
            }
            
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Dependency not found' });
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: errorMessage });
    }
});

// List dependencies for a task
router.get('/wbs/dependencies/:taskId', (req: Request, res: Response) => {
    try {
        const { taskId } = req.params;
        const dependencies = repository.listDependencies(taskId);
        res.json(dependencies);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: errorMessage });
    }
});

export default router;
