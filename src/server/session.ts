import { getDatabase } from './db';
import { v4 as uuidv4 } from 'uuid';

export interface Session {
    id: string;
    project_id: string;
    created_at: string;
    updated_at: string;
}

export interface SessionMember {
    session_id: string;
    user_id: string;
    joined_at: string;
}

const db = getDatabase();

// Session CRUD operations
export function createSession(projectId: string): Session {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    const stmt = db.prepare(`
        INSERT INTO sessions (id, project_id, created_at, updated_at)
        VALUES (?, ?, ?, ?)
    `);
    
    stmt.run(id, projectId, now, now);
    
    return getSession(id)!;
}

export function getSession(id: string): Session | null {
    const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
    return stmt.get(id) as Session | null;
}

export function listSessions(projectId?: string): Session[] {
    if (projectId) {
        const stmt = db.prepare('SELECT * FROM sessions WHERE project_id = ? ORDER BY created_at DESC');
        return stmt.all(projectId) as Session[];
    } else {
        const stmt = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC');
        return stmt.all() as Session[];
    }
}

export function deleteSession(id: string): boolean {
    const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
}

// Session member operations
export function joinSession(sessionId: string, userId: string): SessionMember | null {
    const session = getSession(sessionId);
    if (!session) {
        throw new Error('Session not found');
    }
    
    const now = new Date().toISOString();
    
    try {
        const stmt = db.prepare(`
            INSERT INTO session_members (session_id, user_id, joined_at)
            VALUES (?, ?, ?)
        `);
        
        stmt.run(sessionId, userId, now);
        
        // Update session updated_at
        const updateStmt = db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?');
        updateStmt.run(now, sessionId);
        
        return getSessionMember(sessionId, userId);
    } catch (error) {
        // User already in session
        return getSessionMember(sessionId, userId);
    }
}

export function leaveSession(sessionId: string, userId: string): boolean {
    const stmt = db.prepare('DELETE FROM session_members WHERE session_id = ? AND user_id = ?');
    const result = stmt.run(sessionId, userId);
    
    if (result.changes > 0) {
        // Update session updated_at
        const now = new Date().toISOString();
        const updateStmt = db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?');
        updateStmt.run(now, sessionId);
    }
    
    return result.changes > 0;
}

export function getSessionMember(sessionId: string, userId: string): SessionMember | null {
    const stmt = db.prepare('SELECT * FROM session_members WHERE session_id = ? AND user_id = ?');
    return stmt.get(sessionId, userId) as SessionMember | null;
}

export function listSessionMembers(sessionId: string): SessionMember[] {
    const stmt = db.prepare('SELECT * FROM session_members WHERE session_id = ? ORDER BY joined_at ASC');
    return stmt.all(sessionId) as SessionMember[];
}

export function getSessionWithMembers(sessionId: string): any {
    const session = getSession(sessionId);
    if (!session) return null;
    
    const members = listSessionMembers(sessionId);
    
    return {
        ...session,
        members
    };
}
