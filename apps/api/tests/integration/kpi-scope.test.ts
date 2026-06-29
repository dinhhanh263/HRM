import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../src/infrastructure/database/client.js';
import { kpiCycleService as cyc } from '../../src/domain/services/kpi-cycle.service.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';

const SLUG = 'kpi-scope-test';
let tenantId: string;
let roleByKey: Map<string, string>;

// userId + employeeId của từng vai
const managerView = { userId: '', empId: '', roleId: '' };
const reportView = { userId: '', empId: '', roleId: '' };
const otherView = { userId: '', empId: '', roleId: '' };
const hrView = { userId: '', empId: '', roleId: '' };

async function makeUserEmployee(email: string, roleKey: string, roleEnum: string, managerId: string | null) {
  const user = await db.user.create({
    data: { tenantId, email, passwordHash: 'x', fullName: email, role: roleEnum as never, roleId: roleByKey.get(roleKey), status: 'ACTIVE' },
  });
  const emp = await db.employee.create({
    data: { tenantId, userId: user.id, employeeCode: email, fullName: email, joinDate: new Date('2024-01-01'), contractType: 'FULL_TIME', managerId },
  });
  return { userId: user.id, empId: emp.id, roleId: roleByKey.get(roleKey)! };
}

beforeAll(async () => {
  await db.tenant.deleteMany({ where: { slug: SLUG } });
  tenantId = (await db.tenant.create({ data: { name: 'KPI Scope', slug: SLUG } })).id;
  await seedPermissionCatalog(db);
  roleByKey = await syncSystemRolesForTenant(db, tenantId);

  const mgr = await makeUserEmployee('mgr@scope.test', 'manager', 'MANAGER', null);
  Object.assign(managerView, mgr);
  const rep = await makeUserEmployee('rep@scope.test', 'employee', 'EMPLOYEE', mgr.empId); // báo cáo cho mgr
  Object.assign(reportView, rep);
  const oth = await makeUserEmployee('other@scope.test', 'employee', 'EMPLOYEE', null);
  Object.assign(otherView, oth);
  const hr = await makeUserEmployee('hr@scope.test', 'hr_manager', 'HR_MANAGER', null);
  Object.assign(hrView, hr);
});

afterAll(async () => {
  await db.tenant.deleteMany({ where: { slug: SLUG } });
});

const viewer = (v: typeof managerView, role: string) => ({ userId: v.userId, role, roleId: v.roleId });

describe('getEmployeeHistoryForViewer — scope enforcement', () => {
  it('allows viewing self (plain kpi:view employee)', async () => {
    await expect(cyc.getEmployeeHistoryForViewer(tenantId, viewer(reportView, 'EMPLOYEE'), reportView.empId)).resolves.toBeTruthy();
  });

  it('denies a plain employee viewing someone else', async () => {
    await expect(
      cyc.getEmployeeHistoryForViewer(tenantId, viewer(reportView, 'EMPLOYEE'), managerView.empId),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('allows a manager (kpi:view_team) viewing a direct report', async () => {
    await expect(cyc.getEmployeeHistoryForViewer(tenantId, viewer(managerView, 'MANAGER'), reportView.empId)).resolves.toBeTruthy();
  });

  it('denies a manager viewing a non-report', async () => {
    await expect(
      cyc.getEmployeeHistoryForViewer(tenantId, viewer(managerView, 'MANAGER'), otherView.empId),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('allows HR (kpi:view_all) viewing anyone', async () => {
    await expect(cyc.getEmployeeHistoryForViewer(tenantId, viewer(hrView, 'HR_MANAGER'), otherView.empId)).resolves.toBeTruthy();
  });

  it('404s for an unknown / cross-tenant target employee', async () => {
    await expect(
      cyc.getEmployeeHistoryForViewer(tenantId, viewer(hrView, 'HR_MANAGER'), 'nonexistent-employee-id'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('SUPER_ADMIN bypasses scope', async () => {
    await expect(
      cyc.getEmployeeHistoryForViewer(tenantId, { userId: 'x', role: 'SUPER_ADMIN', roleId: null }, otherView.empId),
    ).resolves.toBeTruthy();
  });
});
