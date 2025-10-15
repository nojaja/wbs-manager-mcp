import fs from 'fs';
import path from 'path';
import os from 'os';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

import * as DB from '../../src/mcpServer/db/DatabaseManager';
import * as AR from '../../src/mcpServer/repositories/ArtifactRepository';

let tmpDir: string;
let db: any;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbs-test-'));
  process.env.WBS_MCP_DATA_DIR = tmpDir;
  await DB.initializeDatabase();
  const dbPath = DB.resolveDatabasePath();
  db = await open({ filename: dbPath, driver: sqlite3.Database });
});

afterEach(async () => {
  try { await db.close(); } catch (e) {}
  try { await DB.closeAndClearDatabase(); } catch (e) {}
  delete process.env.WBS_MCP_DATA_DIR;
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('create, list, get, update, delete artifact lifecycle', async () => {
  const created = await AR.createArtifact(db, 'A1', 'http://x', 'desc');
  expect(created.title).toBe('A1');
  const all = await AR.listArtifacts(db);
  expect(all.find(a => a.id === created.id)).toBeTruthy();
  const fetched = await AR.getArtifact(db, created.id);
  expect(fetched).not.toBeNull();
  // update
  const updated = await AR.updateArtifact(db, created.id, { title: 'A1-up', ifVersion: created.version });
  expect(updated.title).toBe('A1-up');
  // update with wrong version should throw
  await expect(AR.updateArtifact(db, created.id, { title: 'bad', ifVersion: 999 })).rejects.toThrow('Artifact has been modified');
  // delete
  const del = await AR.deleteArtifact(db, created.id);
  expect(del).toBeTruthy();
  const after = await AR.getArtifact(db, created.id);
  expect(after).toBeNull();
});
