import fs from 'fs';
import path from 'path';
import os from 'os';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

import * as DB from '../../src/mcpServer/db/DatabaseManager';
import { TaskService } from '../../src/mcpServer/services/TaskService';

let tmpDir: string;
let db: any;
let svc: TaskService;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbs-test-'));
  process.env.WBS_MCP_DATA_DIR = tmpDir;
  await DB.initializeDatabase();
  const dbPath = DB.resolveDatabasePath();
  db = await open({ filename: dbPath, driver: sqlite3.Database });
  svc = new TaskService(db);
});

afterEach(async () => {
  try { await db.close(); } catch (e) {}
  try { await DB.closeAndClearDatabase(); } catch (e) {}
  delete process.env.WBS_MCP_DATA_DIR;
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('createTask and getTask with deliverables and completionConditions', async () => {
  // prepare artifact
  const artId = 'a1';
  await db.run(`INSERT INTO artifacts (id, title, uri, description, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, 1)`, artId, 'Artifact 1', null, null, new Date().toISOString(), new Date().toISOString());

  const id = await svc.createTask('T1', 'desc', null, null, null, { deliverables: [{ artifactId: artId }], completionConditions: [{ description: 'done' }] });
  expect(typeof id).toBe('string');
  const t = await svc.getTask(id);
  expect(t).not.toBeNull();
  expect(Array.isArray(t.deliverables)).toBeTruthy();
  expect(t.deliverables.length).toBe(1);
  expect(Array.isArray(t.completionConditions)).toBeTruthy();
  expect(t.completionConditions.length).toBe(1);
});

test('createTask rejects when artifact missing', async () => {
  await expect(svc.createTask('T2', null, null, null, null, { deliverables: [{ artifactId: 'nope' }] })).rejects.toThrow('Artifact not found');
});

test('updateTask updates fields and conditions', async () => {
  const id = await svc.createTask('U1', null, null, null, null, {});
  // update title and add a completion condition
  const updated = await svc.updateTask(id, { title: 'U1-updated', completionConditions: [{ description: 'x' }] });
  expect(updated).not.toBeNull();
  expect(updated.title).toBe('U1-updated');
  expect(Array.isArray(updated.completionConditions)).toBeTruthy();
});

test('moveTask rejects when setting itself as parent and moves normally', async () => {
  const root = await svc.createTask('R', null, null, null, null, {});
  const child = await svc.createTask('C', null, root, null, null, {});
  await expect(svc.moveTask(child, child)).rejects.toThrow('Task cannot be its own parent');
  // move to top-level
  const moved = await svc.moveTask(child, null);
  expect(moved).not.toBeNull();
  expect(moved.parent_id).toBeNull();
});

test('deleteTask removes task', async () => {
  const id = await svc.createTask('D', null, null, null, null, {});
  const ok = await svc.deleteTask(id);
  expect(ok).toBeTruthy();
  const after = await svc.getTask(id);
  expect(after).toBeNull();
});
