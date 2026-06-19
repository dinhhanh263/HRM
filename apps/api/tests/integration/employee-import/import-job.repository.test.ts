import { describe, it, expect } from 'vitest';
import { importJobRepository } from '../../../src/domain/employee-import/import-job.repository.js';

describe('importJobRepository', () => {
  it('creates, updates, and reads back a job scoped by tenant', async () => {
    const id = await importJobRepository.create('tenant-A');
    expect(await importJobRepository.get(id, 'tenant-B')).toBeNull(); // cross-tenant guard

    await importJobRepository.markActive(id);
    await importJobRepository.setProgress(id, { done: 5, total: 10 });
    let status = await importJobRepository.get(id, 'tenant-A');
    expect(status).toMatchObject({ jobId: id, state: 'active', progress: { done: 5, total: 10 } });

    await importJobRepository.markCompleted(id, { total: 10, created: 9, skipped: 1, failed: 0, errors: [] });
    status = await importJobRepository.get(id, 'tenant-A');
    expect(status?.state).toBe('completed');
    expect(status?.result).toMatchObject({ created: 9 });
  });
});
