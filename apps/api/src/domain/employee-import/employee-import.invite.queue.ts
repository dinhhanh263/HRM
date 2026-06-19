import { enqueueTask } from '../../infrastructure/tasks/dispatcher.js';

export interface InviteJobData {
  userId: string;
  tenantId: string;
  email: string;
  fullName: string;
}

/** Enqueue one invite-email task per freshly-created user. */
export async function enqueueInvites(jobs: InviteJobData[]): Promise<void> {
  await Promise.all(jobs.map((data) => enqueueTask('employee-invite', data)));
}
