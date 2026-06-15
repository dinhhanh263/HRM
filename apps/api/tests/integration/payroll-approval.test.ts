import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { emailProvider } from '../../src/infrastructure/email/email.provider.js';
import { payrollRunRepository } from '../../src/domain/repositories/payroll-run.repository.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';

// Maker-checker: HR (payroll:process) creates + submits; an Approver
// (payroll:approve) approves/rejects. These two permissions live on separate
// system roles so one person cannot both compute and approve a pay run.
const TENANT_SLUG = 'payroll-approval-tenant';
const HR_EMAIL = 'hr@payroll-approval.com';
const HR_PASSWORD = 'HrTest@123';
const APPROVER_EMAIL = 'approver@payroll-approval.com';
const APPROVER_PASSWORD = 'ApvTest@123';

async function cleanup(tenantId: string) {
  await db.payslip.deleteMany({ where: { tenantId } });
  await db.payrollRun.deleteMany({ where: { tenantId } });
  await db.payrollSettings.deleteMany({ where: { tenantId } });
  await db.employeeSalary.deleteMany({ where: { tenantId } });
  await db.employee.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
}

async function login(email: string, password: string) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password, tenantSlug: TENANT_SLUG });
  return res.body.data.accessToken as string;
}

describe('Payroll approval — maker-checker (submit)', () => {
  let tenantId: string;
  let hrToken: string;
  let approverToken: string;
  let approverEmployeeId: string;

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

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Payroll Approval Tenant', slug: TENANT_SLUG },
    });
    tenantId = tenant.id;

    await cleanup(tenantId);

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, tenantId);

    const hrUser = await db.user.create({
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
    await db.employee.create({
      data: {
        tenantId,
        userId: hrUser.id,
        employeeCode: 'PA-HR',
        fullName: 'HR Manager',
        joinDate: new Date('2022-01-01'),
        contractType: 'FULL_TIME',
        status: 'ACTIVE',
      },
    });
    const approverUser = await db.user.create({
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
    const approverEmployee = await db.employee.create({
      data: {
        tenantId,
        userId: approverUser.id,
        employeeCode: 'PA-APV',
        fullName: 'Payroll Approver',
        joinDate: new Date('2021-01-01'),
        contractType: 'FULL_TIME',
        status: 'ACTIVE',
      },
    });
    approverEmployeeId = approverEmployee.id;

    const user = await db.user.create({
      data: {
        tenantId,
        email: 'pa-1@payroll-approval.com',
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
        employeeCode: 'PA-1',
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

    hrToken = await login(HR_EMAIL, HR_PASSWORD);
    approverToken = await login(APPROVER_EMAIL, APPROVER_PASSWORD);
  });

  afterAll(async () => {
    await cleanup(tenantId);
  });

  it('HR submits a DRAFT run for approval → PENDING_APPROVAL, records submittedBy/At', async () => {
    const id = await createDraft('2028-01');
    const res = await post(id, 'submit');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PENDING_APPROVAL');
    expect(res.body.data.submittedById).not.toBeNull();
    expect(res.body.data.submittedAt).not.toBeNull();
  });

  it('rejects recomputing a PENDING_APPROVAL run with 409', async () => {
    const id = await createDraft('2028-02');
    expect((await post(id, 'submit')).status).toBe(200);

    const res = await post(id, 'recompute');
    expect(res.status).toBe(409);
  });

  it('rejects submitting a non-DRAFT run with 409', async () => {
    const id = await createDraft('2028-03');
    expect((await post(id, 'submit')).status).toBe(200);

    const res = await post(id, 'submit');
    expect(res.status).toBe(409);
  });

  it('still allows cancelling a PENDING_APPROVAL run', async () => {
    const id = await createDraft('2028-04');
    expect((await post(id, 'submit')).status).toBe(200);

    const res = await post(id, 'cancel');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
  });

  it('forbids an Approver (no payroll:process) from submitting → 403', async () => {
    const id = await createDraft('2028-05');
    const res = await post(id, 'submit', approverToken);
    expect(res.status).toBe(403);
  });

  // ---- Slice 3: email the approver(s) on submit (best-effort) ----

  it('emails every payroll:approve holder when HR submits for approval', async () => {
    const spy = vi
      .spyOn(emailProvider, 'sendPayrollApprovalRequest')
      .mockResolvedValue(undefined);
    try {
      const id = await createDraft('2028-06');
      expect((await post(id, 'submit')).status).toBe(200);

      expect(spy).toHaveBeenCalled();
      const recipients = spy.mock.calls.map(([arg]) => arg.to);
      expect(recipients).toContain(APPROVER_EMAIL);
    } finally {
      spy.mockRestore();
    }
  });

  it('still returns 200 when the approval email fails (best-effort, no rollback)', async () => {
    const spy = vi
      .spyOn(emailProvider, 'sendPayrollApprovalRequest')
      .mockRejectedValue(new Error('boom'));
    try {
      const id = await createDraft('2028-07');
      const res = await post(id, 'submit');

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PENDING_APPROVAL');
    } finally {
      spy.mockRestore();
    }
  });

  it('excludes an approver who is also the submitter from the recipient list', async () => {
    // With the lone approver as submitter, the recipient set is empty; without
    // an exclusion they remain a recipient — so the filter is what differs.
    const excluded = await payrollRunRepository.findApproverRecipients(tenantId, approverEmployeeId);
    expect(excluded.map((r) => r.email)).not.toContain(APPROVER_EMAIL);

    const all = await payrollRunRepository.findApproverRecipients(tenantId, null);
    expect(all.map((r) => r.email)).toContain(APPROVER_EMAIL);
  });

  // ---- Slice 2: checker (approve / reject) ----

  it('Approver approves a PENDING_APPROVAL run → APPROVED', async () => {
    const id = await createDraft('2029-01');
    expect((await post(id, 'submit')).status).toBe(200);

    const res = await post(id, 'approve', approverToken);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');

    const run = await db.payrollRun.findUnique({ where: { id } });
    expect(run!.approvedAt).not.toBeNull();
    expect(run!.settingsSnapshot).not.toBeNull();
  });

  it('forbids HR (no payroll:approve) from approving → 403', async () => {
    const id = await createDraft('2029-02');
    expect((await post(id, 'submit')).status).toBe(200);

    const res = await post(id, 'approve', hrToken);
    expect(res.status).toBe(403);
  });

  it('forbids self-approval: submitter cannot approve their own run → 403', async () => {
    // Seed a PENDING_APPROVAL run already submitted by the approver themselves.
    const run = await db.payrollRun.create({
      data: {
        tenantId,
        period: '2029-03',
        status: 'PENDING_APPROVAL',
        headcount: 1,
        totalGross: 0,
        totalDeductions: 0,
        totalNet: 0,
        submittedById: approverEmployeeId,
        submittedAt: new Date(),
      },
    });

    const res = await post(run.id, 'approve', approverToken);
    expect(res.status).toBe(403);

    const after = await db.payrollRun.findUnique({ where: { id: run.id } });
    expect(after!.status).toBe('PENDING_APPROVAL');
  });

  it('Approver rejects a PENDING_APPROVAL run → DRAFT, clears submittedBy/At', async () => {
    const id = await createDraft('2029-04');
    expect((await post(id, 'submit')).status).toBe(200);

    const res = await post(id, 'reject', approverToken);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.submittedById).toBeNull();
    expect(res.body.data.submittedAt).toBeNull();
  });

  it('forbids HR (no payroll:approve) from rejecting → 403', async () => {
    const id = await createDraft('2029-05');
    expect((await post(id, 'submit')).status).toBe(200);

    const res = await post(id, 'reject', hrToken);
    expect(res.status).toBe(403);
  });

  it('rejects approving a non-PENDING (DRAFT) run with 409', async () => {
    const id = await createDraft('2029-06');

    const res = await post(id, 'approve', approverToken);
    expect(res.status).toBe(409);
  });

  it('rejects rejecting a non-PENDING (DRAFT) run with 409', async () => {
    const id = await createDraft('2029-07');

    const res = await post(id, 'reject', approverToken);
    expect(res.status).toBe(409);
  });

  it('lets an Approver read the run roster and a run detail (200)', async () => {
    const id = await createDraft('2029-08');

    const listRes = await request(app)
      .get('/api/v1/payroll/runs')
      .set('Authorization', `Bearer ${approverToken}`);
    expect(listRes.status).toBe(200);

    const detailRes = await request(app)
      .get(`/api/v1/payroll/runs/${id}`)
      .set('Authorization', `Bearer ${approverToken}`);
    expect(detailRes.status).toBe(200);
  });
});
