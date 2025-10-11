import { WBSRepository, initializeDatabase } from '../src/server/db-simple';
import fs from 'fs';
import path from 'path';

describe('wbs.impotTask tool (repository.importTasks)', () => {
    const TEST_DIR = path.resolve(__dirname, '.tmp_impot');

    beforeAll(async () => {
        if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
        process.env.WBS_MCP_DATA_DIR = TEST_DIR;
        await initializeDatabase();
    });

    afterAll(() => {
        // cleanup DB files
        try {
            const dbFile = path.join(TEST_DIR, 'data', 'wbs.db');
            if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
            const dataDir = path.join(TEST_DIR, 'data');
            if (fs.existsSync(dataDir)) fs.rmdirSync(dataDir);
            if (fs.existsSync(TEST_DIR)) fs.rmdirSync(TEST_DIR);
        } catch (e) {
            // ignore
        }
    });

    it('imports multiple tasks into a project', async () => {
        const repo = new WBSRepository();

        const tasksToImport = [
            { title: 'Task A', description: 'First' },
            { title: 'Task B', description: 'Second' },
            { title: 'Task C', description: 'Third' }
        ];

    const created = await repo.importTasks(tasksToImport as any);
        expect(Array.isArray(created)).toBe(true);
        expect(created.length).toBe(3);

    const listed = await repo.listTasks();
        // listTasks returns roots; imported tasks have no parent so should be present
        expect(listed.length).toBeGreaterThanOrEqual(3);
        const titles = listed.map(t => t.title);
        expect(titles).toEqual(expect.arrayContaining(['Task A', 'Task B', 'Task C']));
    });
});
