import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import os from 'os';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

import * as DB from '../../../src/mcpServer/db/DatabaseManager.js';
import * as TaskRepo from '../../../src/mcpServer/repositories/TaskRepository.js';
import * as TARepo from '../../../src/mcpServer/repositories/TaskArtifactRepository.js';
import * as CCRepo from '../../../src/mcpServer/repositories/CompletionConditionRepository.js';

let tmpDir;
let db;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbs-test-'));
  process.env.WBS_MCP_DATA_DIR = tmpDir;
  await DB.initializeDatabase();
  const dbPath = DB.resolveDatabasePath();
  db = await open({ filename: dbPath, driver: sqlite3.Database });
});

afterEach(async () => {
  try {
    await db.close();
  } catch (e) {}
  try {
    await DB.closeAndClearDatabase();
  } catch (e) {}
  delete process.env.WBS_MCP_DATA_DIR;
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('insert/get/update/delete task row lifecycle', async () => {
  const id = await TaskRepo.insertTask(db, { title: 'root' });
  expect(typeof id).toBe('string');
  const row = await TaskRepo.getTaskRow(db, id);
  expect(row).not.toBeNull();
  expect(row.title).toBe('root');

  await TaskRepo.updateTaskRow(db, id, { title: 'updated', version: 2 });
  const row2 = await TaskRepo.getTaskRow(db, id);
  expect(row2.title).toBe('updated');
  expect(row2.version).toBe(2);

  const deleted = await TaskRepo.deleteTaskRow(db, id);
  expect(deleted).toBeTruthy();
  const after = await TaskRepo.getTaskRow(db, id);
  expect(after).toBeNull();
});

test('listTaskRows returns children and top-level correctly', async () => {
  const p1 = await TaskRepo.insertTask(db, { title: 'a' });
  const c1 = await TaskRepo.insertTask(db, { title: 'a-child', parent_id: p1 });
  const roots = await TaskRepo.listTaskRows(db, null);
  expect(Array.isArray(roots)).toBeTruthy();
  expect(roots.find(r => r.id === p1)).toBeTruthy();
  const children = await TaskRepo.listTaskRows(db, p1);
  expect(children.length).toBe(1);
  expect(children[0].id).toBe(c1);
});

test('getTaskTree returns nested structure with artifacts and conditions', async () => {
  // create tree: root -> child
  const root = await TaskRepo.insertTask(db, { title: 'root' });
  const child = await TaskRepo.insertTask(db, { title: 'child', parent_id: root });

  // add artifact and task_artifact
  const artifactId = 'art1';
  await db.run(`INSERT INTO artifacts (id, title, uri, description, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, 1)`, artifactId, 'Art 1', null, null, new Date().toISOString(), new Date().toISOString());
  const taId = 'ta1';
  await db.run(`INSERT INTO task_artifacts (id, task_id, artifact_id, role, crud_operations, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, taId, child, artifactId, 'deliverable', null, 0, new Date().toISOString(), new Date().toISOString());

  // add completion condition
  const ccId = 'cc1';
  await db.run(`INSERT INTO task_completion_conditions (id, task_id, description, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, ccId, child, 'Do stuff', 0, new Date().toISOString(), new Date().toISOString());

  const tree = await TaskRepo.getTaskTree(db, root);
  expect(tree).not.toBeNull();
  expect(tree.children.length).toBe(1);
  const ch = tree.children[0];
  expect(ch.deliverables.length).toBe(1);
  expect(ch.completionConditions.length).toBe(1);
});
