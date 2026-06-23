import type { TaskName } from './task-names.js';
import { getHandler } from './task-registry.js';
import { logger } from '../../shared/utils/logger.js';

export interface TaskDriver {
  enqueue(name: TaskName, payload: unknown, opts?: { delaySeconds?: number }): Promise<void>;
}

/**
 * Dev/test driver: runs the handler in-process on the next tick so enqueue()
 * stays non-blocking, mirroring real async dispatch. Handler errors are logged,
 * never thrown back to the producer (a failed background job must not fail the
 * request that scheduled it) — same contract as the cloud driver's fire-and-forget.
 */
export const inlineDriver: TaskDriver = {
  async enqueue(name, payload) {
    setImmediate(() => {
      void getHandler(name)(payload).catch((err) => {
        logger.error({ err, task: name }, 'inline task handler failed');
      });
    });
  },
};
