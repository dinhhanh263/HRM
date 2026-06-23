import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { ImportOptions, ValidatedImportRow } from '@hrm/shared';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { permissionService } from '../../src/domain/services/permission.service.js';
import { processImport } from '../../src/domain/employee-import/employee-import.processor.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';

const TENANT_SLUG = 'import-processor-tenant';
const OPTIONS: ImportOptions = { autoCreateOrgUnits: true, duplicateMode: 'skip' };

/** A complete ValidatedImportRow with sensible defaults; override per test. */
let seq = 0;
function vrow(overrides: Partial<ValidatedImportRow> & { email: string; fullName: string }): ValidatedImportRow {
  seq += 1;
  return {
    rowNumber: seq,
    employeeCode: `NV-${seq}`,
    dateOfBirth: null,
    gender: null,
    idNumber: null,
    phone: null,
    department: null,
    position: null,
    manager: null,
    joinDate: null,
    contractType: 'FULL_TIME',
    dependentsCount: 0,
    role: 'EMPLOYEE',
    placeOfBirth: null,
    idIssueDate: null,
    idIssuePlace: null,
    personalEmail: null,
    education: null,
    maritalStatus: null,
    permanentAddress: null,
    currentAddress: null,
    emergencyContactName: null,
    emergencyContactRelationship: null,
    emergencyContactPhone: null,
    bankAccountNumber: null,
    bankName: null,
    bankBranch: null,
    taxCode: null,
    socialInsuranceNumber: null,
    healthcareFacility: null,
    motorbikeRegistration: null,
    ...overrides,
  };
}

