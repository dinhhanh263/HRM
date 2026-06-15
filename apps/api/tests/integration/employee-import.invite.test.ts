import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Worker } from 'bullmq';
import { db } from '../../src/infrastructure/database/client.js';
import { redis } from '../../src/infrastructure/cache/redis.js';
import {
  getInviteQueue,
  enqueueInvites,
} from '../../src/domain/employee-import/employee-import.invite.queue.js';
import { createInviteWorker } from '../../src/domain/employee-import/employee-import.invite.worker.js';

const TENANT_SLUG = 'invite-queue-tenant';

describe('Invite email queue + worker (hrm.employee.invite)', () => {
  let tenantId: string;
  let userId: string;
  let worker: Worker;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Invite Queue Tenant', slug: TENANT_SLUG },
    });
    tenantId = tenant.id;

    await db.user.deleteMany({ where: { tenantId } });
    const user = await db.user.create({
      data: {
        tenantId,
        email: 'invitee@invite-queue.com',
        passwordHash: 'invited:no-password',
        fullName: 'Invitee One',
        role: 'EMPLOYEE',
        status: 'INVITED',
      },
    });
    userId = user.id;

    await getInviteQueue().obliterate({ force: true });
    worker = createInviteWorker();
  });

  afterAll(async () => {
    await worker.close();
    await getInviteQueue().close();
    await db.user.deleteMany({ where: { tenantId } });
    await db.tenant.deleteMany({ where: { slug: TENANT_SLUG } });
    await redis.quit();
  });

  it('drains an enqueued invite job and issues a one-time invite token for the user', async () => {
    // Pre-condition: a freshly imported user has no outstanding invite token.
    const before = await db.user.findUnique({ where: { id: userId } });
    expect(before?.inviteToken).toBeNull();

    await enqueueInvites([
      { userId, tenantId, email: 'invitee@invite-queue.com', fullName: 'Invitee One' },
    ]);

    // The worker mints + persists the invite token (its sha256 hash) as it
    // processes the job. (Email send itself no-ops when RESEND_API_KEY is unset.)
    const deadline = Date.now() + 8000;
    let after = await db.user.findUnique({ where: { id: userId } });
    while (!after?.inviteToken && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
      after = await db.user.findUnique({ where: { id: userId } });
    }

    expect(after?.inviteToken).toBeTruthy();
    expect(after?.inviteTokenExpiresAt).toBeTruthy();
    // Only the sha256 hash (64 hex chars) is persisted — never the raw token.
    expect(after?.inviteToken).toMatch(/^[a-f0-9]{64}$/);
  });
});
