import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('dispatcher', () => {
  const ENV = { ...process.env };
  afterEach(() => { process.env = { ...ENV }; vi.resetModules(); });
  beforeEach(() => vi.resetModules());

  it('defaults to the inline driver when TASKS_DRIVER is unset', async () => {
    delete process.env.TASKS_DRIVER;
    const { _clearHandlers, registerHandler } = await import('../../../src/infrastructure/tasks/task-registry.js');
    const { enqueueTask } = await import('../../../src/infrastructure/tasks/dispatcher.js');
    _clearHandlers();
    const seen: unknown[] = [];
    registerHandler('cv-parse', async (p) => { seen.push(p); });
    await enqueueTask('cv-parse', { a: 1 });
    await new Promise((r) => setImmediate(r));
    expect(seen).toEqual([{ a: 1 }]);
  });

  it('throws if TASKS_DRIVER=cloud but config env is missing', async () => {
    process.env.TASKS_DRIVER = 'cloud';
    delete process.env.TASKS_PROJECT;
    const { enqueueTask } = await import('../../../src/infrastructure/tasks/dispatcher.js');
    await expect(enqueueTask('cv-parse', {})).rejects.toThrow(/TASKS_/);
  });
});
