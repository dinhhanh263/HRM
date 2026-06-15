import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';

const TENANT_SLUG = 'payroll-pdf-tenant';
const HR_EMAIL = 'hr@payroll-pdf.com';
const HR_PASSWORD = 'HrTest@123';
const EMP_A_EMAIL = 'emp-a@payroll-pdf.com';
const EMP_B_EMAIL = 'emp-b@payroll-pdf.com';
const EMP_PASSWORD = 'EmpTest@123';

const APPROVED_PERIOD = '2026-01';
const DRAFT_PERIOD = '2026-02';

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

async function seedPayable(tenantId: string, roleId: string, email: string, code: string) {
  const user = await db.user.create({
    data: {
      tenantId,
      email,
      passwordHash: await hashPassword(EMP_PASSWORD),
      fullName: code,
      role: 'EMPLOYEE',
      roleId,
      status: 'ACTIVE',
    },
  });
  const employee = await db.employee.create({
    data: {
      tenantId,
      userId: user.id,
      employeeCode: code,
      fullName: code,
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
  return employee.id;
}

// supertest doesn't parse application/pdf — collect the raw bytes so we can
// assert the %PDF magic header on the streamed response.
function pdfParser(res: request.Response, callback: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('Payroll PDF export (single payslip + bulk run)', () => {
  let tenantId: string;
  let hrToken: string;
  let empAToken: string;
  let empAId: string;
  let empBId: string;
  let approvedRunId: string;
  let draftRunId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Công ty Payroll PDF', slug: TENANT_SLUG },
    });
    tenantId = tenant.id;

    await cleanup(tenantId);

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, tenantId);
    const employeeRoleId = roleIdByKey.get('employee')!;

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

    empAId = await seedPayable(tenantId, employeeRoleId, EMP_A_EMAIL, 'EMP-A');
    empBId = await seedPayable(tenantId, employeeRoleId, EMP_B_EMAIL, 'EMP-B');

    hrToken = await login(HR_EMAIL, HR_PASSWORD);
    empAToken = await login(EMP_A_EMAIL, EMP_PASSWORD);

    // This suite asserts PDF export + payslip visibility on an APPROVED run, not
    // the maker-checker path, so the run is forced to APPROVED directly rather
    // than going through submit + a separate approver.
    const approved = await request(app)
      .post('/api/v1/payroll/runs')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ period: APPROVED_PERIOD });
    approvedRunId = approved.body.data.id;
    await db.payrollRun.update({
      where: { id: approvedRunId },
      data: { status: 'APPROVED', approvedAt: new Date() },
    });

    const draft = await request(app)
      .post('/api/v1/payroll/runs')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ period: DRAFT_PERIOD });
    draftRunId = draft.body.data.id;
  });

  afterAll(async () => {
    await cleanup(tenantId);
  });

  const slipId = (employeeId: string, period: string) =>
    db.payslip
      .findFirst({ where: { tenantId, employeeId, payrollRun: { period } }, select: { id: true } })
      .then((p) => p!.id);

  const getPdf = (path: string, token: string) =>
    request(app).get(path).set('Authorization', `Bearer ${token}`).buffer(true).parse(pdfParser);

  // ---- Single payslip PDF (payroll:view, self-scoped) ----

  it('lets an employee download their own APPROVED payslip as a PDF', async () => {
    const id = await slipId(empAId, APPROVED_PERIOD);
    const res = await getPdf(`/api/v1/payroll/payslips/${id}/pdf`, empAToken);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('.pdf');
    expect(res.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('forbids downloading another employee’s payslip PDF (403)', async () => {
    const id = await slipId(empBId, APPROVED_PERIOD);
    const res = await getPdf(`/api/v1/payroll/payslips/${id}/pdf`, empAToken);
    expect(res.status).toBe(403);
  });

  it('hides an employee’s own DRAFT payslip PDF (404)', async () => {
    const id = await slipId(empAId, DRAFT_PERIOD);
    const res = await getPdf(`/api/v1/payroll/payslips/${id}/pdf`, empAToken);
    expect(res.status).toBe(404);
  });

  it('lets HR download any payslip PDF, including DRAFT', async () => {
    const id = await slipId(empBId, DRAFT_PERIOD);
    const res = await getPdf(`/api/v1/payroll/payslips/${id}/pdf`, hrToken);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });

  // ---- Bulk run export (payroll:export, HR-only) ----

  it('lets HR export an entire run as a single PDF', async () => {
    const res = await getPdf(`/api/v1/payroll/runs/${approvedRunId}/export`, hrToken);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain(`payroll-${APPROVED_PERIOD}.pdf`);
    expect(res.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('forbids a view-only employee from exporting a run (403)', async () => {
    const res = await getPdf(`/api/v1/payroll/runs/${approvedRunId}/export`, empAToken);
    expect(res.status).toBe(403);
  });

  it('returns 404 when exporting a non-existent run', async () => {
    const res = await getPdf(
      '/api/v1/payroll/runs/00000000-0000-0000-0000-000000000000/export',
      hrToken,
    );
    expect(res.status).toBe(404);
  });
});
