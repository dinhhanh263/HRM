import type { TaskName } from './task-names.js';

/** A job handler takes the decoded JSON payload and runs the work. */
export type TaskHandler = (payload: unknown) => Promise<void>;

const handlers = new Map<TaskName, TaskHandler>();

export function registerHandler(name: TaskName, handler: TaskHandler): void {
  handlers.set(name, handler);
}

export function getHandler(name: TaskName): TaskHandler {
  const handler = handlers.get(name);
  if (!handler) throw new Error(`No handler registered for task "${name}"`);
  return handler;
}

/** Test-only: reset the registry between cases. */
export function _clearHandlers(): void {
  handlers.clear();
}
