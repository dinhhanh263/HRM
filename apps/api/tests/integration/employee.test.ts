import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';
import { employeeService } from '../../src/domain/services/employee.service.js';
import { payrollRunRepository } from '../../src/domain/repositories/payroll-run.repository.js';

const TEST_TENANT_SLUG = 'employee-test-tenant';
const HR_USER_EMAIL = 'hr@employee-test.com';
const HR_USER_PASSWORD = 'HrTest@123';
const EMP_USER_EMAIL = 'emp@employee-test.com';
const EMP_USER_PASSWORD = 'EmpTest@123';
const ADMIN_USER_EMAIL = 'admin@employee-test.com';
const ADMIN_USER_PASSWORD = 'AdminTest@123';

describe('Employee API', () => {
  let testTenantId: string;
  let hrUserId: string;
  let accessToken: string;
  let employeeToken: string;
  let empUserId: string;
  // SUPER_ADMIN token — the only role allowed to assign/alter system roles.
  let adminToken: string;
  let testDepartmentId: string;
  let testPositionId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TEST_TENANT_SLUG },
      update: {},
      create: {
        name: 'Employee Test Tenant',
        slug: TEST_TENANT_SLUG,
      },
    });
    testTenantId = tenant.id;

    await db.employee.deleteMany({ where: { tenantId: testTenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId: testTenantId } } });
    await db.user.deleteMany({ where: { tenantId: testTenantId } });
    await db.position.deleteMany({ where: { tenantId: testTenantId } });
    await db.department.deleteMany({ where: { tenantId: testTenantId } });

    const department = await db.department.create({
      data: {
        tenantId: testTenantId,
        name: 'Test Department',
      },
    });
    testDepartmentId = department.id;

    const position = await db.position.create({
      data: {
        tenantId: testTenantId,
        name: 'Test Position',
        departmentId: testDepartmentId,
        level: 2,
      },
    });
    testPositionId = position.id;

    // RBAC: seed the global catalog + system roles for this tenant so
    // requirePermission can resolve the caller's permission set.
    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, testTenantId);

    const hrUser = await db.user.create({
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
    hrUserId = hrUser.id;

    // A plain EMPLOYEE-role user: lacks employees:create/update/etc. → used
    // to prove requirePermission denies (403) when a key is missing.
    const empUser = await db.user.create({
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
    empUserId = empUser.id;

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: HR_USER_EMAIL,
      password: HR_USER_PASSWORD,
      tenantSlug: TEST_TENANT_SLUG,
    });
    accessToken = loginRes.body.data.accessToken;

    const empLoginRes = await request(app).post('/api/v1/auth/login').send({
      email: EMP_USER_EMAIL,
      password: EMP_USER_PASSWORD,
      tenantSlug: TEST_TENANT_SLUG,
    });
    employeeToken = empLoginRes.body.data.accessToken;

    // SUPER_ADMIN: the only caller permitted to assign a system role via the form.
    await db.user.create({
      data: {
        tenantId: testTenantId,
        email: ADMIN_USER_EMAIL,
        passwordHash: await hashPassword(ADMIN_USER_PASSWORD),
        fullName: 'Super Admin',
        role: 'SUPER_ADMIN',
        roleId: roleIdByKey.get('super_admin'),
        status: 'ACTIVE',
      },
    });

    const adminLoginRes = await request(app).post('/api/v1/auth/login').send({
      email: ADMIN_USER_EMAIL,
      password: ADMIN_USER_PASSWORD,
      tenantSlug: TEST_TENANT_SLUG,
    });
    adminToken = adminLoginRes.body.data.accessToken;
  });

  afterAll(async () => {
    await db.employee.deleteMany({ where: { tenantId: testTenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId: testTenantId } } });
    await db.user.deleteMany({ where: { tenantId: testTenantId } });
    await db.position.deleteMany({ where: { tenantId: testTenantId } });
    await db.department.deleteMany({ where: { tenantId: testTenantId } });
    await db.tenant.delete({ where: { id: testTenantId } });
  });

  describe('POST /api/v1/employees', () => {
    it('should create a new employee with user account', async () => {
      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: 'newemployee@test.com',
          password: 'Employee@123',
          fullName: 'New Employee',
          departmentId: testDepartmentId,
          positionId: testPositionId,
          contractType: 'FULL_TIME',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.fullName).toBe('New Employee');
      expect(res.body.data.employeeCode).toMatch(/^EMP-\d{3}$/);
      expect(res.body.data.user.email).toBe('newemployee@test.com');
      expect(res.body.data.department.name).toBe('Test Department');
      expect(res.body.data.position.name).toBe('Test Position');
    });

    it('should return 409 with EMAIL_EXISTS code if email already exists', async () => {
      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: 'newemployee@test.com',
          password: 'Employee@123',
          fullName: 'Duplicate Employee',
          contractType: 'FULL_TIME',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      // Distinct code so the client can highlight the offending field.
      expect(res.body.error.code).toBe('EMAIL_EXISTS');
    });

    it('should return 409 with ID_NUMBER_EXISTS code if ID number already exists', async () => {
      const first = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: 'idnumber-owner@test.com',
          password: 'Employee@123',
          fullName: 'ID Number Owner',
          idNumber: '079123456789',
          contractType: 'FULL_TIME',
        });
      expect(first.status).toBe(201);

      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: 'idnumber-dup@test.com',
          password: 'Employee@123',
          fullName: 'ID Number Dup',
          idNumber: '079123456789',
          contractType: 'FULL_TIME',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ID_NUMBER_EXISTS');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).post('/api/v1/employees').send({
        email: 'unauth@test.com',
        password: 'Employee@123',
        fullName: 'Unauth Employee',
      });

      expect(res.status).toBe(401);
    });

    it('should return 422 with invalid email', async () => {
      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: 'invalid-email',
          password: 'Employee@123',
          fullName: 'Invalid Employee',
        });

      expect(res.status).toBe(422);
    });
  });

  describe('permission enforcement (requirePermission)', () => {
    it('should return 403 when EMPLOYEE role lacks employees:create', async () => {
      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          email: 'denied@test.com',
          password: 'Employee@123',
          fullName: 'Denied Employee',
          contractType: 'FULL_TIME',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should allow EMPLOYEE role to GET employees (has employees:view)', async () => {
      const res = await request(app)
        .get('/api/v1/employees')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // Row-level directory scoping for a self-service EMPLOYEE. Reproduces the
  // reported symptom: an EMPLOYEE whose account is NOT linked to an employee
  // record sees an empty directory (not their own profile), whereas a linked
  // EMPLOYEE sees exactly one row — themselves. These run in order: the orphan
  // assertion first, then the same user gets a linked profile.
  describe('EMPLOYEE directory scoping (row-level)', () => {
    it('an EMPLOYEE with no linked profile sees an empty directory', async () => {
      const res = await request(app)
        .get('/api/v1/employees')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.total).toBe(0);
      expect(res.body.data).toHaveLength(0);
    });

    it('an EMPLOYEE with a linked profile sees exactly their own record', async () => {
      await db.employee.create({
        data: {
          tenantId: testTenantId,
          userId: empUserId,
          employeeCode: 'EMP-SELF',
          fullName: 'Plain Employee',
          gender: 'OTHER',
          joinDate: new Date('2024-01-01'),
          contractType: 'FULL_TIME',
          status: 'ACTIVE',
          departmentId: testDepartmentId,
          positionId: testPositionId,
        },
      });

      const res = await request(app)
        .get('/api/v1/employees')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.total).toBe(1);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].userId).toBe(empUserId);
      expect(res.body.data[0].user.email).toBe(EMP_USER_EMAIL);
    });
  });

  describe('GET /api/v1/employees', () => {
    it('should return paginated list of employees', async () => {
      const res = await request(app)
        .get('/api/v1/employees')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.page).toBe(1);
    });

    it('should filter employees by department', async () => {
      const res = await request(app)
        .get(`/api/v1/employees?departmentId=${testDepartmentId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      res.body.data.forEach((emp: { departmentId: string }) => {
        expect(emp.departmentId).toBe(testDepartmentId);
      });
    });

    it('should filter employees by status', async () => {
      const res = await request(app)
        .get('/api/v1/employees?status=ACTIVE')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      res.body.data.forEach((emp: { status: string }) => {
        expect(emp.status).toBe('ACTIVE');
      });
    });

    it('should search employees by name', async () => {
      const res = await request(app)
        .get('/api/v1/employees?search=New')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/employees/:id', () => {
    let employeeId: string;

    beforeAll(async () => {
      const employees = await db.employee.findMany({
        where: { tenantId: testTenantId },
        take: 1,
      });
      employeeId = employees[0]?.id;
    });

    it('should return employee details', async () => {
      const res = await request(app)
        .get(`/api/v1/employees/${employeeId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(employeeId);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.department).toBeDefined();
    });

    it('should return 404 for non-existent employee', async () => {
      const res = await request(app)
        .get('/api/v1/employees/non-existent-id')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/employees/:id', () => {
    let employeeId: string;

    beforeAll(async () => {
      const employees = await db.employee.findMany({
        where: { tenantId: testTenantId },
        take: 1,
      });
      employeeId = employees[0]?.id;
    });

    it('should update employee details', async () => {
      const res = await request(app)
        .patch(`/api/v1/employees/${employeeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          fullName: 'Updated Employee Name',
          phone: '0901234567',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.fullName).toBe('Updated Employee Name');
      expect(res.body.data.phone).toBe('0901234567');
    });

    it('accepts a date-only dateOfBirth from the date input (not just full ISO)', async () => {
      const res = await request(app)
        .patch(`/api/v1/employees/${employeeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          // What <input type="date"> sends — date-only, no time component.
          dateOfBirth: '1995-07-20',
          role: 'PAYROLL_APPROVER',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dateOfBirth).toContain('1995-07-20');
    });

    it('should return 404 for non-existent employee', async () => {
      const res = await request(app)
        .patch('/api/v1/employees/non-existent-id')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ fullName: 'Test' });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/employees/:id/deactivate', () => {
    let employeeId: string;

    beforeAll(async () => {
      const employees = await db.employee.findMany({
        where: { tenantId: testTenantId, status: 'ACTIVE' },
        take: 1,
      });
      employeeId = employees[0]?.id;
    });

    it('should deactivate an employee', async () => {
      const res = await request(app)
        .post(`/api/v1/employees/${employeeId}/deactivate`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('INACTIVE');
    });

    it('should return 400 when already inactive', async () => {
      const res = await request(app)
        .post(`/api/v1/employees/${employeeId}/deactivate`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/employees/:id/activate', () => {
    let employeeId: string;

    beforeAll(async () => {
      const employees = await db.employee.findMany({
        where: { tenantId: testTenantId, status: 'INACTIVE' },
        take: 1,
      });
      employeeId = employees[0]?.id;
    });

    it('should activate an employee', async () => {
      const res = await request(app)
        .post(`/api/v1/employees/${employeeId}/activate`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ACTIVE');
    });
  });

  describe('POST /api/v1/employees/:id/terminate', () => {
    let employeeId: string;

    beforeAll(async () => {
      const employees = await db.employee.findMany({
        where: { tenantId: testTenantId, status: 'ACTIVE' },
        take: 1,
      });
      employeeId = employees[0]?.id;
    });

    it('should terminate an employee', async () => {
      const res = await request(app)
        .post(`/api/v1/employees/${employeeId}/terminate`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('TERMINATED');
      expect(res.body.data.terminatedAt).toBeDefined();
    });

    it('should return 400 when already terminated', async () => {
      const res = await request(app)
        .post(`/api/v1/employees/${employeeId}/terminate`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(400);
    });
  });

  // RBAC foundation: when SUPER_ADMIN assigns a role via the UI it must also set
  // user.roleId, the column resolvePermissions reads. Without this, role-assigned
  // users get no permissions (only the seed backfilled roleId before). Verified
  // end-to-end: the new user can actually log in and exercise a role-gated
  // permission. Role assignment is SUPER_ADMIN-only, so these use `adminToken`.
  describe('role → roleId resolution (RBAC)', () => {
    it('sets user.roleId to the matching Role when creating an HR_MANAGER', async () => {
      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'new-hr@employee-test.com',
          password: 'NewHr@123',
          fullName: 'New HR',
          role: 'HR_MANAGER',
          contractType: 'FULL_TIME',
        });
      expect(res.status).toBe(201);

      const created = await db.user.findFirst({
        where: { tenantId: testTenantId, email: 'new-hr@employee-test.com' },
      });
      const hrRole = await db.role.findFirst({
        where: { tenantId: testTenantId, key: 'hr_manager' },
      });
      expect(created!.roleId).toBe(hrRole!.id);

      // End-to-end: the freshly created HR can log in and the resolved
      // permission set includes an HR-only key.
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email: 'new-hr@employee-test.com',
        password: 'NewHr@123',
        tenantSlug: TEST_TENANT_SLUG,
      });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.user.permissions).toContain('employees:create');
    });

    it('re-resolves user.roleId when an employee role changes on update', async () => {
      const create = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'promote-me@employee-test.com',
          password: 'Promote@123',
          fullName: 'Promote Me',
          role: 'EMPLOYEE',
          contractType: 'FULL_TIME',
        });
      expect(create.status).toBe(201);
      const employeeId = create.body.data.id as string;

      const employeeRole = await db.role.findFirst({
        where: { tenantId: testTenantId, key: 'employee' },
      });
      const before = await db.user.findFirst({
        where: { tenantId: testTenantId, email: 'promote-me@employee-test.com' },
      });
      expect(before!.roleId).toBe(employeeRole!.id);

      // canAssignRole=true mirrors a SUPER_ADMIN caller at the controller boundary.
      await employeeService.update(employeeId, testTenantId, { role: 'HR_MANAGER' }, true);

      const hrRole = await db.role.findFirst({
        where: { tenantId: testTenantId, key: 'hr_manager' },
      });
      const after = await db.user.findFirst({
        where: { tenantId: testTenantId, email: 'promote-me@employee-test.com' },
      });
      expect(after!.role).toBe('HR_MANAGER');
      expect(after!.roleId).toBe(hrRole!.id);
    });

    it('makes a PAYROLL_APPROVER assignable and an approval-email recipient', async () => {
      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'approver@employee-test.com',
          password: 'Approver@123',
          fullName: 'Backup Approver',
          role: 'PAYROLL_APPROVER',
          contractType: 'FULL_TIME',
        });
      expect(res.status).toBe(201);

      const approverRole = await db.role.findFirst({
        where: { tenantId: testTenantId, key: 'payroll_approver' },
      });
      const created = await db.user.findFirst({
        where: { tenantId: testTenantId, email: 'approver@employee-test.com' },
      });
      expect(created!.roleId).toBe(approverRole!.id);

      // The new approver shows up in the notify list for a pay run (no submitter
      // excluded) — proving payroll:approve was granted via roleId resolution.
      const recipients = await payrollRunRepository.findApproverRecipients(testTenantId, null);
      expect(recipients.map((r) => r.email)).toContain('approver@employee-test.com');
    });
  });

  // Separation of duties: assigning a system role is a privilege grant, so a
  // non-SUPER_ADMIN caller (here an HR_MANAGER with employees:create/update)
  // must NOT be able to set it — otherwise HR could self-grant PAYROLL_APPROVER
  // and bypass the payroll maker-checker. The role is silently ignored, not 403,
  // so legitimate edits to other fields still succeed.
  describe('role assignment is restricted to SUPER_ADMIN', () => {
    it('ignores a role from a non-admin caller on create (defaults to EMPLOYEE)', async () => {
      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: 'hr-tries-approver@employee-test.com',
          password: 'Sneaky@123',
          fullName: 'HR Tries Approver',
          role: 'PAYROLL_APPROVER',
          contractType: 'FULL_TIME',
        });
      expect(res.status).toBe(201);

      const employeeRole = await db.role.findFirst({
        where: { tenantId: testTenantId, key: 'employee' },
      });
      const created = await db.user.findFirst({
        where: { tenantId: testTenantId, email: 'hr-tries-approver@employee-test.com' },
      });
      expect(created!.role).toBe('EMPLOYEE');
      expect(created!.roleId).toBe(employeeRole!.id);
    });

    it('ignores a role change from a non-admin caller on update', async () => {
      const create = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'stay-employee@employee-test.com',
          password: 'StayEmp@123',
          fullName: 'Stay Employee',
          role: 'EMPLOYEE',
          contractType: 'FULL_TIME',
        });
      expect(create.status).toBe(201);
      const employeeId = create.body.data.id as string;

      // HR attempts to promote to PAYROLL_APPROVER — request succeeds but the
      // role is left untouched.
      const res = await request(app)
        .patch(`/api/v1/employees/${employeeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ fullName: 'Stay Employee Edited', role: 'PAYROLL_APPROVER' });
      expect(res.status).toBe(200);
      expect(res.body.data.fullName).toBe('Stay Employee Edited');

      const employeeRole = await db.role.findFirst({
        where: { tenantId: testTenantId, key: 'employee' },
      });
      const after = await db.user.findFirst({
        where: { tenantId: testTenantId, email: 'stay-employee@employee-test.com' },
      });
      expect(after!.role).toBe('EMPLOYEE');
      expect(after!.roleId).toBe(employeeRole!.id);
    });
  });

  // SPEC-014: the employee form assigns ANY tenant role (system + custom) by
  // `roleId`, not just the 4 hardcoded enums. roleId is the canonical key; the
  // legacy `user.role` enum is kept in sync (Đ2): a system role maps to its
  // matching enum, a custom role falls back to EMPLOYEE (a neutral baseline —
  // payroll scoping reads permissions from roleId, so the rich custom role still
  // carries its full permission set). super_admin and cross-tenant roles are
  // rejected; non-admin callers are ignored.
  describe('assign by roleId (system + custom roles)', () => {
    let customRoleId: string;

    beforeAll(async () => {
      // A rich custom "Giám đốc" role: payroll:approve + supervisory view perms.
      const permIds = await db.permission.findMany({
        where: { key: { in: ['dashboard:view', 'payroll:view', 'payroll:approve', 'employees:view'] } },
        select: { id: true },
      });
      const role = await db.role.create({
        data: {
          tenantId: testTenantId,
          key: 'director',
          name: 'Giám đốc',
          description: 'Role tùy chỉnh: duyệt lương + giám sát',
          isSystem: false,
          permissions: { create: permIds.map((p) => ({ permissionId: p.id })) },
        },
      });
      customRoleId = role.id;
    });

    it('assigns a custom role via roleId and falls back the enum to EMPLOYEE', async () => {
      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'director@employee-test.com',
          password: 'Director@123',
          fullName: 'Custom Director',
          roleId: customRoleId,
          contractType: 'FULL_TIME',
        });
      expect(res.status).toBe(201);

      const created = await db.user.findFirst({
        where: { tenantId: testTenantId, email: 'director@employee-test.com' },
      });
      expect(created!.roleId).toBe(customRoleId);
      expect(created!.role).toBe('EMPLOYEE');

      // RBAC reads from roleId: the custom role's permissions are live.
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email: 'director@employee-test.com',
        password: 'Director@123',
        tenantSlug: TEST_TENANT_SLUG,
      });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.user.permissions).toContain('payroll:approve');
    });

    it('assigns a system role via roleId and syncs the matching enum', async () => {
      const hrRole = await db.role.findFirst({
        where: { tenantId: testTenantId, key: 'hr_manager' },
      });
      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'hr-by-roleid@employee-test.com',
          password: 'HrById@123',
          fullName: 'HR By RoleId',
          roleId: hrRole!.id,
          contractType: 'FULL_TIME',
        });
      expect(res.status).toBe(201);

      const created = await db.user.findFirst({
        where: { tenantId: testTenantId, email: 'hr-by-roleid@employee-test.com' },
      });
      expect(created!.roleId).toBe(hrRole!.id);
      expect(created!.role).toBe('HR_MANAGER');
    });

    it('re-resolves roleId to a custom role on update', async () => {
      const create = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'promote-to-director@employee-test.com',
          password: 'Promote@123',
          fullName: 'Promote To Director',
          contractType: 'FULL_TIME',
        });
      expect(create.status).toBe(201);
      const employeeId = create.body.data.id as string;

      const res = await request(app)
        .patch(`/api/v1/employees/${employeeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleId: customRoleId });
      expect(res.status).toBe(200);

      const after = await db.user.findFirst({
        where: { tenantId: testTenantId, email: 'promote-to-director@employee-test.com' },
      });
      expect(after!.roleId).toBe(customRoleId);
      expect(after!.role).toBe('EMPLOYEE');
    });

    it('rejects assigning the super_admin role via roleId', async () => {
      const superRole = await db.role.findFirst({
        where: { tenantId: testTenantId, key: 'super_admin' },
      });
      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'wannabe-admin@employee-test.com',
          password: 'Wannabe@123',
          fullName: 'Wannabe Admin',
          roleId: superRole!.id,
          contractType: 'FULL_TIME',
        });
      expect(res.status).toBe(400);
    });

    it('rejects a roleId that belongs to another tenant', async () => {
      const otherTenant = await db.tenant.upsert({
        where: { slug: 'other-roleid-tenant' },
        update: {},
        create: { name: 'Other RoleId Tenant', slug: 'other-roleid-tenant' },
      });
      const otherRole = await db.role.create({
        data: {
          tenantId: otherTenant.id,
          key: 'foreign',
          name: 'Foreign Role',
          isSystem: false,
        },
      });

      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'foreign-role@employee-test.com',
          password: 'Foreign@123',
          fullName: 'Foreign Role User',
          roleId: otherRole.id,
          contractType: 'FULL_TIME',
        });
      expect(res.status).toBe(400);

      await db.rolePermission.deleteMany({ where: { roleId: otherRole.id } });
      await db.role.delete({ where: { id: otherRole.id } });
      await db.tenant.delete({ where: { id: otherTenant.id } });
    });

    it('ignores roleId from a non-admin caller (defaults to EMPLOYEE)', async () => {
      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: 'hr-tries-director@employee-test.com',
          password: 'Sneaky@123',
          fullName: 'HR Tries Director',
          roleId: customRoleId,
          contractType: 'FULL_TIME',
        });
      expect(res.status).toBe(201);

      const employeeRole = await db.role.findFirst({
        where: { tenantId: testTenantId, key: 'employee' },
      });
      const created = await db.user.findFirst({
        where: { tenantId: testTenantId, email: 'hr-tries-director@employee-test.com' },
      });
      expect(created!.role).toBe('EMPLOYEE');
      expect(created!.roleId).toBe(employeeRole!.id);
    });

    it('exposes roleId and role name on the employee detail (for form prefill)', async () => {
      const create = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'detail-roleid@employee-test.com',
          password: 'Detail@123',
          fullName: 'Detail RoleId',
          roleId: customRoleId,
          contractType: 'FULL_TIME',
        });
      expect(create.status).toBe(201);
      const employeeId = create.body.data.id as string;

      const res = await request(app)
        .get(`/api/v1/employees/${employeeId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.user.roleId).toBe(customRoleId);
      expect(res.body.data.user.roleRef.name).toBe('Giám đốc');
    });
  });

  // SPEC-017: HR records an employee's probation end date so the reminder engine
  // and dashboard can surface "probation ending" events. It must round-trip via
  // PATCH, be clearable (null), and be rejected when earlier than the join date.
  describe('probationEndDate (SPEC-017)', () => {
    let employeeId: string;
    let joinDate: string;

    beforeAll(async () => {
      const create = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: 'probation@employee-test.com',
          password: 'Probation@123',
          fullName: 'Probation Employee',
          contractType: 'PROBATION',
          joinDate: '2026-06-01',
        });
      employeeId = create.body.data.id as string;
      joinDate = '2026-06-01';
    });

    it('persists probationEndDate on PATCH (date-only input)', async () => {
      const res = await request(app)
        .patch(`/api/v1/employees/${employeeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ probationEndDate: '2026-08-30' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.probationEndDate).toContain('2026-08-30');
    });

    it('clears probationEndDate when sent null', async () => {
      const res = await request(app)
        .patch(`/api/v1/employees/${employeeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ probationEndDate: null });

      expect(res.status).toBe(200);
      expect(res.body.data.probationEndDate).toBeNull();
    });

    it('rejects a probationEndDate earlier than joinDate with 400', async () => {
      void joinDate;
      const res = await request(app)
        .patch(`/api/v1/employees/${employeeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ probationEndDate: '2026-05-01' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('persists probationEndDate on POST (create, date-only input)', async () => {
      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: 'probation-create@employee-test.com',
          password: 'Probation@123',
          fullName: 'Probation Create',
          contractType: 'PROBATION',
          joinDate: '2026-06-01',
          probationEndDate: '2026-08-30',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.probationEndDate).toContain('2026-08-30');
    });

    it('rejects a create probationEndDate earlier than joinDate with 400', async () => {
      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: 'probation-create-bad@employee-test.com',
          password: 'Probation@123',
          fullName: 'Probation Create Bad',
          contractType: 'PROBATION',
          joinDate: '2026-06-01',
          probationEndDate: '2026-05-01',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // dependentsCount drives the PIT dependent deduction in payroll. The column
  // existed but had no write path, so it was always 0 (every employee over-taxed).
  // These prove it round-trips through create/update and defaults to 0 when omitted.
  describe('dependentsCount (PIT dependent deduction)', () => {
    it('persists dependentsCount on create', async () => {
      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: 'has-dependents@employee-test.com',
          password: 'Depend@123',
          fullName: 'Has Dependents',
          contractType: 'FULL_TIME',
          dependentsCount: 3,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.dependentsCount).toBe(3);
    });

    it('defaults dependentsCount to 0 when omitted on create', async () => {
      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: 'no-dependents@employee-test.com',
          password: 'Depend@123',
          fullName: 'No Dependents',
          contractType: 'FULL_TIME',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.dependentsCount).toBe(0);
    });

    it('updates dependentsCount on PATCH', async () => {
      const create = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: 'edit-dependents@employee-test.com',
          password: 'Depend@123',
          fullName: 'Edit Dependents',
          contractType: 'FULL_TIME',
          dependentsCount: 1,
        });
      expect(create.status).toBe(201);
      const employeeId = create.body.data.id as string;

      const res = await request(app)
        .patch(`/api/v1/employees/${employeeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ dependentsCount: 4 });

      expect(res.status).toBe(200);
      expect(res.body.data.dependentsCount).toBe(4);
    });

    it('rejects a negative dependentsCount with 422', async () => {
      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: 'bad-dependents@employee-test.com',
          password: 'Depend@123',
          fullName: 'Bad Dependents',
          contractType: 'FULL_TIME',
          dependentsCount: -1,
        });

      expect(res.status).toBe(422);
    });
  });

  describe('avatar (base64 data URL)', () => {
    let employeeId: string;

    beforeAll(async () => {
      const employees = await db.employee.findMany({
        where: { tenantId: testTenantId },
        take: 1,
      });
      employeeId = employees[0]?.id;
    });

    // A base64 data URL large enough (~150KB) to exceed Express' default 100kb
    // JSON body limit — proves the limit was raised, not just that the column writes.
    const bigAvatar = `data:image/png;base64,${'A'.repeat(150_000)}`;

    it('persists a base64 data URL avatar on create', async () => {
      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: 'avatar-create@employee-test.com',
          password: 'Avatar@123',
          fullName: 'Avatar Create',
          contractType: 'FULL_TIME',
          avatarUrl: bigAvatar,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.avatar).toBe(bigAvatar);
    });

    it('persists a base64 data URL avatar on update', async () => {
      const res = await request(app)
        .patch(`/api/v1/employees/${employeeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ avatarUrl: bigAvatar });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.avatar).toBe(bigAvatar);
    });

    it('rejects a non-image, non-url avatar string with 422', async () => {
      const res = await request(app)
        .patch(`/api/v1/employees/${employeeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ avatarUrl: 'not-an-image' });

      expect(res.status).toBe(422);
    });
  });
});

// Security fix: the employee directory must be row-level scoped by role, or a
// plain EMPLOYEE can list every colleague and open any profile (PII leak).
// Policy ("HR Manager + Manager xem team"):
//   - HR_MANAGER / SUPER_ADMIN → the whole tenant directory
//   - MANAGER                  → themselves + their direct reports only
//   - EMPLOYEE                 → only their own record
// Enforcement lives in the service (the security boundary), so these tests hit
// the real HTTP endpoints with role-specific tokens and assert the *observable*
// outcome: which employees each role can see in the list and via getById.
describe('Employee directory access scoping (RBAC)', () => {
  const SLUG = 'dir-scope-tenant';
  let tenantId: string;

  // Tokens per role.
  let hrToken: string;
  let managerToken: string;
  let reportToken: string;
  let outsiderToken: string;

  // Employee record ids we assert visibility against.
  let managerEmpId: string;
  let reportEmpId: string;
  let outsiderEmpId: string;

  const PASSWORD = 'Scope@12345';

  async function login(email: string): Promise<string> {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD, tenantSlug: SLUG });
    return res.body.data.accessToken;
  }

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: SLUG },
      update: {},
      create: { name: 'Directory Scope Tenant', slug: SLUG },
    });
    tenantId = tenant.id;

    await db.employee.deleteMany({ where: { tenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
    await db.user.deleteMany({ where: { tenantId } });

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, tenantId);

    // Helper: create a user + linked employee in one go.
    async function makeEmployee(opts: {
      email: string;
      role: 'HR_MANAGER' | 'MANAGER' | 'EMPLOYEE';
      roleKey: string;
      code: string;
      managerId?: string;
    }) {
      const user = await db.user.create({
        data: {
          tenantId,
          email: opts.email,
          passwordHash: await hashPassword(PASSWORD),
          fullName: opts.email,
          role: opts.role,
          roleId: roleIdByKey.get(opts.roleKey),
          status: 'ACTIVE',
        },
      });
      return db.employee.create({
        data: {
          tenantId,
          userId: user.id,
          employeeCode: opts.code,
          fullName: opts.email,
          status: 'ACTIVE',
          joinDate: new Date('2026-01-01'),
          contractType: 'FULL_TIME',
          managerId: opts.managerId,
        },
      });
    }

    // HR has no employee record (they just administer) — proves the FULL role
    // path doesn't depend on having a linked employee.
    await db.user.create({
      data: {
        tenantId,
        email: 'hr@dir-scope.com',
        passwordHash: await hashPassword(PASSWORD),
        fullName: 'HR Manager',
        role: 'HR_MANAGER',
        roleId: roleIdByKey.get('hr_manager'),
        status: 'ACTIVE',
      },
    });

    const managerEmp = await makeEmployee({
      email: 'manager@dir-scope.com',
      role: 'MANAGER',
      roleKey: 'manager',
      code: 'EMP-001',
    });
    managerEmpId = managerEmp.id;

    const reportEmp = await makeEmployee({
      email: 'report@dir-scope.com',
      role: 'EMPLOYEE',
      roleKey: 'employee',
      code: 'EMP-002',
      managerId: managerEmp.id,
    });
    reportEmpId = reportEmp.id;

    // Unrelated employee reporting to nobody — must be invisible to the manager.
    const outsiderEmp = await makeEmployee({
      email: 'outsider@dir-scope.com',
      role: 'EMPLOYEE',
      roleKey: 'employee',
      code: 'EMP-003',
    });
    outsiderEmpId = outsiderEmp.id;

    hrToken = await login('hr@dir-scope.com');
    managerToken = await login('manager@dir-scope.com');
    reportToken = await login('report@dir-scope.com');
    outsiderToken = await login('outsider@dir-scope.com');
  });

  afterAll(async () => {
    await db.employee.deleteMany({ where: { tenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
    await db.user.deleteMany({ where: { tenantId } });
    await db.tenant.delete({ where: { id: tenantId } });
  });

  describe('GET /api/v1/employees (list scoping)', () => {
    it('HR sees the entire directory (all three employees)', async () => {
      const res = await request(app)
        .get('/api/v1/employees')
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(200);
      const ids = res.body.data.map((e: { id: string }) => e.id);
      expect(ids).toEqual(expect.arrayContaining([managerEmpId, reportEmpId, outsiderEmpId]));
    });

    it('MANAGER sees only themselves and their direct reports', async () => {
      const res = await request(app)
        .get('/api/v1/employees')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      const ids = res.body.data.map((e: { id: string }) => e.id).sort();
      expect(ids).toEqual([managerEmpId, reportEmpId].sort());
      expect(ids).not.toContain(outsiderEmpId);
    });

    it('EMPLOYEE sees only their own record', async () => {
      const res = await request(app)
        .get('/api/v1/employees')
        .set('Authorization', `Bearer ${reportToken}`);

      expect(res.status).toBe(200);
      const ids = res.body.data.map((e: { id: string }) => e.id);
      expect(ids).toEqual([reportEmpId]);
    });
  });

  describe('GET /api/v1/employees/:id (detail scoping)', () => {
    it('HR can open any employee', async () => {
      const res = await request(app)
        .get(`/api/v1/employees/${outsiderEmpId}`)
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(outsiderEmpId);
    });

    it('MANAGER can open their own report', async () => {
      const res = await request(app)
        .get(`/api/v1/employees/${reportEmpId}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(reportEmpId);
    });

    it('MANAGER is forbidden from opening an employee outside their team', async () => {
      const res = await request(app)
        .get(`/api/v1/employees/${outsiderEmpId}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('EMPLOYEE can open their own profile', async () => {
      const res = await request(app)
        .get(`/api/v1/employees/${reportEmpId}`)
        .set('Authorization', `Bearer ${reportToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(reportEmpId);
    });

    it('EMPLOYEE is forbidden from opening a colleague (the PII-leak this fixes)', async () => {
      const res = await request(app)
        .get(`/api/v1/employees/${managerEmpId}`)
        .set('Authorization', `Bearer ${outsiderToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
});
