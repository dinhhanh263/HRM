import { describe, it, expect, beforeEach, vi } from 'vitest';
import { inlineDriver } from '../../../src/infrastructure/tasks/inline-driver.js';
import { registerHandler, _clearHandlers } from '../../../src/infrastructure/tasks/task-registry.js';

describe('inlineDriver', () => {
  beforeEach(() => _clearHandlers());

  it('invokes the registered handler with the payload', async () => {
    const seen: unknown[] = [];
    registerHandler('cv-parse', async (p) => { seen.push(p); });
    await inlineDriver.enqueue('cv-parse', { kind: 'attachment', attachmentId: 'a1' });
    await new Promise((r) => setImmediate(r)); // let the deferred run flush
    expect(seen).toEqual([{ kind: 'attachment', attachmentId: 'a1' }]);
  });

  it('does not reject when the handler throws (logged, not propagated)', async () => {
    registerHandler('reminder-scan', async () => { throw new Error('boom'); });
    await expect(inlineDriver.enqueue('reminder-scan', {})).resolves.toBeUndefined();
  });
});
