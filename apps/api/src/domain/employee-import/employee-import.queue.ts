import type { ImportJobStatus } from '@hrm/shared';
import { enqueueTask } from '../../infrastructure/tasks/dispatcher.js';
import { importJobRepository } from './import-job.repository.js';

/** Payload carried on every import task. The validated rows live in the
 * import_staging table under `importId` (staged by /validate). */
export interface ImportJobData {
  jobId: string;
  importId: string;
  tenantId: string;
}

/** Create the job-status row, enqueue the task, and return the job id the
 * wizard polls. Signature unchanged from the BullMQ version. */
export async function enqueueImport(data: { importId: string; tenantId: string }): Promise<string> {
  const jobId = await importJobRepository.create(data.tenantId);
  await enqueueTask('employee-import', { jobId, importId: data.importId, tenantId: data.tenantId });
  return jobId;
}

/** Read a job's status for the polling endpoint (tenant-scoped; null if unknown). */
export async function getImportJobStatus(
  jobId: string,
  tenantId: string,
): Promise<ImportJobStatus | null> {
  return importJobRepository.get(jobId, tenantId);
}
