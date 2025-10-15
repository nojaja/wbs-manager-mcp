import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as DB from '../../../src/mcpServer/db/DatabaseManager.js';

// Use a temporary directory for DB files
let tmpDir;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbs-test-'));
  process.env.WBS_MCP_DATA_DIR = tmpDir;
});

afterEach(async () => {
  // close and remove files
  try {
    await DB.closeAndClearDatabase();
  } catch (e) {
    // ignore
  }
  delete process.env.WBS_MCP_DATA_DIR;
  // remove tmpDir recursively
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('resolveDatabasePath returns path inside provided base dir', () => {
  const p = DB.resolveDatabasePath();
  expect(p.startsWith(path.resolve(tmpDir))).toBeTruthy();
  expect(p.endsWith(path.join('data', 'wbs.db'))).toBeTruthy();
});

test('initializeDatabase creates file and tables', async () => {
  const dbPath = DB.resolveDatabasePath();
  expect(fs.existsSync(dbPath)).toBeFalsy();
  await DB.initializeDatabase();
  // file should exist
  expect(fs.existsSync(dbPath)).toBeTruthy();
  // reopen database with sqlite to check tables
  const sqlite3 = await import('sqlite3');
  const { open } = await import('sqlite');
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  const rows = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
  const names = rows.map(r => r.name);
  expect(names).toEqual(expect.arrayContaining(['tasks','artifacts','task_artifacts','task_completion_conditions','dependencies','task_history']));
  await db.close();
});
