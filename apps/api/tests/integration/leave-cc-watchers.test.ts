import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { roleRepository } from '../../src/domain/repositories/role.repository.js';
import { emailProvider } from '../../src/infrastructure/email/email.provider.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';

// SPEC-046: CC / watcher (view-only) for leave approval flows.
//   - HR staff / a specific user configured as a flow watcher can VIEW every
//     request routed through that flow (scope=watching + detail), even with only
//     leave:view.
//   - Watchers can NEVER approve/reject (invariant).
//   - Watchers are notified on submit and on the final decision.
const SLUG = 'leave-cc-tenant';
const PW = 'CcTest@123';
const HR_EMAIL = 'hr@cc.com'; // hr_manager: approver + configure
const STAFF_EMAIL = 'staff@cc.com'; // custom hr_staff role (leave:view only) → ROLE watcher
const SPECIFIC_EMAIL = 'specific@cc.com'; // observer role, employee profile → SPECIFIC_USER watcher
const OTHER_EMAIL = 'other@cc.com'; // observer role, NOT a watcher
const REQ_EMAIL = 'req@cc.com'; // requester (employee)

async function login(email: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: PW, tenantSlug: SLUG });
  return res.body.data.accessToken;
}

describe('Leave CC / watchers (SPEC-046)', () => {
  let tenantId: string;
  let hrToken: string;
  let staffToken: string;
  let specificToken: string;
  let otherToken: string;
  let reqToken: string;
  let staffUserId: string;
  let specificUserId: string;
  let specificEmployeeId: string;
  let reqUserId: string;
  let leaveTypeId: string;
  let flowId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: SLUG },
      update: {},
      create: { name: 'Leave CC Tenant', slug: SLUG },
    });
    tenantId = tenant.id;

    await cleanup();

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, tenantId);

    // Custom roles with ONLY leave:view — proves watchers need no approve perm.
    const [viewPermId] = await roleRepository.permissionIdsByKeys(['leave:view']);
    const hrStaffRoleId = await roleRepository.createWithPermissions(
      { tenantId, key: 'hr_staff', name: 'HR Staff', description: null },
      [viewPermId],
    );
    const observerRoleId = await roleRepository.createWithPermissions(
      { tenantId, key: 'observer', name: 'Observer', description: null },
      [viewPermId],
    );

    const mk = async (email: string, role: string, roleId: string | undefined, fullName: string) =>
      db.user.create({
        data: {
          tenantId,
          email,
          passwordHash: await hashPassword(PW),
          fullName,
          role: role as never,
          roleId,
          status: 'ACTIVE',
        },
      });

    await mk(HR_EMAIL, 'HR_MANAGER', roleIdByKey.get('hr_manager'), 'HR Manager');
    const staffUser = await mk(STAFF_EMAIL, 'EMPLOYEE', hrStaffRoleId, 'HR Staff');
    staffUserId = staffUser.id;
    const specificUser = await mk(SPECIFIC_EMAIL, 'EMPLOYEE', observerRoleId, 'Specific Watcher');
    specificUserId = specificUser.id;
    await mk(OTHER_EMAIL, 'EMPLOYEE', observerRoleId, 'Other Observer');
    const reqUser = await mk(REQ_EMAIL, 'EMPLOYEE', roleIdByKey.get('employee'), 'Requester');
    reqUserId = reqUser.id;

    // The specific watcher needs an employee profile (matched by employee id).
    const specificEmp = await db.employee.create({
      data: {
        tenantId,
        userId: specificUserId,
        employeeCode: 'CC-SPEC',
        fullName: 'Specific Watcher',
        joinDate: new Date('2024-01-01'),
        contractType: 'FULL_TIME',
        status: 'ACTIVE',
      },
    });
    specificEmployeeId = specificEmp.id;

    await db.employee.create({
      data: {
        tenantId,
        userId: reqUserId,
        employeeCode: 'CC-REQ',
        fullName: 'Requester',
        joinDate: new Date('2024-01-01'),
        contractType: 'FULL_TIME',
        status: 'ACTIVE',
      },
    });

    hrToken = await login(HR_EMAIL);
    staffToken = await login(STAFF_EMAIL);
    specificToken = await login(SPECIFIC_EMAIL);
    otherToken = await login(OTHER_EMAIL);
    reqToken = await login(REQ_EMAIL);

    // Unpaid type → no balance/quota setup needed for submission.
    const type = await db.leaveType.create({
      data: { tenantId, name: 'Không lương', code: 'UNPAID_CC', defaultDays: 0, paid: false },
    });
    leaveTypeId = type.id;
  });

  afterAll(async () => {
    await cleanup();
    await db.tenant.delete({ where: { id: tenantId } });
  });

  async function cleanup() {
    await db.notification.deleteMany({ where: { tenantId } });
    await db.leaveApproval.deleteMany({ where: { tenantId } });
    await db.leaveRequest.deleteMany({ where: { tenantId } });
    await db.approvalWatcher.deleteMany({ where: { flow: { tenantId } } });
    await db.approvalStep.deleteMany({ where: { flow: { tenantId } } });
    await db.approvalFlow.deleteMany({ where: { tenantId } });
    await db.leaveType.deleteMany({ where: { tenantId } });
    await db.employee.deleteMany({ where: { tenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
    await db.user.deleteMany({ where: { tenantId } });
    await db.role.deleteMany({ where: { tenantId, isSystem: false } });
  }

  // ── Slice 1: configure CC on a flow ─────────────────────────────────────
  it('HR creates a default flow with ROLE + SPECIFIC_USER watchers', async () => {
    const res = await request(app)
      .post('/api/v1/leave/flows')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        name: 'Default with CC',
        // ROLE step (never auto-skipped) → request stays PENDING for hr_manager.
        steps: [{ approverType: 'ROLE', roleKey: 'hr_manager' }],
        watchers: [
          { watcherType: 'ROLE', roleKey: 'hr_staff' },
          { watcherType: 'SPECIFIC_USER', watcherId: specificEmployeeId },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.watchers).toHaveLength(2);
    flowId = res.body.data.id;

    // Reload reflects the same watchers.
    const get = await request(app)
      .get(`/api/v1/leave/flows/${flowId}`)
      .set('Authorization', `Bearer ${hrToken}`);
    expect(get.body.data.watchers).toHaveLength(2);
    const types = get.body.data.watchers.map((w: { watcherType: string }) => w.watcherType).sort();
    expect(types).toEqual(['ROLE', 'SPECIFIC_USER']);
  });

  it('rejects a ROLE watcher that references a non-existent role', async () => {
    const res = await request(app)
      .patch(`/api/v1/leave/flows/${flowId}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ watchers: [{ watcherType: 'ROLE', roleKey: 'nope-role' }] });
    expect(res.status).toBe(400);
  });

  // ── Slice 3 (submit) + Slice 2 (view) ───────────────────────────────────
  let requestId: string;
  it('requester submits a request → watchers notified in-app + approver/watchers emailed', async () => {
    const emailSpy = vi
      .spyOn(emailProvider, 'sendLeaveRequestNotification')
      .mockResolvedValue(undefined);
    try {
      const res = await request(app)
        .post('/api/v1/leave/requests')
        .set('Authorization', `Bearer ${reqToken}`)
        .send({
          leaveTypeId,
          startDate: '2026-07-06T00:00:00.000Z',
          endDate: '2026-07-06T00:00:00.000Z',
        });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PENDING');
      requestId = res.body.data.id;

      const staffNote = await db.notification.findFirst({
        where: { userId: staffUserId, kind: 'leave_watch_submitted', entityId: requestId },
      });
      const specificNote = await db.notification.findFirst({
        where: { userId: specificUserId, kind: 'leave_watch_submitted', entityId: requestId },
      });
      expect(staffNote).not.toBeNull();
      expect(specificNote).not.toBeNull();

      // Requester (owner) is never self-notified.
      const ownerNote = await db.notification.findFirst({
        where: { userId: reqUserId, kind: 'leave_watch_submitted' },
      });
      expect(ownerNote).toBeNull();

      // Emails: the current-step ROLE approver (hr_manager) as 'approver',
      // and both watchers as 'watcher'; requester never receives one.
      const calls = emailSpy.mock.calls.map(([a]) => ({ to: a.to, audience: a.audience }));
      const approvers = calls.filter((c) => c.audience === 'approver').map((c) => c.to);
      const watchers = calls.filter((c) => c.audience === 'watcher').map((c) => c.to);
      expect(approvers).toContain(HR_EMAIL);
      expect(watchers).toEqual(expect.arrayContaining([STAFF_EMAIL, SPECIFIC_EMAIL]));
      expect(calls.map((c) => c.to)).not.toContain(REQ_EMAIL);
    } finally {
      emailSpy.mockRestore();
    }
  });

  it('still creates the request when notification emails fail (best-effort)', async () => {
    const emailSpy = vi
      .spyOn(emailProvider, 'sendLeaveRequestNotification')
      .mockRejectedValue(new Error('smtp down'));
    try {
      const res = await request(app)
        .post('/api/v1/leave/requests')
        .set('Authorization', `Bearer ${reqToken}`)
        .send({
          leaveTypeId,
          startDate: '2026-07-07T00:00:00.000Z',
          endDate: '2026-07-07T00:00:00.000Z',
        });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PENDING');
    } finally {
      emailSpy.mockRestore();
    }
  });

  it('ROLE watcher (leave:view only) sees the request in scope=watching and detail', async () => {
    const list = await request(app)
      .get('/api/v1/leave/requests?scope=watching')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.map((r: { id: string }) => r.id)).toContain(requestId);
    expect(list.body.data[0].watchOnly).toBe(true);

    const detail = await request(app)
      .get(`/api/v1/leave/requests/${requestId}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.watchOnly).toBe(true);
  });

  it('SPECIFIC_USER watcher sees the request too', async () => {
    const detail = await request(app)
      .get(`/api/v1/leave/requests/${requestId}`)
      .set('Authorization', `Bearer ${specificToken}`);
    expect(detail.status).toBe(200);
  });

  it('a non-watcher with only leave:view cannot see the request detail (403)', async () => {
    const detail = await request(app)
      .get(`/api/v1/leave/requests/${requestId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(detail.status).toBe(403);

    const list = await request(app)
      .get('/api/v1/leave/requests?scope=watching')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(0);
  });

  // ── Invariant: watchers can never approve ───────────────────────────────
  it('a watcher cannot approve the request (403)', async () => {
    const staffApprove = await request(app)
      .post(`/api/v1/leave/requests/${requestId}/approve`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(staffApprove.status).toBe(403);

    // Even the specific watcher (has an employee profile) is blocked.
    const specApprove = await request(app)
      .post(`/api/v1/leave/requests/${requestId}/approve`)
      .set('Authorization', `Bearer ${specificToken}`);
    expect(specApprove.status).toBe(403);
  });

  // ── Slice 3 (decided) ───────────────────────────────────────────────────
  it('HR approves → request APPROVED and watchers notified of the decision', async () => {
    const approve = await request(app)
      .post(`/api/v1/leave/requests/${requestId}/approve`)
      .set('Authorization', `Bearer ${hrToken}`);
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe('APPROVED');

    const staffDecided = await db.notification.findFirst({
      where: { userId: staffUserId, kind: 'leave_watch_decided', entityId: requestId },
    });
    const specificDecided = await db.notification.findFirst({
      where: { userId: specificUserId, kind: 'leave_watch_decided', entityId: requestId },
    });
    expect(staffDecided).not.toBeNull();
    expect(specificDecided).not.toBeNull();
  });

  it('HR can clear all CC via the watchers endpoint', async () => {
    const res = await request(app)
      .put(`/api/v1/leave/flows/${flowId}/watchers`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ watchers: [] });
    expect(res.status).toBe(200);
    expect(res.body.data.watchers).toHaveLength(0);
  });
});
