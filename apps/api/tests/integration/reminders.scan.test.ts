import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';
import { runReminderScan } from '../../src/domain/reminders/reminders.scan.js';

// Fixed "now": 2026-06-04T03:00:00Z == 2026-06-04 10:00 ICT. Offsets below are
// ICT calendar days relative to this instant (mirrors the unit test).
const NOW = new Date('2026-06-04T03:00:00.000Z');
const DAY_MS = 86_400_000;

/** Midnight-UTC instant for an ICT calendar date `today + offsetDays`. */
function dateAtOffset(offsetDays: number): Date {
  return new Date(Date.UTC(2026, 5, 4) + offsetDays * DAY_MS);
}

const TEST_TENANT_SLUG = 'reminders-scan-test-tenant';
const HR_USER_EMAIL = 'hr@reminders-scan-test.com';
const MANAGER_USER_EMAIL = 'mgr@reminders-scan-test.com';

describe('Reminder scan (SPEC-017) — critical paths', () => {
  let testTenantId: string;
  let hrUserId: string;
  let managerUserId: string;
  let empAId: string; // probation subject
  let empBId: string; // contract subject
  let empCId: string; // indefinite-contract subject

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TEST_TENANT_SLUG },
      update: {},
      create: { name: 'Reminders Scan Test Tenant', slug: TEST_TENANT_SLUG },
    });
    testTenantId = tenant.id;

    await db.notification.deleteMany({ where: { tenantId: testTenantId } });
    await db.contract.deleteMany({ where: { tenantId: testTenantId } });
    await db.employee.deleteMany({ where: { tenantId: testTenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId: testTenantId } } });
    await db.user.deleteMany({ where: { tenantId: testTenantId } });

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, testTenantId);

    const hr = await db.user.create({
      data: {
        tenantId: testTenantId,
        email: HR_USER_EMAIL,
        passwordHash: await hashPassword('HrTest@123'),
        fullName: 'HR Manager',
        role: 'HR_MANAGER',
        roleId: roleIdByKey.get('hr_manager'),
        status: 'ACTIVE',
      },
    });
    hrUserId = hr.id;

    // MANAGER lacks employees:update → must never receive lifecycle reminders.
    const mgr = await db.user.create({
      data: {
        tenantId: testTenantId,
        email: MANAGER_USER_EMAIL,
        passwordHash: await hashPassword('MgrTest@123'),
        fullName: 'Team Manager',
        role: 'MANAGER',
        roleId: roleIdByKey.get('manager'),
        status: 'ACTIVE',
      },
    });
    managerUserId = mgr.id;

    empAId = await createSubject('emp-a@reminders-scan-test.com', 'EMP-A', 'Nguyễn Văn A');
    empBId = await createSubject('emp-b@reminders-scan-test.com', 'EMP-B', 'Trần Thị B');
    empCId = await createSubject('emp-c@reminders-scan-test.com', 'EMP-C', 'Lê Văn C');
  });

  async function createSubject(email: string, code: string, fullName: string): Promise<string> {
    const user = await db.user.create({
      data: {
        tenantId: testTenantId,
        email,
        passwordHash: await hashPassword('Subject@123'),
        fullName,
        role: 'EMPLOYEE',
        status: 'ACTIVE',
      },
    });
    const employee = await db.employee.create({
      data: {
        tenant: { connect: { id: testTenantId } },
        user: { connect: { id: user.id } },
        employeeCode: code,
        fullName,
        joinDate: new Date('2026-01-01'),
        contractType: 'FULL_TIME',
        status: 'ACTIVE',
      },
    });
    return employee.id;
  }

  beforeEach(async () => {
    // Reset scenario state between tests.
    await db.notification.deleteMany({ where: { tenantId: testTenantId } });
    await db.contract.deleteMany({ where: { tenantId: testTenantId } });
    await db.employee.updateMany({
      where: { tenantId: testTenantId },
      data: { probationEndDate: null },
    });
  });

  afterAll(async () => {
    await db.notification.deleteMany({ where: { tenantId: testTenantId } });
    await db.contract.deleteMany({ where: { tenantId: testTenantId } });
    await db.employee.deleteMany({ where: { tenantId: testTenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId: testTenantId } } });
    await db.user.deleteMany({ where: { tenantId: testTenantId } });
    await db.tenant.delete({ where: { id: testTenantId } });
  });

  it('probation today+5 → 1 HR notification, 0 for MANAGER, 1 email job', async () => {
    await db.employee.update({
      where: { id: empAId },
      data: { probationEndDate: dateAtOffset(5) },
    });

    const result = await runReminderScan(NOW, { tenantId: testTenantId });

    expect(result.created).toBe(1);

    const hrNotifs = await db.notification.findMany({ where: { userId: hrUserId } });
    expect(hrNotifs).toHaveLength(1);
    expect(hrNotifs[0].kind).toBe('probation_ending');
    expect(hrNotifs[0].entityType).toBe('employee');
    expect(hrNotifs[0].entityId).toBe(empAId);

    const mgrCount = await db.notification.count({ where: { userId: managerUserId } });
    expect(mgrCount).toBe(0);

    expect(result.emailJobs).toHaveLength(1);
    expect(result.emailJobs[0].to).toBe(HR_USER_EMAIL);
    expect(result.emailJobs[0].kind).toBe('probation_ending');
  });

  it('2nd run same day → still exactly 1 notification (idempotent dedupe)', async () => {
    await db.employee.update({
      where: { id: empAId },
      data: { probationEndDate: dateAtOffset(5) },
    });

    const first = await runReminderScan(NOW, { tenantId: testTenantId });
    expect(first.created).toBe(1);

    const second = await runReminderScan(NOW, { tenantId: testTenantId });
    expect(second.created).toBe(0);
    // No new email fanned out for an already-existing notification.
    expect(second.emailJobs).toHaveLength(0);

    const total = await db.notification.count({ where: { tenantId: testTenantId } });
    expect(total).toBe(1);
  });

  it('contract today+20 → 1 contract_expiring reminder', async () => {
    const contract = await db.contract.create({
      data: {
        tenantId: testTenantId,
        employeeId: empBId,
        type: 'FULL_TIME',
        startDate: new Date('2026-01-01'),
        endDate: dateAtOffset(20),
        status: 'ACTIVE',
      },
    });

    const result = await runReminderScan(NOW, { tenantId: testTenantId });

    expect(result.created).toBe(1);
    const notifs = await db.notification.findMany({ where: { userId: hrUserId } });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].kind).toBe('contract_expiring');
    expect(notifs[0].entityType).toBe('contract');
    expect(notifs[0].entityId).toBe(contract.id);
  });

  it('boundaries today+8 (probation) / today+31 (contract) / indefinite are all excluded', async () => {
    // probation one day past the 7-day lead
    await db.employee.update({
      where: { id: empAId },
      data: { probationEndDate: dateAtOffset(8) },
    });
    // contract one day past the 30-day lead
    await db.contract.create({
      data: {
        tenantId: testTenantId,
        employeeId: empBId,
        type: 'FULL_TIME',
        startDate: new Date('2026-01-01'),
        endDate: dateAtOffset(31),
        status: 'ACTIVE',
      },
    });
    // indefinite contract (no end date)
    await db.contract.create({
      data: {
        tenantId: testTenantId,
        employeeId: empCId,
        type: 'FULL_TIME',
        startDate: new Date('2026-01-01'),
        endDate: null,
        status: 'ACTIVE',
      },
    });

    const result = await runReminderScan(NOW, { tenantId: testTenantId });

    expect(result.created).toBe(0);
    expect(result.emailJobs).toHaveLength(0);
    const total = await db.notification.count({ where: { tenantId: testTenantId } });
    expect(total).toBe(0);
  });

  // SPEC-036 — tenant-configured leads widen (or shrink) the scan window.
  it('probation today+10 fires only after the tenant widens probationLeadDays', async () => {
    await db.employee.update({
      where: { id: empAId },
      data: { probationEndDate: dateAtOffset(10) },
    });

    const withDefaultLead = await runReminderScan(NOW, { tenantId: testTenantId });
    expect(withDefaultLead.created).toBe(0); // default lead = 7 ngày

    await db.tenant.update({
      where: { id: testTenantId },
      data: { settings: { notifications: { probationLeadDays: 14 } } },
    });
    const withWidenedLead = await runReminderScan(NOW, { tenantId: testTenantId });
    expect(withWidenedLead.created).toBe(1);

    await db.tenant.update({ where: { id: testTenantId }, data: { settings: {} } });
  });

  // SPEC-037 P3 — email prefs: opting out kills the EMAIL only; the in-app
  // notification is still created.
  it('skips the email job (not the in-app notification) for an opted-out recipient', async () => {
    await db.user.update({
      where: { id: hrUserId },
      data: { notificationPrefs: { probation_ending: false } },
    });
    await db.employee.update({
      where: { id: empAId },
      data: { probationEndDate: dateAtOffset(5) },
    });

    const result = await runReminderScan(NOW, { tenantId: testTenantId });

    expect(result.created).toBe(1); // in-app vẫn tạo
    expect(result.emailJobs).toHaveLength(0); // email bị tắt

    await db.user.update({ where: { id: hrUserId }, data: { notificationPrefs: {} } });
  });
});
