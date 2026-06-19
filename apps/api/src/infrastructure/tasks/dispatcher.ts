import type { TaskDriver } from './inline-driver.js';
import { inlineDriver } from './inline-driver.js';
import { makeCloudDriver } from './cloud-driver.js';
import type { TaskName } from './task-names.js';

let cached: TaskDriver | null = null;

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is required when TASKS_DRIVER=cloud`);
  return v;
}

function selectDriver(): TaskDriver {
  if (process.env.TASKS_DRIVER === 'cloud') {
    return makeCloudDriver({
      project: requireEnv('TASKS_PROJECT'),
      location: requireEnv('TASKS_LOCATION'),
      serviceUrl: requireEnv('APP_INTERNAL_URL').replace(/\/$/, ''),
      secret: requireEnv('TASKS_SECRET'),
    });
  }
  return inlineDriver;
}

/** Public enqueue API used by every producer. Lazily resolves the driver so
 * tests can swap TASKS_DRIVER before the first call. */
export async function enqueueTask(
  name: TaskName,
  payload: unknown,
  opts?: { delaySeconds?: number },
): Promise<void> {
  if (!cached) cached = selectDriver();
  await cached.enqueue(name, payload, opts);
}

/** Test-only: drop the memoized driver so a new TASKS_DRIVER takes effect. */
export function _resetDriver(): void {
  cached = null;
}
