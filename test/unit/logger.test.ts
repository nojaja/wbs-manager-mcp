import { jest } from '@jest/globals';
import Logger from '../../src/mcpServer/logger';

describe('Logger', () => {
  beforeEach(() => {
    // reset env
    delete process.env.WBS_MCP_LOG_LEVEL;
    delete process.env.WBS_MCP_LOG_JSON;
    Logger.disableMemoryHook();
    Logger.setLevel('info');
  });

  it('respects log level', () => {
    Logger.enableMemoryHook();
    Logger.setLevel('warn');
    Logger.info('should not appear');
    Logger.warn('should appear');
    const mem = Logger.getMemory();
    expect(mem.some(m => m.msg === 'should not appear')).toBe(false);
    expect(mem.some(m => m.msg === 'should appear')).toBe(true);
  });

  it('outputs JSON when env var set', () => {
    // Ensure that logging with correlationId and extra stores the data in memory hook
    Logger.enableMemoryHook();
    Logger.info('json test', 'cid-1', { a: 1 });
    const mem = Logger.getMemory();
    expect(mem.length).toBeGreaterThan(0);
    expect(mem[0].correlationId).toBe('cid-1');
    expect(mem[0].extra).toEqual({ a: 1 });
  });

  it('memory hook collects logs', () => {
    Logger.enableMemoryHook();
    Logger.error('err1');
    Logger.info('i1');
    const mem = Logger.getMemory();
    expect(mem.map(m => m.msg)).toEqual(expect.arrayContaining(['err1', 'i1']));
  });
});
