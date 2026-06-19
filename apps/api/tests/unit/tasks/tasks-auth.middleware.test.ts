import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import { tasksAuth } from '../../../src/app/middlewares/tasks-auth.middleware.js';

function res() {
  const r: Partial<Response> = {};
  r.status = vi.fn(() => r as Response);
  r.json = vi.fn(() => r as Response);
  return r as Response;
}

describe('tasksAuth', () => {
  const ENV = { ...process.env };
  beforeEach(() => { process.env.TASKS_SECRET = 'right'; });
  afterEach(() => { process.env = { ...ENV }; });

  it('calls next when the header matches', () => {
    const next = vi.fn();
    tasksAuth({ header: (h: string) => (h === 'X-Tasks-Secret' ? 'right' : undefined) } as unknown as Request, res(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('401s when the header is wrong or missing', () => {
    const next = vi.fn();
    const r = res();
    tasksAuth({ header: () => 'wrong' } as unknown as Request, r, next);
    expect(next).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(401);
  });
});
