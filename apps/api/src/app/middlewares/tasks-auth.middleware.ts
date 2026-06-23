import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

/**
 * Constant-time string compare. Both inputs are padded to the same length before
 * `timingSafeEqual` so the comparison time does not leak the expected secret's
 * length (an early length-mismatch return would be a length oracle).
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  const len = Math.max(ab.length, bb.length);
  const padA = Buffer.alloc(len);
  const padB = Buffer.alloc(len);
  ab.copy(padA);
  bb.copy(padB);
  // Combine the constant-time content compare with the length check so neither
  // a content nor a length mismatch can pass.
  return timingSafeEqual(padA, padB) && ab.length === bb.length;
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
