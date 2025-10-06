import { Response } from 'express';

// Store for SSE clients organized by projectId
const sseClients: Map<string, Response[]> = new Map();

export function addClient(projectId: string, client: Response) {
    if (!sseClients.has(projectId)) {
        sseClients.set(projectId, []);
    }
    sseClients.get(projectId)!.push(client);
    console.log(`SSE client connected for project: ${projectId}. Total clients: ${sseClients.get(projectId)!.length}`);
}

export function removeClient(projectId: string, client: Response) {
    const clients = sseClients.get(projectId);
    if (clients) {
        const index = clients.indexOf(client);
        if (index > -1) {
            clients.splice(index, 1);
        }
        if (clients.length === 0) {
            sseClients.delete(projectId);
        }
        console.log(`SSE client disconnected for project: ${projectId}. Remaining clients: ${clients.length}`);
    }
}

export function emitEvent(projectId: string, event: any) {
    const clients = sseClients.get(projectId);
    if (clients && clients.length > 0) {
        const eventData = JSON.stringify(event);
        console.log(`Emitting event to ${clients.length} clients for project: ${projectId}`);
        
        clients.forEach((client, index) => {
            try {
                client.write(`data: ${eventData}\n\n`);
            } catch (error) {
                console.error(`Error writing to SSE client ${index}:`, error);
                // Remove dead client
                removeClient(projectId, client);
            }
        });
    }
}

export function getClientCount(projectId?: string): number {
    if (projectId) {
        return sseClients.get(projectId)?.length || 0;
    }
    // Return total count across all projects
    let total = 0;
    sseClients.forEach(clients => {
        total += clients.length;
    });
    return total;
}
