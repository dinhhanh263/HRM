import { Router, type Request, type Response } from 'express';
import { tasksAuth } from '../middlewares/tasks-auth.middleware.js';
import { getHandler } from '../../infrastructure/tasks/task-registry.js';
import { TASK_NAMES, type TaskName } from '../../infrastructure/tasks/task-names.js';
import { logger } from '../../shared/utils/logger.js';

const VALID = new Set<string>(TASK_NAMES);

export const internalTasksRouter: Router = Router();

internalTasksRouter.post('/internal/tasks/:name', tasksAuth, async (req: Request, res: Response) => {
  const name = req.params.name;
  if (!VALID.has(name)) {
    res.status(404).json({ success: false, error: { code: 'UNKNOWN_TASK', message: name } });
    return;
  }
  try {
    await getHandler(name as TaskName)(req.body);
    res.status(200).json({ success: true });
  } catch (err) {
    // 5xx tells Cloud Tasks to retry per the queue's policy.
    logger.error({ err, task: name }, 'task handler failed');
    res.status(500).json({ success: false, error: { code: 'TASK_FAILED', message: name } });
  }
});
