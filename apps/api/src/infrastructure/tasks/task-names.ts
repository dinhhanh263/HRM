/** Canonical names for every background job. Used as the Cloud Tasks queue id
 * (prefixed `hrm-`), the internal route segment, and the registry key. */
export const TASK_NAMES = [
  'cv-parse',
  'employee-import',
  'employee-invite',
  'reminder-email',
  'reminder-scan',
  'sales-task-reminder',
  'sales-email',
] as const;

export type TaskName = (typeof TASK_NAMES)[number];

export interface TaskConfig {
  /** Cloud Tasks queue id. */
  queue: string;
  /** Internal route the task POSTs to. */
  path: string;
}

export const TASK_CONFIG: Record<TaskName, TaskConfig> = Object.fromEntries(
  TASK_NAMES.map((name) => [name, { queue: `hrm-${name}`, path: `/internal/tasks/${name}` }]),
) as Record<TaskName, TaskConfig>;
