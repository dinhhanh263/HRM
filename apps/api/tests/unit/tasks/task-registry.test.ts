import { describe, it, expect, beforeEach } from 'vitest';
import { registerHandler, getHandler, _clearHandlers } from '../../../src/infrastructure/tasks/task-registry.js';

describe('task-registry', () => {
  beforeEach(() => _clearHandlers());

  it('returns a registered handler', async () => {
    const fn = async () => undefined;
    registerHandler('cv-parse', fn);
    expect(getHandler('cv-parse')).toBe(fn);
  });

  it('throws for an unregistered name', () => {
    expect(() => getHandler('reminder-scan')).toThrow(/no handler/i);
  });
});
