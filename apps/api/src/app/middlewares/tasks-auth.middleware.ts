import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

/** Constant-time string compare that never throws on length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Guards /internal/tasks/* on the public hrm-api service. Cloud Tasks and Cloud
 * Scheduler attach `X-Tasks-Secret`; anything else is rejected. The secret lives
 * in Secret Manager (TASKS_SECRET). A missing server-side secret fails closed.
 */
export function tasksAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.TASKS_SECRET ?? '';
  const provided = req.header('X-Tasks-Secret') ?? '';
  if (expected && safeEqual(provided, expected)) {
    next();
    return;
  }
  res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid task secret' } });
}
