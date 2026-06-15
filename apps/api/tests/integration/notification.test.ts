import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';

const TEST_TENANT_SLUG = 'notif-test-tenant';
const HR_USER_EMAIL = 'hr@notif-test.com';
const HR_USER_PASSWORD = 'HrTest@123';
const EMP_USER_EMAIL = 'emp@notif-test.com';
const EMP_USER_PASSWORD = 'EmpTest@123';

describe('Notification API (SPEC-017)', () => {
  let testTenantId: string;
  let hrToken: string;
  let employeeToken: string;
  let hrUserId: string;
  let employeeUserId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TEST_TENANT_SLUG },
      update: {},
      create: { name: 'Notification Test Tenant', slug: TEST_TENANT_SLUG },
    });
    testTenantId = tenant.id;

    await db.notification.deleteMany({ where: { tenantId: testTenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId: testTenantId } } });
    await db.user.deleteMany({ where: { tenantId: testTenantId } });

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, testTenantId);

    const hr = await db.user.create({
      data: {
        tenantId: testTenantId,
        email: HR_USER_EMAIL,
        passwordHash: await hashPassword(HR_USER_PASSWORD),
        fullName: 'HR Manager',
        role: 'HR_MANAGER',
        roleId: roleIdByKey.get('hr_manager'),
        status: 'ACTIVE',
      },
    });
    hrUserId = hr.id;

    const emp = await db.user.create({
      data: {
        tenantId: testTenantId,
        email: EMP_USER_EMAIL,
        passwordHash: await hashPassword(EMP_USER_PASSWORD),
        fullName: 'Plain Employee',
        role: 'EMPLOYEE',
        roleId: roleIdByKey.get('employee'),
        status: 'ACTIVE',
      },
    });
    employeeUserId = emp.id;

    const hrLogin = await request(app).post('/api/v1/auth/login').send({
      email: HR_USER_EMAIL,
      password: HR_USER_PASSWORD,
      tenantSlug: TEST_TENANT_SLUG,
    });
    hrToken = hrLogin.body.data.accessToken;

    const empLogin = await request(app).post('/api/v1/auth/login').send({
      email: EMP_USER_EMAIL,
      password: EMP_USER_PASSWORD,
      tenantSlug: TEST_TENANT_SLUG,
    });
    employeeToken = empLogin.body.data.accessToken;
  });

  beforeEach(async () => {
    await db.notification.deleteMany({ where: { tenantId: testTenantId } });
    // 2 unread + 1 read for HR; 1 unread for employee.
    await db.notification.createMany({
      data: [
        {
          tenantId: testTenantId,
          userId: hrUserId,
          kind: 'probation_ending',
          title: 'Probation ending',
          body: 'Nguyen ends probation in 7 days',
          entityType: 'employee',
          entityId: 'emp-1',
          dedupeKey: 'probation_ending:emp-1:2026-06-11',
        },
        {
          tenantId: testTenantId,
          userId: hrUserId,
          kind: 'contract_expiring',
          title: 'Contract expiring',
          body: 'Tran contract expires in 30 days',
          entityType: 'contract',
          entityId: 'ct-1',
          dedupeKey: 'contract_expiring:ct-1:2026-07-04',
        },
        {
          tenantId: testTenantId,
          userId: hrUserId,
          kind: 'contract_expiring',
          title: 'Already read',
          body: 'Read one',
          dedupeKey: 'contract_expiring:ct-2:2026-07-04',
          readAt: new Date('2026-06-01'),
        },
        {
          tenantId: testTenantId,
          userId: employeeUserId,
          kind: 'probation_ending',
          title: 'Employee notification',
          body: 'Not visible to HR',
          dedupeKey: 'probation_ending:emp-9:2026-06-11',
        },
      ],
    });
  });

  afterAll(async () => {
    await db.notification.deleteMany({ where: { tenantId: testTenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId: testTenantId } } });
    await db.user.deleteMany({ where: { tenantId: testTenantId } });
    await db.tenant.delete({ where: { id: testTenantId } });
  });

  describe('GET /api/v1/notifications', () => {
    it('returns only the calling user notifications with unreadCount', async () => {
      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // 3 belong to HR (2 unread + 1 read); the employee's is excluded.
      expect(res.body.data.data).toHaveLength(3);
      expect(res.body.data.unreadCount).toBe(2);
      // newest first
      const titles = res.body.data.data.map((n: { title: string }) => n.title);
      expect(titles).not.toContain('Employee notification');
    });

    it('scopes to the caller — employee sees only their own', async () => {
      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.data).toHaveLength(1);
      expect(res.body.data.unreadCount).toBe(1);
      expect(res.body.data.data[0].title).toBe('Employee notification');
    });

    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/v1/notifications');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/v1/notifications/:id/read', () => {
    it('marks the caller own notification as read', async () => {
      const target = await db.notification.findFirst({
        where: { userId: hrUserId, readAt: null },
      });

      const res = await request(app)
        .patch(`/api/v1/notifications/${target!.id}/read`)
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.readAt).not.toBeNull();

      const after = await db.notification.findUnique({ where: { id: target!.id } });
      expect(after!.readAt).not.toBeNull();
    });

    it('returns 404 when marking another user notification (caller-scoped)', async () => {
      const other = await db.notification.findFirst({
        where: { userId: employeeUserId },
      });

      const res = await request(app)
        .patch(`/api/v1/notifications/${other!.id}/read`)
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(404);
      // Untouched
      const after = await db.notification.findUnique({ where: { id: other!.id } });
      expect(after!.readAt).toBeNull();
    });
  });

  describe('POST /api/v1/notifications/read-all', () => {
    it('marks all the caller unread notifications as read', async () => {
      const res = await request(app)
        .post('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(200);

      const remainingUnread = await db.notification.count({
        where: { userId: hrUserId, readAt: null },
      });
      expect(remainingUnread).toBe(0);

      // Employee notifications untouched
      const empUnread = await db.notification.count({
        where: { userId: employeeUserId, readAt: null },
      });
      expect(empUnread).toBe(1);
    });
  });
});
