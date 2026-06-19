import type { ImportJobProgress, ImportJobResult, ImportJobStatus } from '@hrm/shared';
import { db } from '../../infrastructure/database/client.js';

/** Postgres-backed import job status (replaces BullMQ job state in Redis). */
export const importJobRepository = {
  async create(tenantId: string): Promise<string> {
    const row = await db.importJob.create({ data: { tenantId, state: 'waiting' } });
    return row.id;
  },

  async markActive(id: string): Promise<void> {
    await db.importJob.update({ where: { id }, data: { state: 'active' } });
  },

  async setProgress(id: string, progress: ImportJobProgress): Promise<void> {
    await db.importJob.update({ where: { id }, data: { progress } });
  },

  async markCompleted(id: string, result: ImportJobResult): Promise<void> {
    await db.importJob.update({ where: { id }, data: { state: 'completed', result } });
  },

  async markFailed(id: string, error: string): Promise<void> {
    await db.importJob.update({ where: { id }, data: { state: 'failed', error } });
  },

  /** Tenant-scoped read for the polling endpoint; null if unknown or cross-tenant. */
  async get(id: string, tenantId: string): Promise<ImportJobStatus | null> {
    const row = await db.importJob.findUnique({ where: { id } });
    if (!row || row.tenantId !== tenantId) return null;
    return {
      jobId: row.id,
      state: row.state as ImportJobStatus['state'],
      progress: row.state === 'active' ? (row.progress as ImportJobProgress | null) : null,
      result: row.state === 'completed' ? (row.result as ImportJobResult | null) : null,
    };
  },
};