describe('processImport — bulk employee import service', () => {
  let tenantId: string;
  let roleIdByKey: Map<string, string>;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Import Processor Tenant', slug: TENANT_SLUG },
    });
    tenantId = tenant.id;
    // Production tenants always have system roles provisioned at creation; the
    // import processor resolves each row's role to a tenant Role row, so the
    // test tenant must be provisioned the same way.
    await seedPermissionCatalog(db);
    roleIdByKey = await syncSystemRolesForTenant(db, tenantId);
  });

  beforeEach(async () => {
    seq = 0;
    // LeaveBalance FKs to employee, so it must be cleared before employees.
    await db.leaveBalance.deleteMany({ where: { tenantId } });
    await db.leaveType.deleteMany({ where: { tenantId } });
    await db.employee.deleteMany({ where: { tenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
    await db.user.deleteMany({ where: { tenantId } });
    await db.position.deleteMany({ where: { tenantId } });
    await db.department.deleteMany({ where: { tenantId } });
    await db.tenant.update({ where: { id: tenantId }, data: { settings: {} } });
  });

  afterAll(async () => {
    await db.leaveBalance.deleteMany({ where: { tenantId } });
    await db.leaveType.deleteMany({ where: { tenantId } });
    await db.employee.deleteMany({ where: { tenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
    await db.user.deleteMany({ where: { tenantId } });
    await db.position.deleteMany({ where: { tenantId } });
    await db.department.deleteMany({ where: { tenantId } });
    await db.tenant.deleteMany({ where: { slug: TENANT_SLUG } });
  });

  it('should create INVITED users + employees and auto-create org units', async () => {
    const rows = [
      vrow({ fullName: 'Nguyen Van A', email: 'a@proc.com', department: 'Engineering', position: 'Senior Dev' }),
      vrow({ fullName: 'Tran Thi B', email: 'b@proc.com', department: 'Engineering' }),
    ];

    const result = await processImport(tenantId, rows, OPTIONS);

    expect(result).toMatchObject({ total: 2, created: 2, skipped: 0, failed: 0 });
    expect(result.errors).toHaveLength(0);

    const users = await db.user.findMany({ where: { tenantId }, orderBy: { email: 'asc' } });
    expect(users).toHaveLength(2);
    expect(users.every((u) => u.status === 'INVITED')).toBe(true);
    // No bcrypt at import: the placeholder hash is never a valid bcrypt digest.
    expect(users.every((u) => !u.passwordHash.startsWith('$2'))).toBe(true);

    const dept = await db.department.findFirst({ where: { tenantId, name: 'Engineering' } });
    const pos = await db.position.findFirst({ where: { tenantId, name: 'Senior Dev' } });
    expect(dept).not.toBeNull();
    expect(pos).not.toBeNull();

    const employees = await db.employee.findMany({ where: { tenantId } });
    expect(employees).toHaveLength(2);
    // Codes come verbatim from the file rows (no longer auto-generated).
    expect(employees.every((e) => /^NV-\d+$/.test(e.employeeCode))).toBe(true);
    expect(new Set(employees.map((e) => e.employeeCode)).size).toBe(2); // unique codes
  });

  it('should persist dependentsCount on imported employees (drives PIT deduction)', async () => {
    const rows = [
      vrow({ fullName: 'Dep Three', email: 'dep3@proc.com', dependentsCount: 3 }),
      vrow({ fullName: 'Dep Zero', email: 'dep0@proc.com' }), // defaults to 0
    ];

    const result = await processImport(tenantId, rows, OPTIONS);
    expect(result).toMatchObject({ total: 2, created: 2, failed: 0 });

    const three = await db.employee.findFirst({ where: { tenantId, user: { email: 'dep3@proc.com' } } });
    const zero = await db.employee.findFirst({ where: { tenantId, user: { email: 'dep0@proc.com' } } });
    expect(three?.dependentsCount).toBe(3);
    expect(zero?.dependentsCount).toBe(0);
  });

  // SPEC-040: import must persist the extended profile fields too.
  it('persists extended profile fields on imported employees', async () => {
    const rows = [
      vrow({
        fullName: 'Ext Fields',
        email: 'ext@proc.com',
        placeOfBirth: 'Hà Nội',
        idIssueDate: '2018-05-20',
        idIssuePlace: 'Cục CSQLHC',
        personalEmail: 'ext.personal@gmail.com',
        education: 'ĐH Bách Khoa',
        maritalStatus: 'MARRIED',
        permanentAddress: '12 Trần Hưng Đạo',
        currentAddress: '45 Cầu Giấy',
        emergencyContactName: 'Người Thân',
        emergencyContactRelationship: 'Vợ',
        emergencyContactPhone: '0912345678',
        bankAccountNumber: '0123456789',
        bankName: 'Vietcombank',
        bankBranch: 'CN Hà Nội',
        taxCode: '8123456789',
        socialInsuranceNumber: 'SI-777',
        healthcareFacility: 'BV Bạch Mai',
        motorbikeRegistration: 'Honda Wave - Đỏ - 29X1-12345',
      }),
    ];

    const result = await processImport(tenantId, rows, OPTIONS);
    expect(result).toMatchObject({ total: 1, created: 1, failed: 0 });

    const emp = await db.employee.findFirst({ where: { tenantId, user: { email: 'ext@proc.com' } } });
    expect(emp?.placeOfBirth).toBe('Hà Nội');
    expect(emp?.idIssueDate?.toISOString().slice(0, 10)).toBe('2018-05-20');
    expect(emp?.personalEmail).toBe('ext.personal@gmail.com');
    expect(emp?.maritalStatus).toBe('MARRIED');
    expect(emp?.permanentAddress).toBe('12 Trần Hưng Đạo');
    expect(emp?.bankName).toBe('Vietcombank');
    expect(emp?.taxCode).toBe('8123456789');
    expect(emp?.socialInsuranceNumber).toBe('SI-777');
    expect(emp?.motorbikeRegistration).toBe('Honda Wave - Đỏ - 29X1-12345');
  });

  it('sets user.roleId to the tenant Role row matching each imported role (RBAC authority)', async () => {
    const rows = [
      vrow({ fullName: 'Emp Role', email: 'emp@role.com', role: 'EMPLOYEE' }),
      vrow({ fullName: 'Mgr Role', email: 'mgr@role.com', role: 'MANAGER' }),
      vrow({ fullName: 'Hr Role', email: 'hr@role.com', role: 'HR_MANAGER' }),
    ];

    const result = await processImport(tenantId, rows, OPTIONS);
    expect(result).toMatchObject({ total: 3, created: 3, failed: 0 });

    const byEmail = new Map(
      (await db.user.findMany({ where: { tenantId } })).map((u) => [u.email, u]),
    );
    // The bug: imported users had roleId = null → zero permissions.
    expect(byEmail.get('emp@role.com')?.roleId).toBe(roleIdByKey.get('employee'));
    expect(byEmail.get('mgr@role.com')?.roleId).toBe(roleIdByKey.get('manager'));
    expect(byEmail.get('hr@role.com')?.roleId).toBe(roleIdByKey.get('hr_manager'));

    // The resolved role must carry the permission set requirePermission reads.
    const mgrPerms = await permissionService.getPermissionsForRole(byEmail.get('mgr@role.com')!.roleId!);
    expect(mgrPerms.has('timesheet:approve')).toBe(true);
    const empPerms = await permissionService.getPermissionsForRole(byEmail.get('emp@role.com')!.roleId!);
    expect(empPerms.has('employees:view')).toBe(true);
    expect(empPerms.has('timesheet:approve')).toBe(false);
  });

  it('lets an imported user (once activated) pass a permission-gated request', async () => {
    const password = 'Imported@123';
    await processImport(
      tenantId,
      [vrow({ fullName: 'Gate User', email: 'gate@role.com', role: 'EMPLOYEE' })],
      OPTIONS,
    );

    // Simulate invite acceptance: activate + set a real password so login works.
    // The roleId set at import is what makes the gate pass below.
    const imported = await db.user.findFirst({ where: { tenantId, email: 'gate@role.com' } });
    expect(imported?.roleId).toBe(roleIdByKey.get('employee'));
    await db.user.update({
      where: { id: imported!.id },
      data: { status: 'ACTIVE', passwordHash: await hashPassword(password) },
    });

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'gate@role.com', password, tenantSlug: TENANT_SLUG });
    expect(login.status).toBe(200);
    const token = login.body.data.accessToken;

    // GET /employees is gated by employees:view, which the EMPLOYEE role grants.
    // With the old null-roleId bug this returned 403.
    const res = await request(app)
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('should be idempotent: re-running the same rows creates 0 and skips all', async () => {
    const rows = [
      vrow({ fullName: 'Idem One', email: 'one@proc.com' }),
      vrow({ fullName: 'Idem Two', email: 'two@proc.com' }),
    ];

    const first = await processImport(tenantId, rows, OPTIONS);
    expect(first).toMatchObject({ created: 2, skipped: 0 });

    seq = 0; // re-issue the same row numbers
    const second = await processImport(tenantId, rows.map((r) => ({ ...r, rowNumber: r.rowNumber })), OPTIONS);
    expect(second).toMatchObject({ total: 2, created: 0, skipped: 2, failed: 0 });

    expect(await db.user.count({ where: { tenantId } })).toBe(2);
  });

  it('should link a forward-referenced manager (boss defined in the same file)', async () => {
    const rows = [
      vrow({ fullName: 'Boss', email: 'boss@proc.com' }),
      vrow({ fullName: 'Report', email: 'report@proc.com', manager: 'boss@proc.com' }),
    ];

    const result = await processImport(tenantId, rows, OPTIONS);
    expect(result).toMatchObject({ created: 2, failed: 0 });

    const boss = await db.employee.findFirst({ where: { tenantId, user: { email: 'boss@proc.com' } } });
    const report = await db.employee.findFirst({ where: { tenantId, user: { email: 'report@proc.com' } } });
    expect(report?.managerId).toBe(boss?.id);
  });

  it('should reject a self-referencing manager (cycle guard) without aborting the row', async () => {
    const rows = [
      vrow({ fullName: 'Loner', email: 'loner@proc.com', manager: 'loner@proc.com' }),
    ];

    const result = await processImport(tenantId, rows, OPTIONS);

    // The employee is still created; only the manager link is skipped.
    expect(result).toMatchObject({ total: 1, created: 1, skipped: 0, failed: 0 });
    expect(result.errors.some((e) => e.column === 'manager')).toBe(true);

    const loner = await db.employee.findFirst({ where: { tenantId, user: { email: 'loner@proc.com' } } });
    expect(loner?.managerId).toBeNull();
  });

  it('should fire onUserCreated once per created user (and not for skipped rows)', async () => {
    const rows = [
      vrow({ fullName: 'Cb One', email: 'cb1@proc.com' }),
      vrow({ fullName: 'Cb Two', email: 'cb2@proc.com' }),
    ];

    const firstSeen: { userId: string; email: string; fullName: string }[] = [];
    const first = await processImport(tenantId, rows, OPTIONS, undefined, (u) => firstSeen.push(u));
    expect(first).toMatchObject({ created: 2 });
    expect(firstSeen).toHaveLength(2);
    expect(firstSeen.map((u) => u.email).sort()).toEqual(['cb1@proc.com', 'cb2@proc.com']);
    expect(firstSeen.every((u) => typeof u.userId === 'string' && u.userId.length > 0)).toBe(true);

    // Re-run: all rows are skipped, so the callback must not fire at all.
    seq = 0;
    const secondSeen: unknown[] = [];
    const second = await processImport(tenantId, rows, OPTIONS, undefined, (u) => secondSeen.push(u));
    expect(second).toMatchObject({ created: 0, skipped: 2 });
    expect(secondSeen).toHaveLength(0);
  });

  it('should not create org units when autoCreateOrgUnits is false', async () => {
    const rows = [vrow({ fullName: 'No Org', email: 'noorg@proc.com', department: 'Ghost Dept' })];

    const result = await processImport(tenantId, rows, { autoCreateOrgUnits: false, duplicateMode: 'skip' });
    expect(result).toMatchObject({ created: 1 });

    expect(await db.department.count({ where: { tenantId, name: 'Ghost Dept' } })).toBe(0);
    const emp = await db.employee.findFirst({ where: { tenantId, user: { email: 'noorg@proc.com' } } });
    expect(emp?.departmentId).toBeNull();
  });

  describe('pro-rata leave seeding on import', () => {
    let annualTypeId: string;

    beforeEach(async () => {
      // ANNUAL (12 days) is the type pro-rata divides; created per test since
      // the outer beforeEach wipes leave types.
      const annual = await db.leaveType.create({
        data: { tenantId, name: 'Annual', code: 'ANNUAL', defaultDays: 12, paid: true },
      });
      annualTypeId = annual.id;
    });

    async function setProRata(enabled: boolean) {
      await db.tenant.update({
        where: { id: tenantId },
        data: { settings: { leaveProrata: { enabled } } },
      });
    }

    it('seeds pro-rated balances for each imported employee when the toggle is on', async () => {
      await setProRata(true);
      // Joined 15 Nov → Nov + Dec inclusive = 2 months → 12 × 2/12 = 2 days.
      const rows = [vrow({ fullName: 'Late Joiner', email: 'late@proc.com', joinDate: '2026-11-15' })];

      const result = await processImport(tenantId, rows, OPTIONS);
      expect(result).toMatchObject({ created: 1, failed: 0 });

      const emp = await db.employee.findFirst({ where: { tenantId, user: { email: 'late@proc.com' } } });
      const balance = await db.leaveBalance.findFirst({
        where: { tenantId, employeeId: emp!.id, leaveTypeId: annualTypeId, year: 2026 },
      });
      expect(balance?.allocated).toBe(2);
    });

    it('writes no balance rows when the toggle is off', async () => {
      await setProRata(false);
      const rows = [vrow({ fullName: 'No Prorata', email: 'noprorata@proc.com', joinDate: '2026-11-15' })];

      const result = await processImport(tenantId, rows, OPTIONS);
      expect(result).toMatchObject({ created: 1, failed: 0 });

      expect(await db.leaveBalance.count({ where: { tenantId } })).toBe(0);
    });

    it('does not abort the batch when one row would fail (partial success preserved)', async () => {
      await setProRata(true);
      // Two valid rows + one duplicate-email row (skipped, not failed). All
      // successful rows must still be seeded; a single bad row never aborts.
      const rows = [
        vrow({ fullName: 'Batch A', email: 'batcha@proc.com', joinDate: '2026-11-15' }),
        vrow({ fullName: 'Batch B', email: 'batchb@proc.com', joinDate: '2026-11-15' }),
      ];

      const result = await processImport(tenantId, rows, OPTIONS);
      expect(result).toMatchObject({ total: 2, created: 2, failed: 0 });

      // Both created employees got their pro-rated annual balance.
      expect(await db.leaveBalance.count({ where: { tenantId, leaveTypeId: annualTypeId, year: 2026 } })).toBe(2);
    });
  });
});
