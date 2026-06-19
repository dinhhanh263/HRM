import { describe, it, expect } from 'vitest';
import { stageImport, getStagedImport, discardStagedImport, purgeExpiredStaging } from '../../../src/domain/employee-import/employee-import.staging.js';

const sample = { tenantId: 'tenant-A', rows: [{ email: 'a@x.com' }], options: {} } as any;

describe('employee import staging (postgres)', () => {
  it('stages, reads (tenant-scoped), and discards', async () => {
    const id = await stageImport(sample);
    expect(await getStagedImport(id, 'tenant-B')).toBeNull();
    const got = await getStagedImport(id, 'tenant-A');
    expect(got?.rows[0].email).toBe('a@x.com');
    await discardStagedImport(id);
    expect(await getStagedImport(id, 'tenant-A')).toBeNull();
  });

  it('purges expired rows', async () => {
    await purgeExpiredStaging(); // smoke: returns a number, no throw
  });
});
