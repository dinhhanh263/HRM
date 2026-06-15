import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';
import { payrollRunRepository } from '../../src/domain/repositories/payroll-run.repository.js';
import { payrollSettingsService } from '../../src/domain/services/payroll-settings.service.js';

const TENANT_SLUG = 'payroll-lifecycle-tenant';
const HR_EMAIL = 'hr@payroll-lifecycle.com';
const HR_PASSWORD = 'HrTest@123';
const APPROVER_EMAIL = 'approver@payroll-lifecycle.com';
const APPROVER_PASSWORD = 'ApvTest@123';
const EMP_EMAIL = 'emp@payroll-lifecycle.com';
const EMP_PASSWORD = 'EmpTest@123';

async function cleanup(tenantId: string) {
  await db.payslip.deleteMany({ where: { tenantId } });
  await db.payrollRun.deleteMany({ where: { tenantId } });
  await db.payrollSettings.deleteMany({ where: { tenantId } });
  await db.employeeSalary.deleteMany({ where: { tenantId } });
  await db.employee.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
}

async function login(email: string, password: string, tenantSlug: string) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password, tenantSlug });
  return res.body.data.accessToken as string;
}

describe('Payroll Run lifecycle transitions', () => {
  let tenantId: string;
  let hrToken: string;
  let approverToken: string;
  let empToken: string;

  // Each test owns its own period so transitions never collide.
  async function createDraft(period: string): Promise<string> {
    const res = await request(app)
      .post('/api/v1/payroll/runs')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ period });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('DRAFT');
    return res.body.data.id as string;
  }

  const post = (id: string, action: string, token = hrToken) =>
    request(app)
      .post(`/api/v1/payroll/runs/${id}/${action}`)
      .set('Authorization', `Bearer ${token}`);

  // Drive a fresh draft all the way to APPROVED through the maker-checker path:
  // HR submits, the approver approves. Returns the run id.
  async function createApproved(period: string): Promise<string> {
    const id = await createDraft(period);
    expect((await post(id, 'submit')).status).toBe(200);
    expect((await post(id, 'approve', approverToken)).status).toBe(200);
    return id;
  }

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Payroll Lifecycle Tenant', slug: TENANT_SLUG },
    });
    tenantId = tenant.id;

    await cleanup(tenantId);

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, tenantId);

    await db.user.create({
      data: {
        tenantId,
        email: HR_EMAIL,
        passwordHash: await hashPassword(HR_PASSWORD),
        fullName: 'HR Manager',
        role: 'HR_MANAGER',
        roleId: roleIdByKey.get('hr_manager'),
        status: 'ACTIVE',
      },
    });
    await db.user.create({
      data: {
        tenantId,
        email: APPROVER_EMAIL,
        passwordHash: await hashPassword(APPROVER_PASSWORD),
        fullName: 'Payroll Approver',
        role: 'PAYROLL_APPROVER',
        roleId: roleIdByKey.get('payroll_approver'),
        status: 'ACTIVE',
      },
    });
    await db.user.create({
      data: {
        tenantId,
        email: EMP_EMAIL,
        passwordHash: await hashPassword(EMP_PASSWORD),
        fullName: 'Employee',
        role: 'EMPLOYEE',
        roleId: roleIdByKey.get('employee'),
        status: 'ACTIVE',
      },
    });

    const user = await db.user.create({
      data: {
        tenantId,
        email: 'pl-1@payroll-lifecycle.com',
        passwordHash: 'x',
        fullName: 'Payable A',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
      },
    });
    const employee = await db.employee.create({
      data: {
        tenantId,
        userId: user.id,
        employeeCode: 'PL-1',
        fullName: 'Payable A',
        joinDate: new Date('2023-01-01'),
        contractType: 'FULL_TIME',
        status: 'ACTIVE',
        dependentsCount: 1,
      },
    });
    await db.employeeSalary.create({
      data: {
        tenantId,
        employeeId: employee.id,
        baseSalary: 30_000_000,
        allowances: [{ name: 'Ăn trưa', amount: 730_000, taxable: true }],
        effectiveFrom: new Date('2025-01-01'),
      },
    });

    hrToken = await login(HR_EMAIL, HR_PASSWORD, TENANT_SLUG);
    approverToken = await login(APPROVER_EMAIL, APPROVER_PASSWORD, TENANT_SLUG);
    empToken = await login(EMP_EMAIL, EMP_PASSWORD, TENANT_SLUG);
  });

  afterAll(async () => {
    await cleanup(tenantId);
  });

  it('should recompute a DRAFT run in place (same run id, still DRAFT)', async () => {
    const id = await createDraft('2026-01');
    const res = await post(id, 'recompute');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(id);
    expect(res.body.data.status).toBe('DRAFT');
  });

  it('should approve a submitted run: lock it, freeze settings snapshot, record approvedAt', async () => {
    const id = await createDraft('2026-02');
    expect((await post(id, 'submit')).status).toBe(200);

    const res = await post(id, 'approve', approverToken);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');

    // settingsSnapshot is not surfaced on the DTO; verify the freeze in the DB.
    const run = await db.payrollRun.findUnique({ where: { id } });
    expect(run!.approvedAt).not.toBeNull();
    expect(run!.settingsSnapshot).not.toBeNull();
  });

  it('should reject recomputing an APPROVED run with 409', async () => {
    const id = await createApproved('2026-03');

    const res = await post(id, 'recompute');
    expect(res.status).toBe(409);
  });

  it('should reject approving a non-PENDING (APPROVED) run with 409', async () => {
    const id = await createApproved('2026-04');

    const res = await post(id, 'approve', approverToken);
    expect(res.status).toBe(409);
  });

  it('should mark an APPROVED run as PAID and record paidAt', async () => {
    const id = await createApproved('2026-05');

    const res = await post(id, 'mark-paid');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PAID');

    const run = await db.payrollRun.findUnique({ where: { id } });
    expect(run!.paidAt).not.toBeNull();
  });

  it('should reject marking a DRAFT run as paid with 409', async () => {
    const id = await createDraft('2026-06');
    const res = await post(id, 'mark-paid');
    expect(res.status).toBe(409);
  });

  it('should cancel a DRAFT run', async () => {
    const id = await createDraft('2026-07');
    const res = await post(id, 'cancel');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
  });

  it('should cancel an APPROVED run', async () => {
    const id = await createApproved('2026-08');

    const res = await post(id, 'cancel');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
  });

  it('should treat a PAID run as read-only (recompute/approve/cancel all 409)', async () => {
    const id = await createApproved('2026-09');
    expect((await post(id, 'mark-paid')).status).toBe(200);

    expect((await post(id, 'recompute')).status).toBe(409);
    expect((await post(id, 'approve', approverToken)).status).toBe(409);
    expect((await post(id, 'cancel')).status).toBe(409);
  });

  it('should return 404 transitioning a non-existent run', async () => {
    const missing = '00000000-0000-0000-0000-000000000000';
    expect((await post(missing, 'recompute')).status).toBe(404);
    expect((await post(missing, 'approve', approverToken)).status).toBe(404);
    expect((await post(missing, 'reject', approverToken)).status).toBe(404);
    expect((await post(missing, 'mark-paid')).status).toBe(404);
    expect((await post(missing, 'cancel')).status).toBe(404);
  });

  it('should forbid an EMPLOYEE from any lifecycle transition (403)', async () => {
    const id = await createDraft('2026-10');

    expect((await post(id, 'recompute', empToken)).status).toBe(403);
    expect((await post(id, 'submit', empToken)).status).toBe(403);
    expect((await post(id, 'approve', empToken)).status).toBe(403);
    expect((await post(id, 'reject', empToken)).status).toBe(403);
    expect((await post(id, 'mark-paid', empToken)).status).toBe(403);
    expect((await post(id, 'cancel', empToken)).status).toBe(403);
  });

  // payroll:view is granted to EMPLOYEE/MANAGER for self-service payslips only.
  // The run-read endpoints expose every employee's payslip, so they must require
  // payroll:process (HR-only) — not payroll:view — or any employee could read the
  // whole company's salaries straight from the API.
  it('should forbid an EMPLOYEE from reading the run roster or a run detail (403)', async () => {
    const id = await createDraft('2026-11');

    const listRes = await request(app)
      .get('/api/v1/payroll/runs')
      .set('Authorization', `Bearer ${empToken}`);
    expect(listRes.status).toBe(403);

    const detailRes = await request(app)
      .get(`/api/v1/payroll/runs/${id}`)
      .set('Authorization', `Bearer ${empToken}`);
    expect(detailRes.status).toBe(403);
  });

  // Race-safety net: the lifecycle writes must be guarded by the prior status at
  // the DB layer, not just by a read-then-write check in the service. Each method
  // returns the affected row count; a transition from the wrong status is a no-op
  // (count 0) and leaves the run untouched. This closes the TOCTOU window where
  // two concurrent requests both pass the service guard.
  describe('status-guarded transitions (race safety)', () => {
    async function seedRun(
      period: string,
      status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'PAID' | 'CANCELLED',
    ) {
      const run = await db.payrollRun.create({
        data: {
          tenantId,
          period,
          status,
          headcount: 0,
          totalGross: 0,
          totalDeductions: 0,
          totalNet: 0,
        },
      });
      return run.id;
    }

    it('approve only transitions a PENDING_APPROVAL run (no-op on a DRAFT run)', async () => {
      const id = await seedRun('2027-01', 'DRAFT');
      const settings = await payrollSettingsService.getSettings(tenantId);

      const count = await payrollRunRepository.approve(tenantId, id, null, settings);
      expect(count).toBe(0);

      const run = await db.payrollRun.findUnique({ where: { id } });
      expect(run!.status).toBe('DRAFT');
      expect(run!.approvedAt).toBeNull();
    });

    it('reject only transitions a PENDING_APPROVAL run (no-op on a DRAFT run)', async () => {
      const id = await seedRun('2027-04', 'DRAFT');

      const count = await payrollRunRepository.reject(tenantId, id);
      expect(count).toBe(0);

      const run = await db.payrollRun.findUnique({ where: { id } });
      expect(run!.status).toBe('DRAFT');
    });

    it('markPaid only transitions an APPROVED run (no-op on a DRAFT run)', async () => {
      const id = await seedRun('2027-02', 'DRAFT');

      const count = await payrollRunRepository.markPaid(tenantId, id);
      expect(count).toBe(0);

      const run = await db.payrollRun.findUnique({ where: { id } });
      expect(run!.status).toBe('DRAFT');
      expect(run!.paidAt).toBeNull();
    });

    it('cancel only transitions a DRAFT/APPROVED run (no-op on a PAID run)', async () => {
      const id = await seedRun('2027-03', 'PAID');

      const count = await payrollRunRepository.cancel(tenantId, id);
      expect(count).toBe(0);

      const run = await db.payrollRun.findUnique({ where: { id } });
      expect(run!.status).toBe('PAID');
    });
  });
});
